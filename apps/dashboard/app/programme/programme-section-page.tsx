import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MerchantShell } from "@/components/merchant-shell";
import {
  merchantLocalePath,
  merchantText,
  resolveMerchantLocale,
} from "@/lib/merchant-locale";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { ProgrammeEditor, type ProgrammeEditorMode } from "./programme-editor";

const sectionCopy: Record<
  ProgrammeEditorMode,
  Readonly<{ title: string; eyebrow: string; description: string }>
> = {
  earning: {
    title: "Earning rules",
    eyebrow: "How members earn",
    description:
      "Set clear purchase earning rates for every VIP tier and preview the exact points awarded on an example order.",
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

  const state = await getMerchantProgrammeState(tenant.context);
  if (!state.programme) redirect(merchantLocalePath("/programme", locale));

  const canEdit = ["owner", "admin"].includes(tenant.context.membershipRole);
  const baseline =
    state.versions.find((version) => version.status === "draft") ??
    state.versions.find((version) => version.status === "published") ??
    state.versions[0];
  const copy = sectionCopy[mode];

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

        <ProgrammeEditor
          canEdit={canEdit}
          initialConfiguration={baseline?.configuration}
          locale={locale}
          mode={mode}
          operationId={crypto.randomUUID()}
          programmeId={state.programme.id}
        />
      </main>
    </MerchantShell>
  );
}
