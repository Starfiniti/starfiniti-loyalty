import { z } from "zod";
import {
  analyticsCohortRetentionReportV1,
  analyticsMetricDictionaryV4Schema,
} from "./analytics-cohorts";
import { analyticsProgrammeOutcomeReportV1 } from "./analytics-outcomes";
import {
  analyticsCommercePerformanceReportV1,
  analyticsValueTruthReportV1,
} from "./reporting";

const exactNonNegativeInteger = z.string().regex(/^(?:0|[1-9][0-9]*)$/u);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/u);
const ianaTimeZone = z.string().min(1).max(64);
const rangeDays = z.union([z.literal(7), z.literal(30), z.literal(90)]);

export const analyticsExportFormatV1 = z.literal("json_v1");
export const analyticsExportFrequencyV1 = z.enum([
  "daily",
  "weekly",
  "monthly",
]);
export const analyticsExportStateV1 = z.enum([
  "pending",
  "processing",
  "retry",
  "ready",
  "failed",
  "expired",
  "consumed",
]);

export const createAnalyticsExportCommandV1 = z
  .object({
    organizationId: z.uuid(),
    workspaceId: z.uuid(),
    programmeGroupId: z.uuid(),
    format: analyticsExportFormatV1,
    rangeDays,
    timeZone: ianaTimeZone,
    idempotencyKey: z.uuid(),
    correlationId: z.uuid(),
  })
  .strict();

export const createAnalyticsReportScheduleCommandV1 = z
  .object({
    organizationId: z.uuid(),
    workspaceId: z.uuid(),
    programmeGroupId: z.uuid(),
    format: analyticsExportFormatV1,
    rangeDays,
    timeZone: ianaTimeZone,
    frequency: analyticsExportFrequencyV1,
    localHour: z.number().int().min(0).max(23),
    dayOfWeek: z.number().int().min(0).max(6).nullable(),
    dayOfMonth: z.number().int().min(1).max(28).nullable(),
    idempotencyKey: z.uuid(),
    correlationId: z.uuid(),
  })
  .strict()
  .superRefine((command, context) => {
    const valid =
      (command.frequency === "daily" &&
        command.dayOfWeek === null &&
        command.dayOfMonth === null) ||
      (command.frequency === "weekly" &&
        command.dayOfWeek !== null &&
        command.dayOfMonth === null) ||
      (command.frequency === "monthly" &&
        command.dayOfWeek === null &&
        command.dayOfMonth !== null);
    if (!valid) {
      context.addIssue({
        code: "custom",
        message: "Schedule selectors must match the selected frequency",
        path: ["frequency"],
      });
    }
  });

export const setAnalyticsReportScheduleStateCommandV1 = z
  .object({
    scheduleId: z.uuid(),
    state: z.enum(["active", "paused"]),
    idempotencyKey: z.uuid(),
    correlationId: z.uuid(),
  })
  .strict();

export const analyticsExportSummaryV1 = z
  .object({
    publicId: z.uuid(),
    source: z.enum(["manual", "schedule"]),
    schedulePublicId: z.uuid().nullable(),
    format: analyticsExportFormatV1,
    rangeDays,
    timeZone: ianaTimeZone,
    state: analyticsExportStateV1,
    attemptCount: z.number().int().min(0).max(5),
    requestedAsOf: z.iso.datetime({ offset: true }),
    requestedAt: z.iso.datetime({ offset: true }),
    generatedAt: z.iso.datetime({ offset: true }).nullable(),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
    consumedAt: z.iso.datetime({ offset: true }).nullable(),
    failureCode: z.string().min(1).max(64).nullable(),
    sourceSha256: sha256Hex.nullable(),
    payloadBytes: exactNonNegativeInteger.nullable(),
  })
  .strict()
  .superRefine((item, context) => {
    const hasReadyPayload =
      item.generatedAt !== null &&
      item.expiresAt !== null &&
      item.sourceSha256 !== null &&
      item.payloadBytes !== null;
    if (
      (["ready", "consumed", "expired"] as const).includes(
        item.state as "ready" | "consumed" | "expired",
      ) !== hasReadyPayload ||
      (item.state === "consumed") !== (item.consumedAt !== null) ||
      (item.source === "schedule") !== (item.schedulePublicId !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Export state and payload evidence must agree",
        path: ["state"],
      });
    }
  });

