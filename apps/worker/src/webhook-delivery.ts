import { createHash, createHmac } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { isAbsolute } from "node:path";
import {
  webhookNotificationDeliveryClaimV1,
  webhookNotificationDispatchAuthorizationV1,
  type NotificationEventV1,
  type WebhookNotificationDispatchAuthorizationV1,
} from "@starfiniti/contracts";
import type { Sql } from "postgres";

const MAX_PAYLOAD_BYTES = 20 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const webhookAddressBlockList = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  webhookAddressBlockList.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  webhookAddressBlockList.addSubnet(network, prefix, "ipv6");
}

type WebhookSecret = Readonly<{
  bytes: Buffer;
  fingerprint: string;
}>;

export type WebhookDeliveryConfig = Readonly<{
  endpointId: string;
  currentSecret: WebhookSecret;
  previousSecret: WebhookSecret | null;
  allowedOrigin: string;
  timeoutMs: number;
  testMode: boolean;
}>;

export type WebhookDeliveryRuntime = Readonly<{
  config: WebhookDeliveryConfig;
  lookup: WebhookLookup;
}>;

type WebhookLookup = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

export type WebhookDeliveryLifecycleResult = Readonly<{
  claimed: number;
  authorized: number;
  delivered: number;
  retryable: number;
  deadLetter: number;
  manualReview: number;
  withheld: number;
}>;

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
  destination_url: string | null;
  event: unknown;
}>;

type StateRow = Readonly<{
  state: string;
  outcome: string;
  scheduled_at: string | Date | null;
}>;

type DeliveryResult = Readonly<{
  outcome: "delivered" | "retryable" | "dead_letter";
  responseCode: number | null;
  errorCode: string | null;
  retryAfterSeconds: number | null;
}>;

type ResponseSummary = Readonly<{
  status: number;
  retryAfterSeconds: number | null;
}>;

class WebhookDeliveryError extends Error {
  constructor(
    readonly code:
      | "webhook_destination_forbidden"
      | "webhook_response_too_large"
      | "webhook_request_invalid"
      | "webhook_dns_unavailable"
      | "webhook_connection_unavailable"
      | "webhook_timeout"
      | "webhook_connection_ambiguous",
  ) {
    super(code);
  }
}

export function readWebhookDeliveryConfig(
  environment: NodeJS.ProcessEnv,
): WebhookDeliveryConfig | null {
  if (environment.LOYALTY_WEBHOOK_ENABLED !== "true") return null;
  const endpointId = environment.LOYALTY_WEBHOOK_ENDPOINT_ID?.trim() ?? "";
  const currentPath =
    environment.LOYALTY_WEBHOOK_CURRENT_SECRET_FILE?.trim() ?? "";
  const previousPath =
    environment.LOYALTY_WEBHOOK_PREVIOUS_SECRET_FILE?.trim() ?? "";
  const configuredOrigin =
    environment.LOYALTY_WEBHOOK_ALLOWED_ORIGIN?.trim() ?? "";
  const timeoutMs = Number(environment.LOYALTY_WEBHOOK_TIMEOUT_MS ?? "15000");
  const testMode = environment.LOYALTY_WEBHOOK_TEST_MODE === "true";
  if (!UUID_PATTERN.test(endpointId)) {
    throw new Error("webhook_config_invalid_endpoint");
  }
  if (!isAbsolute(currentPath)) {
    throw new Error("webhook_config_secret_path_not_absolute");
  }
  if (previousPath !== "" && !isAbsolute(previousPath)) {
    throw new Error("webhook_config_previous_secret_path_not_absolute");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new Error("webhook_config_invalid_timeout");
  }
  const allowedOrigin = parseAllowedOrigin(configuredOrigin, testMode);
  const currentSecret = parseWebhookSecret(
    stripOneTrailingLineBreak(readFileSync(currentPath, "utf8")),
  );
  const previousSecret =
    previousPath === ""
      ? null
      : parseWebhookSecret(
          stripOneTrailingLineBreak(readFileSync(previousPath, "utf8")),
        );
  if (
    previousSecret !== null &&
    previousSecret.fingerprint === currentSecret.fingerprint
  ) {
    throw new Error("webhook_config_rotation_secrets_match");
  }
  return {
    endpointId,
    currentSecret,
    previousSecret,
    allowedOrigin,
    timeoutMs,
    testMode,
  };
}

