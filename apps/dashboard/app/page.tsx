import { DashboardOverview } from "@/components/dashboard-overview";
import { redirect } from "next/navigation";
import { signOut } from "./actions";
import { parseOverviewRange } from "@/lib/overview";
import { getOverviewReport } from "@/lib/server/overview";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";

export default async function HomePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ range?: string | string[] }>;
}>) {
  const parameters = await searchParams;
  const range = parseOverviewRange(parameters.range);
  const state = await getAuthenticatedTenantState();
  if (state.kind === "unauthenticated") redirect("/login");

  if (state.kind === "unassigned") {
    return (
      <main className="access-page" id="main-content" tabIndex={-1}>
        <section className="access-card">
          <p className="login-eyebrow">Starfiniti Loyalty</p>
          <h1>No organization access</h1>
          <p>
            Your identity is valid, but it has no active organization
            membership. An owner must provision membership before tenant data is
            visible.
          </p>
          <form action={signOut}>
            <button className="secondary" type="submit">
              Sign out
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
      range={range}
      report={report}
      tenant={{
        organizationName: context.organization.name,
        workspaceName: context.workspace?.name ?? "No active workspace",
        programmeName:
          context.programmeGroup?.name ?? "Programme setup required",
        role: context.membershipRole,
      }}
    />
  );
}
