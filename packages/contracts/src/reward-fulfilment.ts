import { z } from "zod";

const operationKey = z.string().trim().min(1).max(255);
const boundedSingleLine = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => !/[\r\n\u0000-\u001f\u007f]/u.test(value), {
    message: "Value must be a printable single line",
  });

export const rewardFulfilmentStateV1 = z.enum([
  "pending",
  "in_progress",
  "fulfilled",
  "rejected",
]);

export const merchantStartRewardFulfilmentCommandV1 = z
  .object({
    version: z.literal("1"),
    caseId: z.uuid(),
    idempotencyKey: operationKey,
    correlationId: z.uuid(),
  })
  .strict();

export const merchantResolveRewardFulfilmentCommandV1 = z
  .object({
    version: z.literal("1"),
    caseId: z.uuid(),
    resolution: z.enum(["fulfilled", "rejected"]),
    resultReference: boundedSingleLine.nullable(),
    reason: z.string().trim().min(8).max(1000).nullable(),
    idempotencyKey: operationKey,
    correlationId: z.uuid(),
  })
  .strict()
  .superRefine((command, context) => {
    if (
      (command.resolution === "fulfilled" &&
        command.resultReference === null) ||
      (command.resolution === "rejected" &&
        (command.resultReference !== null || command.reason === null))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Fulfilment requires a result reference; rejection requires a reason and no result reference",
        path: ["resolution"],
      });
    }
  });

export const rewardFulfilmentCommandResultV1 = z
  .object({
    caseId: z.uuid(),
    state: rewardFulfilmentStateV1,
    reservationState: z.enum(["reserved", "captured", "released"]).optional(),
    outcome: z.enum(["created", "duplicate"]),
  })
  .strict();

export const rewardFulfilmentCaseV1 = z
  .object({
    caseId: z.uuid(),
    reservationId: z.uuid(),
    customerId: z.uuid(),
    customerReference: z.string().trim().min(1).max(200),
    rewardCode: z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/u),
    rewardName: z.string().trim().min(1).max(200),
    costPoints: z.string().regex(/^[1-9][0-9]*$/u),
    state: rewardFulfilmentStateV1,
    instructions: z.string().trim().min(1).max(2000),
    dueAt: z.iso.datetime({ offset: true }),
    resultReference: boundedSingleLine.nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const rewardFulfilmentSummaryV1 = z
  .object({
    pending: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
    overdue: z.number().int().nonnegative(),
    fulfilled30d: z.number().int().nonnegative(),
    rejected30d: z.number().int().nonnegative(),
  })
  .strict();

export type RewardFulfilmentCaseV1 = z.infer<typeof rewardFulfilmentCaseV1>;
export type RewardFulfilmentSummaryV1 = z.infer<
  typeof rewardFulfilmentSummaryV1
>;
