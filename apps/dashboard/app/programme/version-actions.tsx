"use client";

import { useActionState } from "react";
import {
  publishProgrammeVersion,
  scheduleProgrammeVersion,
  type ProgrammeActionState,
} from "./actions";

const initialState: ProgrammeActionState = { kind: "idle", message: "" };

export function VersionActions({
  versionId,
  configurationSha256,
  publishOperationId,
  scheduleOperationId,
  canEdit,
}: {
  versionId: string;
  configurationSha256: string;
  publishOperationId: string;
  scheduleOperationId: string;
  canEdit: boolean;
}) {
  const [publishState, publishAction, publishing] = useActionState(
    publishProgrammeVersion,
    initialState,
  );
  const [scheduleState, scheduleAction, scheduling] = useActionState(
    scheduleProgrammeVersion,
    initialState,
  );

  if (!canEdit) {
    return (
      <p className="role-note">Owner or admin role required to publish.</p>
    );
  }

  return (
    <div className="version-actions">
      <form action={publishAction}>
        <input name="programmeVersionId" type="hidden" value={versionId} />
        <input
          name="configurationSha256"
          type="hidden"
          value={configurationSha256}
        />
        <input name="operationId" type="hidden" value={publishOperationId} />
        <label className="confirmation-check">
          <input name="confirmation" type="checkbox" value="publish" />I
          reviewed fingerprint {configurationSha256.slice(0, 12)}…
        </label>
        <button className="primary" disabled={publishing} type="submit">
          {publishing ? "Publishing..." : "Publish now"}
        </button>
        <p aria-live="polite" className={`action-message ${publishState.kind}`}>
          {publishState.message}
        </p>
      </form>
      <form action={scheduleAction}>
        <input name="programmeVersionId" type="hidden" value={versionId} />
        <input
          name="configurationSha256"
          type="hidden"
          value={configurationSha256}
        />
        <input name="operationId" type="hidden" value={scheduleOperationId} />
        <label>
          Schedule publication
          <input name="scheduledFor" required type="datetime-local" />
        </label>
        <button className="secondary" disabled={scheduling} type="submit">
          {scheduling ? "Scheduling..." : "Schedule exact draft"}
        </button>
        <p
          aria-live="polite"
          className={`action-message ${scheduleState.kind}`}
        >
          {scheduleState.message}
        </p>
      </form>
    </div>
  );
}
