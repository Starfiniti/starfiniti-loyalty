"use client";

import { useActionState } from "react";
import { createInitialProgramme, type ProgrammeActionState } from "./actions";

const initialState: ProgrammeActionState = { kind: "idle", message: "" };

export function ProgrammeOnboarding({
  programmeGroupId,
  programmeGroupName,
  suggestedName,
  operationId,
}: {
  programmeGroupId: string;
  programmeGroupName: string;
  suggestedName: string;
  operationId: string;
}) {
  const [state, action, pending] = useActionState(
    createInitialProgramme,
    initialState,
  );

  return (
    <section className="programme-panel onboarding-panel">
      <div className="programme-panel-heading">
        <div>
          <p className="login-eyebrow">Step 1 of 2</p>
          <h2>Create your programme</h2>
          <p>
            This creates the programme container in {programmeGroupName}. You
            will define tiers and rewards as a separate immutable draft next.
          </p>
        </div>
        <span className="status-pill draft">Not launched</span>
      </div>
      <form action={action} className="onboarding-form">
        <input name="programmeGroupId" type="hidden" value={programmeGroupId} />
        <input name="operationId" type="hidden" value={operationId} />
        <label>
          Programme name
          <input
            autoComplete="organization-title"
            defaultValue={suggestedName}
            maxLength={200}
            minLength={1}
            name="name"
            required
          />
          <span>Shown to merchant users and in programme history.</span>
        </label>
        <label>
          Programme slug
          <input
            autoCapitalize="none"
            autoComplete="off"
            defaultValue="loyalty-programme"
            maxLength={80}
            minLength={2}
            name="slug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
            spellCheck={false}
          />
          <span>Lowercase letters, numbers, and single hyphens only.</span>
        </label>
        <div className="onboarding-submit">
          <p>
            Creating this container does not award points or publish a value
            policy.
          </p>
          <button className="primary" disabled={pending} type="submit">
            {pending ? "Creating programme..." : "Create programme"}
          </button>
        </div>
        <p aria-live="polite" className={`action-message ${state.kind}`}>
          {state.message}
        </p>
      </form>
    </section>
  );
}
