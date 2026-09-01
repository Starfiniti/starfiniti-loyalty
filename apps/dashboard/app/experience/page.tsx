import Link from "next/link";
import { redirect } from "next/navigation";
import { MerchantShell } from "@/components/merchant-shell";
import { merchantLocalePath, merchantText } from "@/lib/merchant-locale";
import { getMerchantExperienceTheme } from "@/lib/server/experience-theme";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { ExperienceEditor } from "./experience-editor";

export default async function ExperiencePage() {
  const locale = "en" as const;
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
    <MerchantShell
      locale={locale}
      pageTitle="Customer experience"
      tenant={{
        organizationName: context.organization.name,
        workspaceName: context.workspace?.name ?? t("No workspace"),
        programmeName:
          programme.programme?.name ?? t("Programme setup required"),
        role: context.membershipRole,
      }}
    >
      <main
        className="merchant-main experience-page"
        id="main-content"
        lang={locale}
        tabIndex={-1}
      >
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
            copyOperationId={crypto.randomUUID()}
            initialCopy={theme.copy}
            initialTheme={theme.definition}
            merchantLocale={locale}
            operationId={crypto.randomUUID()}
            programmeGroupId={context.programmeGroup.public_id}
            workspaceId={context.workspace.public_id}
          />
        ) : (
          <section className="customer-panel empty-state">
            {t(
              "Link an active workspace to an active programme group before saving a customer theme.",
            )}
          </section>
        )}
      </main>
    </MerchantShell>
  );
}
