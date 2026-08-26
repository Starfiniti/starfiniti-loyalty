"use client";

import type { MigrationWorkspaceV1 } from "@starfiniti/contracts";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DatabaseBackup,
  History,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useActionState, useState } from "react";
import {
  compensateMigrationBatch,
  type MigrationCorrectionActionState,
} from "./actions";

export function MigrationHistory({
  canCorrect,
  workspace,
}: Readonly<{
  canCorrect: boolean;
  workspace: MigrationWorkspaceV1;
}>) {
  return (
    <section
      className="migration-history"
      aria-labelledby="migration-history-title"
    >
      <header className="migration-section-header">
        <div>
          <p className="login-eyebrow">Immutable migration evidence</p>
          <h2 id="migration-history-title">Receipts and reconciliation</h2>
          <p>
            Every saved dry run is content-addressed. Every applied point traces
            to an opening transaction, source row, and lot without storing the
            source identity.
          </p>
        </div>
        <span className="privacy-badge">
          <History aria-hidden="true" /> {workspace.dryRuns.length} receipts
        </span>
      </header>

      <div className="migration-history-grid">
        <section
          aria-labelledby="migration-batches-title"
          className="migration-history-card is-wide"
        >
          <header>
            <div>
              <p className="login-eyebrow">Applied value</p>
              <h3 id="migration-batches-title">Opening-balance batches</h3>
            </div>
            <DatabaseBackup aria-hidden="true" />
          </header>
          {workspace.batches.length === 0 ? (
            <Empty text="No opening-balance batch has been applied." />
          ) : (
            <div className="migration-batch-list">
              {workspace.batches.map((batch) => (
                <article className="migration-batch" key={batch.publicId}>
                  <header>
                    <div>
                      <span
                        className={`migration-state is-${batch.reconciliation.status}`}
                      >
                        {batch.reconciliation.status === "reconciled" ? (
                          <CheckCircle2 aria-hidden="true" />
                        ) : (
                          <AlertTriangle aria-hidden="true" />
                        )}
                        {batch.reconciliation.status}
                      </span>
                      <h4>{sourceLabel(batch.sourceSystem)} import</h4>
                      <p>
                        {formatInstant(batch.createdAt)} ·{" "}
                        {shortId(batch.publicId)}
                      </p>
                    </div>
                    <strong>
                      {formatPoints(
                        BigInt(batch.availablePoints) +
                          BigInt(batch.pendingPoints),
                      )}{" "}
                      points
                    </strong>
                  </header>
                  <dl className="migration-reconciliation-grid">
                    <Evidence
                      label="Customers"
                      value={`${batch.reconciliation.itemCount} / ${batch.customerCount}`}
                    />
                    <Evidence
                      label="Lots"
                      value={String(batch.reconciliation.lotCount)}
                    />
                    <Evidence
                      label="Opening transactions"
                      value={String(
                        batch.reconciliation.openingTransactionCount,
                      )}
                    />
                    <Evidence
                      label="Released pending"
                      value={`${batch.reconciliation.releasedPendingPoints} points`}
                    />
                    <Evidence
                      label="Created customers"
                      value={String(batch.createdCustomerCount)}
                    />
                    <Evidence
                      label="Corrected"
                      value={`${batch.reconciliation.correctedPoints} points`}
                    />
                  </dl>
                  <details className="migration-item-details">
                    <summary>Trace source rows</summary>
                    <div className="migration-table-wrap">
                      <table className="migration-table is-compact">
                        <thead>
                          <tr>
                            <th scope="col">Source reference</th>
                            <th scope="col">Customer</th>
                            <th scope="col">Resolution</th>
                            <th scope="col">Imported</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batch.items.map((item) => (
                            <tr key={item.publicId}>
                              <td>
                                <code>{item.sourceRowRef}</code>
                              </td>
                              <td>{item.customerReference}</td>
                              <td>{humanize(item.resolutionBasis)}</td>
                              <td>
                                {formatPoints(
                                  BigInt(item.availablePoints) +
                                    BigInt(item.pendingPoints),
                                )}{" "}
                                points
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {batch.itemsTruncated ? (
                      <p className="migration-truncated">
                        Only the first 50 opaque source rows are shown.
                      </p>
                    ) : null}
                  </details>
                  {batch.correction ? (
                    <div className="migration-correction-record">
                      <RotateCcw aria-hidden="true" />
                      <div>
                        <strong>
                          {batch.correction.correctedPoints} points compensated
                        </strong>
                        <p>
                          {batch.correction.reason} ·{" "}
                          {formatInstant(batch.correction.createdAt)}
                        </p>
                      </div>
                    </div>
                  ) : canCorrect ? (
                    <CorrectionForm batchId={batch.publicId} />
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section
          aria-labelledby="migration-receipts-title"
          className="migration-history-card"
        >
          <header>
            <div>
              <p className="login-eyebrow">Validation history</p>
              <h3 id="migration-receipts-title">Dry-run receipts</h3>
            </div>
            <ShieldCheck aria-hidden="true" />
          </header>
          {workspace.dryRuns.length === 0 ? (
            <Empty text="No authoritative dry run has been recorded." />
          ) : (
            <ol className="migration-receipt-list">
              {workspace.dryRuns.map((receipt) => (
                <li key={receipt.publicId}>
                  <span className={`migration-state is-${receipt.status}`}>
                    {receipt.status === "valid" ? (
                      <CheckCircle2 aria-hidden="true" />
                    ) : (
                      <AlertTriangle aria-hidden="true" />
                    )}
                    {receipt.status}
                  </span>
                  <div>
                    <strong>
                      {sourceLabel(receipt.sourceSystem)} · {receipt.rowCount}{" "}
                      rows
                    </strong>
                    <p>
                      {receipt.matchedCount} matched · {receipt.createCount} new
                      · {receipt.unresolvedCount} unresolved
                    </p>
                    <small>
                      <Clock3 aria-hidden="true" />{" "}
                      {formatInstant(receipt.createdAt)}
                    </small>
                  </div>
                  <code title={receipt.approvalSha256}>
                    {shortHash(receipt.approvalSha256)}
                  </code>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </section>
  );
}

function CorrectionForm({ batchId }: Readonly<{ batchId: string }>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const initial: MigrationCorrectionActionState = { kind: "idle", message: "" };
  const [state, action, pending] = useActionState(
    compensateMigrationBatch,
    initial,
  );
  return (
    <details className="migration-correction-form">
      <summary>Append compensating correction</summary>
      <form action={action}>
        <input name="batchId" type="hidden" value={batchId} />
        <input name="operationId" type="hidden" value={operationId} />
        <label>
          Audited reason
          <textarea
            minLength={8}
            maxLength={500}
            name="reason"
            required
            rows={2}
          />
        </label>
        <label className="migration-confirmation">
          <input name="confirmation" type="checkbox" value="correct" />
          <span>
            Compensate all value created by this batch without deleting history.
          </span>
        </label>
        {state.kind !== "idle" ? (
          <p
            className={`migration-form-message is-${state.kind}`}
            role={state.kind === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
        <button
          className="ui-button ui-button-danger"
          disabled={pending}
          type="submit"
        >
          {pending ? (
            <LoaderCircle className="is-spinning" aria-hidden="true" />
          ) : (
            <RotateCcw aria-hidden="true" />
          )}
          {pending ? "Correcting…" : "Record correction"}
        </button>
      </form>
    </details>
  );
}

function Evidence({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Empty({ text }: Readonly<{ text: string }>) {
  return (
    <div className="migration-empty">
      <DatabaseBackup aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

function sourceLabel(source: string): string {
  return (
    (
      {
        generic_csv: "Generic CSV",
        wployalty: "WPLoyalty",
        yith_points_and_rewards: "YITH",
        woorewards: "WooRewards",
      } as Record<string, string>
    )[source] ?? source
  );
}

function formatInstant(value: string): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}

function formatPoints(value: bigint): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

function shortHash(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}…`;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}
