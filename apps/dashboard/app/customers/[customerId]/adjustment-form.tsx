"use client";

import { useActionState, useMemo, useState } from "react";
import {
  adjustCustomerPoints,
  type CustomerAdjustmentActionState,
} from "@/app/customers/adjustment-actions";
import { parseAdjustmentPoints, previewAvailablePoints } from "@/lib/customers";

const initialState: CustomerAdjustmentActionState = {
  kind: "idle",
  message: "",
};

export function CustomerAdjustmentForm({
  customerId,
  programmeGroupId,
  programmeVersionId,
  programmeVersionNumber,
  availablePoints,
}: Readonly<{
  customerId: string;
  programmeGroupId: string;
  programmeVersionId: string;
  programmeVersionNumber: number;
  availablePoints: string;
}>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [points, setPoints] = useState("");
  const [expiryLocal, setExpiryLocal] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [state, action, pending] = useActionState(
    adjustCustomerPoints,
    initialState,
  );
  const parsedPoints = parseAdjustmentPoints(points);
  const preview = useMemo(
    () => previewAvailablePoints(availablePoints, points),
    [availablePoints, points],
  );
  const removal = parsedPoints !== null && parsedPoints < 0n;

  return (
    <section className="customer-panel adjustment-panel">
      <div className="customer-result-heading">
        <div>
          <strong>Manual adjustment</strong>
        </div>
        <span>Immutable ledger · programme v{programmeVersionNumber}</span>
      </div>
      <form action={action} className="adjustment-form">
        <input name="customerId" type="hidden" value={customerId} />
        <input name="programmeGroupId" type="hidden" value={programmeGroupId} />
        <input
          name="programmeVersionId"
          type="hidden"
          value={programmeVersionId}
        />
        <input name="operationId" type="hidden" value={operationId} />
        <input
          name="expiresAt"
          type="hidden"
          value={
            expiryLocal && !removal ? new Date(expiryLocal).toISOString() : ""
          }
        />

        <div className="adjustment-fields">
          <label>
            <span>Points to add or remove</span>
            <input
              inputMode="numeric"
              maxLength={19}
              name="points"
              onChange={(event) => {
                setPoints(event.target.value.trim());
                setReviewing(false);
              }}
              pattern="-?[1-9][0-9]*"
              placeholder="250 or -250"
              required
              value={points}
            />
          </label>
          <label>
            <span>Reason</span>
            <input
              maxLength={500}
              minLength={8}
              name="reason"
              onChange={() => setReviewing(false)}
              placeholder="Approved customer correction"
              required
            />
          </label>
          <label>
            <span>Internal note (optional)</span>
            <input
              maxLength={500}
              name="internalNote"
              onChange={() => setReviewing(false)}
              placeholder="Ticket or approval reference"
            />
          </label>
          {!removal ? (
            <label>
              <span>Added points expire at</span>
              <input
                name="expiryLocal"
                onChange={(event) => {
                  setExpiryLocal(event.target.value);
                  setReviewing(false);
                }}
                required={parsedPoints !== null && parsedPoints > 0n}
                type="datetime-local"
                value={expiryLocal}
              />
            </label>
          ) : null}
        </div>

        <div className={`adjustment-preview ${removal ? "danger" : ""}`}>
          <span>Resulting available balance</span>
          <strong>
            {preview === null ? "—" : preview.toLocaleString("en")} points
          </strong>
          <p>
            {removal
              ? "Warning: this appends a compensating debit and may make the available balance negative. It never rewrites prior awards."
              : "Added points create a new expiry lot attributed to the current published programme version."}
          </p>
        </div>

        {!reviewing ? (
          <button
            className="secondary"
            disabled={parsedPoints === null}
            onClick={() => setReviewing(true)}
            type="button"
          >
            Review adjustment
          </button>
        ) : (
          <div className="adjustment-confirmation">
            <label>
              <input
                name="confirmation"
                required
                type="checkbox"
                value="adjust"
              />
              I reviewed the amount, resulting balance, reason, and expiry.
            </label>
            <button
              className={removal ? "danger-button" : "primary"}
              disabled={pending || state.kind === "success"}
              type="submit"
            >
              {pending
                ? "Recording…"
                : removal
                  ? "Confirm point removal"
                  : "Confirm point credit"}
            </button>
          </div>
        )}
        {state.kind !== "idle" ? (
          <p className={`action-message ${state.kind}`} role="status">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
