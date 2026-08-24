import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sql } from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWebhookDeliveryRuntime,
  createWebhookSignatures,
  isPublicWebhookAddress,
  readWebhookDeliveryConfig,
  runWebhookDeliveryLifecycle,
  type WebhookDeliveryConfig,
} from "./webhook-delivery.ts";

const endpointId = "94000000-0000-4000-8000-000000000001";
const deliveryId = "94000000-0000-4000-8000-000000000002";
const currentBytes = Buffer.alloc(32, 0x11);
const previousBytes = Buffer.alloc(32, 0x22);
const event = {
  schemaVersion: "1",
  eventId: "94000000-0000-4000-8000-000000000003",
  organizationId: "94000000-0000-4000-8000-000000000004",
  programmeGroupId: null,
  locale: "en",
  occurredAt: "2026-08-24T08:00:00Z",
  eventType: "loyalty.connector.health",
  purpose: "merchant_operational",
  subject: { kind: "merchant" },
  payload: {
    connectionId: "94000000-0000-4000-8000-000000000005",
    state: "degraded",
    errorCode: "delivery_lag",
  },
} as const;

const temporaryDirectories: string[] = [];
const openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    openServers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("signed generic webhook delivery", () => {
  it("stays disabled and reads endpoint secrets only from absolute files", () => {
    expect(readWebhookDeliveryConfig({})).toBeNull();
    const { currentPath, previousPath } = secretFiles();
    const config = readWebhookDeliveryConfig({
      LOYALTY_WEBHOOK_ENABLED: "true",
      LOYALTY_WEBHOOK_ENDPOINT_ID: endpointId,
      LOYALTY_WEBHOOK_CURRENT_SECRET_FILE: currentPath,
      LOYALTY_WEBHOOK_PREVIOUS_SECRET_FILE: previousPath,
      LOYALTY_WEBHOOK_ALLOWED_ORIGIN: "https://hooks.example.test",
    });
    expect(config).toMatchObject({
      endpointId,
      allowedOrigin: "https://hooks.example.test",
      timeoutMs: 15_000,
      testMode: false,
    });
    expect(config?.currentSecret.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(config?.previousSecret?.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(config)).not.toContain("whsec_");
  });

  it.each([
    [
      {
        LOYALTY_WEBHOOK_ENABLED: "true",
        LOYALTY_WEBHOOK_ENDPOINT_ID: "invalid",
      },
      "webhook_config_invalid_endpoint",
    ],
    [
      {
        LOYALTY_WEBHOOK_ENABLED: "true",
        LOYALTY_WEBHOOK_ENDPOINT_ID: endpointId,
        LOYALTY_WEBHOOK_CURRENT_SECRET_FILE: "relative-secret",
      },
      "webhook_config_secret_path_not_absolute",
    ],
  ] as const)(
    "rejects invalid endpoint configuration",
    (environment, error) => {
      expect(() => readWebhookDeliveryConfig(environment)).toThrow(error);
    },
  );

  it("allows HTTP loopback only under explicit test mode", () => {
    const { currentPath } = secretFiles();
    const base = {
      LOYALTY_WEBHOOK_ENABLED: "true",
      LOYALTY_WEBHOOK_ENDPOINT_ID: endpointId,
      LOYALTY_WEBHOOK_CURRENT_SECRET_FILE: currentPath,
      LOYALTY_WEBHOOK_ALLOWED_ORIGIN: "http://127.0.0.1:4567",
    };
    expect(() => readWebhookDeliveryConfig(base)).toThrow(
      "webhook_config_allowed_origin_invalid",
    );
    expect(
      readWebhookDeliveryConfig({
        ...base,
        LOYALTY_WEBHOOK_TEST_MODE: "true",
      }),
    ).toMatchObject({ allowedOrigin: "http://127.0.0.1:4567" });
    expect(() =>
      readWebhookDeliveryConfig({
        ...base,
        LOYALTY_WEBHOOK_TEST_MODE: "true",
        LOYALTY_WEBHOOK_ALLOWED_ORIGIN: "http://10.0.0.1:4567",
      }),
    ).toThrow("webhook_config_test_origin_invalid");
  });

  it("signs the exact transmitted bytes with stable metadata and both rotation keys", () => {
    const config = directConfig("http://127.0.0.1:1", true, true);
    const timestamp = "1787558400";
    const body = JSON.stringify(event);
    const signatures = createWebhookSignatures(
      deliveryId,
      timestamp,
      body,
      config,
    ).split(" ");
    expect(signatures).toHaveLength(2);
    expect(signatures[0]).toBe(
      `v1,${createHmac("sha256", currentBytes)
        .update(`${deliveryId}.${timestamp}.${body}`, "utf8")
        .digest("base64")}`,
    );
    expect(signatures[1]).toBe(
      `v1,${createHmac("sha256", previousBytes)
        .update(`${deliveryId}.${timestamp}.${body}`, "utf8")
        .digest("base64")}`,
    );
  });

  it("sends one minimized signed request to a real loopback sink", async () => {
    const received: Array<{
      path: string;
      headers: Record<string, string | string[] | undefined>;
      body: string;
    }> = [];
    const { server, origin } = await loopbackServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received.push({
          path: request.url ?? "",
          headers: request.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
        response.writeHead(204);
        response.end();
      });
    });
    openServers.push(server);
    const calls: unknown[][] = [];
    const result = await runWebhookDeliveryLifecycle(
      lifecycleSql(`${origin}/loyalty`, calls, "completed"),
      "webhook-worker-1",
      createWebhookDeliveryRuntime(directConfig(origin, true)),
    );

    expect(result).toEqual({
      claimed: 1,
      authorized: 1,
      delivered: 1,
      retryable: 0,
      deadLetter: 0,
      manualReview: 0,
      withheld: 0,
    });
    expect(received).toHaveLength(1);
    const request = received[0];
    expect(request?.path).toBe("/loyalty");
    expect(JSON.parse(request?.body ?? "null")).toEqual(event);
    expect(request?.headers["webhook-id"]).toBe(deliveryId);
    expect(request?.headers["webhook-signature"]).toMatch(
      /^v1,[A-Za-z0-9+/]+=*$/u,
    );
    const timestamp = request?.headers["webhook-timestamp"];
    expect(timestamp).toMatch(/^[0-9]{10}$/u);
    expect(request?.headers["webhook-signature"]).toBe(
      createWebhookSignatures(
        deliveryId,
        String(timestamp),
        request?.body ?? "",
        directConfig(origin, true, false),
      ),
    );
    expect(JSON.stringify({ received, calls })).not.toContain("whsec_");
  });

  it.each([
    [302, null, "dead_letter", "dead_letter"],
    [410, null, "dead_letter", "dead_letter"],
    [429, "75", "retryable", "retryable"],
    [503, null, "retryable", "retryable"],
  ] as const)(
    "classifies HTTP %i without following redirects",
    async (status, retryAfter, expectedOutcome, expectedState) => {
      let requests = 0;
      const { server, origin } = await loopbackServer((_request, response) => {
        requests += 1;
        response.writeHead(status, {
          ...(retryAfter ? { "retry-after": retryAfter } : {}),
          ...(status === 302 ? { location: `${origin}/redirected` } : {}),
        });
        response.end();
      });
      openServers.push(server);
      const calls: unknown[][] = [];
      const result = await runWebhookDeliveryLifecycle(
        lifecycleSql(`${origin}/loyalty`, calls, expectedState),
        "webhook-worker-1",
        createWebhookDeliveryRuntime(directConfig(origin, true)),
      );
      const finish = calls.find((values) => values.includes(expectedOutcome));
      expect(finish).toBeDefined();
      if (status === 429) expect(finish).toContain(75);
      expect(requests).toBe(1);
      expect(result.retryable).toBe(expectedState === "retryable" ? 1 : 0);
      expect(result.deadLetter).toBe(expectedState === "dead_letter" ? 1 : 0);
    },
  );

  it("rejects an oversized response without retaining its body", async () => {
    const { server, origin } = await loopbackServer((_request, response) => {
      response.writeHead(200);
      response.end(Buffer.alloc(65 * 1024, 0x61));
    });
    openServers.push(server);
    const calls: unknown[][] = [];
    const result = await runWebhookDeliveryLifecycle(
      lifecycleSql(`${origin}/loyalty`, calls, "dead_letter"),
      "webhook-worker-1",
      createWebhookDeliveryRuntime(directConfig(origin, true)),
    );
    expect(result.deadLetter).toBe(1);
    expect(calls.flat()).toContain("webhook_response_too_large");
  });

  it("bounds a receiver that accepts the socket but never responds", async () => {
    const { server, origin } = await loopbackServer(() => undefined);
    openServers.push(server);
    const calls: unknown[][] = [];
    const result = await runWebhookDeliveryLifecycle(
      lifecycleSql(`${origin}/loyalty`, calls, "retryable"),
      "webhook-worker-1",
      createWebhookDeliveryRuntime({
        ...directConfig(origin, true),
        timeoutMs: 25,
      }),
    );
    expect(result.retryable).toBe(1);
    expect(calls.flat()).toContain("webhook_timeout");
  });

  it.each([
    ["8.8.8.8", true],
    ["2606:4700:4700::1111", true],
    ["127.0.0.1", false],
    ["10.0.0.1", false],
    ["100.64.0.1", false],
    ["172.16.0.1", false],
    ["169.254.169.254", false],
    ["192.168.1.1", false],
    ["192.0.2.10", false],
    ["198.18.0.1", false],
    ["198.51.100.8", false],
    ["203.0.113.4", false],
    ["224.0.0.1", false],
    ["::1", false],
    ["0:0:0:0:0:0:0:1", false],
    ["::ffff:127.0.0.1", false],
    ["64:ff9b::7f00:1", false],
    ["fc00::1", false],
    ["fe80::1", false],
    ["2001:db8::1", false],
    ["2001:0db8:0:0::1", false],
    ["2002:7f00:1::", false],
    ["3fff::1", false],
  ] as const)("classifies destination address %s", (address, expected) => {
    expect(isPublicWebhookAddress(address)).toBe(expected);
  });

  it("fails closed when any DNS answer is non-public before opening a socket", async () => {
    const runtime = createWebhookDeliveryRuntime(
      directConfig("https://hooks.example.test", false),
      async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
    );
    const calls: unknown[][] = [];
    const result = await runWebhookDeliveryLifecycle(
      lifecycleSql("https://hooks.example.test/loyalty", calls, "dead_letter"),
      "webhook-worker-1",
      runtime,
    );
    expect(result.deadLetter).toBe(1);
    expect(calls.flat()).toContain("webhook_destination_forbidden");
  });

  it.each(["held", "suppressed", "dead_letter"] as const)(
    "does not resolve or send a %s authorization",
    async (outcome) => {
      let lookedUp = false;
      const sql = lifecycleSql(
        "https://hooks.example.test/loyalty",
        [],
        "dead_letter",
        outcome,
      );
      const result = await runWebhookDeliveryLifecycle(
        sql,
        "webhook-worker-1",
        createWebhookDeliveryRuntime(
          directConfig("https://hooks.example.test", false),
          async () => {
            lookedUp = true;
            return [{ address: "8.8.8.8", family: 4 }];
          },
        ),
      );
      expect(lookedUp).toBe(false);
      expect(result.withheld).toBe(1);
    },
  );
});

