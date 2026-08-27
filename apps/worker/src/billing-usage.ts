import {
  managedBillingUsageDispatchAuthorityV1,
  managedBillingUsageDispatchClaimV1,
  managedBillingUsageDispatchResultV1,
  type ManagedBillingUsageDispatchAuthorityV1,
  type ManagedBillingUsageDispatchResultV1,
} from "@starfiniti/contracts/billing";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import type { Sql } from "postgres";

const STRIPE_API_ORIGIN = "https://api.stripe.com";
const STRIPE_API_VERSION = "2026-02-25.clover";
const STRIPE_KEY = /^rk_(test|live)_[A-Za-z0-9_]{16,240}$/u;
const MAX_RESPONSE_BYTES = 32_768;
const MIN_BIGINT = -(2n ** 63n);
const MAX_BIGINT = 2n ** 63n - 1n;

type ClaimRow = {
  dispatch_public_id: string;
  lease_token: string;
  attempt_number: number;
};

type AuthorityRow = {
  provider_event_name: string;
  provider_customer_id: string;
  provider_identifier: string;
  quantity: string;
  occurred_at: Date | string;
  live_mode: boolean;
};

export type BillingUsageLifecycleResult = Readonly<{
  captured: number;
  claimed: number;
  accepted: number;
  retryable: number;
  ambiguous: number;
  rejected: number;
  held: number;
  deferred: number;
}>;

export type StripeUsageRuntime = Readonly<{
  send(
    authority: ManagedBillingUsageDispatchAuthorityV1,
  ): Promise<ManagedBillingUsageDispatchResultV1>;
}>;

export class StripeUsageConfigurationError extends Error {
  constructor() {
    super("stripe_usage_provider_config_unavailable");
    this.name = "StripeUsageConfigurationError";
  }
}

type StripeUsageConfig = Readonly<{
  apiKey: string;
  baseUrl: string;
  liveMode: boolean;
  timeoutMs: number;
}>;

export function readStripeUsageApiKey(
  path = process.env.LOYALTY_STRIPE_API_KEY_FILE,
): string {
  if (!path || !isAbsolute(path)) throw new StripeUsageConfigurationError();
  try {
    const metadata = statSync(path);
    if (!metadata.isFile() || metadata.size < 25 || metadata.size > 256) {
      throw new Error("invalid Stripe key file");
    }
    const key = readFileSync(path, "utf8").trim();
    if (!STRIPE_KEY.test(key)) throw new Error("invalid Stripe key");
    return key;
  } catch {
    throw new StripeUsageConfigurationError();
  }
}

export function stripeUsageConfig(input: {
  apiKey: string;
  liveMode: boolean;
  environment?: Readonly<Record<string, string | undefined>>;
}): StripeUsageConfig {
  if (!STRIPE_KEY.test(input.apiKey)) throw new StripeUsageConfigurationError();
  if (input.apiKey.includes("_live_") !== input.liveMode) {
    throw new StripeUsageConfigurationError();
  }
  const environment = input.environment ?? process.env;
  const testMode = environment.LOYALTY_STRIPE_TEST_MODE === "true";
  const configuredBase = environment.LOYALTY_STRIPE_BASE_URL?.trim();
  let baseUrl = STRIPE_API_ORIGIN;
  if (configuredBase) {
    if (!testMode || !isLoopbackHttpOrigin(configuredBase)) {
      throw new StripeUsageConfigurationError();
    }
    baseUrl = new URL(configuredBase).origin;
  }
  const timeoutMs = Number(environment.LOYALTY_STRIPE_TIMEOUT_MS ?? "10000");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 15_000) {
    throw new StripeUsageConfigurationError();
  }
  return { apiKey: input.apiKey, baseUrl, liveMode: input.liveMode, timeoutMs };
}

