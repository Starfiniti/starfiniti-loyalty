"use client";

import { useActionState, useState } from "react";
import { provisionConnector, type ConnectorProvisioningState } from "./actions";

const initialState: ConnectorProvisioningState = {
  kind: "idle",
  message: "",
  setupCode: null,
  connectionId: null,
};

export function ConnectorProvisioningForm({
  workspaceId,
  workspaceName,
  programmeId,
  programmeName,
}: Readonly<{
  workspaceId: string;
  workspaceName: string;
  programmeId: string;
  programmeName: string;
}>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [storeOrigin, setStoreOrigin] = useState("");
  const [displayName, setDisplayName] = useState(workspaceName);
  const [reviewing, setReviewing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState(
    provisionConnector,
    initialState,
  );
  const validOrigin =
    /^https:\/\/[a-z0-9][a-z0-9.-]*[a-z0-9](?::[1-9][0-9]{0,4})?$/u.test(
      storeOrigin,
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
          <strong>One-time WooCommerce setup code</strong>
          <p>{state.message}</p>
        </div>
        <textarea
          aria-label="One-time WooCommerce setup code"
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
            {copied ? "Copied" : "Copy setup code"}
          </button>
          <a className="secondary" href="/operations">
            I saved it — show connector health
          </a>
        </div>
        <p className="connector-secret-warning">
          In WordPress, open WooCommerce → Loyalty, paste this into the setup
          code field, and save. Clear the clipboard afterwards. Starfiniti does
          not put this code in a URL, log, or browser storage.
        </p>
      </section>
    );
  }

  return (
    <section className="connector-provisioning">
      <div>
        <p className="login-eyebrow">Guided connection</p>
        <h2>Connect WooCommerce</h2>
        <p>
          Provision {programmeName} for {workspaceName}. The hub consumes one
          pre-generated signing key and reveals it only in the setup code after
          confirmation.
        </p>
      </div>
      <form action={action} autoComplete="off">
        <input name="operationId" type="hidden" value={operationId} />
        <input name="workspaceId" type="hidden" value={workspaceId} />
        <input name="programmeId" type="hidden" value={programmeId} />
        <label>
          <span>WooCommerce store origin</span>
          <input
            autoCapitalize="none"
            maxLength={255}
            name="externalStoreId"
            onChange={(event) => {
              setStoreOrigin(event.target.value.trim());
              setReviewing(false);
            }}
            placeholder="https://shop.example.com"
            required
            spellCheck={false}
            type="url"
            value={storeOrigin}
          />
          <small>
            Lowercase HTTPS origin only; no path, query, or password.
          </small>
        </label>
        <label>
          <span>Store display name</span>
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
        </label>
        {!reviewing ? (
          <button
            className="primary"
            disabled={!validOrigin || !validName}
            onClick={() => setReviewing(true)}
            type="button"
          >
            Review connection
          </button>
        ) : (
          <div className="connector-provisioning-confirmation">
            <p>
              Connect <strong>{storeOrigin}</strong> to {programmeName}. This
              creates tenant audit evidence and consumes one signing key.
            </p>
            <label>
              <input
                name="confirmation"
                required
                type="checkbox"
                value="provision"
              />
              I reviewed the store and programme.
            </label>
            <button className="primary" disabled={pending} type="submit">
              {pending ? "Provisioning…" : "Provision and show setup code"}
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
