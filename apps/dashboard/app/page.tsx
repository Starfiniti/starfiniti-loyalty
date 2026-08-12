import { DashboardOverview } from "@/components/dashboard-overview";
import { redirect } from "next/navigation";
import { signOut } from "./actions";
import { parseOverviewRange } from "@/lib/overview";
import { getOverviewReport } from "@/lib/server/overview";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import {
  merchantLocalePath,
  merchantText,
  resolveMerchantLocale,
} from "@/lib/merchant-locale";

export default async function HomePage({
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
  const text = (source: string) => merchantText(locale, source);
  const state = await getAuthenticatedTenantState();
  if (state.kind === "unauthenticated") {
    redirect(merchantLocalePath("/login", locale));
  }

  if (state.kind === "unassigned") {
    return (
      <main
        className="access-page"
        id="main-content"
        lang={locale}
        tabIndex={-1}
      >
        <section className="access-card">
          <p className="login-eyebrow">Starfiniti Loyalty</p>
          <h1>{text("No organization access")}</h1>
          <p>
            {text(
              "Your identity is valid, but it has no active organization membership. An owner must provision membership before tenant data is visible.",
            )}
          </p>
          <form action={signOut}>
            <input name="lang" type="hidden" value={locale} />
            <button className="secondary" type="submit">
              {text("Sign out")}
            </button>
          </form>
        </section>
      </main>
    );
  }

  const { context } = state;
  const report = await getOverviewReport(context, range);
  return (
    <DashboardOverview
      locale={locale}
      range={range}
      report={report}
      tenant={{
        organizationName: context.organization.name,
        workspaceName: context.workspace?.name ?? text("No active workspace"),
        programmeName:
          context.programmeGroup?.name ?? text("Programme setup required"),
        role: context.membershipRole,
      }}
    />
  );
}
