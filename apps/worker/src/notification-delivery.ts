import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import {
  smtpNotificationDeliveryClaimV1,
  smtpNotificationDispatchAuthorizationV1,
  type SmtpNotificationDispatchAuthorizationV1,
  type SmtpTransactionalNotificationEventV1,
} from "@starfiniti/contracts";
import nodemailer, { type Transporter } from "nodemailer";
import type SMTPPool from "nodemailer/lib/smtp-pool";
import type { Sql } from "postgres";

type ClaimRow = Readonly<{
  schema_version: string;
  delivery_public_id: string;
  lease_expires_at: string | Date;
}>;

type AuthorizationRow = Readonly<{
  schema_version: string;
  delivery_public_id: string;
  outcome: string;
  attempt_count: number | null;
  recipient_email: string | null;
  template_code: string | null;
  template_version: number | null;
  template_sha256: string | null;
  subject_template: string | null;
  text_template: string | null;
  html_template: string | null;
  event: unknown;
}>;

type FinishRow = Readonly<{
  state: string;
  outcome: string;
  scheduled_at: string | Date | null;
}>;

export type SmtpSecurityMode = "tls" | "starttls" | "plaintext";

export type SmtpDeliveryConfig = Readonly<{
  host: string;
  port: number;
  security: SmtpSecurityMode;
  fromAddress: string;
  username: string | null;
  password: string | null;
  messageIdDomain: string;
}>;

export type SmtpDeliveryRuntime = Readonly<{
  config: SmtpDeliveryConfig;
  transporter: Pick<
    Transporter<SMTPPool.SentMessageInfo>,
    "sendMail" | "close"
  >;
}>;

export type SmtpNotificationLifecycleResult = Readonly<{
  claimed: number;
  authorized: number;
  delivered: number;
  retryable: number;
  deadLetter: number;
  manualReview: number;
  withheld: number;
}>;

type SmtpResult = Readonly<{
  outcome: "delivered" | "retryable" | "dead_letter" | "manual_review";
  responseCode: number | null;
  errorCode: string | null;
}>;

const CONTACT_PATTERN = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/u;
const HOST_PATTERN = /^(?!.*[\s\r\n])[^/]{1,253}$/u;
const PRE_ACCEPTANCE_COMMANDS = [
  "CONN",
  "EHLO",
  "HELO",
  "STARTTLS",
  "AUTH",
] as const;

export function readSmtpDeliveryConfig(
  environment: NodeJS.ProcessEnv,
): SmtpDeliveryConfig | null {
  if (environment.LOYALTY_SMTP_ENABLED !== "true") return null;
  const host = environment.LOYALTY_SMTP_HOST?.trim() ?? "";
  const port = Number(environment.LOYALTY_SMTP_PORT ?? "587");
  const security = environment.LOYALTY_SMTP_SECURITY ?? "starttls";
  const fromAddress = environment.LOYALTY_SMTP_FROM_ADDRESS?.trim() ?? "";
  const username = nullableTrimmed(environment.LOYALTY_SMTP_USERNAME);
  const passwordFile = nullableTrimmed(environment.LOYALTY_SMTP_PASSWORD_FILE);
  if (!HOST_PATTERN.test(host)) throw new Error("smtp_config_invalid_host");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("smtp_config_invalid_port");
  }
  if (!isSecurityMode(security)) {
    throw new Error("smtp_config_invalid_security");
  }
  if (!CONTACT_PATTERN.test(fromAddress) || fromAddress.length > 320) {
    throw new Error("smtp_config_invalid_from_address");
  }
  if ((username === null) !== (passwordFile === null)) {
    throw new Error("smtp_config_incomplete_authentication");
  }
  if (passwordFile !== null && !isAbsolute(passwordFile)) {
    throw new Error("smtp_config_password_path_not_absolute");
  }
  const password =
    passwordFile === null
      ? null
      : stripOneTrailingLineBreak(readFileSync(passwordFile, "utf8"));
  if (username !== null && password?.length === 0) {
    throw new Error("smtp_config_empty_password");
  }
  const messageIdDomain = fromAddress.slice(fromAddress.lastIndexOf("@") + 1);
  return {
    host,
    port,
    security,
    fromAddress,
    username,
    password,
    messageIdDomain,
  };
}

