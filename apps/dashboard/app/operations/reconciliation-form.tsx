"use client";

import { useActionState, useState } from "react";
import {
  requestConnectorReconciliation,
  type ConnectorActionState,
} from "./actions";

const initialState: ConnectorActionState = { kind: "idle", message: "" };

export function ReconciliationForm({
  connectionId,
}: Readonly<{ connectionId: string }>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [state, action, pending] = useActionState(
    requestConnectorReconciliation,
    initialState,
  );
  const validOrderId = /^[1-9][0-9]{0,18}$/u.test(orderId);
  const validReason =
    reason === reason.trim() &&
    reason.length >= 8 &&
    reason.length <= 500 &&
    !/[\u0000-\u001f\u007f]/u.test(reason);

  return (
    <div className="reconciliation-control">
      <div>
        <strong>Reconcile a WooCommerce order</strong>
        <p>
          Ask the connector to re-read one source order and idempotently re-emit
          its order, refund, and coupon facts. This does not edit points
          directly.
        </p>
      </div>
      <form action={action} className="reconciliation-form">
        <input name="connectionId" type="hidden" value={connectionId} />
        <input name="operationId" type="hidden" value={operationId} />
        <label>
          <span>WooCommerce order ID</span>
          <input
            inputMode="numeric"
            maxLength={19}
            name="orderId"
            onChange={(event) => {
              setOrderId(event.target.value.trim());
              setReviewing(false);
            }}
            pattern="[1-9][0-9]{0,18}"
            placeholder="12345"
            required
            value={orderId}
          />
        </label>
        <label>
          <span>Review reason</span>
          <input
            maxLength={500}
            minLength={8}
            name="reason"
            onChange={(event) => {
              setReason(event.target.value);
              setReviewing(false);
            }}
            placeholder="Missing completed-order loyalty effect"
            required
            value={reason}
          />
        </label>
        {!reviewing ? (
          <button
            className="secondary"
            disabled={!validOrderId || !validReason}
            onClick={() => setReviewing(true)}
            type="button"
          >
            Review request
          </button>
        ) : (
          <div className="reconciliation-confirmation">
            <p>
              Reconcile source order <strong>#{orderId}</strong>. Duplicate
              facts remain fenced by their source revision.
            </p>
            <label>
              <input
                name="confirmation"
                required
                type="checkbox"
                value="reconcile"
              />
              I reviewed the order ID and reason.
            </label>
            <button
              className="primary"
              disabled={pending || state.kind === "success"}
              type="submit"
            >
              {pending ? "Queuing…" : "Queue reconciliation"}
            </button>
          </div>
        )}
        {state.kind !== "idle" ? (
          <p className={`action-message ${state.kind}`} role="status">
            {state.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
