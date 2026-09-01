import { redirect } from "next/navigation";
import { MerchantShell } from "@/components/merchant-shell";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { OrganizationOnboarding } from "../organization-onboarding";

export default async function OrganizationJoinPage() {
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    redirect("/login?next=%2Forganization%2Fjoin");
  }
  if (tenant.kind === "unassigned") redirect("/");
  return (
    <MerchantShell
      activePath="/organization/access"
      locale="en"
      pageTitle="Join organization"
      tenant={{
        organizationName: tenant.context.organization.name,
        workspaceName: tenant.context.workspace?.name ?? "No workspace",
        programmeName:
          tenant.context.programmeGroup?.name ?? "Programme setup required",
        role: tenant.context.membershipRole,
      }}
    >
      <main
        className="merchant-main organization-join-page"
        id="main-content"
        lang="en"
        tabIndex={-1}
      >
        <section className="access-hero organization-join-hero">
          <div>
            <p className="login-eyebrow">Organization access</p>
            <h1>Create or join another tenant</h1>
            <p>
              A one-use invitation plus your signed-in Auth subject creates the
              membership. Email, domain, and upstream SSO claims do not.
            </p>
          </div>
        </section>
        <OrganizationOnboarding />
      </main>
    </MerchantShell>
  );
}
