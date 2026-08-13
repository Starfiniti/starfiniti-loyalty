"use client";

import { useActionState, useState } from "react";
import { merchantText, type MerchantLocale } from "@/lib/merchant-locale";
import {
  provisionActivitySource,
  type ActivitySourceProvisioningState,
} from "./actions";

const initialState: ActivitySourceProvisioningState = {
  kind: "idle",
  message: "",
  setupCode: null,
  sourceId: null,
};

export function ActivitySourceProvisioningForm({
  workspaceId,
  workspaceName,
  programmeId,
  programmeName,
  locale,
}: Readonly<{
  workspaceId: string;
  workspaceName: string;
  programmeId: string;
  programmeName: string;
  locale: MerchantLocale;
}>) {
  const t = (source: string) => merchantText(locale, source);
  const [operationId] = useState(() => crypto.randomUUID());
  const [displayName, setDisplayName] = useState(
    `${workspaceName} server activities`,
  );
  const [reviewing, setReviewing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState(
    provisionActivitySource,
    initialState,
  );
  const validName =
    displayName === displayName.trim() &&
    displayName.length >= 1 &&
    displayName.length <= 200 &&
    !/[\u0000-\u001f\u007f]/u.test(displayName);

  if (state.kind === "success" && state.setupCode) {
    return (
      <section className="connector-provisioning-result" aria-live="polite">
        <div>
          <strong>{t("One-time Merchant Activity API setup code")}</strong>
          <p>{state.message}</p>
        </div>
        <textarea
          aria-label={t("One-time Merchant Activity API setup code")}
          readOnly
          rows={7}
          spellCheck={false}
          value={state.setupCode}
        />
        <div className="connector-provisioning-actions">
          <button
            className="primary"
            onClick={async () => {
              await navigator.clipboard.writeText(state.setupCode ?? "");
              setCopied(true);
            }}
            type="button"
          >
            {copied ? t("Copied") : t("Copy setup code")}
          </button>
        </div>
        <p className="connector-secret-warning">
          Store this package in the sending server&apos;s secret manager. Never
          expose it to browser code, analytics, support records, or logs. The
          hub cannot reveal the key again after this page closes.
        </p>
      </section>
    );
  }

  return (
    <section className="connector-provisioning">
      <div>
        <p className="login-eyebrow">{t("Server-side earning source")}</p>
        <h2>{t("Connect Merchant Activity API")}</h2>
        <p>
          Award verified birthdays, account events, product reviews, or custom
          activities from a trusted server into {programmeName}. Browser
          self-reporting is rejected.
        </p>
      </div>
      <form action={action} autoComplete="off">
        <input name="lang" type="hidden" value={locale} />
        <input name="operationId" type="hidden" value={operationId} />
        <input name="workspaceId" type="hidden" value={workspaceId} />
        <input name="programmeId" type="hidden" value={programmeId} />
        <label>
          <span>{t("Source display name")}</span>
          <input
            maxLength={200}
            name="displayName"
            onChange={(event) => {
              setDisplayName(event.target.value);
              setReviewing(false);
            }}
            required
            value={displayName}
          />
          <small>
            Name the trusted CRM, backend, or automation that will sign events.
          </small>
        </label>
        {!reviewing ? (
          <button
            className="primary"
            disabled={!validName}
            onClick={() => setReviewing(true)}
            type="button"
          >
            {t("Review source")}
          </button>
        ) : (
          <div className="connector-provisioning-confirmation">
            <p>
              Connect <strong>{displayName}</strong> to {programmeName}. This
              creates immutable tenant audit evidence and consumes one signing
              key.
            </p>
            <label>
              <input
                name="confirmation"
                required
                type="checkbox"
                value="provision"
              />
              {t("I reviewed the source and programme.")}
            </label>
            <button className="primary" disabled={pending} type="submit">
              {pending
                ? t("Provisioning…")
                : t("Provision and show setup code")}
            </button>
          </div>
        )}
        {state.kind === "error" ? (
          <p className="action-message error" role="alert">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
