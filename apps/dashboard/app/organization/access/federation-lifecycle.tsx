"use client";

import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Link2,
  LockKeyhole,
  Network,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useActionState, useState } from "react";
import type {
  OrganizationFederationSourceReadV1,
  OrganizationFederationWorkspaceV1,
} from "@starfiniti/contracts";
import {
  createFederationSourceAction,
  linkFederationIdentityAction,
  updateFederationSourceAction,
  type FederationActionState,
} from "./federation-actions";

const idle: FederationActionState = {
  kind: "idle",
  message: "",
  setup: null,
};

export function FederationLifecycle({
  workspace,
  linkOutcome,
}: Readonly<{
  workspace: OrganizationFederationWorkspaceV1;
  linkOutcome: "success" | "failed" | null;
}>) {
  const enabled = workspace.sources.filter(
    ({ status }) => status === "enabled",
  );
  return (
    <section
      className="federation-lifecycle"
      aria-labelledby="federation-title"
    >
      <header className="federation-heading">
        <div>
          <p className="login-eyebrow">Tenant identity federation</p>
          <h2 id="federation-title">Bring your own company sign-in</h2>
          <p>
            Authentik brokers each organization provider into a subject-only
            Supabase identity. Live PostgreSQL membership remains the only
            source of organization authority.
          </p>
        </div>
        <span className="federation-heading-icon" aria-hidden="true">
          <Fingerprint />
        </span>
      </header>

      <div className="federation-summary" aria-label="Federation summary">
        <article>
          <Network aria-hidden="true" />
          <div>
            <small>Configured</small>
            <strong>{workspace.sources.length} providers</strong>
          </div>
        </article>
        <article>
          <ShieldCheck aria-hidden="true" />
          <div>
            <small>Available for sign-in</small>
            <strong>{enabled.length}</strong>
          </div>
        </article>
        <article
          className={
            workspace.localPasswordRecoveryAvailable ? "is-ready" : "is-warning"
          }
        >
          {workspace.localPasswordRecoveryAvailable ? (
            <KeyRound aria-hidden="true" />
          ) : (
            <AlertTriangle aria-hidden="true" />
          )}
          <div>
            <small>Owner recovery</small>
            <strong>
              {workspace.localPasswordRecoveryAvailable ? "Ready" : "Required"}
            </strong>
          </div>
        </article>
      </div>

      {!workspace.localPasswordRecoveryAvailable ? (
        <div className="federation-warning" role="status">
          <LockKeyhole aria-hidden="true" />
          <p>
            Keep at least one active owner with local password recovery before
            enabling SSO. This prevents an upstream IdP outage from locking out
            the organization.
          </p>
        </div>
      ) : null}

      {!workspace.entitlementEnabled ? (
        <div className="federation-warning" role="status">
          <LockKeyhole aria-hidden="true" />
          <p>
            Enterprise identity rollout is paused for this organization.
            Existing company sign-in remains available; new providers,
            enablement, and secret rotation are disabled. Owners can still
            disable or retire a provider safely.
          </p>
        </div>
      ) : null}

      {enabled.length > 0 ? (
        <section
          className="federation-enrollment"
          aria-labelledby="link-sso-title"
        >
          <span className="federation-panel-icon">
            <Link2 aria-hidden="true" />
          </span>
          <div>
            <h3 id="link-sso-title">Enroll your existing account</h3>
            <p>
              Link SSO while signed in with your current account. This is
              deliberately separate from membership: the IdP cannot invite you,
              choose a role, or merge an account by email.
            </p>
            {linkOutcome ? (
              <p
                className={`action-message ${
                  linkOutcome === "success" ? "success" : "error"
                }`}
                role={linkOutcome === "success" ? "status" : "alert"}
              >
                {linkOutcome === "success"
                  ? "Company SSO was linked to this existing account."
                  : "The SSO identity was not linked. Your existing access is unchanged."}
              </p>
            ) : null}
          </div>
          <form action={linkFederationIdentityAction}>
            <input
              name="organizationId"
              type="hidden"
              value={workspace.organization.id}
            />
            <button className="secondary" type="submit">
              <ExternalLink aria-hidden="true" />
              Link company SSO
            </button>
          </form>
        </section>
      ) : null}

      {workspace.mayConfigure &&
      workspace.entitlementEnabled &&
      workspace.sources.length < 5 ? (
        <FederationCreateForm organizationId={workspace.organization.id} />
      ) : null}

      <section className="federation-provider-panel">
        <header>
          <div>
            <h3>Identity providers</h3>
            <p>
              Every provider is validated and staged disabled before activation.
            </p>
          </div>
          <span>{workspace.sources.length} of 5</span>
        </header>
        {workspace.sources.length > 0 ? (
          <div className="federation-provider-list">
            {workspace.sources.map((source) => (
              <FederationSourceCard
                key={source.id}
                activationBlocked={workspace.sources.some(
                  (candidate) =>
                    candidate.id !== source.id &&
                    ["enabled", "review_required"].includes(candidate.status),
                )}
                entitlementEnabled={workspace.entitlementEnabled}
                localRecovery={workspace.localPasswordRecoveryAvailable}
                mayConfigure={workspace.mayConfigure}
                organizationId={workspace.organization.id}
                owner={workspace.currentRole === "owner"}
                source={source}
              />
            ))}
          </div>
        ) : (
          <div className="federation-empty">
            <Fingerprint aria-hidden="true" />
            <h4>No company identity provider yet</h4>
            <p>
              Add OIDC or SAML metadata above. Nothing becomes available for
              sign-in until validation and an explicit enable action succeed.
            </p>
          </div>
        )}
      </section>
    </section>
  );
}

