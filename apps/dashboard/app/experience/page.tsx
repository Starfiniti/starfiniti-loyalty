import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import {
  merchantLocalePath,
  merchantText,
  resolveMerchantLocale,
} from "@/lib/merchant-locale";
import { getMerchantExperienceTheme } from "@/lib/server/experience-theme";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { ExperienceEditor } from "./experience-editor";

export default async function ExperiencePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ lang?: string | string[] }> }>) {
  const locale = resolveMerchantLocale((await searchParams).lang);
  const t = (source: string) => merchantText(locale, source);
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    const target = merchantLocalePath("/experience", locale);
    redirect(
      merchantLocalePath(`/login?next=${encodeURIComponent(target)}`, locale),
    );
  }
  if (tenant.kind === "unassigned") redirect(merchantLocalePath("/", locale));

  const { context } = tenant;
  const canEdit = ["owner", "admin"].includes(context.membershipRole);
  const [theme, programme] = await Promise.all([
    getMerchantExperienceTheme(context),
    getMerchantProgrammeState(context),
  ]);
  const hasPublishedVersion = programme.versions.some(
    (version) => version.status === "published",
  );

  return (
    <main
      className="experience-page"
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
            {context.organization.name} ·{" "}
            {context.workspace?.name ?? t("No workspace")}
          </p>
        </div>
        <div className="programme-topbar-actions">
          <nav aria-label={t("Account navigation")}>
            <Link
              className="secondary"
              href={merchantLocalePath("/programme", locale)}
            >
              {t("Programme")}
            </Link>
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

      <div className="experience-heading">
        <div>
          <p className="login-eyebrow">{t("Customer experience")}</p>
          <h1>{t("Brand the loyalty wallet")}</h1>
          <p>
            {t(
              "Preview a bounded token set before it reaches hosted or WooCommerce customer surfaces. Value rules remain in immutable programme versions.",
            )}
          </p>
        </div>
        <span className="role-badge">
          {theme.revision > 0
            ? `${t("Revision")} ${theme.revision}`
            : t("Unsaved default")}
        </span>
        {hasPublishedVersion && programme.programme && context.workspace ? (
          <Link
            className="secondary"
            href={`/loyalty/${context.workspace.public_id}/${programme.programme.id}`}
            prefetch={false}
            rel="noreferrer"
            target="_blank"
          >
            {t("Open hosted page")}
          </Link>
        ) : null}
      </div>

      {theme.scopeReady && context.workspace && context.programmeGroup ? (
        <ExperienceEditor
          canEdit={canEdit}
          initialTheme={theme.definition}
          initialTranslations={theme.translations}
          merchantLocale={locale}
          operationId={crypto.randomUUID()}
          programmeGroupId={context.programmeGroup.public_id}
          workspaceId={context.workspace.public_id}
          translationOperationIds={{
            en: crypto.randomUUID(),
            "sl-SI": crypto.randomUUID(),
          }}
        />
      ) : (
        <section className="customer-panel empty-state">
          {t(
            "Link an active workspace to an active programme group before saving a customer theme.",
          )}
        </section>
      )}
    </main>
  );
}