export function createSmtpDeliveryRuntime(
  config: SmtpDeliveryConfig,
): SmtpDeliveryRuntime {
  const options: SMTPPool.Options & { maxRequeues: number } = {
    host: config.host,
    port: config.port,
    secure: config.security === "tls",
    requireTLS: config.security === "starttls",
    ignoreTLS: config.security === "plaintext",
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
    maxRequeues: 0,
    rateDelta: 1_000,
    rateLimit: 5,
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
    ...(config.username === null
      ? {}
      : { auth: { user: config.username, pass: config.password ?? "" } }),
  };
  return { config, transporter: nodemailer.createTransport(options) };
}

export async function runSmtpNotificationLifecycle(
  sql: Sql,
  workerId: string,
  runtime: SmtpDeliveryRuntime,
  batchSize = 10,
): Promise<SmtpNotificationLifecycleResult> {
  const claimRows = await sql<ClaimRow[]>`
    select schema_version, delivery_public_id::text, lease_expires_at
    from loyalty_private.claim_smtp_notification_deliveries_v1(
      ${workerId}, ${batchSize}, 60
    )
  `;
  if (claimRows.length > batchSize) {
    throw new Error("smtp_claim_batch_exceeded");
  }
  const claims = claimRows.map((row) =>
    smtpNotificationDeliveryClaimV1.parse({
      schemaVersion: row.schema_version,
      deliveryId: row.delivery_public_id,
      leaseExpiresAt: instantString(row.lease_expires_at),
    }),
  );
  const totals = {
    claimed: claims.length,
    authorized: 0,
    delivered: 0,
    retryable: 0,
    deadLetter: 0,
    manualReview: 0,
    withheld: 0,
  };
  for (const claim of claims) {
    let authorization: SmtpNotificationDispatchAuthorizationV1;
    try {
      authorization = await authorizeDelivery(sql, workerId, claim.deliveryId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "smtp_authorization_invalid"
      ) {
        await finishDelivery(sql, workerId, claim.deliveryId, {
          outcome: "dead_letter",
          responseCode: null,
          errorCode: "smtp_message_invalid",
        });
        totals.deadLetter += 1;
        continue;
      }
      throw error;
    }
    if (authorization.outcome !== "authorized") {
      totals.withheld += 1;
      continue;
    }
    totals.authorized += 1;
    let result: SmtpResult;
    try {
      const responseCode = await sendAuthorizedNotification(
        runtime,
        authorization,
      );
      result = {
        outcome: "delivered",
        responseCode,
        errorCode: null,
      };
    } catch (error) {
      result = classifySmtpDeliveryError(error);
    }
    const finish = await finishDelivery(
      sql,
      workerId,
      claim.deliveryId,
      result,
    );
    if (finish.state === "delivered") totals.delivered += 1;
    else if (finish.state === "retryable") totals.retryable += 1;
    else if (finish.state === "dead_letter") totals.deadLetter += 1;
    else if (finish.state === "manual_review") totals.manualReview += 1;
    else throw new Error("smtp_finish_state_invalid");
  }
  return totals;
}

async function authorizeDelivery(
  sql: Sql,
  workerId: string,
  deliveryId: string,
): Promise<SmtpNotificationDispatchAuthorizationV1> {
  const rows = await sql<AuthorizationRow[]>`
    select schema_version, delivery_public_id::text, outcome, attempt_count,
      recipient_email, template_code, template_version, template_sha256,
      subject_template, text_template, html_template, event
    from loyalty_private.authorize_smtp_notification_delivery_v1(
      ${deliveryId}::uuid, ${workerId}
    )
  `;
  const row = rows[0];
  if (!row || rows.length !== 1) throw new Error("smtp_authorization_invalid");
  try {
    return smtpNotificationDispatchAuthorizationV1.parse(
      row.outcome === "authorized"
        ? {
            schemaVersion: row.schema_version,
            deliveryId: row.delivery_public_id,
            outcome: row.outcome,
            attempt: Number(row.attempt_count),
            recipientEmail: row.recipient_email,
            templateCode: row.template_code,
            templateVersion: Number(row.template_version),
            templateSha256: row.template_sha256,
            subjectTemplate: row.subject_template,
            textTemplate: row.text_template,
            htmlTemplate: row.html_template,
            event: row.event,
          }
        : {
            schemaVersion: row.schema_version,
            deliveryId: row.delivery_public_id,
            outcome: row.outcome,
          },
    );
  } catch {
    throw new Error("smtp_authorization_invalid");
  }
}

