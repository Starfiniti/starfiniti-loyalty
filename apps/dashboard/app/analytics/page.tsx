import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { AnalyticsValueTruth } from "@/components/analytics-value-truth";
import { AnalyticsExportOperations } from "@/components/analytics-export-operations";
import { hasEntitlement } from "@/lib/entitlements";
import {
  merchantLocalePath,
  resolveMerchantLocale,
} from "@/lib/merchant-locale";
import { parseOverviewRange } from "@/lib/overview";
import {
  analyticsReportsShareSnapshot,
  analyticsSnapshotFreshness,
} from "@/lib/analytics";
import {
  getAnalyticsCohortRetentionReport,
  getAnalyticsCommercePerformanceReport,
  getAnalyticsProgrammeOutcomeReport,
  getAnalyticsValueTruthReport,
} from "@/lib/server/analytics";
import { getAnalyticsExportWorkspace } from "@/lib/server/analytics-exports";
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
  let exportWorkspace: Awaited<ReturnType<typeof getAnalyticsExportWorkspace>> =
    null;
  if (!hasScope) {
    state = { kind: "setup_required" };
  } else if (!analyticsEnabled) {
    state = { kind: "disabled" };
  } else {
    const targetAsOf = new Date().toISOString();
    const [valueResult, commerceResult, outcomeResult, cohortResult] =
      await Promise.allSettled([
        getAnalyticsValueTruthReport(tenant.context, range, targetAsOf),
        getAnalyticsCommercePerformanceReport(
          tenant.context,
          range,
          targetAsOf,
        ),
        getAnalyticsProgrammeOutcomeReport(tenant.context, range, targetAsOf),
        getAnalyticsCohortRetentionReport(tenant.context, range, targetAsOf),
      ]);
    const reports = [
      valueResult.status === "fulfilled" ? valueResult.value : null,
      commerceResult.status === "fulfilled" ? commerceResult.value : null,
      outcomeResult.status === "fulfilled" ? outcomeResult.value : null,
      cohortResult.status === "fulfilled" ? cohortResult.value : null,
    ].filter((report) => report !== null);
    const sharedSnapshot = analyticsReportsShareSnapshot(
      reports.map((report) => report.asOf),
    );
    const freshness =
      valueResult.status === "fulfilled" && valueResult.value
        ? analyticsSnapshotFreshness(
            valueResult.value.asOf,
            new Date().toISOString(),
          )
        : "invalid";
    if (
      valueResult.status === "fulfilled" &&
      valueResult.value &&
      sharedSnapshot &&
      freshness !== "invalid"
    ) {
      state = {
        kind: "ready",
        freshness,
        report: valueResult.value,
        commerce:
          commerceResult.status === "fulfilled" ? commerceResult.value : null,
        outcomes:
          outcomeResult.status === "fulfilled" ? outcomeResult.value : null,
        cohorts:
          cohortResult.status === "fulfilled" ? cohortResult.value : null,
      };
    } else {
      state = { kind: "unavailable" };
    }
    try {
      exportWorkspace = await getAnalyticsExportWorkspace(tenant.context);
    } catch {
      exportWorkspace = null;
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
        {exportWorkspace &&
        tenant.context.workspace &&
        tenant.context.programmeGroup ? (
          <AnalyticsExportOperations
            initialExportOperationId={crypto.randomUUID()}
            initialScheduleOperationId={crypto.randomUUID()}
            organizationId={tenant.context.organization.public_id}
            programmeGroupId={tenant.context.programmeGroup.public_id}
            workspace={exportWorkspace}
            workspaceId={tenant.context.workspace.public_id}
          />
        ) : state.kind === "ready" ? (
          <section
            className="analytics-module-unavailable"
            id="analytics-reports"
            role="status"
          >
            <AlertTriangle aria-hidden="true" />
            <div>
              <strong>Reporting operations are temporarily unavailable</strong>
              <p>
                On-screen reconciled analytics remain available. No export or
                schedule is implied until its private authorization state can be
                verified.
              </p>
            </div>
          </section>
        ) : null}
      </main>
    </MerchantShell>
  );
}
