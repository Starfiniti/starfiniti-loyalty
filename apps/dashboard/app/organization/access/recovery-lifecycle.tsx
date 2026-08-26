"use client";

import {
  AlertTriangle,
  Check,
  Clock3,
  Download,
  FileCheck2,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Trash2,
} from "lucide-react";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  OrganizationAdministrationExportV1,
  OrganizationBreakGlassSessionReadV1,
  OrganizationRecoveryWorkspaceV1,
} from "@starfiniti/contracts";
import {
  administrationIdle,
  exportOrganizationAdministrationAction,
  startBreakGlassAction,
  updateOrganizationDeletionAction,
  type AdministrationActionState,
} from "./administration-actions";

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function RecoveryLifecycle({
  workspace,
}: Readonly<{ workspace: OrganizationRecoveryWorkspaceV1 }>) {
  const activeSessions = workspace.sessions.filter(
    ({ status }) => status === "active",
  );
  const isClosedAndOffboarded =
    workspace.organization.status === "closed" &&
    workspace.organization.offboardedAt !== null;

  return (
    <section className="recovery-lifecycle" aria-labelledby="recovery-title">
      <header className="recovery-heading">
        <div>
          <p className="login-eyebrow">Owner recovery</p>
          <h2 id="recovery-title">Break-glass, export & deletion</h2>
          <p>
            Elevated recovery requires a live Supabase Auth session at AAL2.
            Each use is immutable, visible to the tenant, and expires after 30
            minutes.
          </p>
        </div>
        <span className="recovery-heading-icon" aria-hidden="true">
          <Fingerprint />
        </span>
      </header>

      <div className="recovery-summary" aria-label="Recovery readiness">
        <RecoveryMetric
          icon={<ShieldCheck aria-hidden="true" />}
          label="Assurance"
          tone={workspace.assuranceLevel === "aal2" ? "ready" : "warning"}
          value={workspace.assuranceLevel.toUpperCase()}
        />
        <RecoveryMetric
          icon={<KeyRound aria-hidden="true" />}
          label="Auth session"
          tone={workspace.hasLiveAuthSession ? "ready" : "warning"}
          value={workspace.hasLiveAuthSession ? "Live" : "Unavailable"}
        />
        <RecoveryMetric
          icon={<Clock3 aria-hidden="true" />}
          label="Active recovery"
          tone={activeSessions.length > 0 ? "ready" : "neutral"}
          value={String(activeSessions.length)}
        />
        <RecoveryMetric
          icon={<FileCheck2 aria-hidden="true" />}
          label="Deletion state"
          tone={
            workspace.deletionCase?.status === "cooling" ? "warning" : "neutral"
          }
          value={workspace.deletionCase?.status ?? "None"}
        />
      </div>

      {!workspace.mayStartBreakGlass ? (
        <div className="recovery-requirement" role="status">
          <LockKeyhole aria-hidden="true" />
          <div>
            <h3>Recovery elevation is locked</h3>
            <p>
              A live organization owner must complete a second authentication
              factor so the signed session reaches AAL2. Browser claims and SSO
              groups cannot unlock this control.
            </p>
          </div>
        </div>
      ) : (
        <StartBreakGlassForm organizationId={workspace.organization.id} />
      )}

      <section
        className="recovery-panel"
        aria-labelledby="recovery-sessions-title"
      >
        <header>
          <div>
            <p className="login-eyebrow">Thirty-minute capabilities</p>
            <h3 id="recovery-sessions-title">Recovery sessions</h3>
          </div>
          <span>{workspace.sessions.length} retained here</span>
        </header>
        {workspace.sessions.length > 0 ? (
          <div className="recovery-session-list">
            {workspace.sessions.map((session) => (
              <RecoverySessionCard key={session.id} session={session} />
            ))}
          </div>
        ) : (
          <div className="recovery-empty">
            <Fingerprint aria-hidden="true" />
            <h4>No recovery session has been opened</h4>
            <p>
              AAL2 owner elevation will appear here with every recorded use.
            </p>
          </div>
        )}
      </section>

      {workspace.mayStartBreakGlass && activeSessions.length > 0 ? (
        <AdministrationExportForm
          organizationId={workspace.organization.id}
          sessions={activeSessions}
        />
      ) : null}

      <section className="recovery-danger" aria-labelledby="deletion-title">
        <header>
          <div>
            <p className="login-eyebrow">Terminal lifecycle</p>
            <h3 id="deletion-title">Organization deletion</h3>
            <p>
              Deletion pseudonymizes mutable identity after a seven-day cooling
              period. Ledger transactions, balances, and audit evidence are
              retained and never rewritten.
            </p>
          </div>
          <Trash2 aria-hidden="true" />
        </header>
        {workspace.organization.deletionCompletedAt ? (
          <div className="recovery-terminal-state" role="status">
            <Check aria-hidden="true" />
            <p>
              Identity was pseudonymized on{" "}
              {dateTime(workspace.organization.deletionCompletedAt)}. Immutable
              value evidence remains available to platform recovery operations.
            </p>
          </div>
        ) : !isClosedAndOffboarded ? (
          <div className="recovery-prerequisite">
            <AlertTriangle aria-hidden="true" />
            <p>
              Close and offboard the organization from the lifecycle section
              first. Offboarding revokes connectors, service credentials, SSO,
              SCIM, support, notifications, and scheduled exports.
            </p>
          </div>
        ) : !workspace.mayStartBreakGlass || activeSessions.length === 0 ? (
          <div className="recovery-prerequisite">
            <LockKeyhole aria-hidden="true" />
            <p>
              Start a live AAL2 recovery session before changing deletion state.
            </p>
          </div>
        ) : (
          <DeletionForm workspace={workspace} sessions={activeSessions} />
        )}
      </section>
    </section>
  );
}