async function finishDelivery(
  sql: Sql,
  workerId: string,
  deliveryId: string,
  result: SmtpResult,
): Promise<FinishRow> {
  const rows = await sql<FinishRow[]>`
    select state, outcome, scheduled_at
    from loyalty_private.finish_smtp_notification_delivery_v1(
      ${deliveryId}::uuid, ${workerId}, ${result.outcome},
      ${result.responseCode}, ${result.errorCode}
    )
  `;
  const row = rows[0];
  if (!row || rows.length !== 1 || row.state !== row.outcome) {
    throw new Error("smtp_finish_result_invalid");
  }
  return row;
}

export async function sendAuthorizedNotification(
  runtime: SmtpDeliveryRuntime,
  authorization: Extract<
    SmtpNotificationDispatchAuthorizationV1,
    { outcome: "authorized" }
  >,
): Promise<number> {
  verifyTemplateHash(authorization);
  const rendered = renderNotificationEmail(
    authorization.event,
    authorization.subjectTemplate,
    authorization.textTemplate,
    authorization.htmlTemplate,
  );
  const messageId = `<${authorization.event.eventId}@${runtime.config.messageIdDomain}>`;
  const info = await runtime.transporter.sendMail({
    from: runtime.config.fromAddress,
    to: authorization.recipientEmail,
    envelope: {
      from: runtime.config.fromAddress,
      to: [authorization.recipientEmail],
    },
    messageId,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const accepted = info.accepted.map(String);
  if (
    accepted.length !== 1 ||
    accepted[0]?.toLowerCase() !== authorization.recipientEmail.toLowerCase() ||
    info.rejected.length !== 0
  ) {
    throw new SmtpOutcomeAmbiguousError();
  }
  const responseCode = /^([2-5][0-9]{2})(?:\s|$)/u.exec(info.response)?.[1];
  return responseCode === undefined ? 250 : Number(responseCode);
}

export function renderNotificationEmail(
  event: SmtpTransactionalNotificationEventV1,
  subjectTemplate: string,
  textTemplate: string,
  htmlTemplate: string,
): Readonly<{ subject: string; text: string; html: string }> {
  const values = notificationTemplateValues(event);
  const subject = interpolateTemplate(subjectTemplate, values, false);
  const text = interpolateTemplate(textTemplate, values, false);
  const html = interpolateTemplate(htmlTemplate, values, true);
  if (/\r|\n/u.test(subject)) throw new Error("smtp_subject_invalid");
  return { subject, text, html };
}

export function classifySmtpDeliveryError(error: unknown): SmtpResult {
  if (error instanceof SmtpOutcomeAmbiguousError) {
    return {
      outcome: "manual_review",
      responseCode: null,
      errorCode: "smtp_outcome_ambiguous",
    };
  }
  const details = smtpErrorDetails(error);
  if (details.responseCode !== null && details.responseCode >= 400) {
    return details.responseCode < 500
      ? {
          outcome: "retryable",
          responseCode: details.responseCode,
          errorCode: "smtp_temporary_rejection",
        }
      : {
          outcome: "dead_letter",
          responseCode: details.responseCode,
          errorCode:
            details.code === "EAUTH"
              ? "smtp_authentication_failed"
              : "smtp_permanent_rejection",
        };
  }
  if (details.code === "EDNS") {
    return {
      outcome: "retryable",
      responseCode: null,
      errorCode: "smtp_dns_unavailable",
    };
  }
  if (["ETLS", "EREQUIRETLS"].includes(details.code ?? "")) {
    return {
      outcome: "retryable",
      responseCode: null,
      errorCode: "smtp_tls_unavailable",
    };
  }
  if (["EAUTH", "ENOAUTH", "EOAUTH2"].includes(details.code ?? "")) {
    return {
      outcome: "dead_letter",
      responseCode: null,
      errorCode: "smtp_authentication_failed",
    };
  }
  if (details.code === "ECONFIG") {
    return {
      outcome: "dead_letter",
      responseCode: null,
      errorCode: "smtp_configuration_invalid",
    };
  }
  if (details.code === "EENVELOPE") {
    return {
      outcome: "dead_letter",
      responseCode: null,
      errorCode: "smtp_envelope_invalid",
    };
  }
  if (
    ["EMESSAGE", "ESTREAM", "EFILEACCESS", "EURLACCESS"].includes(
      details.code ?? "",
    )
  ) {
    return {
      outcome: "dead_letter",
      responseCode: null,
      errorCode: "smtp_message_invalid",
    };
  }
  if (
    ["ECONNECTION", "ESOCKET", "ETIMEDOUT"].includes(details.code ?? "") &&
    isPreAcceptanceCommand(details.command)
  ) {
    return {
      outcome: "retryable",
      responseCode: null,
      errorCode:
        details.code === "ETIMEDOUT"
          ? "smtp_timeout"
          : "smtp_connection_unavailable",
    };
  }
  return {
    outcome: "manual_review",
    responseCode: null,
    errorCode: "smtp_outcome_ambiguous",
  };
}

function verifyTemplateHash(
  authorization: Extract<
    SmtpNotificationDispatchAuthorizationV1,
    { outcome: "authorized" }
  >,
): void {
  const actual = createHash("sha256")
    .update(
      [
        authorization.templateCode,
        authorization.templateVersion,
        authorization.event.eventType,
        authorization.subjectTemplate,
        authorization.textTemplate,
        authorization.htmlTemplate,
      ].join("|"),
      "utf8",
    )
    .digest();
  const expected = Buffer.from(authorization.templateSha256, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("smtp_template_hash_mismatch");
  }
}

function notificationTemplateValues(
  event: SmtpTransactionalNotificationEventV1,
): Readonly<Record<string, string>> {
  switch (event.eventType) {
    case "loyalty.points.earned":
      return {
        points: event.payload.points,
        pendingUntil: event.payload.pendingUntil ?? "not scheduled",
      };
    case "loyalty.points.released":
      return {
        points: event.payload.points,
        availableBalance: event.payload.availableBalance,
      };
    case "loyalty.points.expiring":
      return {
        points: event.payload.points,
        expiresAt: event.payload.expiresAt,
        daysRemaining: String(event.payload.daysRemaining),
      };
    case "loyalty.reward.changed":
      return {
        rewardReservationId: event.payload.rewardReservationId,
        rewardCode: event.payload.rewardCode,
        state: event.payload.state,
      };
    case "loyalty.tier.changed":
      return {
        fromTierCode: event.payload.fromTierCode ?? "no prior tier",
        toTierCode: event.payload.toTierCode,
        effectiveAt: event.payload.effectiveAt,
      };
    case "loyalty.referral.changed":
      return {
        referralId: event.payload.referralId,
        party: event.payload.party,
        state: event.payload.state,
      };
  }
}

function interpolateTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
  html: boolean,
): string {
  const rendered = template.replace(
    /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/gu,
    (_placeholder, token: string) => {
      const value = values[token];
      if (value === undefined) throw new Error("smtp_template_token_invalid");
      return html ? escapeHtml(value) : value;
    },
  );
  if (/\{\{|\}\}/u.test(rendered)) {
    throw new Error("smtp_template_token_invalid");
  }
  return rendered;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function smtpErrorDetails(error: unknown): Readonly<{
  code: string | null;
  command: string | null;
  responseCode: number | null;
}> {
  if (typeof error !== "object" || error === null) {
    return { code: null, command: null, responseCode: null };
  }
  const candidate = error as Record<string, unknown>;
  return {
    code: typeof candidate.code === "string" ? candidate.code : null,
    command: typeof candidate.command === "string" ? candidate.command : null,
    responseCode:
      typeof candidate.responseCode === "number" &&
      Number.isInteger(candidate.responseCode)
        ? candidate.responseCode
        : null,
  };
}

function isPreAcceptanceCommand(command: string | null): boolean {
  if (command === null) return false;
  return PRE_ACCEPTANCE_COMMANDS.some(
    (prefix) => command === prefix || command.startsWith(`${prefix} `),
  );
}

function instantString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function nullableTrimmed(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function stripOneTrailingLineBreak(value: string): string {
  return value.replace(/\r?\n$/u, "");
}

function isSecurityMode(value: string): value is SmtpSecurityMode {
  return value === "tls" || value === "starttls" || value === "plaintext";
}

class SmtpOutcomeAmbiguousError extends Error {
  constructor() {
    super("smtp_outcome_ambiguous");
  }
}