function secretFiles(): { currentPath: string; previousPath: string } {
  const directory = mkdtempSync(join(tmpdir(), "loyalty-webhook-"));
  temporaryDirectories.push(directory);
  const currentPath = join(directory, "current");
  const previousPath = join(directory, "previous");
  writeFileSync(currentPath, `whsec_${currentBytes.toString("base64")}\n`, {
    mode: 0o600,
  });
  writeFileSync(previousPath, `whsec_${previousBytes.toString("base64")}`, {
    mode: 0o600,
  });
  return { currentPath, previousPath };
}

function directConfig(
  allowedOrigin: string,
  testMode: boolean,
  includePrevious = false,
): WebhookDeliveryConfig {
  const { currentPath, previousPath } = secretFiles();
  const config = readWebhookDeliveryConfig({
    LOYALTY_WEBHOOK_ENABLED: "true",
    LOYALTY_WEBHOOK_ENDPOINT_ID: endpointId,
    LOYALTY_WEBHOOK_CURRENT_SECRET_FILE: currentPath,
    ...(includePrevious
      ? { LOYALTY_WEBHOOK_PREVIOUS_SECRET_FILE: previousPath }
      : {}),
    LOYALTY_WEBHOOK_ALLOWED_ORIGIN: allowedOrigin,
    ...(testMode ? { LOYALTY_WEBHOOK_TEST_MODE: "true" } : {}),
  });
  if (!config) throw new Error("test_webhook_config_unavailable");
  return config;
}