function FederationCreateForm({
  organizationId,
}: Readonly<{ organizationId: string }>) {
  const [protocol, setProtocol] = useState<"oidc" | "saml">("oidc");
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    createFederationSourceAction,
    idle,
  );
  return (
    <form action={action} className="federation-create-form" autoComplete="off">
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="operationId" type="hidden" value={operationId} />
      <div className="federation-create-heading">
        <span className="federation-panel-icon">
          <Network aria-hidden="true" />
        </span>
        <div>
          <h3>Add an identity provider</h3>
          <p>
            Remote metadata is fetched with public-network pinning, strict TLS,
            size limits, and no redirects.
          </p>
        </div>
      </div>
      <label>
        <span>Protocol</span>
        <select
          name="protocol"
          onChange={(event) =>
            setProtocol(event.target.value === "saml" ? "saml" : "oidc")
          }
          value={protocol}
        >
          <option value="oidc">OpenID Connect</option>
          <option value="saml">SAML 2.0</option>
        </select>
      </label>
      <label>
        <span>Display name</span>
        <input
          maxLength={120}
          name="displayName"
          placeholder="Acme workforce SSO"
          required
        />
      </label>
      {protocol === "oidc" ? (
        <>
          <label className="federation-wide-field">
            <span>Discovery URL</span>
            <input
              inputMode="url"
              maxLength={2048}
              name="discoveryUrl"
              placeholder="https://idp.example.com/.well-known/openid-configuration"
              required
              type="url"
            />
          </label>
          <label>
            <span>Client ID</span>
            <input maxLength={512} name="clientId" required />
          </label>
          <label>
            <span>Client secret · write only</span>
            <input
              autoComplete="new-password"
              maxLength={8192}
              minLength={8}
              name="clientSecret"
              required
              type="password"
            />
          </label>
        </>
      ) : (
        <>
          <label className="federation-wide-field">
            <span>Metadata URL</span>
            <input
              inputMode="url"
              maxLength={2048}
              name="metadataUrl"
              placeholder="https://idp.example.com/saml/metadata"
              required
              type="url"
            />
          </label>
          <label className="federation-wide-field">
            <span>Expected entity ID · optional exact match</span>
            <input maxLength={2048} name="expectedEntityId" />
          </label>
        </>
      )}
      <label className="federation-confirmation">
        <input
          name="confirmation"
          required
          type="checkbox"
          value="create-federation"
        />
        <span>
          I understand this stages a disabled broker and does not grant
          membership or enable sign-in.
        </span>
      </label>
      <button disabled={pending} type="submit">
        {pending ? "Validating…" : "Validate and stage provider"}
      </button>
      <ActionMessage state={state} />
      {state.setup ? <FederationSetupDetails setup={state.setup} /> : null}
    </form>
  );
}

