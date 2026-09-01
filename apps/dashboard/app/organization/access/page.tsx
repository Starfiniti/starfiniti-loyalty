import { redirect } from "next/navigation";
import { LockKeyhole, TriangleAlert } from "lucide-react";
import { MerchantShell } from "@/components/merchant-shell";
import {
  getAgencyPortfolioWorkspace,
  getOrganizationRecoveryWorkspace,
  getSupportAdministrationWorkspace,
} from "@/lib/server/enterprise-administration";
import {
  getOrganizationAccessWorkspace,
  getOrganizationFederationWorkspace,
  getOrganizationTeamWorkspace,
} from "@/lib/server/enterprise-identity";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { getOrganizationScimWorkspace } from "@/lib/server/scim-management";
import { AccessReview } from "./access-review";
import { AgencySupportLifecycle } from "./agency-support-lifecycle";
import { FederationLifecycle } from "./federation-lifecycle";
import { RecoveryLifecycle } from "./recovery-lifecycle";
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
  let agencyWorkspace = null;
  let supportWorkspace = null;
  let recoveryWorkspace = null;
  let identityControlsUnavailable = false;
  let unavailable = false;
  try {
    workspace = await getOrganizationAccessWorkspace(
      tenant.context.organization.public_id,
    );
    if (workspace) {
      const [
        teamResult,
        federationResult,
        scimResult,
        agencyResult,
        supportResult,
        recoveryResult,
      ] = await Promise.allSettled([
        getOrganizationTeamWorkspace(tenant.context.organization.public_id),
        getOrganizationFederationWorkspace(
          tenant.context.organization.public_id,
        ),
        getOrganizationScimWorkspace(tenant.context.organization.public_id),
        getAgencyPortfolioWorkspace(tenant.context.organization.public_id),
        getSupportAdministrationWorkspace(
          tenant.context.organization.public_id,
        ),
        getOrganizationRecoveryWorkspace(tenant.context.organization.public_id),
      ]);
      const mayReviewDirectory = ["owner", "admin", "auditor"].includes(
        workspace.currentAccess.role,
      );
      if (teamResult.status === "fulfilled") teamWorkspace = teamResult.value;
      if (federationResult.status === "fulfilled") {
        federationWorkspace = federationResult.value;
      }
      if (scimResult.status === "fulfilled") scimWorkspace = scimResult.value;
      if (agencyResult.status === "fulfilled") {
        agencyWorkspace = agencyResult.value;
      }
      if (supportResult.status === "fulfilled") {
        supportWorkspace = supportResult.value;
      }
      if (recoveryResult.status === "fulfilled") {
        recoveryWorkspace = recoveryResult.value;
      }
      identityControlsUnavailable =
        federationResult.status === "rejected" ||
        federationResult.value === null ||
        (mayReviewDirectory &&
          (teamResult.status === "rejected" ||
            teamResult.value === null ||
            scimResult.status === "rejected" ||
            scimResult.value === null ||
            agencyResult.status === "rejected" ||
            agencyResult.value === null ||
            supportResult.status === "rejected" ||
            supportResult.value === null ||
            recoveryResult.status === "rejected" ||
            recoveryResult.value === null));
    }
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
            {identityControlsUnavailable ? (
              <section className="access-partial-unavailable" role="status">
                <TriangleAlert aria-hidden="true" />
                <div>
                  <h2>Some identity controls are temporarily unavailable</h2>
                  <p>
                    Existing memberships remain authoritative. Retry before
                    making a team, agency, support, recovery, SSO, or directory
                    access decision.
                  </p>
                </div>
              </section>
            ) : null}
            {teamWorkspace ? <TeamLifecycle workspace={teamWorkspace} /> : null}
            {agencyWorkspace && supportWorkspace ? (
              <AgencySupportLifecycle
                portfolio={agencyWorkspace}
                support={supportWorkspace}
              />
            ) : null}
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
            {recoveryWorkspace ? (
              <RecoveryLifecycle workspace={recoveryWorkspace} />
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
