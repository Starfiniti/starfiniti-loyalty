import { UserRoundPlus } from "lucide-react";
import { redirect } from "next/navigation";
import { MerchantShell } from "@/components/merchant-shell";
import {
  merchantLocalePath,
  merchantText,
  resolveMerchantLocale,
} from "@/lib/merchant-locale";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getReferralReviewCases } from "@/lib/server/referrals";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { ReferralReviewQueue } from "./referral-review-queue";

export default async function ReferralsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ lang?: string | string[] }>;
}>) {
  const locale = resolveMerchantLocale((await searchParams).lang);
  const t = (source: string) => merchantText(locale, source);
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    const referralsPath = merchantLocalePath("/referrals", locale);
    redirect(
      merchantLocalePath(
        `/login?next=${encodeURIComponent(referralsPath)}`,
        locale,
      ),
    );
  }
  if (tenant.kind === "unassigned") redirect(merchantLocalePath("/", locale));

  const programme = await getMerchantProgrammeState(tenant.context);
  const cases = programme.programme
    ? await getReferralReviewCases(programme.programme.id)
    : [];
  const canOperate = ["owner", "admin", "operator"].includes(
    tenant.context.membershipRole,
  );

  return (
    <MerchantShell
      activePath="/referrals"
      locale={locale}
      pageTitle="Referrals"
      tenant={{
        organizationName: tenant.context.organization.name,
        workspaceName: tenant.context.workspace?.name ?? t("No workspace"),
        programmeName:
          programme.programme?.name ?? t("Programme setup required"),
        role: tenant.context.membershipRole,
      }}
    >
      <main
        className="merchant-main customer-page referrals-page"
        id="main-content"
        lang={locale}
        tabIndex={-1}
      >
        <div className="customer-heading referrals-heading">
          <div>
            <p className="login-eyebrow">Audited growth operations</p>
            <h1>Referral review</h1>
            <p>
              Resolve uncertain referrals and recover exhausted internal reward
              jobs without exposing identity fingerprints or bypassing the
              immutable ledger.
            </p>
          </div>
          <span className="referrals-heading-icon" aria-hidden="true">
            <UserRoundPlus />
          </span>
        </div>

        {programme.programme ? (
          <ReferralReviewQueue
            canOperate={canOperate}
            cases={cases}
            operations={cases.map((item) => ({
              reviewId: item.reviewId,
              operationId: crypto.randomUUID(),
            }))}
          />
        ) : (
          <section className="customer-panel referral-empty-state">
            <UserRoundPlus aria-hidden="true" />
            <h2>Programme setup required</h2>
            <p>
              Create a loyalty programme before referral review cases can be
              accepted.
            </p>
          </section>
        )}
      </main>
    </MerchantShell>
  );
}
