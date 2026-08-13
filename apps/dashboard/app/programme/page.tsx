import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { MerchantLocaleSwitcher } from "@/components/merchant-locale-switcher";
import {
  merchantIntlLocale,
  merchantLocalePath,
  merchantText,
  resolveMerchantLocale,
  type MerchantLocale,
} from "@/lib/merchant-locale";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { ProgrammeEditor } from "./programme-editor";
import { ProgrammeOnboarding } from "./programme-onboarding";
import { VersionActions } from "./version-actions";

function formatDate(value: string | null, locale: MerchantLocale): string {
  return value
    ? new Intl.DateTimeFormat(merchantIntlLocale(locale), {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Ljubljana",
      }).format(new Date(value))
    : merchantText(locale, "Not set");
}

function actionLabel(action: string, locale: MerchantLocale): string {
  return merchantText(
    locale,
    {
      "programme.draft.create": "Draft created",
      "programme.create": "Programme created",
      "programme.version.publish": "Version published",
      "programme.version.schedule": "Publication scheduled",
    }[action] ?? action,
  );
}

export default async function ProgrammePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ lang?: string | string[] }>;
}>) {
  const locale = resolveMerchantLocale((await searchParams).lang);
  const t = (source: string) => merchantText(locale, source);
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    const programmePath = merchantLocalePath("/programme", locale);
    redirect(
      merchantLocalePath(
        `/login?next=${encodeURIComponent(programmePath)}`,
        locale,
      ),
    );
  }
  if (tenant.kind === "unassigned") redirect(merchantLocalePath("/", locale));

  const state = await getMerchantProgrammeState(tenant.context);
  const canEdit = ["owner", "admin"].includes(tenant.context.membershipRole);
  const baseline =
    state.versions.find((version) => version.status === "draft") ??
    state.versions.find((version) => version.status === "published") ??
    state.versions[0];

  return (
    <main
      className="programme-page"
      id="main-content"
      lang={locale}
      tabIndex={-1}
    >
      <header className="programme-topbar">
        <div>
          <Link
            className="programme-brand"
            href={merchantLocalePath("/", locale)}
          >
            <span aria-hidden="true">SF</span>
            Starfiniti Loyalty
          </Link>
          <p>
            {tenant.context.organization.name} ·{" "}
            {tenant.context.workspace?.name}
          </p>
        </div>
        <div className="programme-topbar-actions">
          <MerchantLocaleSwitcher locale={locale} />
          <nav aria-label={t("Account navigation")}>
            <Link className="secondary" href={merchantLocalePath("/", locale)}>
              {t("Overview")}
            </Link>
            <form action={signOut}>
              <input name="lang" type="hidden" value={locale} />
              <button className="secondary" type="submit">
                {t("Sign out")}
              </button>
            </form>
          </nav>
        </div>
      </header>

      <div className="programme-heading">
        <div>
          <p className="login-eyebrow">{t("Programme administration")}</p>
          <h1>{state.programme?.name ?? t("Programme setup required")}</h1>
          <p>
            {t(
              "Drafts are new immutable versions. Publishing never rewrites prior transactions or their original value explanation.",
            )}
          </p>
        </div>
        <span className="role-badge">{tenant.context.membershipRole}</span>
      </div>

      {!state.programme ? (
        canEdit && tenant.context.programmeGroup ? (
          <ProgrammeOnboarding
            locale={locale}
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
            <h2>{t("Programme setup requires an owner or admin")}</h2>
            <p>
              {t(
                "An active programme group and a live owner or admin membership are required before the first programme can be created.",
              )}
            </p>
          </section>
        )
      ) : (
        <>
          {canEdit ? (
            <ProgrammeEditor
              initialConfiguration={baseline?.configuration}
              locale={locale}
              operationId={crypto.randomUUID()}
              programmeId={state.programme.id}
            />
          ) : (
            <section className="programme-panel read-only-notice">
              <h2>{t("Read-only programme access")}</h2>
              <p>
                {locale === "sl-SI"
                  ? `Vloga ${tenant.context.membershipRole} lahko pregleduje različice, vendar lahko pravila vrednosti urejajo ali objavijo le lastniki in skrbniki organizacije.`
                  : `Your ${tenant.context.membershipRole} role can inspect versions, but only organization owners and admins can draft or publish value policy.`}
              </p>
            </section>
          )}

          <section
            className="programme-history"
            aria-labelledby="history-title"
          >
            <div className="section-heading">
              <div>
                <p className="login-eyebrow">{t("Immutable history")}</p>
                <h2 id="history-title">{t("Programme versions")}</h2>
              </div>
              <span>
                {state.versions.length} {t("retained")}
              </span>
            </div>
            {state.versions.length === 0 ? (
              <p className="empty-state">{t("No programme versions yet.")}</p>
            ) : (
              <div className="version-grid">
                {state.versions.map((version) => (
                  <article className="version-card" key={version.id}>
                    <div className="version-card-heading">
                      <div>
                        <span className={`status-pill ${version.status}`}>
                          {t(version.status)}
                        </span>
                        <h3>
                          {t("Version")} {version.versionNumber}
                        </h3>
                      </div>
                      <time dateTime={version.createdAt}>
                        {formatDate(version.createdAt, locale)}
                      </time>
                    </div>
                    <dl>
                      <div>
                        <dt>{t("Fingerprint")}</dt>
                        <dd title={version.configurationSha256}>
                          {version.configurationSha256.slice(0, 16)}…
                        </dd>
                      </div>
                      <div>
                        <dt>{t("Published")}</dt>
                        <dd>{formatDate(version.publishedAt, locale)}</dd>
                      </div>
                      <div>
                        <dt>{t("Scheduled")}</dt>
                        <dd>{formatDate(version.scheduledFor, locale)}</dd>
                      </div>
                    </dl>
                    {version.status === "draft" ? (
                      <VersionActions
                        canEdit={canEdit}
                        configurationSha256={version.configurationSha256}
                        locale={locale}
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
                <p className="login-eyebrow">{t("Accountability")}</p>
                <h2 id="audit-title">{t("Administration audit")}</h2>
              </div>
            </div>
            {state.audit.length === 0 ? (
              <p className="empty-state">
                {t("No visible programme audit events for this role.")}
              </p>
            ) : (
              <ol className="audit-list">
                {state.audit.map((event) => (
                  <li key={event.id}>
                    <span className="audit-dot" aria-hidden="true" />
                    <div>
                      <strong>{actionLabel(event.action, locale)}</strong>
                      <span>
                        {t("Actor")} {event.actorUserId.slice(0, 8)}… ·{" "}
                        {t("Correlation")} {event.correlationId.slice(0, 8)}…
                      </span>
                    </div>
                    <time dateTime={event.createdAt}>
                      {formatDate(event.createdAt, locale)}
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
