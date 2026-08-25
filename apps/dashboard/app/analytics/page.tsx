import { redirect } from "next/navigation";
import { AnalyticsValueTruth } from "@/components/analytics-value-truth";
import { hasEntitlement } from "@/lib/entitlements";
import {
  merchantLocalePath,
  resolveMerchantLocale,
} from "@/lib/merchant-locale";
import { parseOverviewRange } from "@/lib/overview";
import {
  getAnalyticsCommercePerformanceReport,
  getAnalyticsValueTruthReport,
} from "@/lib/server/analytics";
import { getEntitlementSnapshot } from "@/lib/server/entitlements";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { MerchantShell } from "@/components/merchant-shell";

export default async function AnalyticsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    range?: string | string[];
    lang?: string | string[];
  }>;
}>) {
  const parameters = await searchParams;
  const range = parseOverviewRange(parameters.range);
  const locale = resolveMerchantLocale(parameters.lang);
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    const path = merchantLocalePath(`/analytics?range=${range}`, locale);
    redirect(
      merchantLocalePath(`/login?next=${encodeURIComponent(path)}`, locale),
    );
  }
  if (tenant.kind === "unassigned") redirect(merchantLocalePath("/", locale));

  const [programmeResult, entitlementResult] = await Promise.allSettled([
    getMerchantProgrammeState(tenant.context),
    getEntitlementSnapshot(tenant.context),
  ]);
  const programme =
    programmeResult.status === "fulfilled" ? programmeResult.value : null;
  const analyticsEnabled =
    entitlementResult.status === "fulfilled" &&
    hasEntitlement(entitlementResult.value, "analytics");
  const hasScope = Boolean(
    tenant.context.workspace && tenant.context.programmeGroup,
  );

  let state: Parameters<typeof AnalyticsValueTruth>[0]["state"];
  if (!hasScope) {
    state = { kind: "setup_required" };
  } else if (!analyticsEnabled) {
    state = { kind: "disabled" };
  } else {
    const [valueResult, commerceResult] = await Promise.allSettled([
      getAnalyticsValueTruthReport(tenant.context, range),
      getAnalyticsCommercePerformanceReport(tenant.context, range),
    ]);
    if (valueResult.status === "fulfilled" && valueResult.value) {
      state = {
        kind: "ready",
        report: valueResult.value,
        commerce:
          commerceResult.status === "fulfilled" ? commerceResult.value : null,
      };
    } else {
      state = { kind: "unavailable" };
    }
  }

  return (
    <MerchantShell
      activePath="/analytics"
      locale={locale}
      pageTitle="Analytics"
      tenant={{
        organizationName: tenant.context.organization.name,
        workspaceName: tenant.context.workspace?.name ?? "No workspace",
        programmeName:
          programme?.programme?.name ??
          tenant.context.programmeGroup?.name ??
          "Programme setup required",
        role: tenant.context.membershipRole,
      }}
    >
      <main
        className="merchant-main analytics-page"
        id="main-content"
        lang="en"
        tabIndex={-1}
      >
        <AnalyticsValueTruth range={range} state={state} />
      </main>
    </MerchantShell>
  );
}
