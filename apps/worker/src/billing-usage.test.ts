import { createServer, type IncomingMessage } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sql } from "postgres";
import { afterEach, describe, expect, it } from "vitest";

import {
  readStripeUsageApiKey,
  runBillingUsageLifecycle,
  StripeUsageClient,
  stripeUsageConfig,
  type StripeUsageRuntime,
} from "./billing-usage.ts";

const apiKey = ["rk", "test", "usagefixturesonly000000000000000"].join("_");
const rejectedBroadTestKey = [
  "sk",
  "test",
  "usagefixturesonly000000000000000",
].join("_");
const rejectedBroadLiveKey = [
  "sk",
  "live",
  "usagefixturesonly000000000000000",
].join("_");
const dispatchId = "a5000000-0000-4000-8000-000000000100";
const leaseToken = "a5000000-0000-4000-8000-000000000101";
const authority = {
  eventName: "starfiniti_orders",
  customerId: "cus_UsageFixture001",
  identifier: "m14u_a5000000000040008000000000000100",
  quantity: "1",
  occurredAt: "2026-08-27T01:00:00.000Z",
  liveMode: false,
} as const;
const cleanup: Array<() => void> = [];

afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

describe("Stripe meter-event client", () => {
  it("posts one minimized, version-pinned meter event to a loopback sink", async () => {
    let received:
      | Readonly<{
          method: string | undefined;
          path: string | undefined;
          headers: IncomingMessage["headers"];
          body: string;
        }>
      | undefined;
    const origin = await sink(async (request, body) => {
      received = {
        method: request.method,
        path: request.url,
        headers: request.headers,
        body,
      };
      return [
        200,
        {
          object: "billing.meter_event",
          event_name: authority.eventName,
          identifier: authority.identifier,
          livemode: false,
          payload: {
            stripe_customer_id: authority.customerId,
            value: authority.quantity,
          },
        },
      ];
    });
    const client = clientFor(origin);
    await expect(client.send(authority)).resolves.toEqual({
      outcome: "accepted",
      responseClass: "success",
      responseCode: 200,
      errorCode: null,
    });
    expect(received?.method).toBe("POST");
    expect(received?.path).toBe("/v1/billing/meter_events");
    expect(received?.headers.authorization).toBe(`Bearer ${apiKey}`);
    expect(received?.headers["stripe-version"]).toBe("2026-02-25.clover");
    expect(received?.headers["idempotency-key"]).toBe(authority.identifier);
    const form = new URLSearchParams(received?.body);
    expect(Object.fromEntries(form)).toEqual({
      event_name: authority.eventName,
      "payload[stripe_customer_id]": authority.customerId,
      "payload[value]": "1",
      identifier: authority.identifier,
      timestamp: "1787792400",
    });
    expect(received?.body).not.toMatch(/email|price|payment|secret/u);
  });

  it("classifies duplicate, retryable, rejected, and malformed outcomes", async () => {
    await expect(
      clientWithResponse(400, {
        error: { code: "duplicate_meter_event", message: "discard" },
      }).send(authority),
    ).resolves.toMatchObject({
      outcome: "accepted",
      responseClass: "duplicate",
    });
    await expect(
      clientWithResponse(429, { error: { message: "discard" } }).send(
        authority,
      ),
    ).resolves.toMatchObject({ outcome: "retryable" });
    await expect(
      clientWithResponse(422, { error: { message: "discard" } }).send(
        authority,
      ),
    ).resolves.toMatchObject({ outcome: "rejected" });
    await expect(
      clientWithResponse(200, {}).send(authority),
    ).resolves.toMatchObject({
      outcome: "ambiguous",
    });
  });

  it("reads only an absolute regular matching-mode key and fixed/loopback origins", () => {
    const directory = mkdtempSync(join(tmpdir(), "loyalty-usage-key-"));
    cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, "stripe-key");
    writeFileSync(path, `${apiKey}\n`, { encoding: "utf8", mode: 0o600 });
    expect(readStripeUsageApiKey(path)).toBe(apiKey);
    expect(stripeUsageConfig({ apiKey, liveMode: false }).baseUrl).toBe(
      "https://api.stripe.com",
    );
    expect(
      stripeUsageConfig({
        apiKey,
        liveMode: false,
        environment: {
          LOYALTY_STRIPE_TEST_MODE: "true",
          LOYALTY_STRIPE_BASE_URL: "http://127.0.0.1:4242",
        },
      }).baseUrl,
    ).toBe("http://127.0.0.1:4242");
    expect(() => readStripeUsageApiKey("relative-key")).toThrow(
      "stripe_usage_provider_config_unavailable",
    );
    expect(() =>
      stripeUsageConfig({
        apiKey,
        liveMode: true,
      }),
    ).toThrow("stripe_usage_provider_config_unavailable");
    expect(() =>
      stripeUsageConfig({
        apiKey: rejectedBroadTestKey,
        liveMode: false,
      }),
    ).toThrow("stripe_usage_provider_config_unavailable");
    expect(() =>
      stripeUsageConfig({
        apiKey: rejectedBroadLiveKey,
        liveMode: true,
      }),
    ).toThrow("stripe_usage_provider_config_unavailable");
    writeFileSync(path, `${rejectedBroadTestKey}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    expect(() => readStripeUsageApiKey(path)).toThrow(
      "stripe_usage_provider_config_unavailable",
    );
    writeFileSync(path, `${rejectedBroadLiveKey}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    expect(() => readStripeUsageApiKey(path)).toThrow(
      "stripe_usage_provider_config_unavailable",
    );
    expect(() =>
      stripeUsageConfig({
        apiKey,
        liveMode: false,
        environment: {
          LOYALTY_STRIPE_TEST_MODE: "true",
          LOYALTY_STRIPE_BASE_URL: "http://localhost:4242",
        },
      }),
    ).toThrow("stripe_usage_provider_config_unavailable");
  });
});

