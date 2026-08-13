import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MerchantShell } from "@/components/merchant-shell";
import {
  merchantLocalePath,
  merchantText,
  resolveMerchantLocale,
} from "@/lib/merchant-locale";
import { hasEntitlement } from "@/lib/entitlements";
import { getEntitlementSnapshot } from "@/lib/server/entitlements";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getRewardFulfilmentState } from "@/lib/server/reward-fulfilment";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { EarningRulesEditor } from "./earning-rules-editor";
import { ExpandedRewardsEditor } from "./expanded-rewards-editor";
import { ProgrammeEditor, type ProgrammeEditorMode } from "./programme-editor";
import { RewardFulfilmentQueue } from "./reward-fulfilment-queue";

const sectionCopy: Record<
  ProgrammeEditorMode,
  Readonly<{ title: string; eyebrow: string; description: string }>
> = {
  earning: {
    title: "Earning rules",
    eyebrow: "How members earn",
    description:
      "Build purchase rates, multipliers, fixed bonuses, lifecycle activities, eligibility conditions, exclusions, and hard value caps.",
  },
  rewards: {
    title: "Rewards catalogue",
    eyebrow: "How members redeem",
    description:
      "Build the WooCommerce-ready rewards members can claim, with exact points cost, value, and coupon validity.",
  },
  tiers: {
    title: "VIP tiers",
    eyebrow: "Member progression",
    description:
      "Shape the tier ladder with clear names and non-overlapping spend thresholds, then preview member qualification.",
  },
};

export async function ProgrammeSectionPage({
  mode,
  searchParams,
}: Readonly<{
  mode: ProgrammeEditorMode;
  searchParams: Promise<{ lang?: string | string[] }>;
}>) {
  const locale = resolveMerchantLocale((await searchParams).lang);
  const t = (source: string) => merchantText(locale, source);
  const path =
    mode === "earning"
      ? "/programme/earning-rules"
      : mode === "rewards"
        ? "/programme/rewards"
        : "/programme/vip-tiers";
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    const sectionPath = merchantLocalePath(path, locale);
    redirect(
      merchantLocalePath(
        `/login?next=${encodeURIComponent(sectionPath)}`,
        locale,
      ),
    );
  }
  if (tenant.kind === "unassigned") redirect(merchantLocalePath("/", locale));

  const entitlements =
    mode === "earning" || mode === "rewards"
      ? await getEntitlementSnapshot(tenant.context)
      : null;
  if (mode === "earning") {
    if (!entitlements) redirect(merchantLocalePath("/programme", locale));
    if (!hasEntitlement(entitlements, "programme.v2")) {
      redirect(merchantLocalePath("/programme", locale));
    }
  }
  const expandedRewardsEnabled =
    mode === "rewards" &&
    entitlements !== null &&
    hasEntitlement(entitlements, "rewards.expanded");

  const state = await getMerchantProgrammeState(tenant.context);
  if (!state.programme) redirect(merchantLocalePath("/programme", locale));

  const canEdit = ["owner", "admin"].includes(tenant.context.membershipRole);
  const baseline =
    state.versions.find((version) => version.status === "draft") ??
    state.versions.find((version) => version.status === "published") ??
    state.versions[0];
  const copy = sectionCopy[mode];
  const fulfilment = expandedRewardsEnabled
    ? await getRewardFulfilmentState(state.programme.id)
    : null;
  const canOperate = ["owner", "admin", "operator"].includes(
    tenant.context.membershipRole,
  );

  return (
    <MerchantShell
      activePath={path}
      locale={locale}
      pageTitle={copy.title}
      tenant={{
        organizationName: tenant.context.organization.name,
        workspaceName: tenant.context.workspace?.name ?? t("No workspace"),
        programmeName: state.programme.name,
        role: tenant.context.membershipRole,
      }}
    >
      <main
        className="merchant-main programme-page programme-section-page"
        id="main-content"
        lang={locale}
        tabIndex={-1}
      >
        <div className="programme-heading programme-section-heading">
          <div>
            <Link
              className="programme-back-link"
              href={merchantLocalePath("/programme", locale)}
            >
              <ArrowLeft aria-hidden="true" /> Programme overview
            </Link>
            <p className="login-eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
          </div>
          <div className="programme-heading-status">
            <span className={`status-pill ${baseline?.status ?? "draft"}`}>
              {baseline?.status ?? "No version"}
            </span>
            <small>
              {baseline
                ? `Editing from version ${baseline.versionNumber}`
                : "Starting the first draft"}
            </small>
          </div>
        </div>

        {mode === "earning" ? (
          <EarningRulesEditor
            canEdit={canEdit}
            initialConfiguration={baseline?.configuration}
            operationId={crypto.randomUUID()}
            programmeId={state.programme.id}
            simulationOccurredAt={new Date().toISOString()}
          />
        ) : mode === "rewards" && expandedRewardsEnabled ? (
          <>
            <ExpandedRewardsEditor
              canEdit={canEdit}
              initialConfiguration={baseline?.configuration}
              operationId={crypto.randomUUID()}
              programmeId={state.programme.id}
            />
            {fulfilment ? (
              <RewardFulfilmentQueue
                asOf={new Date().toISOString()}
                canOperate={canOperate}
                cases={fulfilment.cases}
                operations={fulfilment.cases.map((item) => ({
                  caseId: item.caseId,
                  startOperationId: crypto.randomUUID(),
                  resolveOperationId: crypto.randomUUID(),
                }))}
                summary={fulfilment.summary}
              />
            ) : null}
          </>
        ) : (
          <ProgrammeEditor
            canEdit={canEdit}
            initialConfiguration={baseline?.configuration}
            locale={locale}
            mode={mode}
            operationId={crypto.randomUUID()}
            programmeId={state.programme.id}
          />
        )}
      </main>
    </MerchantShell>
  );
}
