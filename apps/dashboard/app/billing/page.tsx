import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import type { ManagedBillingPlanOptionV1 } from "@starfiniti/contracts";
import type { Metadata } from "next";

import { MerchantShell } from "@/components/merchant-shell";
import {
  getBillingSummary,
  getManagedBillingUsageSummary,
} from "@/lib/server/billing";
import { listManagedBillingPlans } from "@/lib/server/managed-billing-sessions";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";

import { BillingOverview } from "./billing-overview";
import { startManagedBillingSessionAction } from "./actions";

export const metadata: Metadata = {
  title: "Billing & plan · Starfiniti Loyalty",
};

export default async function BillingPage() {
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    redirect("/login?next=%2Fbilling");
  }
  if (tenant.kind === "unassigned") redirect("/");

  let summary = null;
  let usageSummary = null;
  let plans: readonly ManagedBillingPlanOptionV1[] = [];
  try {
    summary = await getBillingSummary(tenant.context.organization.public_id);
    if (summary.deploymentMode === "managed") {
      try {
        usageSummary = await getManagedBillingUsageSummary(
          tenant.context.organization.public_id,
        );
      } catch {
        // Usage health is independent from commercial authority and value paths.
      }
    }
    if (
      summary.deploymentMode === "managed" &&
      tenant.context.membershipRole === "owner"
    ) {
      plans = await listManagedBillingPlans(
        tenant.userId,
        tenant.context.organization.public_id,
      );
    }
  } catch {
    // Fail closed: never infer a commercial state from claims or stale UI data.
  }

  return (
    <MerchantShell
      activePath="/billing"
      locale="en"
      pageTitle="Billing & plan"
      tenant={{
        organizationName: tenant.context.organization.name,
        workspaceName: tenant.context.workspace?.name ?? "No workspace",
        programmeName:
          tenant.context.programmeGroup?.name ?? "Programme setup required",
        role: tenant.context.membershipRole,
      }}
    >
      <main
        className="merchant-main billing-page"
        id="main-content"
        lang="en"
        tabIndex={-1}
      >
        <BillingOverview
          organizationId={tenant.context.organization.public_id}
          plans={plans}
          portalOperationId={randomUUID()}
          startSessionAction={startManagedBillingSessionAction}
          summary={summary}
          usageSummary={usageSummary}
          canManage={tenant.context.membershipRole === "owner"}
        />
      </main>
    </MerchantShell>
  );
}
