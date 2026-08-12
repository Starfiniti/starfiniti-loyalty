"use client";

import { useActionState, useState } from "react";
import {
  executeBulkCustomerAdjustment,
  previewBulkCustomerAdjustment,
  type BulkExecuteActionState,
  type BulkPreviewActionState,
} from "./actions";

const initialPreview: BulkPreviewActionState = { kind: "idle", message: "" };
const initialExecute: BulkExecuteActionState = { kind: "idle", message: "" };

export function BulkAdjustmentForm({
  customers,
  programmeGroupId,
  programmeVersionId,
  programmeVersionNumber,
}: Readonly<{
  customers: readonly Readonly<{
    id: string;
    displayReference: string;
    availablePoints: string;
  }>[];
  programmeGroupId: string;
  programmeVersionId: string;
  programmeVersionNumber: number;
}>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [previewState, previewAction, previewPending] = useActionState(
    previewBulkCustomerAdjustment,
    initialPreview,
  );
  const [executeState, executeAction, executePending] = useActionState(
    executeBulkCustomerAdjustment,
    initialExecute,
  );

  if (previewState.kind !== "success") {
    return (
      <form action={previewAction} className="bulk-adjustment-form">
        <input name="programmeGroupId" type="hidden" value={programmeGroupId} />
        <input
          name="programmeVersionId"
          type="hidden"
          value={programmeVersionId}
        />
        <div className="bulk-customer-picker">
          <div className="customer-result-heading">
            <div>
              <strong>Select customers</strong>
            </div>
            <span>2–50 active wallets · latest 50 customers</span>
          </div>
          {customers.length < 2 ? (
            <p className="empty-state">
              At least two active customer wallets are required for a bulk
              operation.
            </p>
          ) : (
            <div className="bulk-customer-grid">
              {customers.map((customer) => (
                <label key={customer.id}>
                  <input
                    name="customerId"
                    type="checkbox"
                    value={customer.id}
                  />
                  <span>
                    <strong>{customer.displayReference}</strong>
                    <small>{customer.availablePoints} available points</small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="adjustment-fields">
          <label>
            <span>Points per customer</span>
            <input
              inputMode="numeric"
              maxLength={19}
              name="pointsPerCustomer"
              pattern="-?[1-9][0-9]*"
              placeholder="250 or -250"
              required
            />
          </label>
          <label>
            <span>Reason</span>
            <input
              maxLength={500}
              minLength={8}
              name="reason"
              placeholder="Approved campaign correction"
              required
            />
          </label>
          <label>
            <span>Credit expiry (required when adding points)</span>
            <input name="expiresAt" type="datetime-local" />
          </label>
        </div>
        <div className="bulk-safety-note">
          <strong>Dry run first</strong>
          <p>
            Previewing is read-only. Execution later requires the exact customer
            set, balances, amount, reason, expiry, and published programme
            fingerprint shown in that preview.
          </p>
        </div>
        <button
          className="primary"
          disabled={previewPending || customers.length < 2}
          type="submit"
        >
          {previewPending ? "Building dry run…" : "Preview batch"}
        </button>
        {previewState.kind === "error" ? (
          <p className="action-message error" role="status">
            {previewState.message}
          </p>
        ) : null}
      </form>
    );
  }

  const { command, result } = previewState.preview;
  const removal = BigInt(command.pointsPerCustomer) < 0n;
  return (
    <form action={executeAction} className="bulk-adjustment-form">
      {command.customerIds.map((customerId) => (
        <input
          key={customerId}
          name="customerId"
          type="hidden"
          value={customerId}
        />
      ))}
      <input
        name="programmeGroupId"
        type="hidden"
        value={command.programmeGroupId}
      />
      <input
        name="programmeVersionId"
        type="hidden"
        value={command.programmeVersionId}
      />
      <input
        name="pointsPerCustomer"
        type="hidden"
        value={command.pointsPerCustomer}
      />
      <input name="reason" type="hidden" value={command.reason} />
      <input name="expiresAt" type="hidden" value={command.expiresAt ?? ""} />
      <input
        name="expectedPreviewSha256"
        type="hidden"
        value={result.previewSha256}
      />
      <input name="operationId" type="hidden" value={operationId} />

      <div className={`bulk-preview-summary ${removal ? "danger" : ""}`}>
        <div>
          <span>Customers</span>
          <strong>{result.customerCount}</strong>
        </div>
        <div>
          <span>Each customer</span>
          <strong>{result.pointsPerCustomer}</strong>
        </div>
        <div>
          <span>Total ledger effect</span>
          <strong>{result.totalPoints}</strong>
        </div>
        <div>
          <span>Programme</span>
          <strong>v{programmeVersionNumber}</strong>
        </div>
      </div>
      <div className="customer-table-wrap">
        <table className="customer-table bulk-preview-table">
          <thead>
            <tr>
              <th scope="col">Customer</th>
              <th scope="col">Available before</th>
              <th scope="col">Projected after</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((item) => (
              <tr key={item.customerId}>
                <td>
                  <strong>{item.displayReference}</strong>
                </td>
                <td className="points-cell">{item.availablePoints}</td>
                <td className="points-cell">{item.projectedAvailablePoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="bulk-preview-evidence">
        <div>
          <dt>Reason</dt>
          <dd>{command.reason}</dd>
        </div>
        <div>
          <dt>Credit expiry</dt>
          <dd>{command.expiresAt ?? "Not applicable to point removal"}</dd>
        </div>
        <div>
          <dt>Preview fingerprint</dt>
          <dd>{result.previewSha256}</dd>
        </div>
      </dl>
      {executeState.kind !== "success" ? (
        <div className="adjustment-confirmation">
          <label>
            <input
              name="confirmation"
              required
              type="checkbox"
              value="approved"
            />
            I approve this exact customer set, amount, projected balances,
            reason, expiry, and immutable ledger batch.
          </label>
          <button
            className={removal ? "danger-button" : "primary"}
            disabled={executePending}
            type="submit"
          >
            {executePending ? "Recording batch…" : "Execute approved batch"}
          </button>
        </div>
      ) : null}
      <div className="bulk-preview-footer">
        <a className="secondary" href="/customers/bulk">
          Start a new dry run
        </a>
        <p className="action-message success" role="status">
          {executeState.kind === "idle"
            ? previewState.message
            : executeState.message}
        </p>
      </div>
    </form>
  );
}
