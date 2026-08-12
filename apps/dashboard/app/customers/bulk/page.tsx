import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { signOut } from "@/app/actions";
import { listCustomers } from "@/lib/server/customers";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { BulkAdjustmentForm } from "./bulk-adjustment-form";

export default async function BulkCustomerAdjustmentPage() {
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    redirect("/login?next=%2Fcustomers%2Fbulk");
  }
  if (tenant.kind === "unassigned") redirect("/");

  const [customers, programme] = await Promise.all([
    listCustomers(tenant.context),
    getMerchantProgrammeState(tenant.context),
  ]);
  const publishedVersion = programme.versions.find(
    (version) => version.status === "published",
  );
  const canAdjust = ["owner", "admin"].includes(tenant.context.membershipRole);

  return (
    <main className="customer-page" id="main-content" tabIndex={-1}>
      <header className="programme-topbar">
        <div>
          <Link className="programme-brand" href="/">
            <span aria-hidden="true">SF</span>
            Starfiniti Loyalty
          </Link>
          <p>{tenant.context.organization.name}</p>
        </div>
        <nav aria-label="Account navigation">
          <Link className="secondary" href="/customers">
            Customers
          </Link>
          <form action={signOut}>
            <button className="secondary" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <div className="customer-heading detail-heading">
        <div>
          <Link className="back-link" href="/customers">
            <ArrowLeft aria-hidden="true" /> Back to customers
          </Link>
          <h1>Bulk point adjustment</h1>
          <p>
            Apply one controlled credit or compensating debit to 2–50 customers
            only after an authoritative dry run. Every customer receives a
            separate immutable, attributable ledger transaction.
          </p>
        </div>
        <span className="privacy-badge">
          <ShieldCheck aria-hidden="true" /> Exact approval required
        </span>
      </div>

      <section className="customer-panel bulk-adjustment-panel">
        {!canAdjust ? (
          <div className="empty-state">
            <h2>Read-only customer access</h2>
            <p>
              Your {tenant.context.membershipRole} role cannot preview or
              execute bulk value changes. Organization owners and admins retain
              this responsibility.
            </p>
          </div>
        ) : !tenant.context.programmeGroup || !publishedVersion ? (
          <div className="empty-state">
            <h2>A published programme is required</h2>
            <p>
              Publish the current loyalty programme before attributing new bulk
              ledger transactions to it.
            </p>
          </div>
        ) : (
          <BulkAdjustmentForm
            customers={customers
              .filter((customer) => customer.walletStatus === "active")
              .map((customer) => ({
                id: customer.id,
                displayReference: customer.displayReference,
                availablePoints: customer.availablePoints,
              }))}
            programmeGroupId={tenant.context.programmeGroup.public_id}
            programmeVersionId={publishedVersion.id}
            programmeVersionNumber={publishedVersion.versionNumber}
          />
        )}
      </section>
    </main>
  );
}
