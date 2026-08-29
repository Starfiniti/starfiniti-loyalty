import { scryptSync } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { isAbsolute } from "node:path";
import {
  klaviyoNotificationActionAuthorizationV1,
  klaviyoNotificationOperationClaimV1,
  klaviyoNotificationPreparationV1,
  type KlaviyoCustomerNotificationEventV1,
  type KlaviyoNotificationActionAuthorizationV1,
  type KlaviyoNotificationPreparationV1,
} from "@starfiniti/contracts";
import type { Sql } from "postgres";

const KLAVIYO_PRODUCTION_BASE_URL = "https://a.klaviyo.com/api";
const KLAVIYO_API_REVISION = "2026-07-15";
const KLAVIYO_CREDENTIAL_FINGERPRINT_CONTEXT =
  "starfiniti/klaviyo/credential-fingerprint/v2";
const KLAVIYO_CREDENTIAL_SCRYPT = Object.freeze({
  N: 1 << 15,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});
const MAX_RESPONSE_BYTES = 128 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/u;

type KlaviyoFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type KlaviyoDeliveryConfig = Readonly<{
  connectionId: string;
  apiKey: string;
  credentialSha256: string;
  apiRevision: typeof KLAVIYO_API_REVISION;
  baseUrl: string;
  timeoutMs: number;
}>;

export type KlaviyoDeliveryRuntime = Readonly<{
  config: KlaviyoDeliveryConfig;
  fetch: KlaviyoFetch;
}>;

export type KlaviyoNotificationLifecycleResult = Readonly<{
  claimed: number;
  authorized: number;
  accepted: number;
  retryable: number;
  deadLetter: number;
  manualReview: number;
  withheld: number;
  providerSuppressed: number;
}>;

type ClaimRow = Readonly<{
  schema_version: string;
  operation_public_id: string;
  operation_kind: string;
  lease_expires_at: string | Date;
}>;

type PreparationRow = Readonly<{
  schema_version: string;
  operation_public_id: string;
  outcome: string;
  operation_kind: string | null;
  attempt_count: number | null;
  recipient_email: string | null;
  external_customer_public_id: string | null;
  provider_profile_id: string | null;
  api_revision: string | null;
  list_id: string | null;
  preference_event_public_id: string | null;
  desired_state: string | null;
  effective_at: string | Date | null;
  event: unknown;
}>;

type ActionRow = Readonly<{
  schema_version: string;
  operation_public_id: string;
  outcome: string;
  action: string | null;
  provider_profile_id: string | null;
}>;

type StateRow = Readonly<{
  state: string;
  outcome?: string;
  scheduled_at?: string | Date | null;
  provider_profile_id?: string | null;
  preference_state?: string;
}>;

type OperationPhase =
  "profile" | "provider_check" | "event" | "subscribe" | "unsubscribe";
type OperationResult = Readonly<{
  outcome: "completed" | "retryable" | "dead_letter" | "manual_review";
  responseCode: number | null;
  errorCode: string | null;
  retryAfterSeconds: number | null;
}>;

