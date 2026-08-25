import { describe, expect, it } from "vitest";
import {
  analyticsExportSummaryV1,
  analyticsExportWorkspaceV1,
  analyticsReportScheduleV1,
  createAnalyticsReportScheduleCommandV1,
} from "./analytics-export";

const now = "2026-08-25T20:00:00.000Z";

describe("analytics exports and schedules", () => {
  it("accepts one bounded ready aggregate export", () => {
    const item = analyticsExportSummaryV1.parse({
      publicId: "7e000000-0000-4000-8000-000000000001",
      source: "manual",
      schedulePublicId: null,
      format: "json_v1",
      rangeDays: 30,
      timeZone: "Europe/Ljubljana",
      state: "ready",
      attemptCount: 1,
      requestedAsOf: now,
      requestedAt: now,
      generatedAt: "2026-08-25T20:00:01.000Z",
      expiresAt: "2026-08-26T20:00:01.000Z",
      consumedAt: null,
      failureCode: null,
      sourceSha256: "a".repeat(64),
      payloadBytes: "12000",
    });
    expect(item.state).toBe("ready");
  });

  it("rejects payload evidence on a pending export", () => {
    expect(() =>
      analyticsExportSummaryV1.parse({
        publicId: "7e000000-0000-4000-8000-000000000001",
        source: "manual",
        schedulePublicId: null,
        format: "json_v1",
        rangeDays: 30,
        timeZone: "UTC",
        state: "pending",
        attemptCount: 0,
        requestedAsOf: now,
        requestedAt: now,
        generatedAt: now,
        expiresAt: "2026-08-26T20:00:00.000Z",
        consumedAt: null,
        failureCode: null,
        sourceSha256: "b".repeat(64),
        payloadBytes: "1",
      }),
    ).toThrow();
  });

  it("requires cadence-specific local selectors", () => {
    const base = {
      organizationId: "7e000000-0000-4000-8000-000000000100",
      workspaceId: "7e000000-0000-4000-8000-000000000101",
      programmeGroupId: "7e000000-0000-4000-8000-000000000102",
      format: "json_v1" as const,
      rangeDays: 30 as const,
      timeZone: "Europe/Ljubljana",
      localHour: 8,
      idempotencyKey: "7e000000-0000-4000-8000-000000000103",
      correlationId: "7e000000-0000-4000-8000-000000000104",
    };
    expect(
      createAnalyticsReportScheduleCommandV1.parse({
        ...base,
        frequency: "weekly",
        dayOfWeek: 1,
        dayOfMonth: null,
      }).dayOfWeek,
    ).toBe(1);
    expect(() =>
      createAnalyticsReportScheduleCommandV1.parse({
        ...base,
        frequency: "monthly",
        dayOfWeek: 1,
        dayOfMonth: null,
      }),
    ).toThrow();
  });

  it("binds active schedules to a next run and paused schedules to none", () => {
    const base = {
      publicId: "7e000000-0000-4000-8000-000000000201",
      format: "json_v1" as const,
      rangeDays: 90 as const,
      timeZone: "UTC",
      frequency: "daily" as const,
      localHour: 6,
      dayOfWeek: null,
      dayOfMonth: null,
      lastRunAt: null,
      createdAt: now,
      updatedAt: now,
    };
    expect(
      analyticsReportScheduleV1.parse({
        ...base,
        state: "active",
        nextRunAt: "2026-08-26T06:00:00.000Z",
      }).state,
    ).toBe("active");
    expect(() =>
      analyticsReportScheduleV1.parse({
        ...base,
        state: "paused",
        nextRunAt: "2026-08-26T06:00:00.000Z",
      }),
    ).toThrow();
  });

  it("caps workspace history", () => {
    expect(() =>
      analyticsExportWorkspaceV1.parse({
        schemaVersion: "1",
        canCreateExport: true,
        canManageSchedules: false,
        exports: Array.from({ length: 51 }, (_, index) => ({
          publicId: `7e000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        })),
        schedules: [],
      }),
    ).toThrow();
  });
});
