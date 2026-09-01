import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  normalize: vi.fn(),
  readSecret: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/database", () => ({
  getDatabase: mocks.getDatabase,
}));
vi.mock("@/lib/server/stripe-billing-webhook", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/server/stripe-billing-webhook")
    >();
  return {
    ...original,
    normalizeStripeBillingWebhook: mocks.normalize,
    readStripeBillingWebhookSecret: mocks.readSecret,
    verifyStripeBillingWebhook: mocks.verify,
  };
});

import { POST } from "./route";

const receiptId = "10000000-0000-4000-8000-000000000001";
const event = {
  schemaVersion: "1",
  eventId: "evt_StripeRoute0001",
  eventType: "customer.subscription.updated",
  liveMode: false,
  objectId: "sub_StripeRoute0001",
  customerId: "cus_StripeRoute0001",
  subscriptionId: "sub_StripeRoute0001",
  subscriptionStatus: "active",
  eventCreatedAt: "2026-08-26T20:00:00.000Z",
  currentPeriodEndsAt: "2026-09-26T20:00:00.000Z",
  trialEndsAt: null,
  signatureCreatedAt: "2026-08-26T20:00:01.000Z",
  bodySha256: "a".repeat(64),
} as const;

function request(
  options: {
    body?: BodyInit | null;
    contentLength?: string;
    contentType?: string;
  } = {},
): Request {
  const headers = new Headers({
    "content-type": options.contentType ?? "application/json; charset=utf-8",
    "stripe-signature": `t=1787774400,v1=${"a".repeat(64)}`,
  });
  if (options.contentLength) {
    headers.set("content-length", options.contentLength);
  }
  return new Request(
    "https://loyalty.example.test/api/v1/billing/stripe/webhooks",
    {
      method: "POST",
      headers,
      body: options.body ?? "{}",
    },
  );
}

function database(gate: { deployment_mode: string; enabled: boolean }) {
  return vi.fn(async (parts: TemplateStringsArray) => {
    const text = parts.join("?");
    if (text.includes("get_managed_billing_webhook_gate_v1")) return [gate];
    if (text.includes("accept_managed_billing_webhook_v1")) {
      return [{ receipt_public_id: receiptId, outcome: "accepted" }];
    }
    throw new Error(`Unexpected query: ${text}`);
  });
}

describe("Stripe billing webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readSecret.mockReturnValue("whsec_test");
    mocks.verify.mockReturnValue({
      signatureCreatedAt: event.signatureCreatedAt,
      bodySha256: event.bodySha256,
    });
    mocks.normalize.mockReturnValue(event);
  });

  it("returns before body or secret access in self-hosted mode", async () => {
    const query = database({ deployment_mode: "self_hosted", enabled: false });
    mocks.getDatabase.mockReturnValue(query);

    const response = await POST(
      request({ contentLength: "999999999", contentType: "text/plain" }),
    );

    expect(response.status).toBe(404);
    expect(query).toHaveBeenCalledOnce();
    expect(mocks.readSecret).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("rejects disabled managed, unsupported media, and oversized bodies", async () => {
    mocks.getDatabase.mockReturnValue(
      database({ deployment_mode: "managed", enabled: false }),
    );
    expect((await POST(request())).status).toBe(404);

    mocks.getDatabase.mockReturnValue(
      database({ deployment_mode: "managed", enabled: true }),
    );
    expect((await POST(request({ contentType: "text/plain" }))).status).toBe(
      415,
    );
    expect(
      (
        await POST(
          request({
            contentLength: "262145",
          }),
        )
      ).status,
    ).toBe(413);
    expect(mocks.readSecret).not.toHaveBeenCalled();
  });

  it("accepts one verified minimized event without returning provider IDs", async () => {
    const query = database({ deployment_mode: "managed", enabled: true });
    mocks.getDatabase.mockReturnValue(query);

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      receiptId,
      outcome: "accepted",
    });
    expect(mocks.readSecret).toHaveBeenCalledOnce();
    expect(mocks.verify).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("acknowledges only signature-verified unsupported events", async () => {
    mocks.getDatabase.mockReturnValue(
      database({ deployment_mode: "managed", enabled: true }),
    );
    const { StripeBillingWebhookError } =
      await import("@/lib/server/stripe-billing-webhook");
    mocks.normalize.mockImplementation(() => {
      throw new StripeBillingWebhookError("unsupported_event");
    });
    const response = await POST(request());
    expect(response.status).toBe(204);
    expect(mocks.verify).toHaveBeenCalledOnce();
  });

  it("maps signature, conflict, and transient failures without leaking detail", async () => {
    const { StripeBillingWebhookError } =
      await import("@/lib/server/stripe-billing-webhook");
    mocks.getDatabase.mockReturnValue(
      database({ deployment_mode: "managed", enabled: true }),
    );
    mocks.verify.mockImplementationOnce(() => {
      throw new StripeBillingWebhookError("invalid_signature");
    });
    const invalid = await POST(request());
    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toEqual({
      error: { code: "invalid_signature" },
    });

    const conflictQuery = vi.fn(async (parts: TemplateStringsArray) => {
      if (parts.join("?").includes("get_managed_billing_webhook_gate_v1")) {
        return [{ deployment_mode: "managed", enabled: true }];
      }
      throw Object.assign(new Error("private detail"), { code: "23505" });
    });
    mocks.getDatabase.mockReturnValue(conflictQuery);
    expect((await POST(request())).status).toBe(409);

    mocks.getDatabase.mockImplementation(() => {
      throw new Error("private connection detail");
    });
    const unavailable = await POST(request());
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("retry-after")).toBe("30");
  });
});
