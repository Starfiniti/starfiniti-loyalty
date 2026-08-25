"use server";

import {
  createAnalyticsExportCommandV1,
  createAnalyticsReportScheduleCommandV1,
  setAnalyticsReportScheduleStateCommandV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ANALYTICS_EXPORT_COOKIE,
  analyticsExportDownloadPath,
} from "@/lib/analytics-export";
import { isSupabaseSessionId } from "@/lib/customer-export";
import { issueAnalyticsExportAuthorization } from "@/lib/server/analytics-exports";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AnalyticsExportActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
}>;

const success = (message: string): AnalyticsExportActionState => ({
  kind: "success",
  message,
});
const failure = (message: string): AnalyticsExportActionState => ({
  kind: "error",
  message,
});

export async function createAnalyticsExport(
  _previous: AnalyticsExportActionState,
  formData: FormData,
): Promise<AnalyticsExportActionState> {
  const command = createAnalyticsExportCommandV1.safeParse({
    organizationId: formData.get("organizationId"),
    workspaceId: formData.get("workspaceId"),
    programmeGroupId: formData.get("programmeGroupId"),
    format: "json_v1",
    rangeDays: number(formData.get("rangeDays")),
    timeZone: formData.get("timeZone"),
    idempotencyKey: formData.get("operationId"),
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return failure("Choose a supported period and IANA time zone.");
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("create_analytics_export_command", {
      target_organization_public_id: command.data.organizationId,
      target_workspace_public_id: command.data.workspaceId,
      target_programme_group_public_id: command.data.programmeGroupId,
      target_format: command.data.format,
      target_range_days: command.data.rangeDays,
      target_time_zone: command.data.timeZone,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error || !firstRow(data)) return databaseFailure(error);
  revalidatePath("/analytics");
  return success(
    "Report requested. It will become downloadable after the isolated reporting worker verifies all four sources.",
  );
}

export async function createAnalyticsReportSchedule(
  _previous: AnalyticsExportActionState,
  formData: FormData,
): Promise<AnalyticsExportActionState> {
  const frequency = formData.get("frequency");
  const command = createAnalyticsReportScheduleCommandV1.safeParse({
    organizationId: formData.get("organizationId"),
    workspaceId: formData.get("workspaceId"),
    programmeGroupId: formData.get("programmeGroupId"),
    format: "json_v1",
    rangeDays: number(formData.get("rangeDays")),
    timeZone: formData.get("timeZone"),
    frequency,
    localHour: number(formData.get("localHour")),
    dayOfWeek:
      frequency === "weekly" ? number(formData.get("dayOfWeek")) : null,
    dayOfMonth:
      frequency === "monthly" ? number(formData.get("dayOfMonth")) : null,
    idempotencyKey: formData.get("operationId"),
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return failure(
      "Complete the cadence, local hour, applicable day, and IANA time zone.",
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("create_analytics_report_schedule_command", {
      target_organization_public_id: command.data.organizationId,
      target_workspace_public_id: command.data.workspaceId,
      target_programme_group_public_id: command.data.programmeGroupId,
      target_format: command.data.format,
      target_range_days: command.data.rangeDays,
      target_time_zone: command.data.timeZone,
      target_frequency: command.data.frequency,
      target_local_hour: command.data.localHour,
      target_day_of_week: command.data.dayOfWeek,
      target_day_of_month: command.data.dayOfMonth,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error || !firstRow(data)) return databaseFailure(error);
  revalidatePath("/analytics");
  return success(
    "Schedule activated. Every run keeps its own requested-as-of evidence and expiry.",
  );
}

export async function setAnalyticsReportScheduleState(
  _previous: AnalyticsExportActionState,
  formData: FormData,
): Promise<AnalyticsExportActionState> {
  const command = setAnalyticsReportScheduleStateCommandV1.safeParse({
    scheduleId: formData.get("scheduleId"),
    state: formData.get("state"),
    idempotencyKey: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) return failure("The schedule command is invalid.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("set_analytics_report_schedule_state_command", {
      target_schedule_public_id: command.data.scheduleId,
      target_state: command.data.state,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error || !firstRow(data)) return databaseFailure(error);
  revalidatePath("/analytics");
  return success(
    command.data.state === "active"
      ? "Schedule resumed from a newly calculated future occurrence."
      : "Schedule paused. Existing exports and evidence were preserved.",
  );
}

export async function prepareAnalyticsExportDownload(
  formData: FormData,
): Promise<never> {
  const exportId = String(formData.get("exportId") ?? "");
  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  const authUserId = claims.data?.claims?.sub;
  const sessionId = claims.data?.claims?.session_id;
  if (
    claims.error ||
    typeof authUserId !== "string" ||
    !isSupabaseSessionId(sessionId)
  ) {
    redirect("/login?next=%2Fanalytics");
  }
  let downloadPath: string;
  try {
    const authorization = await issueAnalyticsExportAuthorization(
      exportId,
      authUserId,
      sessionId,
    );
    const cookieStore = await cookies();
    downloadPath = analyticsExportDownloadPath(exportId);
    cookieStore.set(ANALYTICS_EXPORT_COOKIE, authorization.authorizationToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: downloadPath,
      expires: new Date(authorization.expiresAt),
    });
  } catch {
    redirect("/analytics?export=unavailable");
  }
  redirect(downloadPath);
}

function number(value: FormDataEntryValue | null): number {
  return typeof value === "string" && /^\d{1,3}$/u.test(value)
    ? Number(value)
    : Number.NaN;
}

function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object"
    ? (row as Record<string, unknown>)
    : null;
}

function databaseFailure(error: { code?: string } | null) {
  if (error?.code === "42501") {
    return failure(
      "Your live role or analytics entitlement does not allow this operation.",
    );
  }
  if (error?.code === "23514" || error?.code === "23505") {
    return failure(
      "This operation identity conflicts with earlier input. Refresh and try again.",
    );
  }
  if (error?.code === "22023") {
    return failure("The report scope or schedule failed protected validation.");
  }
  return failure(
    "The report operation could not be completed safely. No outcome was assumed.",
  );
}
