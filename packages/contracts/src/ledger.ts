import { z } from "zod";

const bigintString = z.string().regex(/^[1-9][0-9]*$/u);
const signedBigintString = z.string().regex(/^-?(?:0|[1-9][0-9]*)$/u);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/u);
const operationKey = z.string().min(1).max(255);
const timestamp = z.iso.datetime({ offset: true });
const merchantText = z
  .string()
  .trim()
  .regex(/^[^\u0000-\u001f\u007f]*$/u);

export const ledgerOperationKind = z.enum([
  "award",
  "release",
  "reserve",
  "capture",
  "cancel",
  "expire",
  "refund_reversal",
  "manual_adjustment",
]);

const commandIdentity = z.object({
  version: z.literal("1"),
  organizationId: bigintString,
  idempotencyKey: operationKey,
  requestSha256: sha256Hex,
  effectiveAt: timestamp,
});

const programmeContext = z.object({
  programmeGroupId: bigintString,
  programmeVersionId: bigintString,
});

export const awardPointsCommandV1 = commandIdentity.extend({
  kind: z.literal("award"),
  ...programmeContext.shape,
  customerId: bigintString,
  points: bigintString,
  sourceEventId: bigintString.nullable(),
  sourceReference: z.string().min(1).max(500).nullable(),
});

export const releasePointsCommandV1 = commandIdentity.extend({
  kind: z.literal("release"),
  ...programmeContext.shape,
  originEntryId: z.uuid(),
  expiresAt: timestamp,
});

export const reservePointsCommandV1 = commandIdentity.extend({
  kind: z.literal("reserve"),
  ...programmeContext.shape,
  walletId: z.uuid(),
  points: bigintString,
});

export const resolveReservationCommandV1 = commandIdentity.extend({
  kind: z.enum(["capture", "cancel"]),
  reservationTransactionId: z.uuid(),
});

export const expirePointsCommandV1 = commandIdentity.extend({
  kind: z.literal("expire"),
  walletId: z.uuid(),
  programmeVersionId: bigintString,
  asOf: timestamp,
});

export const reverseAwardCommandV1 = commandIdentity.extend({
  kind: z.literal("refund_reversal"),
  originEntryId: z.uuid(),
  points: bigintString,
  reason: z.string().trim().min(8).max(1000),
});

export const adjustPointsCommandV1 = commandIdentity.extend({
  kind: z.literal("manual_adjustment"),
  walletId: z.uuid(),
  programmeVersionId: bigintString,
  points: signedBigintString.refine(
    (value) => value !== "0",
    "points must be non-zero",
  ),
  reason: z.string().trim().min(8).max(1000),
  actorId: z.string().min(1).max(255),
  expiresAt: timestamp.nullable(),
});

export const ledgerCommandV1 = z.discriminatedUnion("kind", [
  awardPointsCommandV1,
  releasePointsCommandV1,
  reservePointsCommandV1,
  resolveReservationCommandV1,
  expirePointsCommandV1,
  reverseAwardCommandV1,
  adjustPointsCommandV1,
]);

export const ledgerCommandResultV1 = z.object({
  version: z.literal("1"),
  transactionId: z.uuid(),
  outcome: z.enum(["created", "duplicate"]),
});

export const merchantAdjustCustomerPointsCommandV1 = z
  .object({
    version: z.literal("1"),
    customerId: z.uuid(),
    programmeGroupId: z.uuid(),
    programmeVersionId: z.uuid(),
    points: signedBigintString.refine(
      (value) => value !== "0",
      "points must be non-zero",
    ),
    reason: merchantText.min(8).max(500),
    internalNote: merchantText.max(500).nullable(),
    expiresAt: timestamp.nullable(),
    idempotencyKey: operationKey,
    correlationId: z.uuid(),
  })
  .strict()
  .superRefine((command, context) => {
    const points = BigInt(command.points);
    if (points > 0n && command.expiresAt === null) {
      context.addIssue({
        code: "custom",
        message: "positive adjustment requires an expiry",
        path: ["expiresAt"],
      });
    }
    if (points < 0n && command.expiresAt !== null) {
      context.addIssue({
        code: "custom",
        message: "negative adjustment cannot have an expiry",
        path: ["expiresAt"],
      });
    }
  });

export const merchantAdjustCustomerPointsResultV1 = z
  .object({
    transactionId: z.uuid(),
    outcome: z.enum(["created", "duplicate"]),
    availablePoints: signedBigintString,
  })
  .strict();

export type LedgerCommandV1 = z.infer<typeof ledgerCommandV1>;
export type LedgerCommandResultV1 = z.infer<typeof ledgerCommandResultV1>;
export type MerchantAdjustCustomerPointsCommandV1 = z.infer<
  typeof merchantAdjustCustomerPointsCommandV1
>;
