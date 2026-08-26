"use client";

import {
  Activity,
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Unplug,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { useActionState, useState } from "react";
import type {
  OrganizationFederationSourceReadV1,
  OrganizationScimEndpointReadV1,
  OrganizationScimGroupReadV1,
  OrganizationScimWorkspaceV1,
} from "@starfiniti/contracts";
import {
  createScimEndpointAction,
  mapScimGroupRoleAction,
  updateScimEndpointAction,
  type ScimActionState,
} from "./scim-actions";

const idle: ScimActionState = {
  kind: "idle",
  message: "",
  credential: null,
  endpointUrl: null,
};

const managedRoles = [
  ["", "No access"],
  ["admin", "Admin"],
  ["marketer", "Marketer"],
  ["operator", "Operator"],
  ["analyst", "Analyst"],
  ["auditor", "Auditor"],
] as const;

export function ScimLifecycle({
  workspace,
  federationSources,
}: Readonly<{
  workspace: OrganizationScimWorkspaceV1;
  federationSources: readonly OrganizationFederationSourceReadV1[];
}>) {
  const activeEndpoints = workspace.endpoints.filter(
    ({ status }) => status === "active",
  );
  const usedSourceIds = new Set(
    workspace.endpoints.map(({ federationSourceId }) => federationSourceId),
  );
  const availableSources = federationSources.filter(
    ({ id, status, validation }) =>
      !usedSourceIds.has(id) &&
      validation !== null &&
      ["validated", "enabled", "disabled"].includes(status),
  );
  const activeUsers = activeEndpoints.reduce(
    (total, endpoint) => total + endpoint.activeUserCount,
    0,
  );
  const boundUsers = activeEndpoints.reduce(
    (total, endpoint) => total + endpoint.boundUserCount,
    0,
  );
  const mappedGroups = workspace.groups.filter(
    ({ mappedRole }) => mappedRole !== null,
  ).length;

  return (
    <section className="scim-lifecycle" aria-labelledby="scim-title">
      <header className="scim-heading">
        <div>
          <p className="login-eyebrow">Directory provisioning</p>
          <h2 id="scim-title">Provision access with SCIM 2.0</h2>
          <p>
            Authentik synchronizes opaque users and groups. A person receives
            access only when their verified broker subject matches an active
            SCIM record and exactly one reviewed group-to-role mapping.
          </p>
        </div>
        <span className="scim-heading-icon" aria-hidden="true">
          <UsersRound />
        </span>
      </header>

      <div className="scim-summary" aria-label="SCIM provisioning summary">
        <SummaryMetric
          icon={<ShieldCheck />}
          label="Live endpoints"
          value={String(activeEndpoints.length)}
        />
        <SummaryMetric
          icon={<UsersRound />}
          label="Active records"
          value={String(activeUsers)}
        />
        <SummaryMetric
          icon={<UserRoundCheck />}
          label="Bound members"
          value={String(boundUsers)}
        />
        <SummaryMetric
          icon={<Check />}
          label="Approved mappings"
          value={String(mappedGroups)}
        />
      </div>

      <div className="scim-trust-note" role="note">
        <ShieldCheck aria-hidden="true" />
        <p>
          Email, domain, username, IdP group names, and token claims never grant
          a tenant role. Owner access is deliberately unavailable through SCIM.
        </p>
      </div>

      {!workspace.entitlementEnabled ? (
        <div className="federation-warning" role="status">
          <AlertTriangle aria-hidden="true" />
          <p>
            Enterprise directory rollout is paused. Existing provisioning
            records remain visible; credential creation and rotation are
            disabled, while revocation remains available.
          </p>
        </div>
      ) : null}

      {workspace.mayConfigure &&
      workspace.entitlementEnabled &&
      availableSources.length > 0 &&
      workspace.endpoints.length < 5 ? (
        <ScimCreateForm
          organizationId={workspace.organization.id}
          sources={availableSources}
        />
      ) : null}

      <section
        className="scim-endpoint-panel"
        aria-labelledby="scim-endpoints-title"
      >
        <header>
          <div>
            <h3 id="scim-endpoints-title">Provisioning endpoints</h3>
            <p>
              Each endpoint is bound to one validated company identity source
              and one independently rotatable bearer credential.
            </p>
          </div>
          <span>{workspace.endpoints.length} of 5</span>
        </header>
        {workspace.endpoints.length > 0 ? (
          <div className="scim-endpoint-list">
            {workspace.endpoints.map((endpoint) => (
              <ScimEndpointCard
                key={endpoint.id}
                endpoint={endpoint}
                entitlementEnabled={workspace.entitlementEnabled}
                mayConfigure={workspace.mayConfigure}
                organizationId={workspace.organization.id}
              />
            ))}
          </div>
        ) : (
          <div className="scim-empty">
            <Unplug aria-hidden="true" />
            <h4>No directory endpoint yet</h4>
            <p>
              First validate an OIDC or SAML provider, then create its SCIM
              endpoint. Provisioning alone does not grant membership.
            </p>
          </div>
        )}
      </section>

      <ScimGroupMappings
        groups={workspace.groups}
        mayConfigure={workspace.mayConfigure}
        organizationId={workspace.organization.id}
      />

      <section className="scim-activity" aria-labelledby="scim-activity-title">
        <header>
          <div>
            <p className="login-eyebrow">Minimized audit</p>
            <h3 id="scim-activity-title">Recent directory activity</h3>
          </div>
          <Activity aria-hidden="true" />
        </header>
        {workspace.events.length > 0 ? (
          <ol>
            {workspace.events.slice(0, 12).map((event) => (
              <li key={event.id}>
                <span aria-hidden="true" />
                <div>
                  <strong>{humanize(event.action)}</strong>
                  <p>
                    {event.resourceType} · revision {event.resourceRevision} ·{" "}
                    {humanize(event.outcome)}
                  </p>
                </div>
                <time dateTime={event.createdAt}>
                  {dateTime(event.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="scim-activity-empty">
            No provisioning requests have been recorded.
          </p>
        )}
      </section>
    </section>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
}: Readonly<{ icon: React.ReactNode; label: string; value: string }>) {
  return (
    <article>
      <span aria-hidden="true">{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function ScimCreateForm({
  organizationId,
  sources,
}: Readonly<{
  organizationId: string;
  sources: readonly OrganizationFederationSourceReadV1[];
}>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [credential] = useState(generateScimCredential);
  const [state, action, pending] = useActionState(
    createScimEndpointAction,
    idle,
  );
  return (
    <form action={action} className="scim-create-form" autoComplete="off">
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="operationId" type="hidden" value={operationId} />
      <input name="credential" type="hidden" value={credential} />
      <div className="scim-form-heading">
        <span className="scim-panel-icon">
          <KeyRound aria-hidden="true" />
        </span>
        <div>
          <h3>Create a provisioning endpoint</h3>
          <p>
            The bearer credential appears once after the endpoint is committed.
          </p>
        </div>
      </div>
      <label>
        <span>Identity provider</span>
        <select name="federationSourceId" required defaultValue="">
          <option disabled value="">
            Choose a validated provider
          </option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.displayName}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Directory name</span>
        <input
          maxLength={120}
          name="displayName"
          placeholder="Authentik workforce directory"
          required
        />
      </label>
      <label className="scim-confirmation">
        <input
          name="confirmation"
          required
          type="checkbox"
          value="create-scim-endpoint"
        />
        <span>
          I understand provisioning creates no access until I review an opaque
          group and map it to a non-owner role.
        </span>
      </label>
      <button disabled={pending} type="submit">
        {pending ? (
          <RefreshCw className="spin" aria-hidden="true" />
        ) : (
          <KeyRound aria-hidden="true" />
        )}
        {pending ? "Creating…" : "Create endpoint"}
      </button>
      <ScimActionMessage state={state} />
      <CredentialSetup state={state} />
    </form>
  );
}

function ScimEndpointCard({
  endpoint,
  entitlementEnabled,
  mayConfigure,
  organizationId,
}: Readonly<{
  endpoint: OrganizationScimEndpointReadV1;
  entitlementEnabled: boolean;
  mayConfigure: boolean;
  organizationId: string;
}>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [credential] = useState(generateScimCredential);
  const [selected, setSelected] = useState<"rotate" | "revoke" | null>(null);
  const [state, action, pending] = useActionState(
    updateScimEndpointAction,
    idle,
  );
  const canRotate =
    mayConfigure && entitlementEnabled && endpoint.status === "active";
  const canRevoke = mayConfigure && endpoint.status === "active";
  return (
    <article className={`scim-endpoint is-${endpoint.status}`}>
      <header>
        <span className="scim-endpoint-icon">
          {endpoint.status === "active" ? (
            <ShieldCheck aria-hidden="true" />
          ) : (
            <Unplug aria-hidden="true" />
          )}
        </span>
        <div>
          <h4>{endpoint.displayName}</h4>
          <p>Credential revision {endpoint.credentialRevision}</p>
        </div>
        <span className={`scim-status is-${endpoint.status}`}>
          {humanize(endpoint.status)}
        </span>
      </header>
      <div className="scim-endpoint-metrics">
        <Metric label="Active records" value={endpoint.activeUserCount} />
        <Metric label="Bound members" value={endpoint.boundUserCount} />
        <Metric label="Groups" value={endpoint.groupCount} />
        <Metric label="Revision" value={endpoint.revision} />
      </div>
      {canRotate || canRevoke ? (
        <form
          action={action}
          className="scim-endpoint-actions"
          autoComplete="off"
        >
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="endpointId" type="hidden" value={endpoint.id} />
          <input
            name="expectedRevision"
            type="hidden"
            value={endpoint.revision}
          />
          <input name="operationId" type="hidden" value={operationId} />
          <input name="credential" type="hidden" value={credential} />
          <label>
            <span>Action</span>
            <select
              name="scimAction"
              onChange={(event) =>
                setSelected(event.target.value as "rotate" | "revoke")
              }
              required
              value={selected ?? ""}
            >
              <option disabled value="">
                Choose an action
              </option>
              {canRotate ? (
                <option value="rotate">Rotate credential</option>
              ) : null}
              {canRevoke ? (
                <option value="revoke">Revoke endpoint</option>
              ) : null}
            </select>
          </label>
          <label className="scim-action-reason">
            <span>Audited reason</span>
            <input maxLength={500} minLength={8} name="reason" required />
          </label>
          <label className="scim-confirmation">
            <input
              name="confirmation"
              required
              type="checkbox"
              value="scim-endpoint-lifecycle"
            />
            <span>
              {selected === "revoke"
                ? "I understand this revokes SCIM-managed memberships immediately."
                : "I understand the previous credential stops working immediately."}
            </span>
          </label>
          <button
            className={selected === "revoke" ? "danger" : "secondary"}
            disabled={pending || selected === null}
            type="submit"
          >
            {pending ? <RefreshCw className="spin" aria-hidden="true" /> : null}
            {pending ? "Applying…" : "Apply action"}
          </button>
          <ScimActionMessage state={state} />
          <CredentialSetup state={state} />
        </form>
      ) : null}
    </article>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function ScimGroupMappings({
  groups,
  mayConfigure,
  organizationId,
}: Readonly<{
  groups: readonly OrganizationScimGroupReadV1[];
  mayConfigure: boolean;
  organizationId: string;
}>) {
  return (
    <section className="scim-group-panel" aria-labelledby="scim-groups-title">
      <header>
        <div>
          <p className="login-eyebrow">Reviewed allowlist</p>
          <h3 id="scim-groups-title">Group role mappings</h3>
          <p>
            Group display names are descriptive only. The immutable opaque group
            resource is what receives the reviewed mapping.
          </p>
        </div>
        <span>{groups.length} synchronized</span>
      </header>
      {groups.length > 0 ? (
        <div className="scim-group-list">
          {groups.map((group) => (
            <ScimGroupCard
              key={group.id}
              group={group}
              mayConfigure={mayConfigure}
              organizationId={organizationId}
            />
          ))}
        </div>
      ) : (
        <div className="scim-empty compact">
          <UsersRound aria-hidden="true" />
          <h4>No groups synchronized</h4>
          <p>Send groups from Authentik before reviewing tenant roles here.</p>
        </div>
      )}
    </section>
  );
}

function ScimGroupCard({
  group,
  mayConfigure,
  organizationId,
}: Readonly<{
  group: OrganizationScimGroupReadV1;
  mayConfigure: boolean;
  organizationId: string;
}>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(mapScimGroupRoleAction, idle);
  return (
    <article className="scim-group-card">
      <div className="scim-group-identity">
        <span>
          <UsersRound aria-hidden="true" />
        </span>
        <div>
          <h4>{group.displayName}</h4>
          <p>
            {group.memberCount} members · revision {group.revision}
          </p>
        </div>
        <span className={`scim-role ${group.mappedRole ? "is-mapped" : ""}`}>
          {group.mappedRole ? humanize(group.mappedRole) : "No access"}
        </span>
      </div>
      {mayConfigure ? (
        <form action={action} className="scim-group-actions">
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="endpointId" type="hidden" value={group.endpointId} />
          <input name="groupId" type="hidden" value={group.id} />
          <input name="expectedRevision" type="hidden" value={group.revision} />
          <input name="operationId" type="hidden" value={operationId} />
          <label>
            <span>Tenant role</span>
            <select name="role" defaultValue={group.mappedRole ?? ""}>
              {managedRoles.map(([value, label]) => (
                <option key={value || "none"} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="scim-action-reason">
            <span>Audited reason</span>
            <input maxLength={500} minLength={8} name="reason" required />
          </label>
          <label className="scim-confirmation">
            <input
              name="confirmation"
              required
              type="checkbox"
              value="map-scim-group"
            />
            <span>I reviewed this opaque group and its effective access.</span>
          </label>
          <button className="secondary" disabled={pending} type="submit">
            {pending ? <RefreshCw className="spin" aria-hidden="true" /> : null}
            {pending ? "Reconciling…" : "Save mapping"}
          </button>
          <ScimActionMessage state={state} />
        </form>
      ) : null}
    </article>
  );
}

function CredentialSetup({ state }: Readonly<{ state: ScimActionState }>) {
  if (!state.credential || !state.endpointUrl) return null;
  return (
    <div className="scim-credential" role="status">
      <div>
        <AlertTriangle aria-hidden="true" />
        <p>
          <strong>Copy now — the credential cannot be recovered.</strong>
          Store it in Authentik’s SCIM provider, then close this message.
        </p>
      </div>
      <CopyRow label="SCIM base URL" value={state.endpointUrl} />
      <CopyRow label="Bearer token" value={state.credential} />
    </div>
  );
}

function CopyRow({ label, value }: Readonly<{ label: string; value: string }>) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="scim-copy-row">
      <span>{label}</span>
      <code>{value}</code>
      <button
        aria-label={`Copy ${label}`}
        className="secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        }}
        type="button"
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
    </div>
  );
}

function ScimActionMessage({ state }: Readonly<{ state: ScimActionState }>) {
  if (state.kind === "idle") return null;
  return (
    <p
      className={`action-message ${state.kind}`}
      role={state.kind === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function generateScimCredential(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...bytes));
  return `stf_scim_${base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "")}`;
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Ljubljana",
  }).format(new Date(value));
}
