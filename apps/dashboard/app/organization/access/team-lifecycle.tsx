"use client";

import {
  Building2,
  Check,
  Clipboard,
  Clock3,
  Download,
  KeyRound,
  ShieldAlert,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import type {
  OrganizationMembershipRoleV1,
  OrganizationTeamWorkspaceV1,
} from "@starfiniti/contracts";
import {
  createOrganizationInvitationAction,
  revokeOrganizationInvitationAction,
  updateOrganizationLifecycleAction,
  updateOrganizationMemberAction,
  type IdentityActionState,
  type InvitationActionState,
} from "../actions";

const idle: IdentityActionState = { kind: "idle", message: "" };
const invitationIdle: InvitationActionState = {
  kind: "idle",
  message: "",
  token: null,
};
const roles: readonly OrganizationMembershipRoleV1[] = [
  "owner",
  "admin",
  "marketer",
  "operator",
  "analyst",
  "auditor",
];

function inviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
  return `stfi_v1_${encoded}`;
}

function title(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/^./u, (letter) => letter.toUpperCase());
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function assignableRoles(
  actorRole: OrganizationMembershipRoleV1,
): readonly OrganizationMembershipRoleV1[] {
  return actorRole === "owner"
    ? roles
    : roles.filter((role) => role !== "owner");
}