export function createWebhookDeliveryRuntime(
  config: WebhookDeliveryConfig,
  lookupImplementation: WebhookLookup = async (hostname) =>
    dnsLookup(hostname, { all: true, verbatim: true }),
): WebhookDeliveryRuntime {
  return { config, lookup: lookupImplementation };
}

export async function runWebhookDeliveryLifecycle(
  sql: Sql,
  workerId: string,
  runtime: WebhookDeliveryRuntime,
  batchSize = 10,
): Promise<WebhookDeliveryLifecycleResult> {
  const claims = (
    await sql<ClaimRow[]>`
      select schema_version, delivery_public_id::text, lease_expires_at
      from loyalty_private.claim_notification_webhook_deliveries_v1(
        ${runtime.config.endpointId}::uuid,
        ${runtime.config.currentSecret.fingerprint},
        ${runtime.config.previousSecret?.fingerprint ?? null},
        ${workerId}, ${batchSize}, 60
      )
    `
  ).map((row) =>
    webhookNotificationDeliveryClaimV1.parse({
      schemaVersion: row.schema_version,
      deliveryId: row.delivery_public_id,
      leaseExpiresAt: instantString(row.lease_expires_at),
    }),
  );
  if (claims.length > batchSize)
    throw new Error("webhook_claim_batch_exceeded");
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
    const authorization = await authorizeDispatch(
      sql,
      workerId,
      runtime,
      claim.deliveryId,
    );
    if (authorization.outcome !== "authorized") {
      totals.withheld += 1;
      if (authorization.outcome === "dead_letter") totals.deadLetter += 1;
      continue;
    }
    totals.authorized += 1;
    let result: DeliveryResult;
    try {
      const body = JSON.stringify(authorization.event);
      if (Buffer.byteLength(body, "utf8") > MAX_PAYLOAD_BYTES) {
        throw new WebhookDeliveryError("webhook_request_invalid");
      }
      const timestamp = Math.floor(Date.now() / 1_000).toString(10);
      const signatures = createWebhookSignatures(
        claim.deliveryId,
        timestamp,
        body,
        runtime.config,
      );
      const response = await postWebhook(
        runtime,
        authorization.destinationUrl,
        claim.deliveryId,
        timestamp,
        signatures,
        body,
      );
      result = classifyWebhookResponse(response);
    } catch (error) {
      result = classifyWebhookError(error);
    }
    const state = await finishDelivery(
      sql,
      workerId,
      runtime,
      claim.deliveryId,
      result,
    );
    if (state === "completed") totals.delivered += 1;
    else if (state === "retryable") totals.retryable += 1;
    else if (state === "dead_letter") totals.deadLetter += 1;
    else if (state === "manual_review") totals.manualReview += 1;
  }
  return totals;
}

