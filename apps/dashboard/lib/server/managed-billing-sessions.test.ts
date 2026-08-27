import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  checkout: vi.fn(),
  customer: vi.fn(),
  portal: vi.fn(),
  readKey: vi.fn(),
  rows: [] as unknown[][],
  statements: [] as Array<{ text: string; values: unknown[] }>,
}));

vi.mock("./database", () => ({
  getDatabase:
    () =>
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      mocks.statements.push({ text: strings.join("?"), values });
      return mocks.rows.shift() ?? [];
    },
}));

vi.mock("./stripe-billing-sessions", () => {
  class StripeBillingSessionError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  }
  return {
    readStripeBillingApiKey: mocks.readKey,
    stripeBillingSessionConfig: () => ({
      apiKey: "private",
      baseUrl: "https://api.stripe.com",
      liveMode: false,
      publicOrigin: "https://loyalty.starfiniti.com",
      timeoutMs: 1000,
    }),
    StripeBillingSessionError,
    StripeBillingSessionClient: class {
      createCustomer = mocks.customer;
      createCheckout = mocks.checkout;
      createPortal = mocks.portal;
    },
  };
});

import { createManagedBillingSession } from "./managed-billing-sessions";

const actorUserId = "a1000000-0000-4000-8000-000000000001";
const organizationId = "a1000000-0000-4000-8000-000000000100";
const planId = "a1000000-0000-4000-8000-000000000200";
const operationId = "a1000000-0000-4000-8000-000000000300";

