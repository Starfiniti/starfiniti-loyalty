import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KlaviyoNotificationPreparationV1 } from "@starfiniti/contracts";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyKlaviyoError,
  createKlaviyoDeliveryRuntime,
  detectKlaviyoProviderSuppression,
  klaviyoEventRequest,
  klaviyoSubscribeRequest,
  klaviyoUnsubscribeRequest,
  readBoundedJson,
  readKlaviyoDeliveryConfig,
  submitKlaviyoAction,
  upsertKlaviyoProfile,
  type KlaviyoDeliveryRuntime,
} from "./klaviyo-delivery.ts";

const temporaryDirectories: string[] = [];
const openServers: Server[] = [];

const event = {
  schemaVersion: "1",
  eventId: "93000000-0000-4000-8000-000000000001",
  organizationId: "93000000-0000-4000-8000-000000000002",
  programmeGroupId: "93000000-0000-4000-8000-000000000003",
  locale: "en",
  occurredAt: "2026-08-24T08:00:00Z",
  eventType: "loyalty.campaign.effect",
  purpose: "loyalty_marketing",
  subject: {
    kind: "customer",
    customerId: "93000000-0000-4000-8000-000000000004",
  },
  payload: {
    campaignVersionId: "93000000-0000-4000-8000-000000000005",
    outcome: "points_awarded",
    points: "25",
  },
} as const;

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

