"use client";

import type {
  MigrationSourceInspectionV1,
  MigrationSourceSystemV1,
  MigrationWorkflowMappingV1,
} from "@starfiniti/contracts";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSearch,
  FileUp,
  Fingerprint,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  applyMigrationOpeningBalance,
  inspectMigrationSource,
  recordMigrationDryRun,
  type MigrationApplyActionState,
  type MigrationDryRunActionState,
  type MigrationInspectionActionState,
} from "./actions";

type CustomerOption = Readonly<{
  id: string;
  label: string;
}>;

type ConnectionOption = Readonly<{
  id: string;
  name: string;
}>;

type SourceOption = Readonly<{
  sourceSystem: MigrationSourceSystemV1;
  label: string;
  format: "csv" | "json";
  requiredExpiryPolicy: "merchant_selected" | "apply_default";
}>;

type RowMapping = Readonly<{
  decision: MigrationWorkflowMappingV1["decision"];
  targetCustomerId: string | null;
}>;

const SOURCE_LIMIT = 5 * 1024 * 1024;

export function MigrationWorkflow({
  canConfigure,
  connections,
  customers,
  programmeVersionNumber,
  sources,
}: Readonly<{
  canConfigure: boolean;
  connections: readonly ConnectionOption[];
  customers: readonly CustomerOption[];
  programmeVersionNumber: number;
  sources: readonly SourceOption[];
}>) {
  const router = useRouter();
  const [sourceSystem, setSourceSystem] = useState<MigrationSourceSystemV1>(
    sources[0]?.sourceSystem ?? "generic_csv",
  );
  const source = sources.find((option) => option.sourceSystem === sourceSystem);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [exportId, setExportId] = useState("");
  const [exportedAt, setExportedAt] = useState("");
  const [expiryMode, setExpiryMode] = useState<
    "apply_default" | "preserve_exact"
  >(
    source?.requiredExpiryPolicy === "merchant_selected"
      ? "preserve_exact"
      : "apply_default",
  );
  const [expiresAt, setExpiresAt] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [inspection, setInspection] =
    useState<MigrationInspectionActionState | null>(null);
  const [dryRun, setDryRun] = useState<MigrationDryRunActionState | null>(null);
  const [application, setApplication] =
    useState<MigrationApplyActionState | null>(null);
  const [mappings, setMappings] = useState<
    Readonly<Record<string, RowMapping>>
  >({});
  const [approved, setApproved] = useState(false);
  const [inspectionPending, startInspection] = useTransition();
  const [dryRunPending, startDryRun] = useTransition();
  const [applicationPending, startApplication] = useTransition();
  const [dryRunOperationId, setDryRunOperationId] = useState(() =>
    crypto.randomUUID(),
  );
  const [applicationOperationId, setApplicationOperationId] = useState(() =>
    crypto.randomUUID(),
  );

  const readyInspection =
    inspection?.kind === "ready" ? inspection.inspection : null;
  const readyDryRun = dryRun?.kind === "ready" ? dryRun : null;
  const allResolved = useMemo(
    () =>
      Boolean(readyInspection) &&
      readyInspection?.rows.every(
        (row) => mappings[row.sourceRowId]?.decision !== "unresolved",
      ),
    [mappings, readyInspection],
  );

  function resetReview() {
    setInspection(null);
    setMappings({});
    setDryRun(null);
    setApplication(null);
    setApproved(false);
    setDryRunOperationId(crypto.randomUUID());
    setApplicationOperationId(crypto.randomUUID());
  }

  function sourceFormData(operationId?: string): FormData | null {
    if (!sourceFile || !source || !exportedAt) return null;
    const exportedInstant = instant(exportedAt);
    const expiryInstant =
      expiryMode === "apply_default" ? instant(expiresAt) : null;
    if (
      !exportedInstant ||
      (expiryMode === "apply_default" && !expiryInstant)
    ) {
      return null;
    }
    const data = new FormData();
    data.set("sourceFile", sourceFile);
    data.set("sourceSystem", source.sourceSystem);
    data.set("exportId", exportId);
    data.set("exportedAt", exportedInstant);
    data.set("expiryMode", expiryMode);
    if (expiryInstant) data.set("expiresAt", expiryInstant);
    if (operationId) data.set("operationId", operationId);
    if (connectionId) data.set("commerceConnectionId", connectionId);
    return data;
  }

  function inspect() {
    if (sourceFile && sourceFile.size > SOURCE_LIMIT) {
      setInspection({
        kind: "error",
        message: "The source file exceeds the reviewed 5 MiB limit.",
      });
      return;
    }
    const data = sourceFormData();
    if (!data) {
      setInspection({
        kind: "error",
        message:
          "Choose a file, export reference, export time, and expiry policy.",
      });
      return;
    }
    startInspection(async () => {
      const result = await inspectMigrationSource(data);
      setInspection(result);
      setDryRun(null);
      setApplication(null);
      setApproved(false);
      if (result.kind === "ready") {
        setMappings(
          Object.fromEntries(
            result.inspection.rows.map((row) => [
              row.sourceRowId,
              { decision: "unresolved", targetCustomerId: null },
            ]),
          ),
        );
      } else {
        setMappings({});
      }
    });
  }

  function serializedMappings(
    sourceInspection: MigrationSourceInspectionV1,
  ): string {
    return JSON.stringify(
      sourceInspection.rows.map(
        (row) =>
          ({
            sourceRowId: row.sourceRowId,
            decision: mappings[row.sourceRowId]?.decision ?? "unresolved",
            targetCustomerId:
              mappings[row.sourceRowId]?.targetCustomerId ?? null,
          }) satisfies MigrationWorkflowMappingV1,
      ),
    );
  }

  function runDryRun() {
    if (!readyInspection) return;
    const data = sourceFormData(dryRunOperationId);
    if (!data) return;
    data.set("mappings", serializedMappings(readyInspection));
    startDryRun(async () => {
      const result = await recordMigrationDryRun(data);
      setDryRun(result);
      setApplication(null);
      setApproved(false);
      if (result.kind === "ready") router.refresh();
    });
  }

  function apply() {
    if (!readyInspection || !readyDryRun || !approved) return;
    const data = sourceFormData(applicationOperationId);
    if (!data) return;
    data.set("mappings", serializedMappings(readyInspection));
    data.set("confirmation", "approved");
    data.set("dryRunId", readyDryRun.receipt.dryRunId);
    data.set("approvalSha256", readyDryRun.receipt.approvalSha256);
    data.set("expectedEngineSha256", readyDryRun.result.engineSha256);
    data.set("expectedSourceSha256", readyDryRun.result.sourceExportSha256);
    startApplication(async () => {
      const result = await applyMigrationOpeningBalance(data);
      setApplication(result);
      if (result.kind === "success") router.refresh();
    });
  }

  function updateMapping(sourceRowId: string, value: string) {
    const next: RowMapping = value.startsWith("customer:")
      ? {
          decision: "matched_existing",
          targetCustomerId: value.slice("customer:".length),
        }
      : value === "create_new"
        ? { decision: "create_new", targetCustomerId: null }
        : { decision: "unresolved", targetCustomerId: null };
    setMappings((current) => ({ ...current, [sourceRowId]: next }));
    setDryRun(null);
    setApplication(null);
    setApproved(false);
    setDryRunOperationId(crypto.randomUUID());
    setApplicationOperationId(crypto.randomUUID());
  }

  function setAll(decision: "create_new" | "unresolved") {
    if (!readyInspection) return;
    setMappings(
      Object.fromEntries(
        readyInspection.rows.map((row) => [
          row.sourceRowId,
          { decision, targetCustomerId: null },
        ]),
      ),
    );
    setDryRun(null);
    setApplication(null);
    setApproved(false);
    setDryRunOperationId(crypto.randomUUID());
    setApplicationOperationId(crypto.randomUUID());
  }

  if (!canConfigure) {
    return (
      <section className="migration-disabled" role="status">
        <LockKeyhole aria-hidden="true" />
        <div>
          <h2>Migration writes are disabled</h2>
          <p>
            Your role or live tenant entitlement is read-only. Existing
            receipts, batches, balances, and correction evidence remain visible
            below.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="migration-builder"
      aria-labelledby="migration-builder-title"
    >
      <header className="migration-section-header">
        <div>
          <p className="login-eyebrow">Controlled value import</p>
          <h2 id="migration-builder-title">Move customer balances safely</h2>
          <p>
            Inspect the export, resolve each identity, then approve one
            immutable opening-balance batch. Source bytes stay transient.
          </p>
        </div>
        <span className="privacy-badge">
          <ShieldCheck aria-hidden="true" /> Programme v{programmeVersionNumber}
        </span>
      </header>

      <ol className="migration-steps" aria-label="Migration workflow">
        <Step
          number="1"
          label="Inspect source"
          active={!readyInspection}
          complete={Boolean(readyInspection)}
        />
        <Step
          number="2"
          label="Resolve and dry run"
          active={Boolean(readyInspection && !readyDryRun)}
          complete={Boolean(readyDryRun)}
        />
        <Step
          number="3"
          label="Approve and apply"
          active={Boolean(readyDryRun && application?.kind !== "success")}
          complete={application?.kind === "success"}
        />
      </ol>

      <div className="migration-config-grid">
        <label>
          Source system
          <select
            value={sourceSystem}
            onChange={(event) => {
              const next = event.target.value as MigrationSourceSystemV1;
              setSourceSystem(next);
              const option = sources.find(
                (candidate) => candidate.sourceSystem === next,
              );
              setExpiryMode(
                option?.requiredExpiryPolicy === "apply_default"
                  ? "apply_default"
                  : "preserve_exact",
              );
              resetReview();
            }}
          >
            {sources.map((option) => (
              <option key={option.sourceSystem} value={option.sourceSystem}>
                {option.label} · {option.format.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          Export reference
          <input
            maxLength={160}
            placeholder="august-2026-final"
            value={exportId}
            onChange={(event) => {
              setExportId(event.target.value);
              resetReview();
            }}
          />
        </label>
        <label>
          Exported at
          <input
            type="datetime-local"
            value={exportedAt}
            onChange={(event) => {
              setExportedAt(event.target.value);
              resetReview();
            }}
          />
        </label>
        <label>
          Expiry evidence
          <select
            disabled={source?.requiredExpiryPolicy === "apply_default"}
            value={expiryMode}
            onChange={(event) => {
              setExpiryMode(event.target.value as typeof expiryMode);
              resetReview();
            }}
          >
            <option value="preserve_exact">Preserve exact source lots</option>
            <option value="apply_default">Apply one reviewed expiry</option>
          </select>
        </label>
        {expiryMode === "apply_default" ? (
          <label>
            Imported points expire at
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => {
                setExpiresAt(event.target.value);
                resetReview();
              }}
            />
          </label>
        ) : null}
        {connections.length > 0 ? (
          <label>
            WooCommerce identity store
            <select
              value={connectionId}
              onChange={(event) => setConnectionId(event.target.value)}
            >
              <option value="">Not required</option>
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="migration-file-row">
        <label className="migration-file-control">
          <FileUp aria-hidden="true" />
          <span>
            <strong>{sourceFile?.name ?? "Choose export file"}</strong>
            <small>Strict UTF-8 · maximum 5 MiB · never persisted</small>
          </span>
          <input
            accept={
              source?.format === "json"
                ? ".json,application/json"
                : ".csv,text/csv"
            }
            type="file"
            onChange={(event) => {
              setSourceFile(event.target.files?.[0] ?? null);
              resetReview();
            }}
          />
        </label>
        <button
          className="ui-button ui-button-primary"
          disabled={inspectionPending || !sourceFile}
          onClick={inspect}
          type="button"
        >
          {inspectionPending ? (
            <LoaderCircle className="is-spinning" aria-hidden="true" />
          ) : (
            <FileSearch aria-hidden="true" />
          )}
          {inspectionPending ? "Inspecting…" : "Inspect source"}
        </button>
      </div>

      {inspection ? <ActionNotice state={inspection} /> : null}
      {inspection?.kind === "invalid" ? (
        <div
          className="migration-issues"
          role="region"
          aria-label="Source validation issues"
        >
          <strong>
            {inspection.issueCount} issue
            {inspection.issueCount === 1 ? "" : "s"}
          </strong>
          <ul>
            {inspection.issues.map((issue, index) => (
              <li key={`${issue.rowNumber}:${issue.code}:${index}`}>
                Row {issue.rowNumber}: {humanize(issue.code)} (
                {humanize(issue.field)})
              </li>
            ))}
          </ul>
          {inspection.truncatedIssueCount > 0 ? (
            <p>
              {inspection.truncatedIssueCount} additional issues were safely
              summarized.
            </p>
          ) : null}
        </div>
      ) : null}

      {readyInspection ? (
        <section
          className="migration-resolution"
          aria-labelledby="migration-resolution-title"
        >
          <header>
            <div>
              <p className="login-eyebrow">Transient source review</p>
              <h3 id="migration-resolution-title">
                Resolve {readyInspection.rowCount} customer rows
              </h3>
              <p>
                Emails and source IDs below came from your current upload and
                are not included in saved receipts or reports.
              </p>
            </div>
            <div className="migration-resolution-actions">
              <button
                className="ui-button ui-button-secondary"
                onClick={() => setAll("create_new")}
                type="button"
              >
                <Check aria-hidden="true" /> Create all as new
              </button>
              <button
                className="ui-button ui-button-ghost"
                onClick={() => setAll("unresolved")}
                type="button"
              >
                <RotateCcw aria-hidden="true" /> Clear mappings
              </button>
            </div>
          </header>

          <div className="migration-summary-strip">
            <Metric label="Rows" value={String(readyInspection.rowCount)} />
            <Metric
              label="Available"
              value={`${readyInspection.availablePoints} points`}
            />
            <Metric
              label="Pending"
              value={`${readyInspection.pendingPoints} points`}
            />
            <Metric
              label="Source digest"
              value={shortHash(readyInspection.sourceExportSha256)}
              mono
            />
          </div>

          <div className="migration-table-wrap">
            <table className="migration-table">
              <thead>
                <tr>
                  <th scope="col">Source row</th>
                  <th scope="col">Identity</th>
                  <th scope="col">Value</th>
                  <th scope="col">Explicit destination</th>
                </tr>
              </thead>
              <tbody>
                {readyInspection.rows.map((row) => {
                  const mapping = mappings[row.sourceRowId] ?? {
                    decision: "unresolved",
                    targetCustomerId: null,
                  };
                  const selected =
                    mapping.decision === "matched_existing" &&
                    mapping.targetCustomerId
                      ? `customer:${mapping.targetCustomerId}`
                      : mapping.decision;
                  return (
                    <tr key={row.sourceRowId}>
                      <td>
                        <code>{row.sourceRowId}</code>
                      </td>
                      <td>
                        <span className="migration-identity-kind">
                          {humanize(row.identity.kind)}
                        </span>
                        <strong>{row.identity.value}</strong>
                      </td>
                      <td>
                        {row.availablePoints} available
                        {row.pendingPoints !== "0"
                          ? ` · ${row.pendingPoints} pending`
                          : ""}
                      </td>
                      <td>
                        <select
                          aria-label={`Destination for ${row.sourceRowId}`}
                          value={selected}
                          onChange={(event) =>
                            updateMapping(row.sourceRowId, event.target.value)
                          }
                        >
                          <option value="unresolved">
                            Choose destination…
                          </option>
                          <option value="create_new">
                            Create new imported member
                          </option>
                          {customers.map((customer) => (
                            <option
                              key={customer.id}
                              value={`customer:${customer.id}`}
                            >
                              Match {customer.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="migration-dry-run-bar">
            <div>
              <Fingerprint aria-hidden="true" />
              <span>
                <strong>
                  {allResolved
                    ? "Ready for authoritative validation"
                    : "Unresolved rows remain"}
                </strong>
                <small>
                  Running a dry run stores hashes, counts, and bounded issue
                  totals only.
                </small>
              </span>
            </div>
            <button
              className="ui-button ui-button-primary"
              disabled={dryRunPending}
              onClick={runDryRun}
              type="button"
            >
              {dryRunPending ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
              ) : (
                <ArrowRight aria-hidden="true" />
              )}
              {dryRunPending ? "Validating…" : "Run authoritative dry run"}
            </button>
          </div>
        </section>
      ) : null}

      {dryRun ? <ActionNotice state={dryRun} /> : null}
      {readyDryRun ? (
        <section
          className={`migration-approval ${readyDryRun.result.status === "valid" ? "is-valid" : "is-invalid"}`}
        >
          <header>
            {readyDryRun.result.status === "valid" ? (
              <CheckCircle2 aria-hidden="true" />
            ) : (
              <AlertTriangle aria-hidden="true" />
            )}
            <div>
              <p className="login-eyebrow">Immutable dry-run receipt</p>
              <h3>
                {readyDryRun.result.status === "valid"
                  ? "Exact batch is ready for approval"
                  : "Resolve the recorded differences"}
              </h3>
            </div>
          </header>
          <div className="migration-summary-strip">
            <Metric
              label="Matched"
              value={String(readyDryRun.result.matchedCount)}
            />
            <Metric
              label="New"
              value={String(readyDryRun.result.createCount)}
            />
            <Metric
              label="Unresolved"
              value={String(readyDryRun.result.unresolvedCount)}
            />
            <Metric
              label="Approval"
              value={shortHash(readyDryRun.receipt.approvalSha256)}
              mono
            />
          </div>
          {readyDryRun.result.status === "invalid" ? (
            <ul className="migration-safe-issues">
              {Object.entries(readyDryRun.result.issueCounts).map(
                ([code, count]) => (
                  <li key={code}>
                    {humanize(code)}: {count}
                  </li>
                ),
              )}
            </ul>
          ) : (
            <div className="migration-approval-footer">
              <label className="migration-confirmation">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(event) => setApproved(event.target.checked)}
                />
                <span>
                  I approve this exact file, mapping, programme version, and
                  point total.
                </span>
              </label>
              <button
                className="ui-button ui-button-primary"
                disabled={!approved || applicationPending}
                onClick={apply}
                type="button"
              >
                {applicationPending ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : (
                  <LockKeyhole aria-hidden="true" />
                )}
                {applicationPending
                  ? "Applying once…"
                  : "Apply opening balances"}
              </button>
            </div>
          )}
        </section>
      ) : null}

      {application ? <ActionNotice state={application} /> : null}
    </section>
  );
}

function Step({
  active,
  complete,
  label,
  number,
}: Readonly<{
  active: boolean;
  complete: boolean;
  label: string;
  number: string;
}>) {
  return (
    <li
      className={`${active ? "is-active" : ""} ${complete ? "is-complete" : ""}`}
    >
      <span>{complete ? <Check aria-hidden="true" /> : number}</span>
      <strong>{label}</strong>
    </li>
  );
}

function Metric({
  label,
  mono = false,
  value,
}: Readonly<{ label: string; mono?: boolean; value: string }>) {
  return (
    <div>
      <small>{label}</small>
      <strong className={mono ? "is-mono" : undefined}>{value}</strong>
    </div>
  );
}

function ActionNotice({
  state,
}: Readonly<{ state: { kind: string; message: string } }>) {
  const success = ["ready", "success"].includes(state.kind);
  return (
    <div
      className={`migration-notice ${success ? "is-success" : "is-error"}`}
      role={success ? "status" : "alert"}
    >
      {success ? (
        <CheckCircle2 aria-hidden="true" />
      ) : (
        <AlertTriangle aria-hidden="true" />
      )}
      <p>{state.message}</p>
    </div>
  );
}

function instant(value: string): string | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}