async function authorizeDispatch(
  sql: Sql,
  workerId: string,
  runtime: WebhookDeliveryRuntime,
  deliveryId: string,
): Promise<WebhookNotificationDispatchAuthorizationV1> {
  const rows = await sql<AuthorizationRow[]>`
    select schema_version, delivery_public_id::text, outcome, attempt_count,
      destination_url, event
    from loyalty_private.authorize_notification_webhook_dispatch_v1(
      ${runtime.config.endpointId}::uuid,
      ${runtime.config.currentSecret.fingerprint},
      ${runtime.config.previousSecret?.fingerprint ?? null},
      ${deliveryId}::uuid, ${workerId}
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("webhook_authorization_unavailable");
  return webhookNotificationDispatchAuthorizationV1.parse(
    row.outcome === "authorized"
      ? {
          schemaVersion: row.schema_version,
          deliveryId: row.delivery_public_id,
          outcome: row.outcome,
          attempt: row.attempt_count,
          destinationUrl: row.destination_url,
          event: row.event,
        }
      : {
          schemaVersion: row.schema_version,
          deliveryId: row.delivery_public_id,
          outcome: row.outcome,
        },
  );
}

async function finishDelivery(
  sql: Sql,
  workerId: string,
  runtime: WebhookDeliveryRuntime,
  deliveryId: string,
  result: DeliveryResult,
): Promise<string> {
  const rows = await sql<StateRow[]>`
    select state, outcome, scheduled_at
    from loyalty_private.finish_notification_webhook_delivery_v1(
      ${runtime.config.endpointId}::uuid,
      ${runtime.config.currentSecret.fingerprint},
      ${runtime.config.previousSecret?.fingerprint ?? null},
      ${deliveryId}::uuid, ${workerId}, ${result.outcome},
      ${result.responseCode}, ${result.errorCode},
      ${result.retryAfterSeconds}
    )
  `;
  const state = rows[0]?.state;
  if (
    state !== "completed" &&
    state !== "retryable" &&
    state !== "dead_letter" &&
    state !== "manual_review"
  ) {
    throw new Error("webhook_finish_result_invalid");
  }
  return state;
}

export function createWebhookSignatures(
  deliveryId: string,
  timestamp: string,
  body: string,
  config: WebhookDeliveryConfig,
): string {
  if (
    !UUID_PATTERN.test(deliveryId) ||
    !/^(?:0|[1-9][0-9]*)$/u.test(timestamp)
  ) {
    throw new WebhookDeliveryError("webhook_request_invalid");
  }
  const signed = `${deliveryId}.${timestamp}.${body}`;
  return [config.currentSecret, config.previousSecret]
    .filter((secret): secret is WebhookSecret => secret !== null)
    .map(
      (secret) =>
        `v1,${createHmac("sha256", secret.bytes).update(signed, "utf8").digest("base64")}`,
    )
    .join(" ");
}

async function postWebhook(
  runtime: WebhookDeliveryRuntime,
  destinationValue: string,
  deliveryId: string,
  timestamp: string,
  signatures: string,
  body: string,
): Promise<ResponseSummary> {
  const destination = new URL(destinationValue);
  if (destination.origin !== runtime.config.allowedOrigin) {
    throw new WebhookDeliveryError("webhook_destination_forbidden");
  }
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body, "utf8").toString(10),
    "user-agent": "Starfiniti-Loyalty-Webhooks/1",
    "webhook-id": deliveryId,
    "webhook-timestamp": timestamp,
    "webhook-signature": signatures,
  };
  if (runtime.config.testMode) {
    if (
      destination.protocol !== "http:" ||
      !isLoopbackHostname(destination.hostname)
    ) {
      throw new WebhookDeliveryError("webhook_destination_forbidden");
    }
    return sendRequest(httpRequest, destination, headers, body, runtime.config);
  }
  if (
    destination.protocol !== "https:" ||
    (destination.port !== "" && destination.port !== "443") ||
    isIP(destination.hostname) !== 0
  ) {
    throw new WebhookDeliveryError("webhook_destination_forbidden");
  }
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await runtime.lookup(destination.hostname);
  } catch {
    throw new WebhookDeliveryError("webhook_dns_unavailable");
  }
  if (
    !Array.isArray(addresses) ||
    addresses.length === 0 ||
    addresses.some((answer) => !isPublicWebhookAddress(answer.address))
  ) {
    throw new WebhookDeliveryError("webhook_destination_forbidden");
  }
  const selected = [...addresses].sort((left, right) =>
    left.address.localeCompare(right.address),
  )[0];
  if (!selected) throw new WebhookDeliveryError("webhook_dns_unavailable");
  return sendRequest(
    httpsRequest,
    destination,
    headers,
    body,
    runtime.config,
    selected,
  );
}

type RequestFunction = typeof httpRequest | typeof httpsRequest;

function sendRequest(
  requestFunction: RequestFunction,
  destination: URL,
  headers: Record<string, string>,
  body: string,
  config: WebhookDeliveryConfig,
  pinnedAddress?: Readonly<{ address: string; family: number }>,
): Promise<ResponseSummary> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finishReject = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = requestFunction(
      {
        protocol: destination.protocol,
        hostname: destination.hostname,
        port: destination.port || undefined,
        path: destination.pathname,
        method: "POST",
        headers,
        ...(pinnedAddress
          ? {
              lookup: (
                _hostname: string,
                _options: unknown,
                callback: (
                  error: NodeJS.ErrnoException | null,
                  address: string,
                  family: number,
                ) => void,
              ) => callback(null, pinnedAddress.address, pinnedAddress.family),
            }
          : {}),
      },
      (response) => {
        let responseBytes = 0;
        response.on("data", (chunk: Buffer | string) => {
          responseBytes += Buffer.byteLength(chunk);
          if (responseBytes > MAX_RESPONSE_BYTES) {
            response.destroy();
            finishReject(
              new WebhookDeliveryError("webhook_response_too_large"),
            );
          }
        });
        response.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            status: response.statusCode ?? 0,
            retryAfterSeconds: parseRetryAfter(response.headers["retry-after"]),
          });
        });
      },
    );
    request.setTimeout(config.timeoutMs, () => {
      request.destroy();
      finishReject(new WebhookDeliveryError("webhook_timeout"));
    });
    request.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      const code =
        error.code === "ENOTFOUND" || error.code === "EAI_AGAIN"
          ? "webhook_dns_unavailable"
          : request.socket?.bytesWritten
            ? "webhook_connection_ambiguous"
            : "webhook_connection_unavailable";
      finishReject(new WebhookDeliveryError(code));
    });
    request.end(body, "utf8");
  });
}

function classifyWebhookResponse(response: ResponseSummary): DeliveryResult {
  if (response.status >= 200 && response.status <= 299) {
    return {
      outcome: "delivered",
      responseCode: response.status,
      errorCode: null,
      retryAfterSeconds: null,
    };
  }
  if (
    response.status === 408 ||
    response.status === 425 ||
    response.status === 429 ||
    (response.status >= 500 && response.status <= 599)
  ) {
    return {
      outcome: "retryable",
      responseCode: response.status,
      errorCode: null,
      retryAfterSeconds:
        response.status === 429
          ? (response.retryAfterSeconds ?? 60)
          : response.retryAfterSeconds,
    };
  }
  return {
    outcome: "dead_letter",
    responseCode: response.status,
    errorCode: response.status === 410 ? "webhook_endpoint_gone" : null,
    retryAfterSeconds: null,
  };
}

function classifyWebhookError(error: unknown): DeliveryResult {
  const code =
    error instanceof WebhookDeliveryError
      ? error.code
      : "webhook_connection_ambiguous";
  const permanent = [
    "webhook_destination_forbidden",
    "webhook_response_too_large",
    "webhook_request_invalid",
  ].includes(code);
  return {
    outcome: permanent ? "dead_letter" : "retryable",
    responseCode: null,
    errorCode: code,
    retryAfterSeconds: null,
  };
}

export function isPublicWebhookAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !webhookAddressBlockList.check(address, "ipv4");
  if (family === 6) return !webhookAddressBlockList.check(address, "ipv6");
  return false;
}

function parseAllowedOrigin(value: string, testMode: boolean): string {
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error("webhook_config_allowed_origin_invalid");
  }
  if (
    origin.username !== "" ||
    origin.password !== "" ||
    origin.pathname !== "/" ||
    origin.search !== "" ||
    origin.hash !== ""
  ) {
    throw new Error("webhook_config_allowed_origin_invalid");
  }
  if (testMode) {
    if (origin.protocol !== "http:" || !isLoopbackHostname(origin.hostname)) {
      throw new Error("webhook_config_test_origin_invalid");
    }
  } else if (
    origin.protocol !== "https:" ||
    (origin.port !== "" && origin.port !== "443") ||
    isIP(origin.hostname) !== 0
  ) {
    throw new Error("webhook_config_allowed_origin_invalid");
  }
  return origin.origin;
}

function parseWebhookSecret(value: string): WebhookSecret {
  if (!value.startsWith("whsec_")) {
    throw new Error("webhook_config_invalid_secret");
  }
  const encoded = value.slice("whsec_".length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) {
    throw new Error("webhook_config_invalid_secret");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.byteLength < 24 ||
    bytes.byteLength > 64 ||
    bytes.toString("base64") !== encoded
  ) {
    throw new Error("webhook_config_invalid_secret");
  }
  return {
    bytes,
    fingerprint: createHash("sha256").update(bytes).digest("hex"),
  };
}

function parseRetryAfter(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  if (/^[0-9]+$/u.test(raw)) {
    const seconds = Number(raw);
    return Number.isInteger(seconds) && seconds >= 1
      ? Math.min(seconds, 86_400)
      : null;
  }
  const retryAt = Date.parse(raw);
  if (!Number.isFinite(retryAt)) return null;
  return Math.max(
    1,
    Math.min(86_400, Math.ceil((retryAt - Date.now()) / 1_000)),
  );
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]"
  );
}

function stripOneTrailingLineBreak(value: string): string {
  return value.replace(/(?:\r\n|\n)$/u, "");
}

function instantString(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export type WebhookAuthorizedNotificationEvent = NotificationEventV1;
