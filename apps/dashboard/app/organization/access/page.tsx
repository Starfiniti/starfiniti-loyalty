import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { MerchantShell } from "@/components/merchant-shell";
import {
  getOrganizationAccessWorkspace,
  getOrganizationTeamWorkspace,
} from "@/lib/server/enterprise-identity";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { AccessReview } from "./access-review";
import { TeamLifecycle } from "./team-lifecycle";

export default async function OrganizationAccessPage() {
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    redirect("/login?next=%2Forganization%2Faccess");
  }
  if (tenant.kind === "unassigned") redirect("/");

  let workspace = null;
  let teamWorkspace = null;
  let unavailable = false;
  try {
    [workspace, teamWorkspace] = await Promise.all([
      getOrganizationAccessWorkspace(tenant.context.organization.public_id),
      getOrganizationTeamWorkspace(tenant.context.organization.public_id),
    ]);
  } catch {
    unavailable = true;
  }

  return (
    <MerchantShell
      activePath="/organization/access"
      locale="en"
      pageTitle="Team & access"
      tenant={{
        organizationName: tenant.context.organization.name,
        workspaceName: tenant.context.workspace?.name ?? "No workspace",
        programmeName:
          tenant.context.programmeGroup?.name ?? "Programme setup required",
        role: tenant.context.membershipRole,
      }}
    >
      <main
        className="merchant-main enterprise-access-page"
        id="main-content"
        lang="en"
        tabIndex={-1}
      >
        {workspace ? (
          <>
            <AccessReview workspace={workspace} />
            {teamWorkspace ? <TeamLifecycle workspace={teamWorkspace} /> : null}
          </>
        ) : (
          <section
            className="access-unavailable"
            role={unavailable ? "alert" : "status"}
          >
            <LockKeyhole aria-hidden="true" />
            <div>
              <h1>Access review unavailable</h1>
              <p>
                {unavailable
                  ? "The live access projection could not be verified. No tenant identity data was shown."
                  : "A live organization membership is required. Email, domain, and SSO claims cannot grant access."}
              </p>
            </div>
          </section>
        )}
      </main>
    </MerchantShell>
  );
}