export const analyticsReportScheduleV1 = z
  .object({
    publicId: z.uuid(),
    format: analyticsExportFormatV1,
    rangeDays,
    timeZone: ianaTimeZone,
    frequency: analyticsExportFrequencyV1,
    localHour: z.number().int().min(0).max(23),
    dayOfWeek: z.number().int().min(0).max(6).nullable(),
    dayOfMonth: z.number().int().min(1).max(28).nullable(),
    state: z.enum(["active", "paused"]),
    nextRunAt: z.iso.datetime({ offset: true }).nullable(),
    lastRunAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((schedule, context) => {
    const selectorValid =
      (schedule.frequency === "daily" &&
        schedule.dayOfWeek === null &&
        schedule.dayOfMonth === null) ||
      (schedule.frequency === "weekly" &&
        schedule.dayOfWeek !== null &&
        schedule.dayOfMonth === null) ||
      (schedule.frequency === "monthly" &&
        schedule.dayOfWeek === null &&
        schedule.dayOfMonth !== null);
    if (
      !selectorValid ||
      (schedule.state === "active") !== !!schedule.nextRunAt
    ) {
      context.addIssue({
        code: "custom",
        message: "Schedule cadence and active state must agree",
        path: ["state"],
      });
    }
  });

export const analyticsExportWorkspaceV1 = z
  .object({
    schemaVersion: z.literal("1"),
    canCreateExport: z.boolean(),
    canManageSchedules: z.boolean(),
    exports: z.array(analyticsExportSummaryV1).max(50),
    schedules: z.array(analyticsReportScheduleV1).max(20),
  })
  .strict();

export const analyticsReportExportV1 = z
  .object({
    schemaVersion: z.literal("starfiniti.analytics-report-export.v1"),
    exportId: z.uuid(),
    generatedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    requestedAsOf: z.iso.datetime({ offset: true }),
    rangeDays,
    requestedTimeZone: ianaTimeZone,
    sourceSha256: sha256Hex,
    dictionary: analyticsMetricDictionaryV4Schema,
    reports: z
      .object({
        valueTruth: analyticsValueTruthReportV1,
        commercePerformance: analyticsCommercePerformanceReportV1,
        programmeOutcomes: analyticsProgrammeOutcomeReportV1,
        cohortRetention: analyticsCohortRetentionReportV1,
      })
      .strict(),
  })
  .strict()
  .superRefine((document, context) => {
    const asOf = Date.parse(document.requestedAsOf);
    const reports = document.reports;
    if (
      Date.parse(document.generatedAt) < asOf ||
      Date.parse(document.expiresAt) <= Date.parse(document.generatedAt) ||
      reports.valueTruth.asOf !== document.requestedAsOf ||
      reports.commercePerformance.asOf !== document.requestedAsOf ||
      reports.programmeOutcomes.asOf !== document.requestedAsOf ||
      reports.cohortRetention.asOf !== document.requestedAsOf ||
      reports.valueTruth.period.rangeDays !== document.rangeDays ||
      reports.commercePerformance.period.rangeDays !== document.rangeDays ||
      reports.programmeOutcomes.period.rangeDays !== document.rangeDays ||
      reports.cohortRetention.reportPeriod.rangeDays !== document.rangeDays ||
      reports.cohortRetention.cohortPeriod.timeZone !==
        document.requestedTimeZone ||
      document.dictionary.dictionaryVersion !== "4"
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Export request, reports, and dictionary must share exact evidence",
        path: ["reports"],
      });
    }
  });

export type AnalyticsExportSummaryV1 = z.infer<typeof analyticsExportSummaryV1>;
export type AnalyticsReportScheduleV1 = z.infer<
  typeof analyticsReportScheduleV1
>;
export type AnalyticsExportWorkspaceV1 = z.infer<
  typeof analyticsExportWorkspaceV1
>;
export type AnalyticsReportExportV1 = z.infer<typeof analyticsReportExportV1>;
