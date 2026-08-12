import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { getMerchantExperienceTheme } from "@/lib/server/experience-theme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { ExperienceEditor } from "./experience-editor";

export default async function ExperiencePage() {
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") redirect("/login?next=%2Fexperience");
  if (tenant.kind === "unassigned") redirect("/");

  const { context } = tenant;
  const canEdit = ["owner", "admin"].includes(context.membershipRole);
  const theme = await getMerchantExperienceTheme(context);

  return (
    <main className="experience-page" id="main-content" tabIndex={-1}>
      <header className="programme-topbar">
        <div>
          <Link className="programme-brand" href="/">
            <span aria-hidden="true">SF</span>
            Starfiniti Loyalty
          </Link>
          <p>
            {context.organization.name} ·{" "}
            {context.workspace?.name ?? "No workspace"}
          </p>
        </div>
        <nav aria-label="Account navigation">
          <Link className="secondary" href="/programme">
            Programme
          </Link>
          <Link className="secondary" href="/">
            Overview
          </Link>
          <form action={signOut}>
            <button className="secondary" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <div className="experience-heading">
        <div>
          <p className="login-eyebrow">Customer experience</p>
          <h1>Brand the loyalty wallet</h1>
          <p>
            Preview a bounded token set before it reaches hosted or WooCommerce
            customer surfaces. Value rules remain in immutable programme
            versions.
          </p>
        </div>
        <span className="role-badge">
          {theme.revision > 0
            ? `Revision ${theme.revision}`
            : "Unsaved default"}
        </span>
      </div>

      {theme.scopeReady && context.workspace && context.programmeGroup ? (
        <ExperienceEditor
          canEdit={canEdit}
          initialTheme={theme.definition}
          operationId={crypto.randomUUID()}
          programmeGroupId={context.programmeGroup.public_id}
          workspaceId={context.workspace.public_id}
        />
      ) : (
        <section className="customer-panel empty-state">
          Link an active workspace to an active programme group before saving a
          customer theme.
        </section>
      )}
    </main>
  );
}