function RecoveryMetric({
  icon,
  label,
  tone,
  value,
}: Readonly<{
  icon: ReactNode;
  label: string;
  tone: "ready" | "warning" | "neutral";
  value: string;
}>) {
  return (
    <article className={`is-${tone}`}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function StartBreakGlassForm({
  organizationId,
}: Readonly<{ organizationId: string }>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    startBreakGlassAction,
    administrationIdle,
  );
  const operationInput = useFreshOperationInput(state);
  return (
    <form action={action} className="break-glass-form">
      <input name="organizationId" type="hidden" value={organizationId} />
      <input
        defaultValue={operationId}
        name="operationId"
        ref={operationInput}
        type="hidden"
      />
      <span className="break-glass-icon" aria-hidden="true">
        <Fingerprint />
      </span>
      <div>
        <p className="login-eyebrow">AAL2 confirmed</p>
        <h3>Start a 30-minute recovery session</h3>
        <p>
          The session is bound to your current Auth session ID and owner
          membership.
        </p>
      </div>
      <label>
        <span>Audited reason</span>
        <input maxLength={500} minLength={8} name="reason" required />
      </label>
      <label className="recovery-confirmation">
        <input
          name="confirmation"
          required
          type="checkbox"
          value="start-break-glass"
        />
        <span>I understand every elevated use will be recorded.</span>
      </label>
      <button disabled={pending} type="submit">
        {pending ? (
          <RefreshCw className="spin" aria-hidden="true" />
        ) : (
          <ShieldCheck aria-hidden="true" />
        )}
        {pending ? "Starting recovery…" : "Start recovery session"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function RecoverySessionCard({
  session,
}: Readonly<{ session: OrganizationBreakGlassSessionReadV1 }>) {
  return (
    <article className={`recovery-session is-${session.status}`}>
      <header>
        <span aria-hidden="true">
          <Fingerprint />
        </span>
        <div>
          <h4>{session.reason}</h4>
          <p>Started {dateTime(session.createdAt)}</p>
        </div>
        <span className={`recovery-status is-${session.status}`}>
          {session.status}
        </span>
      </header>
      <dl>
        <div>
          <dt>Expires</dt>
          <dd>{dateTime(session.expiresAt)}</dd>
        </div>
        <div>
          <dt>Recorded uses</dt>
          <dd>{session.useCount}</dd>
        </div>
        <div>
          <dt>Last used</dt>
          <dd>{session.lastUsedAt ? dateTime(session.lastUsedAt) : "Never"}</dd>
        </div>
      </dl>
    </article>
  );
}

function AdministrationExportForm({
  organizationId,
  sessions,
}: Readonly<{
  organizationId: string;
  sessions: readonly OrganizationBreakGlassSessionReadV1[];
}>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    exportOrganizationAdministrationAction,
    administrationIdle,
  );
  const operationInput = useFreshOperationInput(state);
  return (
    <form action={action} className="administration-export-form">
      <input name="organizationId" type="hidden" value={organizationId} />
      <input
        defaultValue={operationId}
        name="operationId"
        ref={operationInput}
        type="hidden"
      />
      <header>
        <span aria-hidden="true">
          <Download />
        </span>
        <div>
          <p className="login-eyebrow">Bounded evidence</p>
          <h3>Administration export</h3>
          <p>
            Counts, credential state, and exact ledger reconciliation—no
            customer PII or secrets.
          </p>
        </div>
      </header>
      <label>
        <span>Active recovery session</span>
        <select name="breakGlassSessionId" required>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              Expires {dateTime(session.expiresAt)}
            </option>
          ))}
        </select>
      </label>
      <label className="recovery-confirmation">
        <input
          name="confirmation"
          required
          type="checkbox"
          value="export-administration"
        />
        <span>
          Record this export use against the selected recovery session.
        </span>
      </label>
      <button disabled={pending} type="submit">
        {pending ? (
          <RefreshCw className="spin" aria-hidden="true" />
        ) : (
          <FileCheck2 aria-hidden="true" />
        )}
        {pending ? "Preparing export…" : "Prepare export"}
      </button>
      <ActionMessage state={state} />
      {state.exportDocument ? (
        <ExportDownload document={state.exportDocument} />
      ) : null}
    </form>
  );
}

