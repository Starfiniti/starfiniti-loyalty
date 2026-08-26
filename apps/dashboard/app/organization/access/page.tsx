import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { MerchantShell } from "@/components/merchant-shell";
import {
  getOrganizationAccessWorkspace,
  getOrganizationFederationWorkspace,
  getOrganizationTeamWorkspace,
} from "@/lib/server/enterprise-identity";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { getOrganizationScimWorkspace } from "@/lib/server/scim-management";
import { AccessReview } from "./access-review";
import { FederationLifecycle } from "./federation-lifecycle";
import { ScimLifecycle } from "./scim-lifecycle";
import { TeamLifecycle } from "./team-lifecycle";

export default async function OrganizationAccessPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ federationLink?: string }>;
}>) {
  const query = await searchParams;
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    redirect("/login?next=%2Forganization%2Faccess");
  }
  if (tenant.kind === "unassigned") redirect("/");

  let workspace = null;
  let teamWorkspace = null;
  let federationWorkspace = null;
  let scimWorkspace = null;
  let unavailable = false;
  try {
    workspace = await getOrganizationAccessWorkspace(
      tenant.context.organization.public_id,
    );
    const [teamResult, federationResult, scimResult] = await Promise.allSettled(
      [
        getOrganizationTeamWorkspace(tenant.context.organization.public_id),
        getOrganizationFederationWorkspace(
          tenant.context.organization.public_id,
        ),
        getOrganizationScimWorkspace(tenant.context.organization.public_id),
      ],
    );
    if (teamResult.status === "fulfilled") teamWorkspace = teamResult.value;
    if (federationResult.status === "fulfilled") {
      federationWorkspace = federationResult.value;
    }
    if (scimResult.status === "fulfilled") scimWorkspace = scimResult.value;
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
            {federationWorkspace ? (
              <FederationLifecycle
                linkOutcome={
                  query.federationLink === "success" ||
                  query.federationLink === "failed"
                    ? query.federationLink
                    : null
                }
                workspace={federationWorkspace}
              />
            ) : null}
            {scimWorkspace && federationWorkspace ? (
              <ScimLifecycle
                federationSources={federationWorkspace.sources}
                workspace={scimWorkspace}
              />
            ) : null}
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
