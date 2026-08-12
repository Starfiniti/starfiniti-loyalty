"use client";

import { useActionState, useState } from "react";
import { merchantText, type MerchantLocale } from "@/lib/merchant-locale";
import {
  requestConnectorReconciliation,
  type ConnectorActionState,
} from "./actions";

const initialState: ConnectorActionState = { kind: "idle", message: "" };

export function ReconciliationForm({
  connectionId,
  locale,
}: Readonly<{ connectionId: string; locale: MerchantLocale }>) {
  const t = (source: string) => merchantText(locale, source);
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
        <strong>{t("Reconcile a WooCommerce order")}</strong>
        <p>
          {t(
            "Ask the connector to re-read one source order and idempotently re-emit its order, refund, and coupon facts. This does not edit points directly.",
          )}
        </p>
      </div>
      <form action={action} className="reconciliation-form">
        <input name="lang" type="hidden" value={locale} />
        <input name="connectionId" type="hidden" value={connectionId} />
        <input name="operationId" type="hidden" value={operationId} />
        <label>
          <span>{t("WooCommerce order ID")}</span>
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
          <span>{t("Review reason")}</span>
          <input
            maxLength={500}
            minLength={8}
            name="reason"
            onChange={(event) => {
              setReason(event.target.value);
              setReviewing(false);
            }}
            placeholder={t("Missing completed-order loyalty effect")}
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
            {t("Review request")}
          </button>
        ) : (
          <div className="reconciliation-confirmation">
            <p>
              {locale === "sl-SI"
                ? "Uskladi izvorno naročilo"
                : "Reconcile source order"}{" "}
              <strong>#{orderId}</strong>.{" "}
              {locale === "sl-SI"
                ? "Podvojeni podatki ostanejo zamejeni z revizijo vira."
                : "Duplicate facts remain fenced by their source revision."}
            </p>
            <label>
              <input
                name="confirmation"
                required
                type="checkbox"
                value="reconcile"
              />
              {t("I reviewed the order ID and reason.")}
            </label>
            <button
              className="primary"
              disabled={pending || state.kind === "success"}
              type="submit"
            >
              {pending ? t("Queuing…") : t("Queue reconciliation")}
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
