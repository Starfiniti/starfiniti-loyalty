import { DashboardOverview } from "@/components/dashboard-overview";
import { redirect } from "next/navigation";
import { signOut } from "./actions";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";

export default async function HomePage() {
  const state = await getAuthenticatedTenantState();
  if (state.kind === "unauthenticated") redirect("/login");

  if (state.kind === "unassigned") {
    return (
      <main className="access-page">
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
  return (
    <DashboardOverview
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
