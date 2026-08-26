"use client";

import { Building2, KeyRound } from "lucide-react";
import { useActionState, useState } from "react";
import {
  acceptOrganizationInvitationAction,
  createOrganizationAction,
  type IdentityActionState,
} from "./actions";

const idle: IdentityActionState = { kind: "idle", message: "" };

export function OrganizationOnboarding() {
  return (
    <div className="organization-onboarding-grid">
      <CreateOrganizationCard />
      <AcceptInvitationCard />
    </div>
  );
}

function CreateOrganizationCard() {
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    createOrganizationAction,
    idle,
  );
  return (
    <form action={action} className="organization-onboarding-card">
      <input name="operationId" type="hidden" value={operationId} />
      <span className="organization-onboarding-icon">
        <Building2 aria-hidden="true" />
      </span>
      <div>
        <p className="login-eyebrow">Start a tenant</p>
        <h2>Create an organization</h2>
        <p>
          You become its first owner. Membership authority stays in PostgreSQL.
        </p>
      </div>
      <label>
        <span>Organization name</span>
        <input
          maxLength={200}
          name="name"
          placeholder="Northstar Commerce"
          required
        />
      </label>
      <label>
        <span>URL slug</span>
        <input
          maxLength={80}
          minLength={2}
          name="slug"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          placeholder="northstar-commerce"
          required
        />
      </label>
      <label className="organization-confirmation">
        <input name="confirmation" required type="checkbox" value="create" />
        Create the tenant and assign me as its first owner.
      </label>
      <button className="primary" disabled={pending} type="submit">
        {pending ? "Creating…" : "Create organization"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function AcceptInvitationCard() {
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    acceptOrganizationInvitationAction,
    idle,
  );
  return (
    <form action={action} className="organization-onboarding-card">
      <input name="operationId" type="hidden" value={operationId} />
      <span className="organization-onboarding-icon">
        <KeyRound aria-hidden="true" />
      </span>
      <div>
        <p className="login-eyebrow">Join a tenant</p>
        <h2>Accept an invitation</h2>
        <p>
          The one-use token—not your email, domain, or SSO group—authorizes
          acceptance.
        </p>
      </div>
      <label>
        <span>Invitation token</span>
        <input
          autoComplete="off"
          maxLength={51}
          name="invitationToken"
          pattern="stfi_v1_[A-Za-z0-9_-]{43}"
          placeholder="stfi_v1_…"
          required
          spellCheck={false}
          type="password"
        />
      </label>
      <label className="organization-confirmation">
        <input name="confirmation" required type="checkbox" value="accept" />
        Accept the exact role carried by this invitation.
      </label>
      <button className="primary" disabled={pending} type="submit">
        {pending ? "Accepting…" : "Accept invitation"}
      </button>
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