export function readKlaviyoDeliveryConfig(
  environment: NodeJS.ProcessEnv,
): KlaviyoDeliveryConfig | null {
  if (environment.LOYALTY_KLAVIYO_ENABLED !== "true") return null;
  const connectionId = environment.LOYALTY_KLAVIYO_CONNECTION_ID?.trim() ?? "";
  const keyFile = environment.LOYALTY_KLAVIYO_API_KEY_FILE?.trim() ?? "";
  const testMode = environment.LOYALTY_KLAVIYO_TEST_MODE === "true";
  const configuredBase = environment.LOYALTY_KLAVIYO_BASE_URL?.trim();
  const timeoutMs = Number(environment.LOYALTY_KLAVIYO_TIMEOUT_MS ?? "10000");
  if (!UUID_PATTERN.test(connectionId)) {
    throw new Error("klaviyo_config_invalid_connection");
  }
  if (!isAbsolute(keyFile)) {
    throw new Error("klaviyo_config_key_path_not_absolute");
  }
  const apiKey = stripOneTrailingLineBreak(readKlaviyoKey(keyFile));
  if (!/^[^\s\r\n]{8,500}$/u.test(apiKey)) {
    throw new Error("klaviyo_config_invalid_key");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new Error("klaviyo_config_invalid_timeout");
  }
  let baseUrl = KLAVIYO_PRODUCTION_BASE_URL;
  if (configuredBase !== undefined) {
    if (!testMode) throw new Error("klaviyo_config_base_override_forbidden");
    const parsed = new URL(configuredBase);
    if (
      parsed.protocol !== "http:" ||
      (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      throw new Error("klaviyo_config_test_base_invalid");
    }
    baseUrl = parsed.toString().replace(/\/$/u, "");
  } else if (testMode) {
    throw new Error("klaviyo_config_test_base_required");
  }
  const credentialSha256 = fingerprintKlaviyoCredential(apiKey, connectionId);
  return {
    connectionId,
    apiKey,
    credentialSha256,
    apiRevision: KLAVIYO_API_REVISION,
    baseUrl,
    timeoutMs,
  };
}

export function fingerprintKlaviyoCredential(
  apiKey: string,
  connectionId: string,
): string {
  if (!UUID_PATTERN.test(connectionId) || !/^[^\s\r\n]{8,500}$/u.test(apiKey)) {
    throw new Error("klaviyo_config_invalid_fingerprint_input");
  }
  const salt = `${KLAVIYO_CREDENTIAL_FINGERPRINT_CONTEXT}\0${connectionId.toLowerCase()}`;
  return scryptSync(apiKey, salt, 32, KLAVIYO_CREDENTIAL_SCRYPT).toString(
    "hex",
  );
}

function readKlaviyoKey(path: string): string {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size < 8 || before.size > 502) {
      throw new Error("invalid key file");
    }
    const raw = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const link = lstatSync(path);
    if (
      raw.length !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      after.mode !== before.mode ||
      after.uid !== before.uid ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      link.isSymbolicLink() ||
      !link.isFile() ||
      link.dev !== before.dev ||
      link.ino !== before.ino ||
      link.size !== before.size
    ) {
      throw new Error("unstable key file");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new Error("klaviyo_config_key_unavailable");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function createKlaviyoDeliveryRuntime(
  config: KlaviyoDeliveryConfig,
  fetchImplementation: KlaviyoFetch = fetch,
): KlaviyoDeliveryRuntime {
  return { config, fetch: fetchImplementation };
}

export async function runKlaviyoNotificationLifecycle(
  sql: Sql,
  workerId: string,
  runtime: KlaviyoDeliveryRuntime,
  batchSize = 10,
): Promise<KlaviyoNotificationLifecycleResult> {
  const claimRows = await sql<ClaimRow[]>`
    select schema_version, operation_public_id::text, operation_kind,
      lease_expires_at
    from loyalty_private.claim_klaviyo_notification_operations_v1(
      ${runtime.config.connectionId}::uuid,
      ${runtime.config.credentialSha256}, ${workerId}, ${batchSize}, 60
    )
  `;
  if (claimRows.length > batchSize)
    throw new Error("klaviyo_claim_batch_exceeded");
  const claims = claimRows.map((row) =>
    klaviyoNotificationOperationClaimV1.parse({
      schemaVersion: row.schema_version,
      operationId: row.operation_public_id,
      operationKind: row.operation_kind,
      leaseExpiresAt: instantString(row.lease_expires_at),
    }),
  );
  const totals = {
    claimed: claims.length,
    authorized: 0,
    accepted: 0,
    retryable: 0,
    deadLetter: 0,
    manualReview: 0,
    withheld: 0,
    providerSuppressed: 0,
  };
  for (const claim of claims) {
    const preparation = await prepareOperation(
      sql,
      workerId,
      runtime,
      claim.operationId,
    );
    if (preparation.outcome !== "authorized") {
      totals.withheld += 1;
      continue;
    }
    totals.authorized += 1;

    let profileResult: Readonly<{ id: string; status: number }>;
    try {
      profileResult = await upsertKlaviyoProfile(runtime, preparation);
    } catch (error) {
      applyFinishedState(
        totals,
        await finishOperation(
          sql,
          workerId,
          runtime,
          claim.operationId,
          "profile",
          classifyKlaviyoError(error, "profile"),
        ),
      );
      continue;
    }
    const profileState = await recordProfile(
      sql,
      workerId,
      runtime,
      claim.operationId,
      profileResult,
    );
    if (profileState === "manual_review") {
      totals.manualReview += 1;
      continue;
    }

    if (
      preparation.operationKind === "consent_sync" &&
      preparation.desiredState === "subscribed"
    ) {
      let providerSuppression: ProviderSuppressionReason | null;
      try {
        providerSuppression = await readKlaviyoProviderSuppression(
          runtime,
          profileResult.id,
        );
      } catch (error) {
        applyFinishedState(
          totals,
          await finishOperation(
            sql,
            workerId,
            runtime,
            claim.operationId,
            "provider_check",
            classifyKlaviyoError(error, "provider_check"),
          ),
        );
        continue;
      }
      if (providerSuppression !== null) {
        await recordProviderSuppression(
          sql,
          workerId,
          runtime,
          claim.operationId,
          providerSuppression,
        );
        totals.providerSuppressed += 1;
        continue;
      }
    }

    const actionAuthorization = await authorizeAction(
      sql,
      workerId,
      runtime,
      claim.operationId,
    );
    if (actionAuthorization.outcome !== "authorized") {
      totals.withheld += 1;
      continue;
    }
    const phase = actionAuthorization.action;
    let result: OperationResult;
    try {
      await submitKlaviyoAction(runtime, preparation, actionAuthorization);
      result = {
        outcome: "completed",
        responseCode: 202,
        errorCode: null,
        retryAfterSeconds: null,
      };
    } catch (error) {
      result = classifyKlaviyoError(error, phase);
    }
    applyFinishedState(
      totals,
      await finishOperation(
        sql,
        workerId,
        runtime,
        claim.operationId,
        phase,
        result,
      ),
    );
  }
  return totals;
}

async function prepareOperation(
  sql: Sql,
  workerId: string,
  runtime: KlaviyoDeliveryRuntime,
  operationId: string,
): Promise<KlaviyoNotificationPreparationV1> {
  const rows = await sql<PreparationRow[]>`
    select schema_version, operation_public_id::text, outcome, operation_kind,
      attempt_count, recipient_email, external_customer_public_id::text,
      provider_profile_id, api_revision, list_id,
      preference_event_public_id::text, desired_state, effective_at, event
    from loyalty_private.prepare_klaviyo_notification_operation_v1(
      ${runtime.config.connectionId}::uuid,
      ${runtime.config.credentialSha256}, ${operationId}::uuid, ${workerId}
    )
  `;
  const row = rows[0];
  if (!row || rows.length !== 1) throw new Error("klaviyo_preparation_invalid");
  try {
    if (row.outcome !== "authorized") {
      return klaviyoNotificationPreparationV1.parse({
        schemaVersion: row.schema_version,
        operationId: row.operation_public_id,
        outcome: row.outcome,
      });
    }
    const common = {
      schemaVersion: row.schema_version,
      operationId: row.operation_public_id,
      outcome: row.outcome,
      operationKind: row.operation_kind,
      attempt: Number(row.attempt_count),
      recipientEmail: row.recipient_email,
      externalCustomerId: row.external_customer_public_id,
      providerProfileId: row.provider_profile_id,
      apiRevision: row.api_revision,
      listId: row.list_id,
    };
    return klaviyoNotificationPreparationV1.parse(
      row.operation_kind === "event_sync"
        ? { ...common, event: row.event }
        : {
            ...common,
            preferenceEventId: row.preference_event_public_id,
            desiredState: row.desired_state,
            effectiveAt:
              row.effective_at === null
                ? null
                : instantString(row.effective_at),
          },
    );
  } catch {
    throw new Error("klaviyo_preparation_invalid");
  }
}

async function recordProfile(
  sql: Sql,
  workerId: string,
  runtime: KlaviyoDeliveryRuntime,
  operationId: string,
  profile: Readonly<{ id: string; status: number }>,
): Promise<string> {
  const rows = await sql<StateRow[]>`
    select state, provider_profile_id
    from loyalty_private.record_klaviyo_profile_v1(
      ${runtime.config.connectionId}::uuid,
      ${runtime.config.credentialSha256}, ${operationId}::uuid, ${workerId},
      ${profile.id}, ${profile.status}
    )
  `;
  const row = rows[0];
  if (
    !row ||
    rows.length !== 1 ||
    !["processing", "manual_review"].includes(row.state)
  ) {
    throw new Error("klaviyo_profile_record_invalid");
  }
  return row.state;
}

async function authorizeAction(
  sql: Sql,
  workerId: string,
  runtime: KlaviyoDeliveryRuntime,
  operationId: string,
): Promise<KlaviyoNotificationActionAuthorizationV1> {
  const rows = await sql<ActionRow[]>`
    select schema_version, operation_public_id::text, outcome, action,
      provider_profile_id
    from loyalty_private.authorize_klaviyo_provider_action_v1(
      ${runtime.config.connectionId}::uuid,
      ${runtime.config.credentialSha256}, ${operationId}::uuid, ${workerId}
    )
  `;
  const row = rows[0];
  if (!row || rows.length !== 1) throw new Error("klaviyo_action_invalid");
  try {
    return klaviyoNotificationActionAuthorizationV1.parse(
      row.outcome === "authorized"
        ? {
            schemaVersion: row.schema_version,
            operationId: row.operation_public_id,
            outcome: row.outcome,
            action: row.action,
            providerProfileId: row.provider_profile_id,
          }
        : {
            schemaVersion: row.schema_version,
            operationId: row.operation_public_id,
            outcome: row.outcome,
          },
    );
  } catch {
    throw new Error("klaviyo_action_invalid");
  }
}

async function recordProviderSuppression(
  sql: Sql,
  workerId: string,
  runtime: KlaviyoDeliveryRuntime,
  operationId: string,
  reason: ProviderSuppressionReason,
): Promise<void> {
  const rows = await sql<StateRow[]>`
    select state, preference_state
    from loyalty_private.record_klaviyo_provider_suppression_v1(
      ${runtime.config.connectionId}::uuid,
      ${runtime.config.credentialSha256}, ${operationId}::uuid, ${workerId},
      ${reason}
    )
  `;
  const row = rows[0];
  if (
    !row ||
    rows.length !== 1 ||
    row.state !== "suppressed" ||
    row.preference_state !== "suppressed"
  ) {
    throw new Error("klaviyo_suppression_record_invalid");
  }
}

async function finishOperation(
  sql: Sql,
  workerId: string,
  runtime: KlaviyoDeliveryRuntime,
  operationId: string,
  phase: OperationPhase,
  result: OperationResult,
): Promise<string> {
  const rows = await sql<StateRow[]>`
    select state, outcome, scheduled_at
    from loyalty_private.finish_klaviyo_notification_operation_v1(
      ${runtime.config.connectionId}::uuid,
      ${runtime.config.credentialSha256}, ${operationId}::uuid, ${workerId},
      ${phase}, ${result.outcome}, ${result.responseCode},
      ${result.errorCode}, ${result.retryAfterSeconds}
    )
  `;
  const row = rows[0];
  if (!row || rows.length !== 1 || row.state !== row.outcome) {
    throw new Error("klaviyo_finish_invalid");
  }
  return row.state;
}

export async function upsertKlaviyoProfile(
  runtime: KlaviyoDeliveryRuntime,
  preparation: Extract<
    KlaviyoNotificationPreparationV1,
    { outcome: "authorized" }
  >,
): Promise<Readonly<{ id: string; status: number }>> {
  const response = await klaviyoRequest(runtime, "/profile-import", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "profile",
        ...(preparation.providerProfileId === null
          ? {}
          : { id: preparation.providerProfileId }),
        attributes: {
          email: preparation.recipientEmail,
          external_id: preparation.externalCustomerId,
        },
      },
    }),
  });
  if (response.status !== 200 && response.status !== 201) {
    throw responseError(response);
  }
  const payload = await readBoundedJson(response);
  const data = objectProperty(payload, "data");
  const id = data === null ? null : stringProperty(data, "id");
  if (
    data === null ||
    stringProperty(data, "type") !== "profile" ||
    id === null ||
    !PROVIDER_ID_PATTERN.test(id)
  ) {
    throw new KlaviyoPayloadError("klaviyo_profile_response_invalid");
  }
  return { id, status: response.status };
}