function ExportDownload({
  document,
}: Readonly<{ document: OrganizationAdministrationExportV1 }>) {
  return (
    <div className="administration-export-ready" role="status">
      <div>
        <Check aria-hidden="true" />
        <p>
          <strong>Export reconciled.</strong> Ledger net amount:{" "}
          {document.ledger.netAmount}
        </p>
      </div>
      <button
        className="secondary"
        onClick={() => downloadExport(document)}
        type="button"
      >
        <Download aria-hidden="true" />
        Download JSON
      </button>
    </div>
  );
}

function DeletionForm({
  sessions,
  workspace,
}: Readonly<{
  sessions: readonly OrganizationBreakGlassSessionReadV1[];
  workspace: OrganizationRecoveryWorkspaceV1;
}>) {
  const deletionCase = workspace.deletionCase;
  const actionName =
    deletionCase?.status === "cooling" ? "complete" : "request";
  const revision =
    deletionCase?.revision ?? workspace.organization.lifecycleRevision;
  const coolingActive =
    deletionCase?.status === "cooling" && !deletionCase.completionAvailable;
  return (
    <div className="deletion-control-grid">
      {deletionCase?.status === "cooling" ? (
        <div className="deletion-cooling" role="status">
          <Clock3 aria-hidden="true" />
          <div>
            <h4>Cooling period active</h4>
            <p>Deletion can complete after {dateTime(deletionCase.dueAt)}.</p>
          </div>
        </div>
      ) : null}
      <DeletionActionForm
        actionName={actionName}
        disabled={Boolean(coolingActive)}
        revision={revision}
        sessions={sessions}
        workspace={workspace}
      />
      {deletionCase?.status === "cooling" ? (
        <DeletionActionForm
          actionName="cancel"
          disabled={false}
          revision={deletionCase.revision}
          sessions={sessions}
          workspace={workspace}
        />
      ) : null}
    </div>
  );
}

function DeletionActionForm({
  actionName,
  disabled,
  revision,
  sessions,
  workspace,
}: Readonly<{
  actionName: "request" | "cancel" | "complete";
  disabled: boolean;
  revision: number;
  sessions: readonly OrganizationBreakGlassSessionReadV1[];
  workspace: OrganizationRecoveryWorkspaceV1;
}>) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    updateOrganizationDeletionAction,
    administrationIdle,
  );
  const operationInput = useFreshOperationInput(state);
  const destructive = actionName !== "cancel";
  return (
    <form action={action} className={`deletion-action-form is-${actionName}`}>
      <input
        name="organizationId"
        type="hidden"
        value={workspace.organization.id}
      />
      <input
        name="caseId"
        type="hidden"
        value={workspace.deletionCase?.id ?? ""}
      />
      <input name="expectedRevision" type="hidden" value={revision} />
      <input name="deletionAction" type="hidden" value={actionName} />
      <input
        defaultValue={operationId}
        name="operationId"
        ref={operationInput}
        type="hidden"
      />
      <h4>
        {actionName === "request"
          ? "Start deletion cooling"
          : actionName === "cancel"
            ? "Cancel deletion"
            : "Complete pseudonymization"}
      </h4>
      <label>
        <span>Recovery session</span>
        <select name="breakGlassSessionId" required>
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              Expires {dateTime(session.expiresAt)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Audited reason</span>
        <input maxLength={500} minLength={8} name="reason" required />
      </label>
      <label className="recovery-confirmation">
        <input
          name="confirmation"
          required
          type="checkbox"
          value={`deletion-${actionName}`}
        />
        <span>
          {destructive
            ? "I understand mutable identity will be pseudonymized while immutable ledger evidence remains."
            : "I am cancelling this deletion case before completion."}
        </span>
      </label>
      {disabled ? (
        <p className="deletion-disabled-reason">
          The seven-day cooling period has not ended.
        </p>
      ) : null}
      <button
        className={destructive ? "danger" : "secondary"}
        disabled={disabled || pending}
        type="submit"
      >
        {pending ? (
          <RefreshCw className="spin" aria-hidden="true" />
        ) : destructive ? (
          <Trash2 aria-hidden="true" />
        ) : (
          <ShieldX aria-hidden="true" />
        )}
        {pending
          ? "Recording…"
          : actionName === "request"
            ? "Start seven-day cooling"
            : actionName === "cancel"
              ? "Cancel deletion"
              : "Complete deletion"}
      </button>
      <ActionMessage state={state} />
    </form>
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

function downloadExport(document: OrganizationAdministrationExportV1) {
  const blob = new Blob([`${JSON.stringify(document, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `starfiniti-administration-${document.organization.slug}-${document.generatedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
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
