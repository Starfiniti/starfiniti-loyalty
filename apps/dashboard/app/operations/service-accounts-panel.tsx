"use client";

import { Ban, Copy, KeyRound, RotateCw, ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";
import type { ServiceAccountReadV1 } from "@starfiniti/contracts";
import {
  createServiceAccountAction,
  issueServiceCredentialAction,
  revokeServiceCredentialAction,
  type ServiceAccountActionState,
  type ServiceCredentialActionState,
} from "./service-account-actions";

const idle: ServiceAccountActionState = { kind: "idle", message: "" };
const credentialIdle: ServiceCredentialActionState = {
  kind: "idle",
  message: "",
  token: null,
};

export function ServiceAccountsPanel({
  accounts,
  configurationEnabled,
  mayConfigure,
  workspaceId,
  workspaceName,
  programmeId,
  programmeName,
}: Readonly<{
  accounts: readonly ServiceAccountReadV1[];
  configurationEnabled: boolean;
  mayConfigure: boolean;
  workspaceId: string | null;
  workspaceName: string | null;
  programmeId: string | null;
  programmeName: string | null;
}>) {
  return (
    <section className="customer-panel service-accounts-panel">
      <div className="customer-result-heading">
        <div>
          <KeyRound aria-hidden="true" />
          <strong>Service accounts</strong>
        </div>
        <span>Scoped server credentials · secrets shown once</span>
      </div>
      <p>
        Connect a CRM, ERP, or backend without sharing Supabase, database, or
        platform keys. PostgreSQL derives the tenant and enforces each scope,
        lifecycle state, and per-minute quota.
      </p>

      {accounts.map((account) => (
        <ServiceAccountCard
          account={account}
          key={account.id}
          mayConfigure={mayConfigure}
        />
      ))}

      {configurationEnabled && mayConfigure && workspaceId && programmeId ? (
        <CreateServiceAccountForm
          programmeId={programmeId}
          programmeName={programmeName ?? "Current programme"}
          workspaceId={workspaceId}
          workspaceName={workspaceName ?? "Current workspace"}
        />
      ) : (
        <div className="reconciliation-unavailable">
          {!configurationEnabled
            ? "New API credentials are disabled for this tenant. Existing value, refunds, reconciliation, exports, and checkout are unaffected."
            : "A live owner/admin, workspace, and programme are required to create credentials."}
        </div>
      )}
    </section>
  );
}

function CreateServiceAccountForm({
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
  const [reviewing, setReviewing] = useState(false);
  const [state, action, pending] = useActionState(
    createServiceAccountAction,
    idle,
  );
  return (
    <form action={action} className="service-account-create" autoComplete="off">
      <input name="operationId" type="hidden" value={operationId} />
      <input name="workspaceId" type="hidden" value={workspaceId} />
      <input name="programmeId" type="hidden" value={programmeId} />
      <div>
        <h3>Create server integration</h3>
        <p>
          {workspaceName} · {programmeName}
        </p>
      </div>
      <label>
        <span>Integration name</span>
        <input
          maxLength={200}
          name="displayName"
          onChange={() => setReviewing(false)}
          placeholder="ERP production"
          required
        />
      </label>
      <fieldset>
        <legend>Least-privilege scopes</legend>
        <label>
          <input
            defaultChecked
            name="scopes"
            type="checkbox"
            value="customers:write"
          />
          Synchronize opaque customer identities
        </label>
        <label>
          <input
            defaultChecked
            name="scopes"
            type="checkbox"
            value="activities:write"
          />
          Submit verified earning activities
        </label>
      </fieldset>
      <label>
        <span>Requests per minute</span>
        <input
          defaultValue="120"
          max="6000"
          min="10"
          name="requestsPerMinute"
          type="number"
        />
      </label>
      {!reviewing ? (
        <button
          className="secondary"
          onClick={() => setReviewing(true)}
          type="button"
        >
          Review account
        </button>
      ) : (
        <div className="connector-provisioning-confirmation">
          <label>
            <input
              name="confirmation"
              required
              type="checkbox"
              value="create"
            />
            I reviewed the workspace, programme, scopes, and quota.
          </label>
          <button className="primary" disabled={pending} type="submit">
            {pending ? "Creating…" : "Create service account"}
          </button>
        </div>
      )}
      {state.kind !== "idle" ? (
        <p
          className={`action-message ${state.kind}`}
          role={state.kind === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function ServiceAccountCard({
  account,
  mayConfigure,
}: Readonly<{ account: ServiceAccountReadV1; mayConfigure: boolean }>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [reviewing, setReviewing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [state, action, pending] = useActionState(
    issueServiceCredentialAction,
    credentialIdle,
  );
  return (
    <article className="service-account-card">
      <header>
        <div>
          <ShieldCheck aria-hidden="true" />
          <div>
            <h3>{account.displayName}</h3>
            <p>
              {account.workspaceName} · {account.programmeName}
            </p>
          </div>
        </div>
        <span className="role-badge">{account.status}</span>
      </header>
      <div className="service-account-facts">
        <span>{account.scopes.join(" · ")}</span>
        <strong>{account.requestsPerMinute} requests/minute</strong>
      </div>
      <div className="service-credential-list">
        {account.credentials.length === 0 ? (
          <p>No credential has been issued.</p>
        ) : (
          account.credentials.map((credential) => (
            <CredentialRow
              accountId={account.id}
              credential={credential}
              key={credential.id}
              mayConfigure={mayConfigure}
            />
          ))
        )}
      </div>
      {state.token ? (
        <div className="connector-provisioning-result" aria-live="polite">
          <strong>One-time service credential</strong>
          <textarea
            aria-label="One-time service credential"
            readOnly
            rows={3}
            spellCheck={false}
            value={state.token}
          />
          <button
            className="primary"
            onClick={async () => {
              await navigator.clipboard.writeText(state.token ?? "");
              setCopied(true);
            }}
            type="button"
          >
            <Copy aria-hidden="true" /> {copied ? "Copied" : "Copy credential"}
          </button>
          <p className="connector-secret-warning">
            Store this in the calling server&apos;s secret manager. It is never
            persisted in plaintext and cannot be revealed again.
          </p>
        </div>
      ) : mayConfigure ? (
        <form action={action} className="service-credential-issue">
          <input name="operationId" type="hidden" value={operationId} />
          <input name="serviceAccountId" type="hidden" value={account.id} />
          <label>
            <span>Previous credential overlap</span>
            <select
              defaultValue="300"
              name="overlapSeconds"
              onChange={() => setReviewing(false)}
            >
              <option value="0">Immediate cutover</option>
              <option value="300">5 minutes</option>
              <option value="3600">1 hour</option>
              <option value="86400">24 hours</option>
            </select>
          </label>
          {!reviewing ? (
            <button
              className="secondary"
              onClick={() => setReviewing(true)}
              type="button"
            >
              <RotateCw aria-hidden="true" /> Review issuance
            </button>
          ) : (
            <div className="connector-provisioning-confirmation">
              <label>
                <input
                  name="confirmation"
                  required
                  type="checkbox"
                  value="issue"
                />
                I will copy the new secret now and complete the cutover within
                the overlap.
              </label>
              <button className="primary" disabled={pending} type="submit">
                {pending
                  ? "Issuing…"
                  : account.credentials.length
                    ? "Rotate credential"
                    : "Issue credential"}
              </button>
            </div>
          )}
        </form>
      ) : null}
      {state.kind !== "idle" && !state.token ? (
        <p
          className={`action-message ${state.kind}`}
          role={state.kind === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </article>
  );
}

function CredentialRow({
  accountId,
  credential,
  mayConfigure,
}: Readonly<{
  accountId: string;
  credential: ServiceAccountReadV1["credentials"][number];
  mayConfigure: boolean;
}>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    revokeServiceCredentialAction,
    idle,
  );
  return (
    <div className="service-credential-row">
      <div>
        <code>••••••{credential.secretHint}</code>
        <span className={`issue-state ${credential.status}`}>
          {credential.status}
        </span>
      </div>
      {mayConfigure &&
      credential.status !== "revoked" &&
      credential.status !== "expired" ? (
        <form action={action}>
          <input name="operationId" type="hidden" value={operationId} />
          <input name="serviceAccountId" type="hidden" value={accountId} />
          <input name="credentialId" type="hidden" value={credential.id} />
          <input
            aria-label="Revocation reason"
            defaultValue="Scheduled key rotation"
            maxLength={200}
            name="reason"
            required
          />
          <label>
            <input
              name="confirmation"
              required
              type="checkbox"
              value="revoke"
            />
            Revoke now
          </label>
          <button className="danger-button" disabled={pending} type="submit">
            <Ban aria-hidden="true" /> {pending ? "Revoking…" : "Revoke"}
          </button>
        </form>
      ) : null}
      {state.kind !== "idle" ? (
        <p
          className={`action-message ${state.kind}`}
          role={state.kind === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