export type ProviderSuppressionReason =
  "provider_unsubscribe" | "hard_bounce" | "spam_complaint" | "invalid_contact";

export async function readKlaviyoProviderSuppression(
  runtime: KlaviyoDeliveryRuntime,
  providerProfileId: string,
): Promise<ProviderSuppressionReason | null> {
  if (!PROVIDER_ID_PATTERN.test(providerProfileId)) {
    throw new KlaviyoPayloadError("klaviyo_subscription_response_invalid");
  }
  const response = await klaviyoRequest(
    runtime,
    `/profiles/${encodeURIComponent(providerProfileId)}?additional-fields%5Bprofile%5D=subscriptions&fields%5Bprofile%5D=subscriptions`,
    { method: "GET" },
  );
  if (response.status !== 200) throw responseError(response);
  const payload = await readBoundedJson(response);
  return detectKlaviyoProviderSuppression(payload, providerProfileId);
}

export function detectKlaviyoProviderSuppression(
  payload: unknown,
  expectedProfileId: string,
): ProviderSuppressionReason | null {
  const data = objectProperty(payload, "data");
  if (
    data === null ||
    stringProperty(data, "type") !== "profile" ||
    stringProperty(data, "id") !== expectedProfileId
  ) {
    throw new KlaviyoPayloadError("klaviyo_subscription_response_invalid");
  }
  const attributes = objectProperty(data, "attributes");
  const subscriptions = objectProperty(attributes, "subscriptions");
  const email = objectProperty(subscriptions, "email");
  const marketing = objectProperty(email, "marketing");
  if (marketing === null) {
    throw new KlaviyoPayloadError("klaviyo_subscription_response_invalid");
  }
  const consent = stringProperty(marketing, "consent");
  const canReceive = marketing.can_receive_email_marketing;
  const suppressions = marketing.suppression;
  const listSuppressions = marketing.list_suppressions;
  if (
    consent === null ||
    typeof canReceive !== "boolean" ||
    !isNullableArray(suppressions) ||
    !isNullableArray(listSuppressions)
  ) {
    throw new KlaviyoPayloadError("klaviyo_subscription_response_invalid");
  }
  for (const suppression of suppressions ?? []) {
    if (
      typeof suppression !== "object" ||
      suppression === null ||
      Array.isArray(suppression)
    ) {
      throw new KlaviyoPayloadError("klaviyo_subscription_response_invalid");
    }
    const code = stringProperty(
      suppression as Record<string, unknown>,
      "reason",
    );
    if (code === "HARD_BOUNCE") return "hard_bounce";
    if (code === "INVALID_EMAIL") return "invalid_contact";
    if (code === "SPAM_COMPLAINT") return "spam_complaint";
    if (code === "UNSUBSCRIBE" || code === "USER_SUPPRESSED") {
      return "provider_unsubscribe";
    }
    throw new KlaviyoPayloadError("klaviyo_subscription_response_invalid");
  }
  if ((listSuppressions ?? []).length > 0) return "provider_unsubscribe";
  if (consent === "UNSUBSCRIBED" || !canReceive) return "provider_unsubscribe";
  if (consent !== "SUBSCRIBED" && consent !== "NEVER_SUBSCRIBED") {
    throw new KlaviyoPayloadError("klaviyo_subscription_response_invalid");
  }
  return null;
}