describe("isolated billing usage lifecycle", () => {
  it("captures and dispatches one authorized fact without logging authority", async () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    let sent = 0;
    const runtime: StripeUsageRuntime = {
      async send(input) {
        sent += 1;
        expect(input).toEqual(authority);
        return {
          outcome: "accepted",
          responseClass: "success",
          responseCode: 200,
          errorCode: null,
        };
      },
    };
    const outcome = await runBillingUsageLifecycle(
      lifecycleSql(calls, { captured: "2", authority: true }),
      "billing-usage-worker",
      { runtimeFactory: () => runtime },
    );
    expect(outcome).toEqual({
      captured: 2,
      claimed: 1,
      accepted: 1,
      retryable: 0,
      ambiguous: 0,
      rejected: 0,
      held: 0,
      deferred: 0,
    });
    expect(sent).toBe(1);
    expect(calls.some(({ query }) => query.includes("finish_managed"))).toBe(
      true,
    );
    expect(JSON.stringify(calls)).not.toMatch(
      /UsageFixture|starfiniti_orders/u,
    );
  });

  it("constructs no provider runtime when self-hosted or authorization holds", async () => {
    let runtimeCalls = 0;
    const factory = (): StripeUsageRuntime => {
      runtimeCalls += 1;
      throw new Error("must not construct provider runtime");
    };
    const selfHosted = await runBillingUsageLifecycle(
      lifecycleSql([], { claim: false }),
      "billing-usage-worker",
      { runtimeFactory: factory },
    );
    expect(selfHosted.claimed).toBe(0);
    const held = await runBillingUsageLifecycle(
      lifecycleSql([], { authority: false }),
      "billing-usage-worker",
      { runtimeFactory: factory, captureFacts: false },
    );
    expect(held.held).toBe(1);
    expect(runtimeCalls).toBe(0);
  });

  it("records missing local provider configuration as a held attempt", async () => {
    const calls: Array<{ query: string; values: unknown[] }> = [];
    const outcome = await runBillingUsageLifecycle(
      lifecycleSql(calls, { authority: true }),
      "billing-usage-worker",
      { captureFacts: false },
    );
    expect(outcome.held).toBe(1);
    expect(calls.flatMap(({ values }) => values)).toContain(
      "stripe_usage_provider_config_unavailable",
    );
  });

  it("fails closed for malformed claims, worker IDs, batches, and excess rows", async () => {
    await expect(
      runBillingUsageLifecycle(lifecycleSql([], { claim: false }), "x"),
    ).rejects.toThrow("billing_usage_worker_id_invalid");
    await expect(
      runBillingUsageLifecycle(
        lifecycleSql([], { claim: false }),
        "billing-usage-worker",
        { batchSize: 0 },
      ),
    ).rejects.toThrow("billing_usage_batch_size_invalid");
    await expect(
      runBillingUsageLifecycle(
        lifecycleSql([], { claimCount: 2 }),
        "billing-usage-worker",
        { batchSize: 1, captureFacts: false },
      ),
    ).rejects.toThrow("billing_usage_claim_batch_exceeded");
  });
});

function lifecycleSql(
  calls: Array<{ query: string; values: unknown[] }>,
  options: {
    captured?: string;
    claim?: boolean;
    claimCount?: number;
    authority?: boolean;
  },
): Sql {
  const tag = async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown[]> => {
    const query = strings.join("?");
    calls.push({ query, values });
    if (query.includes("capture_managed_billing_usage_facts_v1")) {
      return options.captured ? [{ captured_count: options.captured }] : [];
    }
    if (query.includes("claim_managed_billing_usage_dispatches_v1")) {
      if (options.claim === false) return [];
      return Array.from({ length: options.claimCount ?? 1 }, (_, index) => ({
        dispatch_public_id: dispatchId.replace(/.$/u, String(index)),
        lease_token: leaseToken.replace(/.$/u, String(index + 1)),
        attempt_number: 1,
      }));
    }
    if (query.includes("authorize_managed_billing_usage_dispatch_v1")) {
      if (options.authority === false) return [];
      return [
        {
          provider_event_name: authority.eventName,
          provider_customer_id: authority.customerId,
          provider_identifier: authority.identifier,
          quantity: authority.quantity,
          occurred_at: authority.occurredAt,
          live_mode: authority.liveMode,
        },
      ];
    }
    if (query.includes("finish_managed_billing_usage_dispatch_v1")) {
      return [{ state: values[3], next_attempt_at: null }];
    }
    throw new Error("unexpected_billing_usage_sql");
  };
  return tag as unknown as Sql;
}

function clientFor(origin: string): StripeUsageClient {
  return new StripeUsageClient(
    stripeUsageConfig({
      apiKey,
      liveMode: false,
      environment: {
        LOYALTY_STRIPE_TEST_MODE: "true",
        LOYALTY_STRIPE_BASE_URL: origin,
      },
    }),
  );
}

function clientWithResponse(
  status: number,
  payload: unknown,
): StripeUsageClient {
  return new StripeUsageClient(
    stripeUsageConfig({ apiKey, liveMode: false }),
    async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

async function sink(
  handler: (
    request: IncomingMessage,
    body: string,
  ) => Promise<readonly [number, unknown]>,
): Promise<string> {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const [status, payload] = await handler(
      request,
      Buffer.concat(chunks).toString(),
    );
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(payload));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => server.close());
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("sink unavailable");
  return `http://127.0.0.1:${address.port}`;
}
