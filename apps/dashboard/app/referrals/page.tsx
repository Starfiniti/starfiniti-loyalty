import { UserRoundPlus } from "lucide-react";
import { redirect } from "next/navigation";
import { MerchantShell } from "@/components/merchant-shell";
import {
  merchantLocalePath,
  merchantText,
  resolveMerchantLocale,
} from "@/lib/merchant-locale";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getReferralWorkspace } from "@/lib/server/referrals";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { ReferralPerformance } from "./referral-performance";
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
  const workspace = programme.programme
    ? await getReferralWorkspace(programme.programme.id)
    : null;
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
            <p className="login-eyebrow">Audited customer growth</p>
            <h1>Referral performance &amp; review</h1>
            <p>
              Follow canonical referral outcomes, understand advocate progress,
              and resolve protected review cases without bypassing the immutable
              ledger.
            </p>
          </div>
          <span className="referrals-heading-icon" aria-hidden="true">
            <UserRoundPlus />
          </span>
        </div>

        {programme.programme ? (
          <>
            {workspace?.dashboard ? (
              <ReferralPerformance dashboard={workspace.dashboard} />
            ) : (
              <ReferralReadUnavailable area="performance" />
            )}
            {workspace?.casesAvailable ? (
              <ReferralReviewQueue
                canOperate={canOperate}
                cases={workspace.cases}
                operations={workspace.cases.map((item) => ({
                  reviewId: item.reviewId,
                  operationId: crypto.randomUUID(),
                }))}
              />
            ) : (
              <ReferralReadUnavailable area="review queue" />
            )}
          </>
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

function ReferralReadUnavailable({
  area,
}: Readonly<{ area: "performance" | "review queue" }>) {
  return (
    <section className="customer-panel referral-empty-state" role="status">
      <UserRoundPlus aria-hidden="true" />
      <h2>Referral {area} temporarily unavailable</h2>
      <p>
        Existing loyalty value is unaffected. Refresh after the referral read
        service recovers.
      </p>
    </section>
  );
}
