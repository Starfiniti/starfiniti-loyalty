import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { ProgrammeEditor } from "./programme-editor";
import { ProgrammeOnboarding } from "./programme-onboarding";
import { VersionActions } from "./version-actions";

function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Ljubljana",
      }).format(new Date(value))
    : "Not set";
}

function actionLabel(action: string): string {
  return (
    {
      "programme.draft.create": "Draft created",
      "programme.create": "Programme created",
      "programme.version.publish": "Version published",
      "programme.version.schedule": "Publication scheduled",
    }[action] ?? action
  );
}

export default async function ProgrammePage() {
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") redirect("/login?next=%2Fprogramme");
  if (tenant.kind === "unassigned") redirect("/");

  const state = await getMerchantProgrammeState(tenant.context);
  const canEdit = ["owner", "admin"].includes(tenant.context.membershipRole);
  const baseline =
    state.versions.find((version) => version.status === "draft") ??
    state.versions.find((version) => version.status === "published") ??
    state.versions[0];

  return (
    <main className="programme-page">
      <header className="programme-topbar">
        <div>
          <Link className="programme-brand" href="/">
            <span aria-hidden="true">SF</span>
            Starfiniti Loyalty
          </Link>
          <p>
            {tenant.context.organization.name} ·{" "}
            {tenant.context.workspace?.name}
          </p>
        </div>
        <nav aria-label="Account navigation">
          <Link className="secondary" href="/">
            Overview
          </Link>
          <form action={signOut}>
            <button className="secondary" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <div className="programme-heading">
        <div>
          <p className="login-eyebrow">Programme administration</p>
          <h1>{state.programme?.name ?? "Programme setup required"}</h1>
          <p>
            Drafts are new immutable versions. Publishing never rewrites prior
            transactions or their original value explanation.
          </p>
        </div>
        <span className="role-badge">{tenant.context.membershipRole}</span>
      </div>

      {!state.programme ? (
        canEdit && tenant.context.programmeGroup ? (
          <ProgrammeOnboarding
            operationId={crypto.randomUUID()}
            programmeGroupId={tenant.context.programmeGroup.public_id}
            programmeGroupName={tenant.context.programmeGroup.name}
            suggestedName={`${tenant.context.organization.name} Loyalty`.slice(
              0,
              200,
            )}
          />
        ) : (
          <section className="programme-panel empty-programme">
            <h2>Programme setup requires an owner or admin</h2>
            <p>
              An active programme group and a live owner or admin membership are
              required before the first programme can be created.
            </p>
          </section>
        )
      ) : (
        <>
          {canEdit ? (
            <ProgrammeEditor
              initialConfiguration={baseline?.configuration}
              operationId={crypto.randomUUID()}
              programmeId={state.programme.id}
            />
          ) : (
            <section className="programme-panel read-only-notice">
              <h2>Read-only programme access</h2>
              <p>
                Your {tenant.context.membershipRole} role can inspect versions,
                but only organization owners and admins can draft or publish
                value policy.
              </p>
            </section>
          )}

          <section
            className="programme-history"
            aria-labelledby="history-title"
          >
            <div className="section-heading">
              <div>
                <p className="login-eyebrow">Immutable history</p>
                <h2 id="history-title">Programme versions</h2>
              </div>
              <span>{state.versions.length} retained</span>
            </div>
            {state.versions.length === 0 ? (
              <p className="empty-state">No programme versions yet.</p>
            ) : (
              <div className="version-grid">
                {state.versions.map((version) => (
                  <article className="version-card" key={version.id}>
                    <div className="version-card-heading">
                      <div>
                        <span className={`status-pill ${version.status}`}>
                          {version.status}
                        </span>
                        <h3>Version {version.versionNumber}</h3>
                      </div>
                      <time dateTime={version.createdAt}>
                        {formatDate(version.createdAt)}
                      </time>
                    </div>
                    <dl>
                      <div>
                        <dt>Fingerprint</dt>
                        <dd title={version.configurationSha256}>
                          {version.configurationSha256.slice(0, 16)}…
                        </dd>
                      </div>
                      <div>
                        <dt>Published</dt>
                        <dd>{formatDate(version.publishedAt)}</dd>
                      </div>
                      <div>
                        <dt>Scheduled</dt>
                        <dd>{formatDate(version.scheduledFor)}</dd>
                      </div>
                    </dl>
                    {version.status === "draft" ? (
                      <VersionActions
                        canEdit={canEdit}
                        configurationSha256={version.configurationSha256}
                        publishOperationId={crypto.randomUUID()}
                        scheduleOperationId={crypto.randomUUID()}
                        versionId={version.id}
                      />
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="programme-history" aria-labelledby="audit-title">
            <div className="section-heading">
              <div>
                <p className="login-eyebrow">Accountability</p>
                <h2 id="audit-title">Administration audit</h2>
              </div>
            </div>
            {state.audit.length === 0 ? (
              <p className="empty-state">
                No visible programme audit events for this role.
              </p>
            ) : (
              <ol className="audit-list">
                {state.audit.map((event) => (
                  <li key={event.id}>
                    <span className="audit-dot" aria-hidden="true" />
                    <div>
                      <strong>{actionLabel(event.action)}</strong>
                      <span>
                        Actor {event.actorUserId.slice(0, 8)}… · Correlation{" "}
                        {event.correlationId.slice(0, 8)}…
                      </span>
                    </div>
                    <time dateTime={event.createdAt}>
                      {formatDate(event.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </main>
  );
}