describe("Klaviyo notification delivery", () => {
  it("stays disabled and reads a tenant-bound key only from an absolute file", () => {
    expect(readKlaviyoDeliveryConfig({})).toBeNull();
    const directory = mkdtempSync(join(tmpdir(), "loyalty-klaviyo-"));
    temporaryDirectories.push(directory);
    const keyFile = join(directory, "private-key");
    writeFileSync(keyFile, "pk_test_private_value\n", { mode: 0o600 });

    const config = readKlaviyoDeliveryConfig({
      LOYALTY_KLAVIYO_ENABLED: "true",
      LOYALTY_KLAVIYO_CONNECTION_ID: "93000000-0000-4000-8000-000000000010",
      LOYALTY_KLAVIYO_API_KEY_FILE: keyFile,
    });

    expect(config).toMatchObject({
      connectionId: "93000000-0000-4000-8000-000000000010",
      apiKey: "pk_test_private_value",
      apiRevision: "2026-07-15",
      baseUrl: "https://a.klaviyo.com/api",
    });
    expect(config?.credentialSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it.each([
    [
      {
        LOYALTY_KLAVIYO_ENABLED: "true",
        LOYALTY_KLAVIYO_CONNECTION_ID: "invalid",
        LOYALTY_KLAVIYO_API_KEY_FILE: "relative-key",
      },
      "klaviyo_config_invalid_connection",
    ],
    [
      {
        LOYALTY_KLAVIYO_ENABLED: "true",
        LOYALTY_KLAVIYO_CONNECTION_ID: "93000000-0000-4000-8000-000000000010",
        LOYALTY_KLAVIYO_API_KEY_FILE: "relative-key",
      },
      "klaviyo_config_key_path_not_absolute",
    ],
  ] as const)("rejects invalid Klaviyo configuration", (environment, error) => {
    expect(() => readKlaviyoDeliveryConfig(environment)).toThrow(error);
  });

  it("allows a loopback override only under explicit test mode", () => {
    const directory = mkdtempSync(join(tmpdir(), "loyalty-klaviyo-"));
    temporaryDirectories.push(directory);
    const keyFile = join(directory, "private-key");
    writeFileSync(keyFile, "pk_test_private_value", { mode: 0o600 });
    const base = {
      LOYALTY_KLAVIYO_ENABLED: "true",
      LOYALTY_KLAVIYO_CONNECTION_ID: "93000000-0000-4000-8000-000000000010",
      LOYALTY_KLAVIYO_API_KEY_FILE: keyFile,
      LOYALTY_KLAVIYO_BASE_URL: "http://127.0.0.1:4567/api",
    };
    expect(() => readKlaviyoDeliveryConfig(base)).toThrow(
      "klaviyo_config_base_override_forbidden",
    );
    expect(
      readKlaviyoDeliveryConfig({
        ...base,
        LOYALTY_KLAVIYO_TEST_MODE: "true",
      }),
    ).toMatchObject({ baseUrl: "http://127.0.0.1:4567/api" });
    expect(() =>
      readKlaviyoDeliveryConfig({
        ...base,
        LOYALTY_KLAVIYO_TEST_MODE: "true",
        LOYALTY_KLAVIYO_BASE_URL: "https://evil.example/api",
      }),
    ).toThrow("klaviyo_config_test_base_invalid");
  });

  it("builds minimized deduplicated events and consent jobs", () => {
    expect(klaviyoEventRequest(event, "KlaviyoProfile_1")).toMatchObject({
      data: {
        attributes: {
          unique_id: event.eventId,
          time: event.occurredAt,
          profile: { data: { id: "KlaviyoProfile_1" } },
          metric: { data: { attributes: { name: event.eventType } } },
        },
      },
    });
    const subscribe = JSON.stringify(
      klaviyoSubscribeRequest("KlaviyoProfile_1", "LoyaltyList"),
    );
    expect(subscribe).toContain('"consent":"SUBSCRIBED"');
    expect(subscribe).toContain('"type":"list"');
    expect(subscribe).not.toContain("consented_at");
    expect(subscribe).not.toContain("historical_import");
    const unsubscribe = JSON.stringify(
      klaviyoUnsubscribeRequest("member@example.test"),
    );
    expect(unsubscribe).toContain('"consent":"UNSUBSCRIBED"');
    expect(unsubscribe).not.toContain('"list"');
  });

  it.each([
    [
      {
        consent: "UNSUBSCRIBED",
        can_receive_email_marketing: false,
        suppression: [],
        list_suppressions: [],
      },
      "provider_unsubscribe",
    ],
    [
      {
        consent: "SUBSCRIBED",
        can_receive_email_marketing: false,
        suppression: [
          { reason: "HARD_BOUNCE", timestamp: "2026-08-24T08:00:00Z" },
        ],
        list_suppressions: [],
      },
      "hard_bounce",
    ],
    [
      {
        consent: "NEVER_SUBSCRIBED",
        can_receive_email_marketing: true,
        suppression: [],
        list_suppressions: [],
      },
      null,
    ],
  ] as const)(
    "imports stronger provider suppression",
    (marketing, expected) => {
      expect(
        detectKlaviyoProviderSuppression(
          profileSubscriptionPayload(marketing),
          "KlaviyoProfile_1",
        ),
      ).toBe(expected);
    },
  );

  it("reads provider JSON with a streaming byte cap and cancels overflow", async () => {
    await expect(
      readBoundedJson(
        new Response("null", { headers: { "content-length": "4" } }),
        4,
      ),
    ).resolves.toBeNull();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"a":'));
        controller.enqueue(new TextEncoder().encode('"too-large"}'));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(readBoundedJson(new Response(body), 5)).rejects.toThrow(
      "klaviyo_response_too_large",
    );
    expect(cancelled).toBe(true);
  });

  it("pins revision and authorization against a real loopback HTTP sink", async () => {
    const requests: Array<{
      path: string;
      headers: Record<string, string | string[] | undefined>;
      body: unknown;
    }> = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const bodyText = Buffer.concat(chunks).toString("utf8");
        requests.push({
          path: request.url ?? "",
          headers: request.headers,
          body: bodyText === "" ? null : JSON.parse(bodyText),
        });
        if (request.url === "/api/profile-import") {
          response.writeHead(201, {
            "content-type": "application/vnd.api+json",
          });
          response.end(
            JSON.stringify({
              data: { type: "profile", id: "KlaviyoProfile_1" },
            }),
          );
        } else {
          response.writeHead(202);
          response.end();
        }
      });
    });
    openServers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as AddressInfo).port;
    const runtime = testRuntime(`http://127.0.0.1:${port}/api`);
    const preparation = eventPreparation();
    const profile = await upsertKlaviyoProfile(runtime, preparation);
    await submitKlaviyoAction(runtime, preparation, {
      schemaVersion: "1",
      operationId: preparation.operationId,
      outcome: "authorized",
      action: "event",
      providerProfileId: profile.id,
    });

    expect(profile).toEqual({ id: "KlaviyoProfile_1", status: 201 });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.headers.revision).toBe("2026-07-15");
    expect(requests[0]?.headers.authorization).toBe(
      "Klaviyo-API-Key pk_test_private_value",
    );
    expect(JSON.stringify(requests)).not.toContain("coupon");
    expect(requests[1]?.body).toMatchObject({
      data: { attributes: { unique_id: event.eventId } },
    });
  });

  it("honors Retry-After and treats ambiguous subscribe differently from safe retries", async () => {
    const rateLimited = testRuntime(
      "http://127.0.0.1:1/api",
      async () =>
        new Response(null, { status: 429, headers: { "retry-after": "75" } }),
    );
    const rateLimitError = await captureFailureAsync(() =>
      upsertKlaviyoProfile(rateLimited, eventPreparation()),
    );
    expect(classifyKlaviyoError(rateLimitError, "profile")).toEqual({
      outcome: "retryable",
      responseCode: 429,
      errorCode: "klaviyo_provider_unavailable",
      retryAfterSeconds: 75,
    });
    const unavailable = testRuntime("http://127.0.0.1:1/api", async () => {
      throw new TypeError("network unavailable");
    });
    const networkError = await captureFailureAsync(() =>
      upsertKlaviyoProfile(unavailable, eventPreparation()),
    );
    expect(classifyKlaviyoError(networkError, "event").outcome).toBe(
      "retryable",
    );
    expect(classifyKlaviyoError(networkError, "unsubscribe").outcome).toBe(
      "retryable",
    );
    expect(classifyKlaviyoError(networkError, "subscribe")).toEqual({
      outcome: "manual_review",
      responseCode: null,
      errorCode: "klaviyo_subscribe_outcome_ambiguous",
      retryAfterSeconds: null,
    });
  });
});

function eventPreparation(): Extract<
  KlaviyoNotificationPreparationV1,
  { outcome: "authorized"; operationKind: "event_sync" }
> {
  return {
    schemaVersion: "1",
    operationId: "93000000-0000-4000-8000-000000000011",
    outcome: "authorized",
    operationKind: "event_sync",
    attempt: 1,
    recipientEmail: "member@example.test",
    externalCustomerId: event.subject.customerId,
    providerProfileId: null,
    apiRevision: "2026-07-15",
    listId: null,
    event,
  };
}

function testRuntime(
  baseUrl: string,
  fetchImplementation: KlaviyoDeliveryRuntime["fetch"] = fetch,
): KlaviyoDeliveryRuntime {
  return createKlaviyoDeliveryRuntime(
    {
      connectionId: "93000000-0000-4000-8000-000000000010",
      apiKey: "pk_test_private_value",
      credentialSha256: "ab".repeat(32),
      apiRevision: "2026-07-15",
      baseUrl,
      timeoutMs: 2_000,
    },
    fetchImplementation,
  );
}

function profileSubscriptionPayload(marketing: unknown): unknown {
  return {
    data: {
      type: "profile",
      id: "KlaviyoProfile_1",
      attributes: { subscriptions: { email: { marketing } } },
    },
  };
}

async function captureFailureAsync(
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected_operation_to_fail");
}
