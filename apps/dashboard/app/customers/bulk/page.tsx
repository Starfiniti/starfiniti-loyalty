import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { MerchantShell } from "@/components/merchant-shell";
import {
  merchantLocalePath,
  merchantText,
  resolveMerchantLocale,
} from "@/lib/merchant-locale";
import { listCustomers } from "@/lib/server/customers";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { BulkAdjustmentForm } from "./bulk-adjustment-form";

export default async function BulkCustomerAdjustmentPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ lang?: string | string[] }> }>) {
  const locale = resolveMerchantLocale((await searchParams).lang);
  const t = (source: string) => merchantText(locale, source);
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    const target = merchantLocalePath("/customers/bulk", locale);
    redirect(
      merchantLocalePath(`/login?next=${encodeURIComponent(target)}`, locale),
    );
  }
  if (tenant.kind === "unassigned") redirect(merchantLocalePath("/", locale));

  const [customers, programme] = await Promise.all([
    listCustomers(tenant.context),
    getMerchantProgrammeState(tenant.context),
  ]);
  const publishedVersion = programme.versions.find(
    (version) => version.status === "published",
  );
  const canAdjust = ["owner", "admin"].includes(tenant.context.membershipRole);

  return (
    <MerchantShell
      locale={locale}
      pageTitle="Bulk adjustment"
      tenant={{
        organizationName: tenant.context.organization.name,
        workspaceName: tenant.context.workspace?.name ?? t("No workspace"),
        programmeName:
          programme.programme?.name ?? t("Programme setup required"),
        role: tenant.context.membershipRole,
      }}
    >
      <main
        className="merchant-main customer-page"
        id="main-content"
        lang={locale}
        tabIndex={-1}
      >
        <div className="customer-heading detail-heading">
          <div>
            <Link
              className="back-link"
              href={merchantLocalePath("/customers", locale)}
            >
              <ArrowLeft aria-hidden="true" /> {t("Back to customers")}
            </Link>
            <h1>{t("Bulk point adjustment")}</h1>
            <p>
              {locale === "sl-SI"
                ? "En nadzorovan dobropis ali kompenzacijsko bremenitev uporabite za 2–50 strank šele po avtoritativnem poskusnem izračunu. Vsaka stranka prejme ločeno nespremenljivo in pripisljivo transakcijo glavne knjige."
                : "Apply one controlled credit or compensating debit to 2–50 customers only after an authoritative dry run. Every customer receives a separate immutable, attributable ledger transaction."}
            </p>
          </div>
          <span className="privacy-badge">
            <ShieldCheck aria-hidden="true" /> {t("Exact approval required")}
          </span>
        </div>

        <section className="customer-panel bulk-adjustment-panel">
          {!canAdjust ? (
            <div className="empty-state">
              <h2>{t("Read-only customer access")}</h2>
              <p>
                {locale === "sl-SI"
                  ? `Vloga ${tenant.context.membershipRole} ne more pregledovati ali izvajati množičnih sprememb vrednosti. Ta odgovornost ostaja lastnikom in skrbnikom organizacije.`
                  : `Your ${tenant.context.membershipRole} role cannot preview or execute bulk value changes. Organization owners and admins retain this responsibility.`}
              </p>
            </div>
          ) : !tenant.context.programmeGroup || !publishedVersion ? (
            <div className="empty-state">
              <h2>{t("A published programme is required")}</h2>
              <p>
                {t(
                  "Publish the current loyalty programme before attributing new bulk ledger transactions to it.",
                )}
              </p>
            </div>
          ) : (
            <BulkAdjustmentForm
              locale={locale}
              customers={customers
                .filter((customer) => customer.walletStatus === "active")
                .map((customer) => ({
                  id: customer.id,
                  displayReference: customer.displayReference,
                  availablePoints: customer.availablePoints,
                }))}
              programmeGroupId={tenant.context.programmeGroup.public_id}
              programmeVersionId={publishedVersion.id}
              programmeVersionNumber={publishedVersion.versionNumber}
            />
          )}
        </section>
      </main>
    </MerchantShell>
  );
}
