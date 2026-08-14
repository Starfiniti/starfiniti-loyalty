import { z } from "zod";

export * from "./woocommerce";
export * from "./ledger";
export * from "./programme";
export * from "./programme-v2";
export * from "./tier-policy-v2";
export * from "./tier-progression";
export * from "./point-expiry-v2";
export * from "./reward-v2";
export * from "./reward-fulfilment";
export * from "./reporting";
export * from "./experience";
export * from "./customer-export";
export * from "./entitlements";
export * from "./activity";
export * from "./referral";
export * from "./audience";

export const commerceEnvelopeV1 = z.object({
  version: z.literal("1"),
  eventId: z.string().min(1).max(255),
  connectionId: z.uuid(),
  eventType: z.string().regex(/^[a-z]+\.[a-z_]+$/u),
  occurredAt: z.iso.datetime({ offset: true }),
  deliveredAt: z.iso.datetime({ offset: true }),
  payload: z.unknown(),
});

export type CommerceEnvelopeV1 = z.infer<typeof commerceEnvelopeV1>;
