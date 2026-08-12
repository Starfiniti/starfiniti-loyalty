import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { signOut } from "@/app/actions";
import {
  getCustomerAdjustmentContext,
  getCustomerDetail,
} from "@/lib/server/customers";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { CustomerAdjustmentForm } from "./adjustment-form";
import { formatPointText, pointTextIsCredit } from "@/lib/customers";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Ljubljana",
  }).format(new Date(value));
}

function label(value: string): string {
  return value.replaceAll("_", " ");
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const tenant = await getAuthenticatedTenantState();
  const { customerId } = await params;
  if (tenant.kind === "unauthenticated") {
    redirect(`/login?next=${encodeURIComponent(`/customers/${customerId}`)}`);
  }
  if (tenant.kind === "unassigned") redirect("/");

  const [detail, adjustmentContext, programmeState] = await Promise.all([
    getCustomerDetail(tenant.context, customerId),
    getCustomerAdjustmentContext(tenant.context, customerId),
    getMerchantProgrammeState(tenant.context),
  ]);
  if (!detail) notFound();
  const publishedVersion = programmeState.versions.find(
    (version) => version.status === "published",
  );

  return (
    <main className="customer-page">
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
          <h1>{detail.customer.displayReference}</h1>
          <p>
            {detail.customer.identityKind ?? "Unlinked"} ·{" "}
            {detail.customer.maskedExternalId ?? "No channel ID"} ·{" "}
            {detail.customer.status}
          </p>
        </div>
        <span className="privacy-badge">
          <ShieldCheck aria-hidden="true" /> Tenant scoped
        </span>
      </div>

      <section className="balance-grid" aria-label="Wallet balances">
        {(
          [
            ["Available", detail.balances.available],
            ["Pending", detail.balances.pending],
            ["Reserved", detail.balances.reserved],
            ["Spent", detail.balances.spent],
            ["Expired", detail.balances.expired],
            ["Reversed", detail.balances.reversed],
          ] as const
        ).map(([bucket, points]) => (
          <article className="balance-card" key={bucket}>
            <span>{bucket}</span>
            <strong>{formatPointText(points)}</strong>
            <small>points</small>
          </article>
        ))}
      </section>

      {adjustmentContext &&
      publishedVersion &&
      tenant.context.programmeGroup ? (
        <CustomerAdjustmentForm
          availablePoints={adjustmentContext.availablePoints}
          customerId={customerId}
          programmeGroupId={tenant.context.programmeGroup.public_id}
          programmeVersionId={publishedVersion.id}
          programmeVersionNumber={publishedVersion.versionNumber}
        />
      ) : null}

      <section className="customer-panel ledger-panel">
        <div className="customer-result-heading">
          <div>
            <strong>Immutable ledger history</strong>
          </div>
          <span>Latest 100 wallet entries</span>
        </div>
        {detail.ledger.length === 0 ? (
          <p className="empty-state">No ledger entries for this wallet.</p>
        ) : (
          <ol className="ledger-list">
            {detail.ledger.map((item) => (
              <li key={`${item.id}-${item.points}`}>
                <span
                  className={`ledger-points ${pointTextIsCredit(item.points) ? "credit" : "debit"}`}
                >
                  {BigInt(item.points) > 0n ? "+" : ""}
                  {formatPointText(item.points)}
                </span>
                <div>
                  <strong>{label(item.kind)}</strong>
                  <span>
                    {label(item.bucket)} ·{" "}
                    {item.sourceReference ?? item.actorType} · programme v
                    {item.programmeVersion ?? "?"}
                  </span>
                  <small>Correlation {item.correlationId.slice(0, 12)}…</small>
                </div>
                <time dateTime={item.effectiveAt}>
                  {formatDate(item.effectiveAt)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