export async function submitKlaviyoAction(
  runtime: KlaviyoDeliveryRuntime,
  preparation: Extract<
    KlaviyoNotificationPreparationV1,
    { outcome: "authorized" }
  >,
  authorization: Extract<
    KlaviyoNotificationActionAuthorizationV1,
    { outcome: "authorized" }
  >,
): Promise<void> {
  let path: string;
  let body: unknown;
  if (authorization.action === "event") {
    if (preparation.operationKind !== "event_sync") {
      throw new KlaviyoPayloadError("klaviyo_request_invalid");
    }
    path = "/events";
    body = klaviyoEventRequest(
      preparation.event,
      authorization.providerProfileId,
    );
  } else if (authorization.action === "subscribe") {
    if (
      preparation.operationKind !== "consent_sync" ||
      preparation.desiredState !== "subscribed"
    ) {
      throw new KlaviyoPayloadError("klaviyo_request_invalid");
    }
    path = "/profile-subscription-bulk-create-jobs";
    body = klaviyoSubscribeRequest(
      authorization.providerProfileId,
      preparation.listId,
    );
  } else {
    if (
      preparation.operationKind !== "consent_sync" ||
      preparation.desiredState !== "unsubscribed"
    ) {
      throw new KlaviyoPayloadError("klaviyo_request_invalid");
    }
    path = "/profile-subscription-bulk-delete-jobs";
    body = klaviyoUnsubscribeRequest(preparation.recipientEmail);
  }
  const response = await klaviyoRequest(runtime, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (response.status !== 202) throw responseError(response);
}

export function klaviyoEventRequest(
  event: KlaviyoCustomerNotificationEventV1,
  providerProfileId: string,
): unknown {
  return {
    data: {
      type: "event",
      attributes: {
        properties: {
          schema_version: event.schemaVersion,
          purpose: event.purpose,
          programme_group_id: event.programmeGroupId,
          ...event.payload,
        },
        time: event.occurredAt,
        unique_id: event.eventId,
        metric: {
          data: {
            type: "metric",
            attributes: { name: event.eventType },
          },
        },
        profile: {
          data: {
            type: "profile",
            id: providerProfileId,
            attributes: { external_id: event.subject.customerId },
          },
        },
      },
    },
  };
}

export function klaviyoSubscribeRequest(
  providerProfileId: string,
  listId: string | null,
): unknown {
  return {
    data: {
      type: "profile-subscription-bulk-create-job",
      attributes: {
        custom_source: "Starfiniti Loyalty",
        profiles: {
          data: [
            {
              type: "profile",
              id: providerProfileId,
              attributes: {
                subscriptions: {
                  email: { marketing: { consent: "SUBSCRIBED" } },
                },
              },
            },
          ],
        },
      },
      ...(listId === null
        ? {}
        : { relationships: { list: { data: { type: "list", id: listId } } } }),
    },
  };
}

export function klaviyoUnsubscribeRequest(recipientEmail: string): unknown {
  return {
    data: {
      type: "profile-subscription-bulk-delete-job",
      attributes: {
        profiles: {
          data: [
            {
              type: "profile",
              attributes: {
                email: recipientEmail,
                subscriptions: {
                  email: { marketing: { consent: "UNSUBSCRIBED" } },
                },
              },
            },
          ],
        },
      },
    },
  };
}

async function klaviyoRequest(
  runtime: KlaviyoDeliveryRuntime,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    runtime.config.timeoutMs,
  );
  try {
    return await runtime.fetch(`${runtime.config.baseUrl}${path}`, {
      ...init,
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/vnd.api+json",
        "content-type": "application/vnd.api+json",
        authorization: `Klaviyo-API-Key ${runtime.config.apiKey}`,
        revision: runtime.config.apiRevision,
      },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new KlaviyoTransportError("klaviyo_timeout");
    }
    if (isDnsError(error)) {
      throw new KlaviyoTransportError("klaviyo_dns_unavailable");
    }
    throw new KlaviyoTransportError("klaviyo_connection_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

export async function readBoundedJson(
  response: Response,
  maxBytes = MAX_RESPONSE_BYTES,
): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(declared) || Number(declared) > maxBytes) {
      throw new KlaviyoPayloadError("klaviyo_response_too_large");
    }
  }
  if (response.body === null) {
    throw new KlaviyoPayloadError("klaviyo_response_invalid");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    if (total + next.value.byteLength > maxBytes) {
      await reader.cancel();
      throw new KlaviyoPayloadError("klaviyo_response_too_large");
    }
    chunks.push(next.value);
    total += next.value.byteLength;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new KlaviyoPayloadError("klaviyo_response_invalid");
  }
}

