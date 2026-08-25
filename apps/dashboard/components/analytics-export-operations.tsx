"use client";

import type {
  AnalyticsExportWorkspaceV1,
  AnalyticsReportScheduleV1,
} from "@starfiniti/contracts";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Download,
  FileJson2,
  LoaderCircle,
  Pause,
  Play,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { useActionState, useState } from "react";
import {
  createAnalyticsExport,
  createAnalyticsReportSchedule,
  prepareAnalyticsExportDownload,
  setAnalyticsReportScheduleState,
  type AnalyticsExportActionState,
} from "@/app/analytics/actions";

const idle: AnalyticsExportActionState = { kind: "idle", message: "" };

export function AnalyticsExportOperations({
  initialExportOperationId,
  initialScheduleOperationId,
  organizationId,
  workspaceId,
  programmeGroupId,
  workspace,
}: Readonly<{
  initialExportOperationId: string;
  initialScheduleOperationId: string;
  organizationId: string;
  workspaceId: string;
  programmeGroupId: string;
  workspace: AnalyticsExportWorkspaceV1;
}>) {
  const [exportState, exportAction, exportPending] = useActionState(
    createAnalyticsExport,
    idle,
  );
  const [scheduleState, scheduleAction, schedulePending] = useActionState(
    createAnalyticsReportSchedule,
    idle,
  );
  const [timeZone, setTimeZone] = useState("UTC");
  const [frequency, setFrequency] = useState("weekly");

  const scopeFields = (
    <>
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="workspaceId" type="hidden" value={workspaceId} />
      <input name="programmeGroupId" type="hidden" value={programmeGroupId} />
    </>
  );

  return (
    <section
      className="analytics-export-module"
      aria-labelledby="exports-title"
    >
      <header className="analytics-section-heading">
        <div>
          <p className="login-eyebrow">Private reporting operations</p>
          <h2 id="exports-title">Exports and scheduled reports</h2>
          <p>
            Generate one reconciled JSON package with dictionary v4 and all four
            analytics reports. Payloads expire after 24 hours and download
            capabilities are session-bound and single use.
          </p>
        </div>
        <FileJson2 aria-hidden="true" />
      </header>

      <div className="analytics-export-builders">
        <form action={exportAction} className="analytics-export-card">
          <div className="analytics-export-card-title">
            <span>
              <Download aria-hidden="true" />
            </span>
            <div>
              <h3>Request export</h3>
              <p>Bounded aggregate evidence only—no raw customer rows.</p>
            </div>
          </div>
          {scopeFields}
          <input
            name="operationId"
            type="hidden"
            value={initialExportOperationId}
          />
          <div className="analytics-export-fields">
            <label>
              Period
              <select defaultValue="30" name="rangeDays">
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </label>
            <label>
              Reporting time zone
              <input
                maxLength={64}
                name="timeZone"
                onChange={(event) => setTimeZone(event.target.value)}
                required
                value={timeZone}
              />
            </label>
          </div>
          <ActionMessage state={exportState} />
          <button
            className="ui-button ui-button-primary"
            disabled={!workspace.canCreateExport || exportPending}
            type="submit"
          >
            {exportPending ? (
              <LoaderCircle aria-hidden="true" />
            ) : (
              <FileJson2 aria-hidden="true" />
            )}
            {exportPending ? "Requesting…" : "Generate report"}
          </button>
        </form>

        <form action={scheduleAction} className="analytics-export-card">
          <div className="analytics-export-card-title">
            <span>
              <CalendarClock aria-hidden="true" />
            </span>
            <div>
              <h3>Schedule reports</h3>
              <p>Daily, weekly, or monthly in the selected IANA zone.</p>
            </div>
          </div>
          {scopeFields}
          <input
            name="operationId"
            type="hidden"
            value={initialScheduleOperationId}
          />
          <div className="analytics-export-fields is-schedule">
            <label>
              Cadence
              <select
                name="frequency"
                onChange={(event) => setFrequency(event.target.value)}
                value={frequency}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label>
              Period
              <select defaultValue="30" name="rangeDays">
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
              </select>
            </label>
            <label>
              Local hour
              <input
                defaultValue="8"
                max="23"
                min="0"
                name="localHour"
                type="number"
              />
            </label>
            {frequency === "weekly" ? (
              <label>
                Day
                <select defaultValue="1" name="dayOfWeek">
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                  <option value="6">Saturday</option>
                  <option value="0">Sunday</option>
                </select>
              </label>
            ) : null}
            {frequency === "monthly" ? (
              <label>
                Day of month
                <input
                  defaultValue="1"
                  max="28"
                  min="1"
                  name="dayOfMonth"
                  type="number"
                />
              </label>
            ) : null}
            <label className="analytics-time-zone-field">
              Reporting time zone
              <input
                maxLength={64}
                name="timeZone"
                required
                value={timeZone}
                readOnly
              />
            </label>
          </div>
          <ActionMessage state={scheduleState} />
          <button
            className="ui-button ui-button-secondary"
            disabled={!workspace.canManageSchedules || schedulePending}
            type="submit"
          >
            {schedulePending ? (
              <LoaderCircle aria-hidden="true" />
            ) : (
              <CalendarClock aria-hidden="true" />
            )}
            {schedulePending ? "Scheduling…" : "Create schedule"}
          </button>
        </form>
      </div>

      <div className="analytics-export-history-grid">
        <section
          className="analytics-export-history"
          aria-labelledby="export-history-title"
        >
          <header>
            <div>
              <p className="login-eyebrow">Report history</p>
              <h3 id="export-history-title">Recent exports</h3>
            </div>
            <span>{workspace.exports.length} retained</span>
          </header>
          {workspace.exports.length === 0 ? (
            <EmptyHistory
              icon={FileJson2}
              text="No report exports have been requested yet."
            />
          ) : (
            <ul className="analytics-export-list">
              {workspace.exports.map((item) => (
                <li key={item.publicId}>
                  <span className={`analytics-export-state is-${item.state}`}>
                    <ExportStateIcon state={item.state} />{" "}
                    {stateLabel(item.state)}
                  </span>
                  <div>
                    <strong>{item.rangeDays}-day JSON report</strong>
                    <small>
                      {item.source === "schedule" ? "Scheduled" : "Manual"} ·
                      requested {formatDate(item.requestedAt)} · {item.timeZone}
                    </small>
                    {item.failureCode ? (
                      <small>
                        Stopped safely: {failureLabel(item.failureCode)}
                      </small>
                    ) : null}
                  </div>
                  {item.state === "ready" ? (
                    <form action={prepareAnalyticsExportDownload}>
                      <input
                        name="exportId"
                        type="hidden"
                        value={item.publicId}
                      />
                      <button
                        className="ui-button ui-button-secondary"
                        type="submit"
                      >
                        <Download aria-hidden="true" /> Download
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="analytics-export-history"
          aria-labelledby="schedule-history-title"
        >
          <header>
            <div>
              <p className="login-eyebrow">Automation</p>
              <h3 id="schedule-history-title">Schedules</h3>
            </div>
            <span>
              {
                workspace.schedules.filter((item) => item.state === "active")
                  .length
              }{" "}
              active
            </span>
          </header>
          {workspace.schedules.length === 0 ? (
            <EmptyHistory
              icon={CalendarClock}
              text="No recurring report schedule is configured."
            />
          ) : (
            <ul className="analytics-schedule-list">
              {workspace.schedules.map((schedule) => (
                <ScheduleItem key={schedule.publicId} schedule={schedule} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="analytics-export-assurance">
        <ShieldCheck aria-hidden="true" />
        <p>
          Exports are assembled server-side from reconciled PostgreSQL evidence.
          The browser never receives database credentials or a reusable download
          token.
        </p>
      </footer>
    </section>
  );
}

function ScheduleItem({
  schedule,
}: Readonly<{ schedule: AnalyticsReportScheduleV1 }>) {
  const [state, action, pending] = useActionState(
    setAnalyticsReportScheduleState,
    idle,
  );
  const nextState = schedule.state === "active" ? "paused" : "active";
  return (
    <li>
      <span className={`analytics-export-state is-${schedule.state}`}>
        {schedule.state === "active" ? (
          <CheckCircle2 aria-hidden="true" />
        ) : (
          <Pause aria-hidden="true" />
        )}
        {schedule.state}
      </span>
      <div>
        <strong>
          {capitalize(schedule.frequency)} · {schedule.rangeDays}-day report
        </strong>
        <small>
          {schedule.nextRunAt
            ? `Next ${formatDate(schedule.nextRunAt)}`
            : "No future run"}{" "}
          · {schedule.timeZone}
        </small>
        <ActionMessage state={state} />
      </div>
      <form action={action}>
        <input name="scheduleId" type="hidden" value={schedule.publicId} />
        <input name="state" type="hidden" value={nextState} />
        <button
          className="ui-button ui-button-quiet"
          disabled={pending}
          type="submit"
        >
          {nextState === "paused" ? (
            <Pause aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
          {pending ? "Updating…" : nextState === "paused" ? "Pause" : "Resume"}
        </button>
      </form>
    </li>
  );
}

function ActionMessage({
  state,
}: Readonly<{ state: AnalyticsExportActionState }>) {
  return state.kind === "idle" ? null : (
    <p className={`analytics-export-message is-${state.kind}`} role="status">
      {state.message}
    </p>
  );
}

function EmptyHistory({
  icon: Icon,
  text,
}: Readonly<{ icon: typeof FileJson2; text: string }>) {
  return (
    <div className="analytics-export-empty">
      <Icon aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

function ExportStateIcon({
  state,
}: Readonly<{
  state: AnalyticsExportWorkspaceV1["exports"][number]["state"];
}>) {
  if (state === "ready" || state === "consumed")
    return <CheckCircle2 aria-hidden="true" />;
  if (state === "pending" || state === "processing" || state === "retry")
    return <LoaderCircle aria-hidden="true" />;
  if (state === "expired") return <Clock3 aria-hidden="true" />;
  return <RefreshCcw aria-hidden="true" />;
}

function stateLabel(
  state: AnalyticsExportWorkspaceV1["exports"][number]["state"],
): string {
  return {
    pending: "Queued",
    processing: "Generating",
    retry: "Retrying",
    ready: "Ready",
    failed: "Failed",
    expired: "Expired",
    consumed: "Downloaded",
  }[state];
}

function failureLabel(code: string): string {
  return (
    (
      {
        actor_revoked: "requesting access was revoked",
        scope_unavailable: "report scope is no longer active",
        feature_disabled: "analytics rollout is disabled",
        payload_too_large: "bounded payload limit was exceeded",
        generation_failed: "report sources were temporarily unavailable",
        lease_attempts_exhausted: "worker retries were exhausted",
      } as Record<string, string>
    )[code] ?? "generation did not pass verification"
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
