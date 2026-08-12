"use client";

import { useActionState, useState } from "react";
import {
  retryConnectorEffect,
  type ConnectorActionState,
} from "./actions";

const initialState: ConnectorActionState = { kind: "idle", message: "" };

export function RetryEffectForm({ eventId }: { eventId: string }) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    retryConnectorEffect,
    initialState,
  );
  return (
    <form action={action} className="retry-form">
      <input name="eventId" type="hidden" value={eventId} />
      <input name="operationId" type="hidden" value={operationId} />
      <label>
        <span className="sr-only">Reason for retry</span>
        <input
          maxLength={500}
          minLength={8}
          name="reason"
          placeholder="Reviewed reason for replay"
          required
        />
      </label>
      <label className="retry-confirm">
        <input name="confirmation" required type="checkbox" value="retry" />
        Reviewed
      </label>
      <button className="secondary" disabled={pending} type="submit">
        {pending ? "Queuing…" : "Retry effect"}
      </button>
      {state.kind !== "idle" ? (
        <p className={`action-message ${state.kind}`} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