export class StripeUsageClient implements StripeUsageRuntime {
  constructor(
    private readonly config: StripeUsageConfig,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async send(
    input: ManagedBillingUsageDispatchAuthorityV1,
  ): Promise<ManagedBillingUsageDispatchResultV1> {
    const authority = managedBillingUsageDispatchAuthorityV1.parse(input);
    const quantity = BigInt(authority.quantity);
    const occurredAt = Date.parse(authority.occurredAt);
    if (
      quantity === 0n ||
      quantity < MIN_BIGINT ||
      quantity > MAX_BIGINT ||
      !Number.isFinite(occurredAt) ||
      authority.liveMode !== this.config.liveMode
    ) {
      return result("held", "policy", null, "stripe_usage_request_invalid");
    }

    const body = new URLSearchParams({
      event_name: authority.eventName,
      "payload[stripe_customer_id]": authority.customerId,
      "payload[value]": authority.quantity,
      identifier: authority.identifier,
      timestamp: String(Math.floor(occurredAt / 1000)),
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImplementation(
        `${this.config.baseUrl}/v1/billing/meter_events`,
        {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            "content-type": "application/x-www-form-urlencoded",
            "idempotency-key": authority.identifier,
            "stripe-version": STRIPE_API_VERSION,
          },
          body,
        },
      );
    } catch (error) {
      return result(
        "ambiguous",
        "ambiguous",
        null,
        error instanceof DOMException && error.name === "AbortError"
          ? "stripe_usage_timeout"
          : "stripe_usage_response_interrupted",
      );
    } finally {
      clearTimeout(timeout);
    }

    let payload: unknown;
    try {
      payload = await boundedJson(response);
    } catch {
      return result(
        "ambiguous",
        "ambiguous",
        null,
        "stripe_usage_response_interrupted",
      );
    }
    if (response.ok) {
      return validMeterEvent(payload, authority, this.config.liveMode)
        ? result("accepted", "success", response.status, null)
        : result(
            "ambiguous",
            "ambiguous",
            null,
            "stripe_usage_response_interrupted",
          );
    }
    if (
      (response.status === 400 || response.status === 409) &&
      providerErrorCode(payload) === "duplicate_meter_event"
    ) {
      return result("accepted", "duplicate", response.status, null);
    }
    if (
      response.status === 409 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      return result(
        "retryable",
        "temporary_failure",
        response.status,
        "stripe_usage_provider_unavailable",
      );
    }
    return result(
      "rejected",
      "permanent_failure",
      response.status,
      "stripe_usage_request_rejected",
    );
  }
}

export async function runBillingUsageLifecycle(
  sql: Sql,
  workerId: string,
  options: Readonly<{
    batchSize?: number;
    captureFacts?: boolean;
    runtimeFactory?: (liveMode: boolean) => StripeUsageRuntime;
  }> = {},
): Promise<BillingUsageLifecycleResult> {
  const normalizedWorker = workerId.trim();
  const batchSize = options.batchSize ?? 25;
  if (normalizedWorker.length < 3 || normalizedWorker.length > 120) {
    throw new Error("billing_usage_worker_id_invalid");
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new Error("billing_usage_batch_size_invalid");
  }

  let captured = 0;
  let deferred = 0;
  if (options.captureFacts !== false) {
    try {
      const captureRows = await sql<{ captured_count: string }[]>`
        select captured_count::text
        from loyalty_private.capture_managed_billing_usage_facts_v1(500, now())
      `;
      captured = captureRows.reduce(
        (total, row) => total + boundedCount(row.captured_count),
        0,
      );
    } catch {
      deferred += 1;
    }
  }

  const rows = await sql<ClaimRow[]>`
    select dispatch_public_id::text, lease_token::text, attempt_number
    from loyalty_private.claim_managed_billing_usage_dispatches_v1(
      ${normalizedWorker}, ${batchSize}, 60, now()
    )
  `;
  if (rows.length > batchSize)
    throw new Error("billing_usage_claim_batch_exceeded");

  const counts = {
    captured,
    claimed: rows.length,
    accepted: 0,
    retryable: 0,
    ambiguous: 0,
    rejected: 0,
    held: 0,
    deferred,
  };
  const runtimes = new Map<boolean, StripeUsageRuntime>();

  for (const row of rows) {
    const claim = managedBillingUsageDispatchClaimV1.parse({
      dispatchId: row.dispatch_public_id,
      leaseToken: row.lease_token,
      attemptNumber: row.attempt_number,
    });
    try {
      const authorityRows = await sql<AuthorityRow[]>`
        select provider_event_name, provider_customer_id, provider_identifier,
          quantity, occurred_at, live_mode
        from loyalty_private.authorize_managed_billing_usage_dispatch_v1(
          ${claim.dispatchId}::uuid, ${claim.leaseToken}::uuid,
          ${normalizedWorker}, now()
        )
      `;
      if (authorityRows.length === 0) {
        counts.held += 1;
        continue;
      }
      if (authorityRows.length !== 1)
        throw new Error("billing_usage_authority_invalid");
      const row = authorityRows[0];
      const authority = managedBillingUsageDispatchAuthorityV1.parse({
        eventName: row?.provider_event_name,
        customerId: row?.provider_customer_id,
        identifier: row?.provider_identifier,
        quantity: row?.quantity,
        occurredAt: instant(row?.occurred_at),
        liveMode: row?.live_mode,
      });

      let runtime = runtimes.get(authority.liveMode);
      if (!runtime) {
        runtime = options.runtimeFactory
          ? options.runtimeFactory(authority.liveMode)
          : new StripeUsageClient(
              stripeUsageConfig({
                apiKey: readStripeUsageApiKey(),
                liveMode: authority.liveMode,
              }),
            );
        runtimes.set(authority.liveMode, runtime);
      }
      const providerResult = await runtime.send(authority);
      const parsed = managedBillingUsageDispatchResultV1.parse(providerResult);
      await finish(sql, normalizedWorker, claim, parsed);
      counts[parsed.outcome] += 1;
    } catch (error) {
      if (error instanceof StripeUsageConfigurationError) {
        const held = result(
          "held",
          "policy",
          null,
          "stripe_usage_provider_config_unavailable",
        );
        try {
          await finish(sql, normalizedWorker, claim, held);
          counts.held += 1;
        } catch {
          counts.deferred += 1;
        }
      } else {
        counts.deferred += 1;
      }
    }
  }
  return counts;
}

async function finish(
  sql: Sql,
  workerId: string,
  claim: { dispatchId: string; leaseToken: string },
  providerResult: ManagedBillingUsageDispatchResultV1,
): Promise<void> {
  await sql`
    select state, next_attempt_at
    from loyalty_private.finish_managed_billing_usage_dispatch_v1(
      ${claim.dispatchId}::uuid, ${claim.leaseToken}::uuid, ${workerId},
      ${providerResult.outcome}, ${providerResult.responseClass},
      ${providerResult.responseCode}, ${providerResult.errorCode}, now()
    )
  `;
}

function result(
  outcome: ManagedBillingUsageDispatchResultV1["outcome"],
  responseClass: ManagedBillingUsageDispatchResultV1["responseClass"],
  responseCode: number | null,
  errorCode: string | null,
): ManagedBillingUsageDispatchResultV1 {
  return managedBillingUsageDispatchResultV1.parse({
    outcome,
    responseClass,
    responseCode,
    errorCode,
  });
}

function validMeterEvent(
  payload: unknown,
  authority: ManagedBillingUsageDispatchAuthorityV1,
  liveMode: boolean,
): boolean {
  if (!isRecord(payload) || !isRecord(payload.payload)) return false;
  return (
    payload.object === "billing.meter_event" &&
    payload.event_name === authority.eventName &&
    payload.identifier === authority.identifier &&
    payload.livemode === liveMode &&
    payload.payload.stripe_customer_id === authority.customerId &&
    payload.payload.value === authority.quantity
  );
}

function providerErrorCode(payload: unknown): string | undefined {
  if (!isRecord(payload) || !isRecord(payload.error)) return undefined;
  return typeof payload.error.code === "string"
    ? payload.error.code
    : undefined;
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new Error("stripe_usage_response_too_large");
  }
  if (!response.body) throw new Error("stripe_usage_response_empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw new Error("stripe_usage_response_too_large");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function instant(value: Date | string | undefined): string | undefined {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function boundedCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0 || count > 2000) {
    throw new Error("billing_usage_capture_count_invalid");
  }
  return count;
}

function isLoopbackHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "[::1]") &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