function FederationSetupDetails({
  setup,
}: Readonly<{ setup: NonNullable<FederationActionState["setup"]> }>) {
  const values = [
    ["OIDC callback URL", setup.oauthCallbackUrl],
    ["SAML metadata URL", setup.samlMetadataUrl],
    ["SAML ACS URL", setup.samlAcsUrl],
  ].filter((entry): entry is [string, string] => entry[1] !== null);
  return (
    <div className="federation-setup" role="status">
      <strong>Finish the upstream provider configuration</strong>
      {values.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <code>{value}</code>
          <button
            aria-label={`Copy ${label}`}
            className="secondary"
            onClick={() => navigator.clipboard.writeText(value)}
            type="button"
          >
            <Copy aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

function FederationSourceCard({
  activationBlocked,
  entitlementEnabled,
  localRecovery,
  mayConfigure,
  organizationId,
  owner,
  source,
}: Readonly<{
  activationBlocked: boolean;
  entitlementEnabled: boolean;
  localRecovery: boolean;
  mayConfigure: boolean;
  organizationId: string;
  owner: boolean;
  source: OrganizationFederationSourceReadV1;
}>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [selected, setSelected] = useState<
    "enable" | "disable" | "rotate_secret" | "retire" | "recover" | null
  >(null);
  const [state, action, pending] = useActionState(
    updateFederationSourceAction,
    idle,
  );
  const actions = availableActions(
    source,
    mayConfigure,
    owner,
    localRecovery,
    entitlementEnabled,
    activationBlocked,
  );
  const endpoint =
    source.configuration.protocol === "oidc"
      ? source.configuration.discoveryUrl
      : source.configuration.metadataUrl;
  return (
    <article className={`federation-source is-${source.status}`}>
      <header>
        <span className="federation-source-icon">
          {source.status === "review_required" ? (
            <AlertTriangle aria-hidden="true" />
          ) : (
            <ShieldCheck aria-hidden="true" />
          )}
        </span>
        <div>
          <h4>{source.displayName}</h4>
          <p>
            {source.protocol.toUpperCase()} · revision {source.revision}
          </p>
        </div>
        <span className={`federation-status is-${source.status}`}>
          {title(source.status)}
        </span>
      </header>
      <dl>
        <div>
          <dt>Issuer or metadata</dt>
          <dd title={endpoint}>{endpoint}</dd>
        </div>
        <div>
          <dt>Last external outcome</dt>
          <dd>{title(source.lastOutcome)}</dd>
        </div>
        <div>
          <dt>Validated</dt>
          <dd>
            {source.validation
              ? dateTime(source.validation.validatedAt)
              : "Not yet"}
          </dd>
        </div>
      </dl>
      {source.status === "review_required" ? (
        <p className="federation-review-note">
          An external write had an uncertain or failed outcome. Sign-in is
          hidden until an owner disables and reconciles this provider.
        </p>
      ) : null}
      {source.pendingAction ? (
        <p className="federation-review-note">
          The {title(source.pendingAction)} operation did not record a final
          result. An owner can recover it after the five-minute safety window;
          recovery records an ambiguous outcome and keeps sign-in hidden for
          reconciliation.
        </p>
      ) : null}
      {actions.length > 0 ? (
        <form
          action={action}
          className="federation-source-actions"
          autoComplete="off"
        >
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="sourceId" type="hidden" value={source.id} />
          <input
            name="expectedRevision"
            type="hidden"
            value={source.revision}
          />
          <input name="operationId" type="hidden" value={operationId} />
          <label>
            <span>Action</span>
            <select
              name="federationAction"
              onChange={(event) =>
                setSelected(event.target.value as typeof selected)
              }
              required
              value={selected ?? ""}
            >
              <option disabled value="">
                Choose an action
              </option>
              {actions.map((available) => (
                <option key={available} value={available}>
                  {title(available)}
                </option>
              ))}
            </select>
          </label>
          <label className="federation-action-reason">
            <span>Audited reason</span>
            <input maxLength={500} minLength={8} name="reason" required />
          </label>
          {selected === "rotate_secret" ? (
            <label>
              <span>New client secret · write only</span>
              <input
                autoComplete="new-password"
                maxLength={8192}
                minLength={8}
                name="clientSecret"
                required
                type="password"
              />
            </label>
          ) : null}
          <label className="federation-confirmation">
            <input
              name="confirmation"
              required
              type="checkbox"
              value="federation-lifecycle"
            />
            <span>I understand this changes sign-in availability.</span>
          </label>
          <button
            className={selected === "enable" ? "primary" : "secondary"}
            disabled={pending || selected === null}
            type="submit"
          >
            {pending ? <RefreshCw className="spin" aria-hidden="true" /> : null}
            {pending ? "Applying…" : "Apply action"}
          </button>
          <ActionMessage state={state} />
        </form>
      ) : null}
    </article>
  );
}

function availableActions(
  source: OrganizationFederationSourceReadV1,
  mayConfigure: boolean,
  owner: boolean,
  localRecovery: boolean,
  entitlementEnabled: boolean,
  activationBlocked: boolean,
) {
  const actions: Array<
    "enable" | "disable" | "rotate_secret" | "retire" | "recover"
  > = [];
  if (source.pendingAction !== null) {
    if (owner) actions.push("recover");
    return actions;
  }
  if (
    mayConfigure &&
    entitlementEnabled &&
    !activationBlocked &&
    localRecovery &&
    ["validated", "disabled"].includes(source.status)
  ) {
    actions.push("enable");
  }
  if (
    owner &&
    ["validated", "enabled", "review_required"].includes(source.status)
  ) {
    actions.push("disable");
  }
  if (
    mayConfigure &&
    entitlementEnabled &&
    source.protocol === "oidc" &&
    ["validated", "disabled", "review_required"].includes(source.status)
  ) {
    actions.push("rotate_secret");
  }
  if (
    owner &&
    ["validated", "disabled", "review_required"].includes(source.status)
  ) {
    actions.push("retire");
  }
  return actions;
}

function ActionMessage({ state }: Readonly<{ state: FederationActionState }>) {
  return state.kind === "idle" ? null : (
    <p
      className={`action-message ${state.kind}`}
      role={state.kind === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function title(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/^./u, (character) => character.toUpperCase());
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