async function loopbackServer(
  listener: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ server: Server; origin: string }> {
  const server = createServer(listener);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, origin: `http://127.0.0.1:${port}` };
}

function lifecycleSql(
  destinationUrl: string,
  calls: unknown[][],
  finishState: "completed" | "retryable" | "dead_letter",
  authorizationOutcome:
    "authorized" | "held" | "suppressed" | "dead_letter" = "authorized",
): Sql {
  const tag = async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown[]> => {
    const query = strings.join("?");
    calls.push(values);
    if (query.includes("claim_notification_webhook_deliveries_v1")) {
      return [
        {
          schema_version: "1",
          delivery_public_id: deliveryId,
          lease_expires_at: "2026-08-24T08:01:00Z",
        },
      ];
    }
    if (query.includes("authorize_notification_webhook_dispatch_v1")) {
      return [
        authorizationOutcome === "authorized"
          ? {
              schema_version: "1",
              delivery_public_id: deliveryId,
              outcome: "authorized",
              attempt_count: 1,
              destination_url: destinationUrl,
              event,
            }
          : {
              schema_version: "1",
              delivery_public_id: deliveryId,
              outcome: authorizationOutcome,
              attempt_count: null,
              destination_url: null,
              event: null,
            },
      ];
    }
    if (query.includes("finish_notification_webhook_delivery_v1")) {
      return [
        {
          state: finishState,
          outcome: finishState === "completed" ? "delivered" : finishState,
          scheduled_at:
            finishState === "retryable" ? "2026-08-24T08:05:00Z" : null,
        },
      ];
    }
    throw new Error("unexpected_webhook_sql");
  };
  return tag as unknown as Sql;
}