export function classifyKlaviyoError(
  error: unknown,
  phase: OperationPhase,
): OperationResult {
  if (error instanceof KlaviyoHttpError) {
    if (error.status === 429 || (error.status >= 500 && error.status <= 599)) {
      return {
        outcome: "retryable",
        responseCode: error.status,
        errorCode: "klaviyo_provider_unavailable",
        retryAfterSeconds:
          error.status === 429
            ? (error.retryAfterSeconds ?? 60)
            : error.retryAfterSeconds,
      };
    }
    return {
      outcome: "dead_letter",
      responseCode: error.status,
      errorCode:
        error.status === 401 || error.status === 403
          ? "klaviyo_configuration_invalid"
          : "klaviyo_request_invalid",
      retryAfterSeconds: null,
    };
  }
  if (error instanceof KlaviyoPayloadError) {
    return {
      outcome: "dead_letter",
      responseCode: null,
      errorCode:
        error.code === "klaviyo_profile_response_invalid"
          ? error.code
          : error.code === "klaviyo_subscription_response_invalid"
            ? error.code
            : "klaviyo_request_invalid",
      retryAfterSeconds: null,
    };
  }
  if (error instanceof KlaviyoTransportError) {
    if (phase === "subscribe") {
      return {
        outcome: "manual_review",
        responseCode: null,
        errorCode: "klaviyo_subscribe_outcome_ambiguous",
        retryAfterSeconds: null,
      };
    }
    return {
      outcome: "retryable",
      responseCode: null,
      errorCode: error.code,
      retryAfterSeconds: null,
    };
  }
  return phase === "subscribe"
    ? {
        outcome: "manual_review",
        responseCode: null,
        errorCode: "klaviyo_subscribe_outcome_ambiguous",
        retryAfterSeconds: null,
      }
    : {
        outcome: "retryable",
        responseCode: null,
        errorCode: "klaviyo_connection_unavailable",
        retryAfterSeconds: null,
      };
}

