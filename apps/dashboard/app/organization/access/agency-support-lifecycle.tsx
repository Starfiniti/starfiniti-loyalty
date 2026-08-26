"use client";

import {
  Activity,
  Building2,
  Check,
  Clipboard,
  Clock3,
  Eye,
  Handshake,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AgencyPortfolioWorkspaceV1,
  OrganizationSupportScopeV1,
  SupportAdministrationWorkspaceV1,
  SupportGrantReadV1,
  SupportRequestReadV1,
} from "@starfiniti/contracts";
import {
  acceptAgencyInvitationAction,
  administrationIdle,
  createAgencyInvitationAction,
  createSupportRequestAction,
  openSupportWorkspaceAction,
  resolveSupportRequestAction,
  revokeAgencyRelationshipAction,
  revokeSupportGrantAction,
  type AdministrationActionState,
} from "./administration-actions";

const scopeLabels: Record<OrganizationSupportScopeV1, string> = {
  "audit.summary.read": "Recent audit activity",
  "identity.health.read": "Identity health counts",
  "members.summary.read": "Member totals",
  "organization.summary.read": "Organization summary",
};

const supportScopes = Object.keys(
  scopeLabels,
) as readonly OrganizationSupportScopeV1[];

function agencyToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
  return `stfa_v1_${encoded}`;
}

