import {
  BarChart3,
  CalendarDays,
  Megaphone,
  ShieldAlert,
  Target,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { MerchantShell } from "@/components/merchant-shell";
import { hasEntitlement } from "@/lib/entitlements";
import {
  merchantLocalePath,
  resolveMerchantLocale,
} from "@/lib/merchant-locale";
import { getCampaignWorkspace } from "@/lib/server/campaigns";
import { getEntitlementSnapshot } from "@/lib/server/entitlements";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { AudienceBuilder, CampaignBuilder } from "./campaign-builders";
import {
  AudienceCatalogue,
  CampaignCalendar,
  CampaignCatalogue,
  CampaignResults,
} from "./campaign-operations";

export default async function CampaignsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ lang?: string | string[] }>;
}>) {
  const locale = resolveMerchantLocale((await searchParams).lang);
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    const path = merchantLocalePath("/campaigns", locale);
    redirect(
      merchantLocalePath(`/login?next=${encodeURIComponent(path)}`, locale),
    );
  }
  if (tenant.kind === "unassigned") redirect(merchantLocalePath("/", locale));

  const programme = await getMerchantProgrammeState(tenant.context);
  const programmeId = programme.programme?.id ?? null;
  const [workspaceResult, entitlementResult] = programmeId
    ? await Promise.allSettled([
        getCampaignWorkspace(tenant.context, programmeId),
        getEntitlementSnapshot(tenant.context),
      ])
    : [null, null];
  const workspace =
    workspaceResult?.status === "fulfilled" ? workspaceResult.value : null;
  const campaignsEnabled =
    entitlementResult?.status === "fulfilled"
      ? hasEntitlement(entitlementResult.value, "campaigns")
      : false;
  const role = tenant.context.membershipRole;
  const canAuthor = role === "owner" || role === "admin";
  const canPreview = canAuthor || role === "operator";
  const canPause = canPreview;
  const canCancel = canAuthor;
  const snapshots =
    workspace?.audiences.flatMap((audience) => audience.snapshots) ?? [];

  return (
    <MerchantShell
      activePath="/campaigns"
      locale={locale}
      pageTitle="Campaigns"
      tenant={{
        organizationName: tenant.context.organization.name,
        workspaceName: tenant.context.workspace?.name ?? "No workspace",
        programmeName: programme.programme?.name ?? "Programme setup required",
        role,
      }}
    >
      <main
        className="merchant-main customer-page campaigns-page"
        id="main-content"
        lang={locale}
        tabIndex={-1}
      >
        <div className="customer-heading campaigns-heading">
          <div>
            <p className="login-eyebrow">
              Audiences, campaigns &amp; liability
            </p>
            <h1>Campaign command center</h1>
            <p>
              Build allowlisted audiences, freeze eligibility, approve bounded
              campaign value, control schedules, and reconcile every result to
              canonical facts.
            </p>
          </div>
          <span className="campaigns-heading-icon" aria-hidden="true">
            <Megaphone />
          </span>
        </div>

        <nav aria-label="Campaign workspace" className="campaign-jump-nav">
          <a href="#audience-builder">
            <Users aria-hidden="true" /> Audiences
          </a>
          <a href="#campaign-builder">
            <Target aria-hidden="true" /> Builder
          </a>
          <a href="#campaign-calendar">
            <CalendarDays aria-hidden="true" /> Calendar
          </a>
          <a href="#campaign-results">
            <BarChart3 aria-hidden="true" /> Results
          </a>
        </nav>

        {!campaignsEnabled ? (
          <section className="campaign-rollout-notice" role="status">
            <ShieldAlert aria-hidden="true" />
            <div>
              <strong>New campaign value is disabled for this tenant</strong>
              <p>
                Authoring, preview, approval, and new snapshots are unavailable.
                Existing definitions, accepted schedules, pause/cancel controls,
                and canonical results remain visible.
              </p>
            </div>
          </section>
        ) : null}

        {!programmeId ? (
          <section className="campaign-panel campaign-empty-state">
            <Megaphone aria-hidden="true" />
            <h2>Programme setup required</h2>
            <p>
              Create and publish a loyalty programme before building campaigns.
            </p>
          </section>
        ) : !workspace?.catalogueAvailable ? (
          <section
            className="campaign-panel campaign-read-warning"
            role="status"
          >
            <ShieldAlert aria-hidden="true" />
            <div>
              <strong>Campaign catalogue temporarily unavailable</strong>
              <p>
                Existing loyalty value is unaffected. Results remain
                independently available when their protected projection is
                healthy.
              </p>
            </div>
          </section>
        ) : (
          <>
            <AudienceBuilder
              canAuthor={canAuthor}
              enabled={campaignsEnabled}
              programmeId={programmeId}
              templates={workspace.audiences}
            />
            <AudienceCatalogue
              audiences={workspace.audiences}
              canAuthor={canAuthor}
              canSnapshot={canPreview}
              enabled={campaignsEnabled}
            />
            <CampaignBuilder
              canAuthor={canAuthor}
              enabled={campaignsEnabled}
              programmeId={programmeId}
              rewards={workspace.rewards}
              snapshots={snapshots}
              templates={workspace.campaigns}
            />
            <CampaignCalendar campaigns={workspace.campaigns} />
            <CampaignCatalogue
              campaigns={workspace.campaigns}
              canApprove={canAuthor}
              canCancel={canCancel}
              canPause={canPause}
              canPreview={canPreview}
              enabled={campaignsEnabled}
            />
          </>
        )}
        {programmeId ? (
          <CampaignResults
            available={workspace?.resultsAvailable ?? false}
            results={workspace?.results ?? []}
          />
        ) : null}
      </main>
    </MerchantShell>
  );
}
