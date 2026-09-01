import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  readStripeBillingApiKey,
  StripeBillingSessionClient,
  stripeBillingSessionConfig,
} from "./stripe-billing-sessions";

const apiKey = ["sk", "test", "billingfixturesonly000000000000"].join("_");
const operationId = "a3000000-0000-4000-8000-000000000200";
const customerId = "cus_BillingSession0001";
const priceId = "price_BillingSession0001";
const canonical = "https://loyalty.starfiniti.com/billing";

describe("narrow Stripe billing session client", () => {
  let server: Server;
  let origin: string;
  const requests: Array<{
    path: string;
    authorization: string | undefined;
    idempotency: string | undefined;
    stripeVersion: string | undefined;
    body: string;
  }> = [];

  beforeEach(async () => {
    requests.length = 0;
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        const path = request.url ?? "";
        requests.push({
          path,
          authorization: request.headers.authorization,
          idempotency: header(request.headers["idempotency-key"]),
          stripeVersion: header(request.headers["stripe-version"]),
          body: Buffer.concat(chunks).toString("utf8"),
        });
        response.setHeader("content-type", "application/json");
        if (path === "/v1/customers") {
          response.end(JSON.stringify({ id: customerId, email: "discard" }));
        } else if (path === "/v1/checkout/sessions") {
          response.end(
            JSON.stringify({
              id: "cs_test_BillingSession0001",
              url: "https://checkout.stripe.com/c/pay/cs_test_BillingSession0001#safe",
              customer_details: { email: "discard@example.test" },
            }),
          );
        } else {
          response.end(
            JSON.stringify({
              id: "bps_BillingSession0001",
              url: "https://billing.stripe.com/p/session/BillingSession0001",
              customer: customerId,
            }),
          );
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("sink failed");
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("creates customer, Checkout, and Portal requests with exact bounded authority", async () => {
    const client = clientFor(origin);
    expect(
      await client.createCustomer({
        operationId,
        idempotencyKey: `m14:customer:${operationId}`,
      }),
    ).toEqual({ customerId });
    expect(
      await client.createCheckout({
        customerId,
        priceId,
        operationId,
        idempotencyKey: `m14:checkout:${operationId}`,
        successUrl: `${canonical}?checkout=returned`,
        cancelUrl: `${canonical}?checkout=cancelled`,
      }),
    ).toEqual({
      resourceId: "cs_test_BillingSession0001",
      url: "https://checkout.stripe.com/c/pay/cs_test_BillingSession0001#safe",
    });
    expect(
      await client.createPortal({
        customerId,
        idempotencyKey: `m14:portal:${operationId}`,
        returnUrl: canonical,
      }),
    ).toEqual({
      resourceId: "bps_BillingSession0001",
      url: "https://billing.stripe.com/p/session/BillingSession0001",
    });

    expect(requests).toHaveLength(3);
    expect(
      requests.every((request) => request.authorization === `Bearer ${apiKey}`),
    ).toBe(true);
    expect(requests[1]?.body).toContain(`customer=${customerId}`);
    expect(
      requests.every(
        (request) => request.stripeVersion === "2026-02-25.clover",
      ),
    ).toBe(true);
    expect(requests[1]?.body).toContain(
      `line_items%5B0%5D%5Bprice%5D=${priceId}`,
    );
    expect(requests[1]?.body).not.toMatch(/email|organization|return_url/u);
    expect(requests[2]?.body).not.toMatch(/price|email|organization/u);
  });

  it("rejects browser-selected origins and provider identifiers before a request", async () => {
    const client = clientFor(origin);
    await expect(
      client.createCheckout({
        customerId: "cus_bad",
        priceId,
        operationId,
        idempotencyKey: `m14:checkout:${operationId}`,
        successUrl: "https://attacker.example.test/billing",
        cancelUrl: canonical,
      }),
    ).rejects.toThrow("provider_request_invalid");
    expect(requests).toHaveLength(0);
  });

  it("rejects malformed redirect responses without returning provider detail", async () => {
    const invalidFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          id: "cs_test_BillingSession0001",
          url: "https://attacker.example.test/session",
          email: "private@example.test",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const client = new StripeBillingSessionClient(
      stripeBillingSessionConfig({
        apiKey,
        liveMode: false,
        environment: {
          DASHBOARD_PUBLIC_ORIGIN: "https://loyalty.starfiniti.com",
          LOYALTY_STRIPE_TEST_MODE: "true",
        },
      }),
      invalidFetch,
    );
    await expect(
      client.createCheckout({
        customerId,
        priceId,
        operationId,
        idempotencyKey: `m14:checkout:${operationId}`,
        successUrl: canonical,
        cancelUrl: canonical,
      }),
    ).rejects.toMatchObject({ code: "provider_response_invalid" });
  });

  it("separates deterministic rejection from ambiguous retry outcomes", async () => {
    const rejected = clientWithStatus(400);
    const ambiguous = clientWithStatus(503);
    await expect(
      rejected.createPortal({
        customerId,
        idempotencyKey: `m14:portal:${operationId}`,
        returnUrl: canonical,
      }),
    ).rejects.toMatchObject({ code: "provider_rejected" });
    await expect(
      ambiguous.createPortal({
        customerId,
        idempotencyKey: `m14:portal:${operationId}`,
        returnUrl: canonical,
      }),
    ).rejects.toMatchObject({ code: "provider_ambiguous" });
  });
});

describe("Stripe billing session configuration", () => {
  it("reads an absolute regular secret file and matches test/live mode", () => {
    const directory = mkdtempSync(join(tmpdir(), "loyalty-stripe-api-"));
    const path = join(directory, "api-key");
    try {
      writeFileSync(path, `${apiKey}\n`, { encoding: "utf8", mode: 0o600 });
      expect(readStripeBillingApiKey(path)).toBe(apiKey);
      expect(
        stripeBillingSessionConfig({
          apiKey,
          liveMode: false,
          environment: {
            DASHBOARD_PUBLIC_ORIGIN: "https://loyalty.starfiniti.com",
          },
        }).baseUrl,
      ).toBe("https://api.stripe.com");
      const restrictedKey = [
        "rk",
        "test",
        "billingfixturesonly000000000000",
      ].join("_");
      expect(
        stripeBillingSessionConfig({
          apiKey: restrictedKey,
          liveMode: false,
          environment: {
            DASHBOARD_PUBLIC_ORIGIN: "https://loyalty.starfiniti.com",
          },
        }).liveMode,
      ).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("allows only explicit loopback test origins and rejects key-mode drift", () => {
    expect(
      stripeBillingSessionConfig({
        apiKey,
        liveMode: false,
        environment: {
          DASHBOARD_PUBLIC_ORIGIN: "https://loyalty.starfiniti.com",
          LOYALTY_STRIPE_TEST_MODE: "true",
          LOYALTY_STRIPE_BASE_URL: "http://127.0.0.1:4242",
        },
      }).baseUrl,
    ).toBe("http://127.0.0.1:4242");
    for (const environment of [
      {
        DASHBOARD_PUBLIC_ORIGIN: "https://loyalty.starfiniti.com",
        LOYALTY_STRIPE_BASE_URL: "https://proxy.example.test",
      },
      {
        DASHBOARD_PUBLIC_ORIGIN: "https://loyalty.starfiniti.com",
        LOYALTY_STRIPE_TEST_MODE: "true",
        LOYALTY_STRIPE_BASE_URL: "http://localhost:4242",
      },
    ]) {
      expect(() =>
        stripeBillingSessionConfig({ apiKey, liveMode: false, environment }),
      ).toThrow("provider_config_unavailable");
    }
    const liveKey = ["sk", "live", "billingfixturesonly000000000000"].join("_");
    expect(() =>
      stripeBillingSessionConfig({
        apiKey: liveKey,
        liveMode: false,
        environment: {
          DASHBOARD_PUBLIC_ORIGIN: "https://loyalty.starfiniti.com",
        },
      }),
    ).toThrow("provider_config_unavailable");
  });
});

function clientFor(origin: string): StripeBillingSessionClient {
  return new StripeBillingSessionClient(
    stripeBillingSessionConfig({
      apiKey,
      liveMode: false,
      environment: {
        DASHBOARD_PUBLIC_ORIGIN: "https://loyalty.starfiniti.com",
        LOYALTY_STRIPE_TEST_MODE: "true",
        LOYALTY_STRIPE_BASE_URL: origin,
      },
    }),
  );
}

function clientWithStatus(status: number): StripeBillingSessionClient {
  return new StripeBillingSessionClient(
    stripeBillingSessionConfig({
      apiKey,
      liveMode: false,
      environment: {
        DASHBOARD_PUBLIC_ORIGIN: "https://loyalty.starfiniti.com",
        LOYALTY_STRIPE_TEST_MODE: "true",
      },
    }),
    async () =>
      new Response(JSON.stringify({ error: { message: "discard" } }), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