function responseError(response: Response): Error {
  if (response.status >= 400) {
    return new KlaviyoHttpError(
      response.status,
      parseRetryAfter(response.headers.get("retry-after")),
    );
  }
  return new KlaviyoPayloadError("klaviyo_response_invalid");
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^[0-9]{1,10}$/u.test(value)) return null;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds >= 1
    ? Math.min(seconds, 86_400)
    : null;
}

function applyFinishedState(
  totals: {
    accepted: number;
    retryable: number;
    deadLetter: number;
    manualReview: number;
  },
  state: string,
): void {
  if (state === "completed") totals.accepted += 1;
  else if (state === "retryable") totals.retryable += 1;
  else if (state === "dead_letter") totals.deadLetter += 1;
  else if (state === "manual_review") totals.manualReview += 1;
  else throw new Error("klaviyo_finish_state_invalid");
}

function objectProperty(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const nested = (value as Record<string, unknown>)[key];
  return typeof nested === "object" && nested !== null && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : null;
}

function stringProperty(
  value: Record<string, unknown>,
  key: string,
): string | null {
  return typeof value[key] === "string" ? value[key] : null;
}

function isNullableArray(
  value: unknown,
): value is unknown[] | null | undefined {
  return value === null || value === undefined || Array.isArray(value);
}

function isDnsError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { cause?: { code?: unknown }; code?: unknown };
  return (
    candidate.code === "ENOTFOUND" || candidate.cause?.code === "ENOTFOUND"
  );
}

function instantString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function stripOneTrailingLineBreak(value: string): string {
  return value.replace(/\r?\n$/u, "");
}

class KlaviyoHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterSeconds: number | null,
  ) {
    super("klaviyo_http_error");
  }
}

class KlaviyoPayloadError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

class KlaviyoTransportError extends Error {
  constructor(
    readonly code:
      | "klaviyo_connection_unavailable"
      | "klaviyo_dns_unavailable"
      | "klaviyo_timeout",
  ) {
    super(code);
  }
}