export function TeamLifecycle({
  workspace,
}: Readonly<{ workspace: OrganizationTeamWorkspaceV1 }>) {
  const activeMembers = workspace.members.filter(
    ({ status }) => status === "active",
  );
  const pendingInvitations = workspace.invitations.filter(
    ({ status }) => status === "pending",
  );
  return (
    <section className="team-lifecycle" aria-labelledby="team-lifecycle-title">
      <header className="team-lifecycle-heading">
        <div>
          <p className="login-eyebrow">Organization lifecycle</p>
          <h2 id="team-lifecycle-title">Operate the team, with evidence</h2>
          <p>
            Every change is versioned and audited. Revocation takes effect on
            the next database request, even while an old access token is still
            valid.
          </p>
        </div>
        {workspace.mayExport ? (
          <a
            className="secondary team-export-link"
            href="/organization/access/export"
          >
            <Download aria-hidden="true" />
            Export snapshot
          </a>
        ) : null}
      </header>

      <div
        className="team-lifecycle-summary"
        aria-label="Team lifecycle summary"
      >
        <article>
          <UsersRound aria-hidden="true" />
          <span>
            <strong>{activeMembers.length}</strong> active members
          </span>
        </article>
        <article>
          <KeyRound aria-hidden="true" />
          <span>
            <strong>{pendingInvitations.length}</strong> pending invitations
          </span>
        </article>
        <article>
          <Building2 aria-hidden="true" />
          <span>
            <strong>Revision {workspace.organization.lifecycleRevision}</strong>{" "}
            {workspace.organization.status}
          </span>
        </article>
      </div>

      {workspace.mayManageMembers ? (
        <InvitationForm
          actorRole={workspace.currentRole}
          organizationId={workspace.organization.id}
        />
      ) : null}

      <section className="team-panel" aria-labelledby="members-heading">
        <header>
          <div>
            <p className="login-eyebrow">Live authority</p>
            <h3 id="members-heading">Members</h3>
          </div>
          <span>
            {activeMembers.filter(({ role }) => role === "owner").length} active
            owner
          </span>
        </header>
        <div className="team-member-list">
          {workspace.members.map((member) => (
            <MemberCard
              key={member.id}
              mayManage={workspace.mayManageMembers}
              member={member}
              actorRole={workspace.currentRole}
              organizationId={workspace.organization.id}
            />
          ))}
        </div>
      </section>

      <section className="team-panel" aria-labelledby="invitations-heading">
        <header>
          <div>
            <p className="login-eyebrow">One-use capabilities</p>
            <h3 id="invitations-heading">Invitations</h3>
          </div>
          <span>Raw tokens are never stored</span>
        </header>
        {workspace.invitations.length ? (
          <div className="team-invitation-list">
            {workspace.invitations.map((invitation) => (
              <InvitationRow
                invitation={invitation}
                key={invitation.id}
                mayManage={workspace.mayManageMembers}
                organizationId={workspace.organization.id}
              />
            ))}
          </div>
        ) : (
          <p className="team-empty">No invitations have been issued.</p>
        )}
      </section>

      {workspace.mayManageLifecycle ? (
        <LifecycleForm workspace={workspace} />
      ) : null}

      <section className="team-panel" aria-labelledby="identity-events-heading">
        <header>
          <div>
            <p className="login-eyebrow">Immutable history</p>
            <h3 id="identity-events-heading">Recent administration events</h3>
          </div>
          <span>{workspace.recentEvents.length} retained here</span>
        </header>
        {workspace.recentEvents.length ? (
          <ol className="team-event-list">
            {workspace.recentEvents.map((event) => (
              <li key={event.id}>
                <Check aria-hidden="true" />
                <div>
                  <strong>{title(event.action)}</strong>
                  <span>{dateTime(event.createdAt)}</span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="team-empty">
            No lifecycle event has been recorded yet.
          </p>
        )}
      </section>
    </section>
  );
}

function InvitationForm({
  actorRole,
  organizationId,
}: Readonly<{
  actorRole: OrganizationMembershipRoleV1;
  organizationId: string;
}>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [token] = useState(inviteToken);
  const [state, action, pending] = useActionState(
    createOrganizationInvitationAction,
    invitationIdle,
  );
  return (
    <form action={action} className="team-invite-form" autoComplete="off">
      <input name="organizationId" type="hidden" value={organizationId} />
      <input name="operationId" type="hidden" value={operationId} />
      <input name="invitationToken" type="hidden" value={token} />
      <div className="team-form-icon">
        <UserPlus aria-hidden="true" />
      </div>
      <div className="team-form-copy">
        <h3>Invite a member</h3>
        <p>
          Label the person for your team list, choose one exact role, and share
          the returned token through a trusted channel.
        </p>
      </div>
      <label>
        <span>Member label</span>
        <input
          maxLength={120}
          name="displayLabel"
          placeholder="Jane — Marketing"
          required
        />
      </label>
      <label>
        <span>Role</span>
        <select defaultValue="marketer" name="role">
          {assignableRoles(actorRole).map((role) => (
            <option key={role} value={role}>
              {title(role)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Expires</span>
        <select defaultValue="7" name="expiresDays">
          <option value="1">In 1 day</option>
          <option value="7">In 7 days</option>
          <option value="14">In 14 days</option>
          <option value="30">In 30 days</option>
        </select>
      </label>
      <label className="organization-confirmation">
        <input name="confirmation" required type="checkbox" value="invite" />I
        reviewed the label, role, and expiry.
      </label>
      <button className="primary" disabled={pending} type="submit">
        {pending ? "Creating…" : "Create invitation"}
      </button>
      {state.kind !== "idle" ? <ActionMessage state={state} /> : null}
      {state.token ? <OneTimeToken token={state.token} /> : null}
    </form>
  );
}

function OneTimeToken({ token }: Readonly<{ token: string }>) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="team-one-time-token" role="status">
      <div>
        <strong>Copy now</strong>
        <code>{token}</code>
        <small>
          Recipient opens /organization/join and signs in before accepting.
        </small>
      </div>
      <button
        className="secondary"
        onClick={() => {
          void navigator.clipboard.writeText(token);
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

function MemberCard({
  member,
  mayManage,
  actorRole,
  organizationId,
}: Readonly<{
  member: OrganizationTeamWorkspaceV1["members"][number];
  mayManage: boolean;
  actorRole: OrganizationMembershipRoleV1;
  organizationId: string;
}>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    updateOrganizationMemberAction,
    idle,
  );
  return (
    <article
      className={`team-member-card ${member.status === "revoked" ? "is-revoked" : ""}`}
    >
      <div className="team-member-identity">
        <span className="team-avatar">
          {(member.displayLabel ?? member.role).slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>
            {member.isCurrent
              ? "You"
              : (member.displayLabel ?? `Member ${member.id.slice(0, 8)}`)}
          </strong>
          <span>
            {title(member.role)} · {title(member.status)} · rev{" "}
            {member.revision}
          </span>
        </div>
      </div>
      {mayManage &&
      member.status === "active" &&
      !member.isCurrent &&
      (actorRole === "owner" || member.role !== "owner") ? (
        <form action={action} className="team-member-actions">
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="membershipId" type="hidden" value={member.id} />
          <input
            name="expectedRevision"
            type="hidden"
            value={member.revision}
          />
          <input name="operationId" type="hidden" value={operationId} />
          <select
            aria-label={`Role for ${member.displayLabel ?? "member"}`}
            defaultValue={member.role}
            name="role"
          >
            {assignableRoles(actorRole).map((role) => (
              <option key={role} value={role}>
                {title(role)}
              </option>
            ))}
          </select>
          <input
            aria-label={`Reason for changing ${member.displayLabel ?? "member"}`}
            maxLength={500}
            minLength={8}
            name="reason"
            placeholder="Reason required"
            required
          />
          <label className="team-inline-confirm">
            <input
              name="confirmation"
              required
              type="checkbox"
              value="member"
            />
            Confirm
          </label>
          <div>
            <button
              className="secondary"
              disabled={pending}
              name="memberAction"
              type="submit"
              value="change_role"
            >
              Change role
            </button>
            <button
              className="danger"
              disabled={pending}
              name="memberAction"
              type="submit"
              value="revoke"
            >
              Revoke
            </button>
          </div>
          <ActionMessage state={state} />
        </form>
      ) : null}
    </article>
  );
}

function InvitationRow({
  invitation,
  mayManage,
  organizationId,
}: Readonly<{
  invitation: OrganizationTeamWorkspaceV1["invitations"][number];
  mayManage: boolean;
  organizationId: string;
}>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    revokeOrganizationInvitationAction,
    idle,
  );
  return (
    <article className="team-invitation-row">
      <div>
        <Clock3 aria-hidden="true" />
        <span>
          <strong>{invitation.displayLabel}</strong>
          <small>
            {title(invitation.role)} · {title(invitation.status)} · expires{" "}
            {dateTime(invitation.expiresAt)}
          </small>
        </span>
      </div>
      {mayManage && invitation.status === "pending" ? (
        <form action={action}>
          <input name="organizationId" type="hidden" value={organizationId} />
          <input name="invitationId" type="hidden" value={invitation.id} />
          <input name="operationId" type="hidden" value={operationId} />
          <input
            aria-label={`Reason for revoking ${invitation.displayLabel}`}
            maxLength={500}
            minLength={8}
            name="reason"
            placeholder="Reason required"
            required
          />
          <label className="team-inline-confirm">
            <input
              name="confirmation"
              required
              type="checkbox"
              value="revoke"
            />
            Confirm
          </label>
          <button className="danger" disabled={pending} type="submit">
            Revoke
          </button>
          <ActionMessage state={state} />
        </form>
      ) : null}
    </article>
  );
}

function LifecycleForm({
  workspace,
}: Readonly<{ workspace: OrganizationTeamWorkspaceV1 }>) {
  const options = useMemo(() => {
    if (workspace.organization.status === "active")
      return ["rename", "suspend", "close"] as const;
    if (workspace.organization.status === "suspended")
      return ["rename", "restore", "close"] as const;
    return workspace.organization.offboardedAt ? [] : (["offboard"] as const);
  }, [workspace.organization.offboardedAt, workspace.organization.status]);
  const [selected, setSelected] = useState<string>(options[0] ?? "");
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    updateOrganizationLifecycleAction,
    idle,
  );
  return (
    <form action={action} className="team-lifecycle-form">
      <input
        name="organizationId"
        type="hidden"
        value={workspace.organization.id}
      />
      <input
        name="expectedRevision"
        type="hidden"
        value={workspace.organization.lifecycleRevision}
      />
      <input name="operationId" type="hidden" value={operationId} />
      <div className="team-form-icon warning">
        <ShieldAlert aria-hidden="true" />
      </div>
      <div className="team-form-copy">
        <h3>Organization state</h3>
        <p>
          Suspension is reversible. Closure is terminal; offboarding then
          revokes non-owner access and pending invitations while preserving one
          owner for export and recovery evidence.
        </p>
      </div>
      {options.length ? (
        <>
          <label>
            <span>Action</span>
            <select
              name="lifecycleAction"
              onChange={(event) => setSelected(event.target.value)}
              value={selected}
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {title(option)}
                </option>
              ))}
            </select>
          </label>
          {selected === "rename" ? (
            <label>
              <span>New name</span>
              <input
                defaultValue={workspace.organization.name}
                maxLength={200}
                name="name"
                required
              />
            </label>
          ) : null}
          <label>
            <span>Reason</span>
            <input
              maxLength={500}
              minLength={8}
              name="reason"
              placeholder="Required for the immutable audit"
              required
            />
          </label>
          <label className="organization-confirmation">
            <input
              name="confirmation"
              required
              type="checkbox"
              value="lifecycle"
            />
            I understand this changes organization authority immediately.
          </label>
          <button
            className={
              selected === "rename" || selected === "restore"
                ? "secondary"
                : "danger"
            }
            disabled={pending}
            type="submit"
          >
            {pending ? "Applying…" : `${title(selected)} organization`}
          </button>
        </>
      ) : (
        <p className="team-empty">
          Offboarding is complete. The remaining owner view and export stay
          available; identity history is not deleted.
        </p>
      )}
      <ActionMessage state={state} />
    </form>
  );
}

function ActionMessage({ state }: Readonly<{ state: IdentityActionState }>) {
  return state.kind === "idle" ? null : (
    <p
      className={`action-message ${state.kind}`}
      role={state.kind === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}
