import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Crown, ShieldCheck } from "lucide-react";
import { signOut } from "@/app/actions";
import {
  getCustomerAdjustmentContext,
  getCustomerDetail,
  getCustomerTierState,
} from "@/lib/server/customers";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { CustomerAdjustmentForm } from "./adjustment-form";
import {
  CUSTOMER_ACTIVITY_FILTERS,
  filterCustomerActivity,
  formatPointText,
  parseCustomerActivityFilter,
  pointTextIsCredit,
  type CustomerActivityFilter,
} from "@/lib/customers";

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
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ activity?: string | string[] }>;
}) {
  const tenant = await getAuthenticatedTenantState();
  const { customerId } = await params;
  const activityFilter = parseCustomerActivityFilter(
    (await searchParams).activity,
  );
  if (tenant.kind === "unauthenticated") {
    redirect(`/login?next=${encodeURIComponent(`/customers/${customerId}`)}`);
  }
  if (tenant.kind === "unassigned") redirect("/");

  const [detail, adjustmentContext, programmeState, tierState] =
    await Promise.all([
      getCustomerDetail(tenant.context, customerId),
      getCustomerAdjustmentContext(tenant.context, customerId),
      getMerchantProgrammeState(tenant.context),
      getCustomerTierState(tenant.context, customerId),
    ]);
  if (!detail) notFound();
  const publishedVersion = programmeState.versions.find(
    (version) => version.status === "published",
  );
  const visibleLedger = filterCustomerActivity(detail.ledger, activityFilter);

  const activityLabel = (filter: CustomerActivityFilter): string =>
    ({
      all: "All activity",
      orders: "Orders & refunds",
      rewards: "Rewards",
      expiry: "Release & expiry",
      adjustments: "Adjustments",
    })[filter];

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

      <section
        className="customer-panel tier-panel"
        aria-labelledby="tier-title"
      >
        <div className="customer-result-heading">
          <div>
            <Crown aria-hidden="true" />
            <strong id="tier-title">Tier qualification</strong>
          </div>
          <span>Current immutable decision</span>
        </div>
        {tierState?.tierCode ? (
          <dl className="tier-detail-grid">
            <div>
              <dt>Effective tier</dt>
              <dd>{tierState.tierName ?? tierState.tierCode}</dd>
            </div>
            <div>
              <dt>Qualified tier</dt>
              <dd>
                {tierState.qualifiedTierName ??
                  tierState.qualifiedTierCode ??
                  "Not recorded"}
              </dd>
            </div>
            <div>
              <dt>Decision</dt>
              <dd>{label(tierState.transition ?? "none")}</dd>
            </div>
            <div>
              <dt>Rolling eligible spend</dt>
              <dd>
                {tierState.rollingEligibleSpendMinor
                  ? `${formatPointText(tierState.rollingEligibleSpendMinor)} minor units`
                  : "Not recorded"}
              </dd>
            </div>
            <div>
              <dt>Effective since</dt>
              <dd>
                {tierState.effectiveFrom
                  ? formatDate(tierState.effectiveFrom)
                  : "Not recorded"}
              </dd>
            </div>
            <div>
              <dt>Grace until</dt>
              <dd>
                {tierState.graceUntil
                  ? formatDate(tierState.graceUntil)
                  : "No active grace period"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="empty-state">
            No tier decision has been recorded for this wallet yet.
          </p>
        )}
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
          <span>
            {visibleLedger.length} of {detail.ledger.length} latest entries
          </span>
        </div>
        <nav className="activity-filters" aria-label="Filter customer activity">
          {CUSTOMER_ACTIVITY_FILTERS.map((filter) => (
            <Link
              aria-current={filter === activityFilter ? "page" : undefined}
              className={filter === activityFilter ? "active" : undefined}
              href={
                filter === "all"
                  ? `/customers/${customerId}`
                  : `/customers/${customerId}?activity=${filter}`
              }
              key={filter}
            >
              {activityLabel(filter)}
            </Link>
          ))}
        </nav>
        {detail.ledger.length === 0 ? (
          <p className="empty-state">No ledger entries for this wallet.</p>
        ) : visibleLedger.length === 0 ? (
          <p className="empty-state">
            No {activityLabel(activityFilter).toLowerCase()} entries appear in
            the latest 100 wallet records.
          </p>
        ) : (
          <ol className="ledger-list">
            {visibleLedger.map((item) => (
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
