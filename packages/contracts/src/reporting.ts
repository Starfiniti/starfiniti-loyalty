import { z } from "zod";

const exactNonNegativeInteger = z.string().regex(/^(?:0|[1-9][0-9]*)$/u);

export const merchantOverviewReportV1 = z
  .object({
    reportVersion: z.literal("1"),
    asOf: z.iso.datetime({ offset: true }),
    rangeDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    currencyCode: z
      .string()
      .regex(/^[A-Z]{3}$/u)
      .nullable(),
    minorUnitsPerMajor: z
      .union([
        z.literal(1),
        z.literal(10),
        z.literal(100),
        z.literal(1_000),
        z.literal(10_000),
        z.literal(100_000),
        z.literal(1_000_000),
      ])
      .nullable(),
    membersTotal: exactNonNegativeInteger,
    membersNew: exactNonNegativeInteger,
    membersNewPrevious: exactNonNegativeInteger,
    eligibleSpendMinor: exactNonNegativeInteger,
    eligibleSpendMinorPrevious: exactNonNegativeInteger,
    repeatRateBasisPoints: exactNonNegativeInteger,
    repeatRateBasisPointsPrevious: exactNonNegativeInteger,
    redemptionRateBasisPoints: exactNonNegativeInteger,
    redemptionRateBasisPointsPrevious: exactNonNegativeInteger,
    outstandingPoints: z.string().regex(/^-?(?:0|[1-9][0-9]*)$/u),
    dailyNewMembers: z
      .array(
        z
          .object({
            date: z.iso.date(),
            current: exactNonNegativeInteger,
            previous: exactNonNegativeInteger,
          })
          .strict(),
      )
      .max(90),
  })
  .strict()
  .superRefine((report, context) => {
    if (report.dailyNewMembers.length !== report.rangeDays) {
      context.addIssue({
        code: "custom",
        message: "Overview trend must contain exactly one point per report day",
        path: ["dailyNewMembers"],
      });
    }
    if (
      (report.currencyCode === null) !==
      (report.minorUnitsPerMajor === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Overview currency metadata must be complete or absent",
        path: ["currencyCode"],
      });
    }
  });

export type MerchantOverviewReportV1 = z.infer<typeof merchantOverviewReportV1>;