function expiresIn(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function title(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

export function AgencySupportLifecycle({
  portfolio,
  support,
}: Readonly<{
  portfolio: AgencyPortfolioWorkspaceV1;
  support: SupportAdministrationWorkspaceV1;
}>) {
  const activeRelationships = portfolio.relationships.filter(
    ({ status }) => status === "active",
  );
  const pendingRequests = support.requests.filter(
    ({ status }) => status === "pending",
  );
  const activeGrants = support.grants.filter(
    ({ status }) => status === "active",
  );

  return (
    <section
      className="agency-support-lifecycle"
      aria-labelledby="agency-support-title"
    >
      <header className="agency-support-heading">
        <div>
          <p className="login-eyebrow">Bilateral administration</p>
          <h2 id="agency-support-title">Agency & support authority</h2>
          <p>
            A relationship only connects portfolios. Client data stays closed
            until an agency operator requests exact read-only scopes and a
            separate client owner approves them.
          </p>
        </div>
        <span className="agency-support-heading-icon" aria-hidden="true">
          <Handshake />
        </span>
      </header>

      <div
        className="agency-support-summary"
        aria-label="Agency support summary"
      >
        <SummaryMetric
          icon={<Building2 aria-hidden="true" />}
          label="Active relationships"
          value={activeRelationships.length}
        />
        <SummaryMetric
          icon={<Clock3 aria-hidden="true" />}
          label="Pending decisions"
          value={pendingRequests.length}
        />
        <SummaryMetric
          icon={<KeyRound aria-hidden="true" />}
          label="Active support grants"
          value={activeGrants.length}
        />
        <SummaryMetric
          icon={<Activity aria-hidden="true" />}
          label="Recorded uses"
          value={support.recentUses.length}
        />
      </div>

      {portfolio.mayInviteAgency || portfolio.mayAcceptAgency ? (
        <div className="agency-entry-grid">
          {portfolio.mayInviteAgency ? (
            <CreateAgencyInvitationForm
              organizationId={portfolio.organization.id}
            />
          ) : null}
          {portfolio.mayAcceptAgency ? (
            <AcceptAgencyInvitationForm
              organizationId={portfolio.organization.id}
            />
          ) : null}
        </div>
      ) : null}

      <section className="agency-panel" aria-labelledby="relationships-title">
        <header>
          <div>
            <p className="login-eyebrow">Two explicit approvals</p>
            <h3 id="relationships-title">Portfolio relationships</h3>
          </div>
          <span>No membership or RLS authority</span>
        </header>
        {portfolio.relationships.length > 0 ? (
          <div className="agency-relationship-list">
            {portfolio.relationships.map((relationship) => (
              <article
                className={`agency-relationship is-${relationship.status}`}
                key={`${relationship.id}:${relationship.revision}`}
              >
                <div className="agency-relationship-identity">
                  <span aria-hidden="true">
                    <Building2 />
                  </span>
                  <div>
                    <h4>{relationship.counterpart.name}</h4>
                    <p>
                      You are the {relationship.perspective} · accepted{" "}
                      {dateTime(relationship.acceptedAt)}
                    </p>
                  </div>
                  <Status value={relationship.status} />
                </div>
                {relationship.status === "active" ? (
                  <RevokeRelationshipForm
                    organizationId={portfolio.organization.id}
                    relationshipId={relationship.id}
                    revision={relationship.revision}
                  />
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Handshake aria-hidden="true" />}
            title="No agency relationship"
            body="Invite a trusted agency or accept its one-time invitation. The relationship itself never opens tenant data."
          />
        )}
      </section>

      {portfolio.mayRequestSupport &&
      activeRelationships.some(
        ({ perspective }) => perspective === "agency",
      ) ? (
        <CreateSupportRequestForm portfolio={portfolio} />
      ) : null}

      <section
        className="agency-panel"
        aria-labelledby="support-requests-title"
      >
        <header>
          <div>
            <p className="login-eyebrow">Separate client approval</p>
            <h3 id="support-requests-title">Support requests</h3>
          </div>
          <span>{pendingRequests.length} awaiting a decision</span>
        </header>
        {support.requests.length > 0 ? (
          <div className="support-request-list">
            {support.requests.map((request) => (
              <SupportRequestCard
                key={`${request.id}:${request.revision}`}
                mayApprove={support.mayApprove}
                organizationId={support.organization.id}
                request={request}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<ShieldCheck aria-hidden="true" />}
            title="No support requests"
            body="Requests appear here with their exact scopes, expiry, requester, and immutable decision state."
          />
        )}
      </section>

      <section className="agency-panel" aria-labelledby="support-grants-title">
        <header>
          <div>
            <p className="login-eyebrow">Time-bounded authority</p>
            <h3 id="support-grants-title">Support grants</h3>
          </div>
          <span>Every successful use is recorded</span>
        </header>
        {support.grants.length > 0 ? (
          <div className="support-grant-list">
            {support.grants.map((grant) => (
              <SupportGrantCard
                grant={grant}
                key={`${grant.id}:${grant.revision}`}
                mayApprove={support.mayApprove}
                organizationId={support.organization.id}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Eye aria-hidden="true" />}
            title="No support grants"
            body="Approved grants remain visible after expiry or revocation so tenant owners can reconstruct support history."
          />
        )}
      </section>

      {support.mayReview ? (
        <section className="agency-panel" aria-labelledby="support-use-title">
          <header>
            <div>
              <p className="login-eyebrow">Tenant-visible evidence</p>
              <h3 id="support-use-title">Recent support use</h3>
            </div>
            <span>{support.recentUses.length} retained here</span>
          </header>
          {support.recentUses.length > 0 ? (
            <ol className="support-use-list">
              {support.recentUses.map((use) => (
                <li key={use.id}>
                  <Check aria-hidden="true" />
                  <div>
                    <strong>{title(use.surface)}</strong>
                    <span>
                      {use.scopes
                        .map((scope) => scopeLabels[scope])
                        .join(" · ")}
                    </span>
                  </div>
                  <time dateTime={use.createdAt}>
                    {dateTime(use.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="agency-empty-copy">
              No support workspace has been used.
            </p>
          )}
        </section>
      ) : null}
    </section>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
}: Readonly<{ icon: ReactNode; label: string; value: number }>) {
  return (
    <article>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function CreateAgencyInvitationForm({
  organizationId,
}: Readonly<{ organizationId: string }>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [token] = useState(agencyToken);
  const [state, action, pending] = useActionState(
    createAgencyInvitationAction,
    administrationIdle,
  );
  const operationInput = useFreshOperationInput(state);
  const tokenInput = useRef<HTMLInputElement>(null);
  const [expiry, setExpiry] = useState(() => expiresIn(7 * 24));
  useEffect(() => {
    if (state.completedOperationId && tokenInput.current) {
      tokenInput.current.value = agencyToken();
    }
  }, [state.completedOperationId]);
  return (
    <form action={action} className="agency-entry-card">
      <input name="organizationId" type="hidden" value={organizationId} />
      <input
        defaultValue={token}
        name="invitationToken"
        ref={tokenInput}
        type="hidden"
      />
      <input name="expiresAt" type="hidden" value={expiry} />
      <input
        defaultValue={operationId}
        name="operationId"
        ref={operationInput}
        type="hidden"
      />
      <div className="agency-entry-title">
        <span aria-hidden="true">
          <Handshake />
        </span>
        <div>
          <p className="login-eyebrow">Client approval</p>
          <h3>Invite an agency</h3>
        </div>
      </div>
      <label>
        <span>Agency label</span>
        <input maxLength={120} name="agencyLabel" required />
      </label>
      <label>
        <span>Token validity</span>
        <select
          defaultValue="168"
          onChange={(event) => setExpiry(expiresIn(Number(event.target.value)))}
        >
          <option value="24">1 day</option>
          <option value="168">7 days</option>
          <option value="720">30 days</option>
        </select>
      </label>
      <label className="agency-confirmation">
        <input
          name="confirmation"
          required
          type="checkbox"
          value="create-agency-invitation"
        />
        <span>
          I understand this creates a relationship invitation, not tenant
          access.
        </span>
      </label>
      <button disabled={pending} type="submit">
        {pending ? (
          <RefreshCw className="spin" aria-hidden="true" />
        ) : (
          <KeyRound aria-hidden="true" />
        )}
        {pending ? "Creating invitation…" : "Create agency invitation"}
      </button>
      <ActionMessage state={state} />
      {state.token ? <OneTimeToken token={state.token} /> : null}
    </form>
  );
}

function AcceptAgencyInvitationForm({
  organizationId,
}: Readonly<{ organizationId: string }>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    acceptAgencyInvitationAction,
    administrationIdle,
  );
  const operationInput = useFreshOperationInput(state);
  return (
    <form action={action} className="agency-entry-card">
      <input name="organizationId" type="hidden" value={organizationId} />
      <input
        defaultValue={operationId}
        name="operationId"
        ref={operationInput}
        type="hidden"
      />
      <div className="agency-entry-title">
        <span aria-hidden="true">
          <Building2 />
        </span>
        <div>
          <p className="login-eyebrow">Agency approval</p>
          <h3>Accept client invitation</h3>
        </div>
      </div>
      <label>
        <span>One-time agency token</span>
        <input
          autoComplete="off"
          name="invitationToken"
          placeholder="stfa_v1_…"
          required
          spellCheck={false}
        />
      </label>
      <p className="agency-field-note">
        The token is reduced to a SHA-256 digest before PostgreSQL receives it.
      </p>
      <label className="agency-confirmation">
        <input
          name="confirmation"
          required
          type="checkbox"
          value="accept-agency-invitation"
        />
        <span>I approve the portfolio relationship for this organization.</span>
      </label>
      <button disabled={pending} type="submit">
        {pending ? (
          <RefreshCw className="spin" aria-hidden="true" />
        ) : (
          <ShieldCheck aria-hidden="true" />
        )}
        {pending ? "Accepting…" : "Accept relationship"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function RevokeRelationshipForm({
  organizationId,
  relationshipId,
  revision,
}: Readonly<{
  organizationId: string;
  relationshipId: string;
  revision: number;
}>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    revokeAgencyRelationshipAction,
    administrationIdle,
  );
  const operationInput = useFreshOperationInput(state);
  return (
    <form action={action} className="agency-inline-action">
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="relationshipId" type="hidden" value={relationshipId} />
      <input name="expectedRevision" type="hidden" value={revision} />
      <input
        defaultValue={operationId}
        name="operationId"
        ref={operationInput}
        type="hidden"
      />
      <label>
        <span>Audited reason</span>
        <input maxLength={500} minLength={8} name="reason" required />
      </label>
      <label className="agency-confirmation">
        <input
          name="confirmation"
          required
          type="checkbox"
          value="revoke-agency-relationship"
        />
        <span>
          Revoke the relationship and every dependent support grant now.
        </span>
      </label>
      <button className="danger" disabled={pending} type="submit">
        <ShieldX aria-hidden="true" />
        {pending ? "Revoking…" : "Revoke relationship"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function CreateSupportRequestForm({
  portfolio,
}: Readonly<{ portfolio: AgencyPortfolioWorkspaceV1 }>) {
  const clients = portfolio.relationships.filter(
    ({ perspective, status }) =>
      perspective === "agency" && status === "active",
  );
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    createSupportRequestAction,
    administrationIdle,
  );
  const operationInput = useFreshOperationInput(state);
  const [expiry, setExpiry] = useState(() => expiresIn(2));
  return (
    <form action={action} className="support-request-form">
      <input
        name="organizationId"
        type="hidden"
        value={portfolio.organization.id}
      />
      <input name="expiresAt" type="hidden" value={expiry} />
      <input
        defaultValue={operationId}
        name="operationId"
        ref={operationInput}
        type="hidden"
      />
      <header>
        <span aria-hidden="true">
          <Eye />
        </span>
        <div>
          <p className="login-eyebrow">Agency request</p>
          <h3>Request a bounded support view</h3>
          <p>
            No customer records, balances, secrets, or write commands are
            available.
          </p>
        </div>
      </header>
      <div className="support-request-fields">
        <label>
          <span>Client organization</span>
          <select name="clientOrganizationId" required>
            {clients.map((relationship) => (
              <option key={relationship.id} value={relationship.counterpart.id}>
                {relationship.counterpart.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Requested duration</span>
          <select
            defaultValue="2"
            onChange={(event) =>
              setExpiry(expiresIn(Number(event.target.value)))
            }
          >
            <option value="0.5">30 minutes</option>
            <option value="1">1 hour</option>
            <option value="2">2 hours</option>
            <option value="4">4 hours</option>
          </select>
        </label>
        <label className="support-wide-field">
          <span>Audited reason</span>
          <input maxLength={500} minLength={8} name="reason" required />
        </label>
      </div>
      <ScopeChecklist legend="Exact read-only scopes" scopes={supportScopes} />
      <label className="agency-confirmation">
        <input
          name="confirmation"
          required
          type="checkbox"
          value="request-support"
        />
        <span>
          I will wait for a separate client-owner approval before opening
          support data.
        </span>
      </label>
      <button disabled={pending} type="submit">
        {pending ? (
          <RefreshCw className="spin" aria-hidden="true" />
        ) : (
          <ShieldCheck aria-hidden="true" />
        )}
        {pending ? "Requesting…" : "Request support access"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function SupportRequestCard({
  mayApprove,
  organizationId,
  request,
}: Readonly<{
  mayApprove: boolean;
  organizationId: string;
  request: SupportRequestReadV1;
}>) {
  return (
    <article className={`support-request-card is-${request.status}`}>
      <header>
        <div>
          <span className="support-perspective">{request.perspective}</span>
          <h4>{request.counterpartName}</h4>
          <p>
            {request.requesterLabel ?? "Revoked agency member"} · requested{" "}
            {dateTime(request.createdAt)}
          </p>
        </div>
        <Status value={request.status} />
      </header>
      <p className="support-reason">{request.reason}</p>
      <ScopeChips scopes={request.scopes} />
      <small>Requested until {dateTime(request.requestedExpiresAt)}</small>
      {request.perspective === "client" &&
      request.status === "pending" &&
      mayApprove ? (
        <SupportDecisionForm
          organizationId={organizationId}
          request={request}
        />
      ) : null}
    </article>
  );
}

function SupportDecisionForm({
  organizationId,
  request,
}: Readonly<{ organizationId: string; request: SupportRequestReadV1 }>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    resolveSupportRequestAction,
    administrationIdle,
  );
  const operationInput = useFreshOperationInput(state);
  const [expiry, setExpiry] = useState(() => expiresIn(1));
  return (
    <form action={action} className="support-decision-form">
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="requestId" type="hidden" value={request.id} />
      <input name="expectedRevision" type="hidden" value={request.revision} />
      <input name="expiresAt" type="hidden" value={expiry} />
      <input
        defaultValue={operationId}
        name="operationId"
        ref={operationInput}
        type="hidden"
      />
      <label>
        <span>Decision</span>
        <select name="supportAction" required>
          <option value="approve">Approve selected scopes</option>
          <option value="reject">Reject request</option>
        </select>
      </label>
      <label>
        <span>Approved duration</span>
        <select
          defaultValue="1"
          onChange={(event) => setExpiry(expiresIn(Number(event.target.value)))}
        >
          <option value="0.5">30 minutes</option>
          <option value="1">1 hour</option>
          <option value="2">2 hours</option>
          <option value="4">4 hours</option>
        </select>
      </label>
      <label className="support-wide-field">
        <span>Decision reason</span>
        <input maxLength={500} minLength={8} name="reason" required />
      </label>
      <ScopeChecklist legend="Approved subset" scopes={request.scopes} />
      <label className="agency-confirmation support-wide-field">
        <input
          name="confirmation"
          required
          type="checkbox"
          value="resolve-support"
        />
        <span>
          I reviewed the requester, exact scopes, expiry, and separate approval
          requirement.
        </span>
      </label>
      <button disabled={pending} type="submit">
        {pending ? <RefreshCw className="spin" aria-hidden="true" /> : null}
        {pending ? "Recording decision…" : "Record decision"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function SupportGrantCard({
  grant,
  mayApprove,
  organizationId,
}: Readonly<{
  grant: SupportGrantReadV1;
  mayApprove: boolean;
  organizationId: string;
}>) {
  return (
    <article className={`support-grant-card is-${grant.status}`}>
      <header>
        <div>
          <span className="support-perspective">{grant.perspective}</span>
          <h4>{grant.counterpartName}</h4>
          <p>{grant.supportLabel ?? "Revoked agency member"}</p>
        </div>
        <Status value={grant.status} />
      </header>
      <ScopeChips scopes={grant.scopes} />
      <dl>
        <div>
          <dt>Expires</dt>
          <dd>{dateTime(grant.expiresAt)}</dd>
        </div>
        <div>
          <dt>Uses</dt>
          <dd>{grant.useCount}</dd>
        </div>
        <div>
          <dt>Last used</dt>
          <dd>{grant.lastUsedAt ? dateTime(grant.lastUsedAt) : "Never"}</dd>
        </div>
      </dl>
      {grant.status === "active" && grant.perspective === "agency" ? (
        <OpenSupportWorkspaceForm grant={grant} />
      ) : null}
      {grant.status === "active" &&
      grant.perspective === "client" &&
      mayApprove ? (
        <RevokeSupportGrantForm grant={grant} organizationId={organizationId} />
      ) : null}
    </article>
  );
}

function OpenSupportWorkspaceForm({
  grant,
}: Readonly<{ grant: SupportGrantReadV1 }>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    openSupportWorkspaceAction,
    administrationIdle,
  );
  const operationInput = useFreshOperationInput(state);
  return (
    <form action={action} className="support-open-form">
      <input name="grantId" type="hidden" value={grant.id} />
      <input
        defaultValue={operationId}
        name="operationId"
        ref={operationInput}
        type="hidden"
      />
      <input name="confirmation" type="hidden" value="open-support" />
      <button disabled={pending} type="submit">
        <Eye aria-hidden="true" />
        {pending ? "Opening…" : "Open audited support view"}
      </button>
      <ActionMessage state={state} />
      {state.supportWorkspace ? (
        <div
          className="support-workspace"
          role="region"
          aria-label="Scoped support workspace"
        >
          <header>
            <div>
              <p className="login-eyebrow">Recorded use</p>
              <h5>{state.supportWorkspace.organization.name}</h5>
            </div>
            <Status value={state.supportWorkspace.organization.status} />
          </header>
          <div className="support-workspace-grid">
            {state.supportWorkspace.organization.workspaceCount !== null ? (
              <Metric
                label="Workspaces"
                value={state.supportWorkspace.organization.workspaceCount}
              />
            ) : null}
            {state.supportWorkspace.organization.programmeGroupCount !==
            null ? (
              <Metric
                label="Programme groups"
                value={state.supportWorkspace.organization.programmeGroupCount}
              />
            ) : null}
            {state.supportWorkspace.members ? (
              <Metric
                label="Active members"
                value={state.supportWorkspace.members.activeCount}
              />
            ) : null}
            {state.supportWorkspace.identityHealth ? (
              <Metric
                label="Identity memberships"
                value={state.supportWorkspace.identityHealth.activeMemberships}
              />
            ) : null}
          </div>
          {state.supportWorkspace.recentAudit ? (
            <ol className="support-audit-list">
              {state.supportWorkspace.recentAudit.map((event) => (
                <li
                  key={`${event.action}:${event.resourceType}:${event.createdAt}`}
                >
                  <span>{title(event.action)}</span>
                  <time dateTime={event.createdAt}>
                    {dateTime(event.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

function RevokeSupportGrantForm({
  grant,
  organizationId,
}: Readonly<{ grant: SupportGrantReadV1; organizationId: string }>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    revokeSupportGrantAction,
    administrationIdle,
  );
  const operationInput = useFreshOperationInput(state);
  return (
    <form action={action} className="support-revoke-form">
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="grantId" type="hidden" value={grant.id} />
      <input name="expectedRevision" type="hidden" value={grant.revision} />
      <input
        defaultValue={operationId}
        name="operationId"
        ref={operationInput}
        type="hidden"
      />
      <label>
        <span>Revocation reason</span>
        <input maxLength={500} minLength={8} name="reason" required />
      </label>
      <label className="agency-confirmation">
        <input
          name="confirmation"
          required
          type="checkbox"
          value="revoke-support"
        />
        <span>End this support authority immediately.</span>
      </label>
      <button className="danger" disabled={pending} type="submit">
        <ShieldX aria-hidden="true" />
        {pending ? "Revoking…" : "Revoke grant"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function ScopeChecklist({
  legend,
  scopes,
}: Readonly<{
  legend: string;
  scopes: readonly OrganizationSupportScopeV1[];
}>) {
  return (
    <fieldset className="support-scope-fieldset">
      <legend>{legend}</legend>
      <div>
        {scopes.map((scope) => (
          <label key={scope}>
            <input defaultChecked name="scope" type="checkbox" value={scope} />
            <span>{scopeLabels[scope]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ScopeChips({
  scopes,
}: Readonly<{ scopes: readonly OrganizationSupportScopeV1[] }>) {
  return (
    <ul
      className="support-scope-chips"
      aria-label="Authorized read-only scopes"
    >
      {scopes.map((scope) => (
        <li key={scope}>{scopeLabels[scope]}</li>
      ))}
    </ul>
  );
}

function OneTimeToken({ token }: Readonly<{ token: string }>) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="agency-one-time-token" role="status">
      <div>
        <strong>Copy now — this token cannot be recovered</strong>
        <code>{token}</code>
      </div>
      <button
        aria-label="Copy agency invitation token"
        className="secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(token);
          setCopied(true);
        }}
        type="button"
      >
        {copied ? (
          <Check aria-hidden="true" />
        ) : (
          <Clipboard aria-hidden="true" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function EmptyState({
  body,
  icon,
  title: emptyTitle,
}: Readonly<{ body: string; icon: ReactNode; title: string }>) {
  return (
    <div className="agency-empty">
      {icon}
      <h4>{emptyTitle}</h4>
      <p>{body}</p>
    </div>
  );
}

function Status({ value }: Readonly<{ value: string }>) {
  return <span className={`agency-status is-${value}`}>{title(value)}</span>;
}

function Metric({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function ActionMessage({
  state,
}: Readonly<{ state: AdministrationActionState }>) {
  return (
    <p
      aria-atomic="true"
      aria-live={state.kind === "error" ? "assertive" : "polite"}
      className={`action-message ${state.kind}`}
    >
      {state.message}
    </p>
  );
}

function useFreshOperationInput(state: AdministrationActionState) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current && state.completedOperationId === input.current.value) {
      input.current.value = crypto.randomUUID();
    }
  }, [state.completedOperationId]);
  return input;
}
