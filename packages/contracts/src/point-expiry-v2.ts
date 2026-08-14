import { z } from "zod";

export const pointExpiryPolicyV2 = z
  .object({
    version: z.literal("2"),
    method: z.literal("earned_date"),
    expireAfterDays: z.number().int().min(1).max(3650),
    notificationLeadDays: z.array(z.number().int().min(1).max(3650)).max(5),
  })
  .strict()
  .superRefine((policy, context) => {
    const uniqueLeads = new Set(policy.notificationLeadDays);
    if (uniqueLeads.size !== policy.notificationLeadDays.length) {
      context.addIssue({
        code: "custom",
        message: "Expiry notification lead days must be unique",
        path: ["notificationLeadDays"],
      });
    }
    if (
      policy.notificationLeadDays.some(
        (leadDays) => leadDays >= policy.expireAfterDays,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Expiry notifications must precede point expiry",
        path: ["notificationLeadDays"],
      });
    }
    if (
      policy.notificationLeadDays.some(
        (leadDays, index) =>
          index > 0 && leadDays >= policy.notificationLeadDays[index - 1]!,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Expiry notification lead days must be in descending order",
        path: ["notificationLeadDays"],
      });
    }
  });

export type PointExpiryPolicyV2 = z.infer<typeof pointExpiryPolicyV2>;
