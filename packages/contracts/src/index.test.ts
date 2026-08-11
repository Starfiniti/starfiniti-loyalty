import { describe, expect, it } from "vitest";
import { commerceEnvelopeV1 } from "./index";

describe("commerceEnvelopeV1", () => {
  it("accepts a versioned WooCommerce event envelope", () => {
    const result = commerceEnvelopeV1.safeParse({
      version: "1",
      eventId: "wc-order-42-v3",
      connectionId: "5abf9309-a530-489f-a63f-51130c4fc01d",
      eventType: "order.updated",
      occurredAt: "2026-08-11T08:30:00+02:00",
      deliveredAt: "2026-08-11T08:30:01+02:00",
      payload: { id: 42 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unversioned envelope", () => {
    expect(commerceEnvelopeV1.safeParse({ eventId: "42" }).success).toBe(false);
  });
});
