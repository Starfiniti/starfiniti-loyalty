import { redirect } from "next/navigation";

import { MerchantShell } from "@/components/merchant-shell";
import { getBillingSummary } from "@/lib/server/billing";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";

import { BillingOverview } from "./billing-overview";

export default async function BillingPage() {
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    redirect("/login?next=%2Fbilling");
  }
  if (tenant.kind === "unassigned") redirect("/");

  let summary = null;
  try {
    summary = await getBillingSummary(tenant.context.organization.public_id);
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
        <BillingOverview summary={summary} />
      </main>
    </MerchantShell>
  );
}
