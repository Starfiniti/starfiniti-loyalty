"use client";

import { useActionState } from "react";
import { merchantText, type MerchantLocale } from "@/lib/merchant-locale";
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
  locale,
}: {
  versionId: string;
  configurationSha256: string;
  publishOperationId: string;
  scheduleOperationId: string;
  canEdit: boolean;
  locale: MerchantLocale;
}) {
  const t = (source: string) => merchantText(locale, source);
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
      <p className="role-note">
        {t("Owner or admin role required to publish.")}
      </p>
    );
  }

  return (
    <div className="version-actions">
      <form action={publishAction}>
        <input name="lang" type="hidden" value={locale} />
        <input name="programmeVersionId" type="hidden" value={versionId} />
        <input
          name="configurationSha256"
          type="hidden"
          value={configurationSha256}
        />
        <input name="operationId" type="hidden" value={publishOperationId} />
        <label className="confirmation-check">
          <input name="confirmation" type="checkbox" value="publish" />
          {t("I reviewed fingerprint")} {configurationSha256.slice(0, 12)}…
        </label>
        <button className="primary" disabled={publishing} type="submit">
          {publishing ? t("Publishing...") : t("Publish now")}
        </button>
        <p aria-live="polite" className={`action-message ${publishState.kind}`}>
          {publishState.message}
        </p>
      </form>
      <form action={scheduleAction}>
        <input name="lang" type="hidden" value={locale} />
        <input name="programmeVersionId" type="hidden" value={versionId} />
        <input
          name="configurationSha256"
          type="hidden"
          value={configurationSha256}
        />
        <input name="operationId" type="hidden" value={scheduleOperationId} />
        <label>
          {t("Schedule publication (Europe/Ljubljana)")}
          <input name="scheduledFor" required type="datetime-local" />
        </label>
        <button className="secondary" disabled={scheduling} type="submit">
          {scheduling ? t("Scheduling...") : t("Schedule exact draft")}
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
