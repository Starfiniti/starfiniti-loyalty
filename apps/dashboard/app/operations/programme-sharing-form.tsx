"use client";

import type {
  ProgrammeGroupSharingModeV1,
  ProgrammeGroupSharingPolicyV1,
} from "@starfiniti/contracts";
import {
  Building2,
  Check,
  GitFork,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  configureProgrammeGroupSharing,
  type SharingActionState,
} from "./sharing-actions";

const initialState: SharingActionState = { kind: "idle", message: "" };

export function ProgrammeSharingForm({
  policy,
  mayConfigure,
}: Readonly<{
  policy: ProgrammeGroupSharingPolicyV1;
  mayConfigure: boolean;
}>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState<ProgrammeGroupSharingModeV1>(policy.mode);
  const [selected, setSelected] = useState(
    () =>
      new Set(
        policy.workspaces.filter((item) => item.linked).map((item) => item.id),
      ),
  );
  const [reviewing, setReviewing] = useState(false);
  const [state, action, pending] = useActionState(
    configureProgrammeGroupSharing,
    initialState,
  );
  const protectedIds = useMemo(
    () =>
      new Set(
        policy.workspaces
          .filter((workspace) => workspace.linked && workspace.removalProtected)
          .map((workspace) => workspace.id),
      ),
    [policy.workspaces],
  );
  const selectedWorkspaces = policy.workspaces.filter((workspace) =>
    selected.has(workspace.id),
  );
  const validSelection =
    selected.size <= 25 &&
    (mode === "isolated" ? selected.size === 1 : selected.size >= 2) &&
    [...protectedIds].every((id) => selected.has(id));
  const canSubmit =
    mayConfigure &&
    policy.configurationEnabled &&
    validSelection &&
    state.kind !== "success";

  function chooseMode(nextMode: ProgrammeGroupSharingModeV1) {
    setMode(nextMode);
    setReviewing(false);
    setSelected((current) => {
      if (nextMode === "isolated") {
        if (protectedIds.size > 0) return new Set(protectedIds);
        const first = [...current][0] ?? policy.workspaces[0]?.id;
        return new Set(first ? [first] : []);
      }
      const next = new Set(current);
      for (const workspace of policy.workspaces) {
        if (next.size >= 2) break;
        next.add(workspace.id);
      }
      return next;
    });
  }

  function chooseWorkspace(workspaceId: string, checked: boolean) {
    setReviewing(false);
    setSelected((current) => {
      if (mode === "isolated") return new Set([workspaceId]);
      const next = new Set(current);
      if (checked) next.add(workspaceId);
      else if (!protectedIds.has(workspaceId)) next.delete(workspaceId);
      return next;
    });
  }

  return (
    <section
      className="sharing-policy-card"
      aria-labelledby="sharing-policy-title"
    >
      <header className="sharing-policy-heading">
        <div>
          <GitFork aria-hidden="true" />
          <div>
            <p className="login-eyebrow">Wallet boundary</p>
            <h2 id="sharing-policy-title">Multi-store programme scope</h2>
            <p>
              Choose the exact stores that share this programme and customer
              wallet. Organization membership alone never links value.
            </p>
          </div>
        </div>
        <span className="revision-badge">Revision {policy.revision}</span>
      </header>

      <form action={action} className="sharing-policy-form">
        <input name="operationId" type="hidden" value={operationId} />
        <input
          name="programmeGroupId"
          type="hidden"
          value={policy.programmeGroupId}
        />
        <input name="expectedRevision" type="hidden" value={policy.revision} />

        <fieldset
          className="sharing-mode-grid"
          disabled={!mayConfigure || !policy.configurationEnabled}
        >
          <legend>Sharing model</legend>
          <label className={mode === "isolated" ? "selected" : ""}>
            <input
              checked={mode === "isolated"}
              disabled={!mayConfigure || protectedIds.size > 1}
              name="mode"
              onChange={() => chooseMode("isolated")}
              type="radio"
              value="isolated"
            />
            <ShieldCheck aria-hidden="true" />
            <span>
              <strong>Isolated store</strong>
              <small>One workspace owns this wallet boundary.</small>
            </span>
          </label>
          <label
            className={
              mode === "explicit-workspace-allowlist" ? "selected" : ""
            }
          >
            <input
              checked={mode === "explicit-workspace-allowlist"}
              disabled={!mayConfigure}
              name="mode"
              onChange={() => chooseMode("explicit-workspace-allowlist")}
              type="radio"
              value="explicit-workspace-allowlist"
            />
            <GitFork aria-hidden="true" />
            <span>
              <strong>Explicit shared wallet</strong>
              <small>Only selected workspaces share value and history.</small>
            </span>
          </label>
        </fieldset>

        <fieldset
          className="sharing-workspace-list"
          disabled={!mayConfigure || !policy.configurationEnabled}
        >
          <legend>Allowed workspaces</legend>
          {policy.workspaces.map((workspace) => {
            const isProtected = protectedIds.has(workspace.id);
            const isSelected = selected.has(workspace.id);
            const lockedByProtectedIsolation =
              mode === "isolated" && protectedIds.size === 1 && !isProtected;
            return (
              <label
                className={`${isSelected ? "selected" : ""} ${
                  isProtected ? "protected" : ""
                }`}
                key={workspace.id}
              >
                {isProtected && isSelected ? (
                  <input
                    name="workspaceIds"
                    type="hidden"
                    value={workspace.id}
                  />
                ) : null}
                <input
                  checked={isSelected}
                  disabled={isProtected || lockedByProtectedIsolation}
                  name="workspaceIds"
                  onChange={(event) =>
                    chooseWorkspace(workspace.id, event.target.checked)
                  }
                  type={mode === "isolated" ? "radio" : "checkbox"}
                  value={workspace.id}
                />
                <span className="workspace-icon">
                  <Building2 aria-hidden="true" />
                </span>
                <span>
                  <strong>{workspace.name}</strong>
                  <small>{workspace.slug}</small>
                </span>
                {isProtected ? (
                  <span className="workspace-protected">
                    <LockKeyhole aria-hidden="true" /> Connected
                  </span>
                ) : isSelected ? (
                  <Check aria-label="Selected" />
                ) : null}
              </label>
            );
          })}
        </fieldset>

        {!policy.configurationEnabled ? (
          <p className="sharing-policy-notice">
            The ecosystem capability is disabled. Current wallets and connected
            stores remain available; new scope changes are blocked.
          </p>
        ) : !mayConfigure ? (
          <p className="sharing-policy-notice">
            Only a live owner or admin can change this wallet boundary.
          </p>
        ) : !validSelection ? (
          <p className="sharing-policy-notice warning">
            Isolated scope needs one workspace. Shared scope needs at least two,
            and connected workspaces cannot be removed here.
          </p>
        ) : null}

        {!reviewing ? (
          <button
            className="secondary"
            disabled={!canSubmit}
            onClick={() => setReviewing(true)}
            type="button"
          >
            Review wallet scope
          </button>
        ) : (
          <div className="sharing-policy-review">
            <div>
              <strong>
                {mode === "isolated" ? "Isolate" : "Share"}{" "}
                {policy.programmeGroupName}
              </strong>
              <p>
                {selectedWorkspaces
                  .map((workspace) => workspace.name)
                  .join(", ")}
              </p>
            </div>
            <label>
              <input
                name="confirmation"
                required
                type="checkbox"
                value="configure"
              />
              I reviewed the exact stores sharing this wallet.
            </label>
            <button
              className="primary"
              disabled={pending || state.kind === "success"}
              type="submit"
            >
              {pending ? "Saving…" : "Save immutable revision"}
            </button>
          </div>
        )}

        {state.kind !== "idle" ? (
          <p className={`action-message ${state.kind}`} role="status">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