describe("managed billing session orchestration", () => {
  beforeEach(() => {
    mocks.rows.length = 0;
    mocks.statements.length = 0;
    vi.clearAllMocks();
    mocks.readKey.mockReturnValue("private");
  });

  it("returns from self-hosted mode before reading a key or creating a provider", async () => {
    mocks.rows.push([
      {
        deployment_mode: "self_hosted",
        operation_id: operationId,
        operation_state: "self_hosted",
        provider_customer_id: null,
        provider_price_id: null,
        live_mode: null,
        customer_idempotency_key: null,
        session_idempotency_key: null,
      },
    ]);

    await expect(
      createManagedBillingSession(actorUserId, {
        schemaVersion: "1",
        organizationId,
        action: "checkout",
        planId,
        operationId,
      }),
    ).resolves.toEqual({ kind: "self_hosted" });
    expect(mocks.readKey).not.toHaveBeenCalled();
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.statements).toHaveLength(1);
  });

  it("does not read a provider key when the database returns no live authority", async () => {
    mocks.rows.push(
      [
        {
          deployment_mode: "managed",
          operation_id: operationId,
          operation_state: "ready",
          provider_customer_id: "cus_BillingSession0001",
          provider_price_id: "price_BillingSession0001",
          live_mode: false,
          customer_idempotency_key: `m14:customer:${operationId}`,
          session_idempotency_key: `m14:checkout:${operationId}`,
        },
      ],
      [],
    );

    await expect(
      createManagedBillingSession(actorUserId, {
        schemaVersion: "1",
        organizationId,
        action: "checkout",
        planId,
        operationId,
      }),
    ).rejects.toThrow();
    expect(mocks.readKey).not.toHaveBeenCalled();
    expect(mocks.customer).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.portal).not.toHaveBeenCalled();
    expect(mocks.statements).toHaveLength(2);
  });

  it("reserves then records a customer before creating one fixed-authority Checkout", async () => {
    mocks.rows.push(
      [
        {
          deployment_mode: "managed",
          operation_id: operationId,
          operation_state: "customer_required",
          provider_customer_id: null,
          provider_price_id: "price_BillingSession0001",
          live_mode: false,
          customer_idempotency_key: `m14:customer:${operationId}`,
          session_idempotency_key: `m14:checkout:${operationId}`,
        },
      ],
      [
        {
          action: "checkout",
          provider_customer_id: null,
          provider_price_id: "price_BillingSession0001",
          live_mode: false,
          provider_idempotency_key: `m14:customer:${operationId}`,
        },
      ],
      [{ operation_state: "ready" }],
      [
        {
          action: "checkout",
          provider_customer_id: "cus_BillingSession0001",
          provider_price_id: "price_BillingSession0001",
          live_mode: false,
          provider_idempotency_key: `m14:checkout:${operationId}`,
        },
      ],
      [{ operation_state: "completed" }],
    );
    mocks.customer.mockResolvedValue({ customerId: "cus_BillingSession0001" });
    mocks.checkout.mockResolvedValue({
      resourceId: "cs_test_BillingSession0001",
      url: "https://checkout.stripe.com/c/pay/BillingSession0001",
    });

    await expect(
      createManagedBillingSession(actorUserId, {
        schemaVersion: "1",
        organizationId,
        action: "checkout",
        planId,
        operationId,
      }),
    ).resolves.toEqual({
      kind: "redirect",
      url: "https://checkout.stripe.com/c/pay/BillingSession0001",
    });

    expect(mocks.readKey).toHaveBeenCalledTimes(1);
    expect(mocks.customer).toHaveBeenCalledWith({
      operationId,
      idempotencyKey: `m14:customer:${operationId}`,
    });
    expect(mocks.checkout).toHaveBeenCalledWith({
      customerId: "cus_BillingSession0001",
      priceId: "price_BillingSession0001",
      operationId,
      idempotencyKey: `m14:checkout:${operationId}`,
      successUrl: "https://loyalty.starfiniti.com/billing?checkout=returned",
      cancelUrl: "https://loyalty.starfiniti.com/billing?checkout=cancelled",
    });
    expect(mocks.portal).not.toHaveBeenCalled();
    expect(mocks.statements).toHaveLength(5);
    expect(mocks.statements[2]?.text).toContain(
      "record_managed_billing_session_attempt_v1",
    );
    expect(mocks.statements[4]?.text).toContain(
      "record_managed_billing_session_attempt_v1",
    );
  });

  it("stops when the post-provider customer record loses authority", async () => {
    mocks.rows.push(
      [
        {
          deployment_mode: "managed",
          operation_id: operationId,
          operation_state: "customer_required",
          provider_customer_id: null,
          provider_price_id: "price_BillingSession0001",
          live_mode: false,
          customer_idempotency_key: `m14:customer:${operationId}`,
          session_idempotency_key: `m14:checkout:${operationId}`,
        },
      ],
      [
        {
          action: "checkout",
          provider_customer_id: null,
          provider_price_id: "price_BillingSession0001",
          live_mode: false,
          provider_idempotency_key: `m14:customer:${operationId}`,
        },
      ],
      [{ operation_state: "held" }],
    );
    mocks.customer.mockResolvedValue({ customerId: "cus_BillingSession0001" });

    await expect(
      createManagedBillingSession(actorUserId, {
        schemaVersion: "1",
        organizationId,
        action: "checkout",
        planId,
        operationId,
      }),
    ).rejects.toThrow("billing_session_unavailable");

    expect(mocks.customer).toHaveBeenCalledTimes(1);
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.portal).not.toHaveBeenCalled();
    expect(mocks.statements).toHaveLength(3);
  });

  it("does not expose a Checkout redirect after the final database hold", async () => {
    mocks.rows.push(
      [
        {
          deployment_mode: "managed",
          operation_id: operationId,
          operation_state: "ready",
          provider_customer_id: "cus_BillingSession0001",
          provider_price_id: "price_BillingSession0001",
          live_mode: false,
          customer_idempotency_key: `m14:customer:${operationId}`,
          session_idempotency_key: `m14:checkout:${operationId}`,
        },
      ],
      [
        {
          action: "checkout",
          provider_customer_id: "cus_BillingSession0001",
          provider_price_id: "price_BillingSession0001",
          live_mode: false,
          provider_idempotency_key: `m14:checkout:${operationId}`,
        },
      ],
      [{ operation_state: "held" }],
    );
    mocks.checkout.mockResolvedValue({
      resourceId: "cs_test_BillingSession0001",
      url: "https://checkout.stripe.com/c/pay/BillingSession0001",
    });

    await expect(
      createManagedBillingSession(actorUserId, {
        schemaVersion: "1",
        organizationId,
        action: "checkout",
        planId,
        operationId,
      }),
    ).rejects.toThrow("billing_session_unavailable");

    expect(mocks.checkout).toHaveBeenCalledTimes(1);
    expect(mocks.portal).not.toHaveBeenCalled();
    expect(mocks.statements).toHaveLength(3);
  });

  it("does not expose a Portal redirect after the final database hold", async () => {
    mocks.rows.push(
      [
        {
          deployment_mode: "managed",
          operation_id: operationId,
          operation_state: "ready",
          provider_customer_id: "cus_BillingSession0001",
          provider_price_id: null,
          live_mode: false,
          customer_idempotency_key: `m14:customer:${operationId}`,
          session_idempotency_key: `m14:portal:${operationId}`,
        },
      ],
      [
        {
          action: "portal",
          provider_customer_id: "cus_BillingSession0001",
          provider_price_id: null,
          live_mode: false,
          provider_idempotency_key: `m14:portal:${operationId}`,
        },
      ],
      [{ operation_state: "held" }],
    );
    mocks.portal.mockResolvedValue({
      resourceId: "bps_BillingSession0001",
      url: "https://billing.stripe.com/p/session/BillingSession0001",
    });

    await expect(
      createManagedBillingSession(actorUserId, {
        schemaVersion: "1",
        organizationId,
        action: "portal",
        planId: null,
        operationId,
      }),
    ).rejects.toThrow("billing_session_unavailable");

    expect(mocks.portal).toHaveBeenCalledTimes(1);
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.statements).toHaveLength(3);
  });
});
