import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Crown, ShieldCheck } from "lucide-react";
import { MerchantShell } from "@/components/merchant-shell";
import { TierProgress } from "@/components/tier-progress";
import {
  merchantIntlLocale,
  merchantLocalePath,
  merchantText,
  resolveMerchantLocale,
  type MerchantLocale,
} from "@/lib/merchant-locale";
import {
  getCustomerAdjustmentContext,
  getCustomerDetail,
  getCustomerTierProgress,
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

function formatDate(value: string, locale: MerchantLocale): string {
  return new Intl.DateTimeFormat(merchantIntlLocale(locale), {
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
  searchParams: Promise<{
    activity?: string | string[];
    lang?: string | string[];
  }>;
}) {
  const tenant = await getAuthenticatedTenantState();
  const { customerId } = await params;
  const resolvedParams = await searchParams;
  const locale = resolveMerchantLocale(resolvedParams.lang);
  const t = (source: string) => merchantText(locale, source);
  const activityFilter = parseCustomerActivityFilter(resolvedParams.activity);
  if (tenant.kind === "unauthenticated") {
    const target = merchantLocalePath(`/customers/${customerId}`, locale);
    redirect(
      merchantLocalePath(`/login?next=${encodeURIComponent(target)}`, locale),
    );
  }
  if (tenant.kind === "unassigned") redirect(merchantLocalePath("/", locale));

  const asOf = new Date().toISOString();
  const [detail, adjustmentContext, programmeState, tierState, tierProgress] =
    await Promise.all([
      getCustomerDetail(tenant.context, customerId),
      getCustomerAdjustmentContext(tenant.context, customerId),
      getMerchantProgrammeState(tenant.context),
      getCustomerTierState(tenant.context, customerId),
      getCustomerTierProgress(tenant.context, customerId, asOf),
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
    <MerchantShell
      locale={locale}
      pageTitle="Customer detail"
      tenant={{
        organizationName: tenant.context.organization.name,
        workspaceName: tenant.context.workspace?.name ?? t("No workspace"),
        programmeName:
          programmeState.programme?.name ?? t("Programme setup required"),
        role: tenant.context.membershipRole,
      }}
    >
      <main
        className="merchant-main customer-page"
        id="main-content"
        lang={locale}
        tabIndex={-1}
      >
        <div className="customer-heading detail-heading">
          <div>
            <Link
              className="back-link"
              href={merchantLocalePath("/customers", locale)}
            >
              <ArrowLeft aria-hidden="true" /> {t("Back to customers")}
            </Link>
            <h1>{detail.customer.displayReference}</h1>
            <p>
              {detail.customer.identityKind ?? t("Unlinked")} ·{" "}
              {detail.customer.maskedExternalId ?? t("No channel ID")} ·{" "}
              {detail.customer.status}
            </p>
          </div>
          <span className="privacy-badge">
            <ShieldCheck aria-hidden="true" /> {t("Tenant scoped")}
          </span>
        </div>

        <section className="balance-grid" aria-label={t("Wallet balances")}>
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
              <span>{t(bucket)}</span>
              <strong>{formatPointText(points, locale)}</strong>
              <small>{t("points")}</small>
            </article>
          ))}
        </section>

        {tierProgress ? (
          <TierProgress
            availablePoints={detail.balances.available}
            mode="merchant"
            progress={tierProgress}
          />
        ) : (
          <section
            className="customer-panel tier-panel"
            aria-labelledby="tier-title"
          >
            <div className="customer-result-heading">
              <div>
                <Crown aria-hidden="true" />
                <strong id="tier-title">{t("Tier qualification")}</strong>
              </div>
              <span>{t("Current immutable decision")}</span>
            </div>
            {tierState?.tierCode ? (
              <dl className="tier-detail-grid">
                <div>
                  <dt>{t("Effective tier")}</dt>
                  <dd>{tierState.tierName ?? tierState.tierCode}</dd>
                </div>
                <div>
                  <dt>{t("Qualified tier")}</dt>
                  <dd>
                    {tierState.qualifiedTierName ??
                      tierState.qualifiedTierCode ??
                      t("Not recorded")}
                  </dd>
                </div>
                <div>
                  <dt>{t("Decision")}</dt>
                  <dd>{label(tierState.transition ?? "none")}</dd>
                </div>
                <div>
                  <dt>{t("Rolling eligible spend")}</dt>
                  <dd>
                    {tierState.rollingEligibleSpendMinor
                      ? `${formatPointText(tierState.rollingEligibleSpendMinor, locale)} ${t("minor units")}`
                      : t("Not recorded")}
                  </dd>
                </div>
                <div>
                  <dt>{t("Effective since")}</dt>
                  <dd>
                    {tierState.effectiveFrom
                      ? formatDate(tierState.effectiveFrom, locale)
                      : t("Not recorded")}
                  </dd>
                </div>
                <div>
                  <dt>{t("Grace until")}</dt>
                  <dd>
                    {tierState.graceUntil
                      ? formatDate(tierState.graceUntil, locale)
                      : t("No active grace period")}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="empty-state">
                {t("No tier decision has been recorded for this wallet yet.")}
              </p>
            )}
          </section>
        )}

        {adjustmentContext &&
        publishedVersion &&
        tenant.context.programmeGroup ? (
          <CustomerAdjustmentForm
            availablePoints={adjustmentContext.availablePoints}
            customerId={customerId}
            locale={locale}
            programmeGroupId={tenant.context.programmeGroup.public_id}
            programmeVersionId={publishedVersion.id}
            programmeVersionNumber={publishedVersion.versionNumber}
          />
        ) : null}

        <section className="customer-panel ledger-panel">
          <div className="customer-result-heading">
            <div>
              <strong>{t("Immutable ledger history")}</strong>
            </div>
            <span>
              {visibleLedger.length} {t("of")} {detail.ledger.length}{" "}
              {t("latest entries")}
            </span>
          </div>
          <nav
            className="activity-filters"
            aria-label={t("Filter customer activity")}
          >
            {CUSTOMER_ACTIVITY_FILTERS.map((filter) => (
              <Link
                aria-current={filter === activityFilter ? "page" : undefined}
                className={filter === activityFilter ? "active" : undefined}
                href={
                  filter === "all"
                    ? merchantLocalePath(`/customers/${customerId}`, locale)
                    : merchantLocalePath(
                        `/customers/${customerId}?activity=${filter}`,
                        locale,
                      )
                }
                key={filter}
              >
                {t(activityLabel(filter))}
              </Link>
            ))}
          </nav>
          {detail.ledger.length === 0 ? (
            <p className="empty-state">
              {t("No ledger entries for this wallet.")}
            </p>
          ) : visibleLedger.length === 0 ? (
            <p className="empty-state">
              {locale === "sl-SI"
                ? `V zadnjih 100 zapisih denarnice ni vnosov za filter »${t(activityLabel(activityFilter))}«.`
                : `No ${activityLabel(activityFilter).toLowerCase()} entries appear in the latest 100 wallet records.`}
            </p>
          ) : (
            <ol className="ledger-list">
              {visibleLedger.map((item) => (
                <li key={`${item.id}-${item.points}`}>
                  <span
                    className={`ledger-points ${pointTextIsCredit(item.points) ? "credit" : "debit"}`}
                  >
                    {BigInt(item.points) > 0n ? "+" : ""}
                    {formatPointText(item.points, locale)}
                  </span>
                  <div>
                    <strong>{label(item.kind)}</strong>
                    <span>
                      {label(item.bucket)} ·{" "}
                      {item.sourceReference ?? item.actorType} · programme v
                      {item.programmeVersion ?? "?"}
                    </span>
                    <small>
                      {t("Correlation")} {item.correlationId.slice(0, 12)}…
                    </small>
                  </div>
                  <time dateTime={item.effectiveAt}>
                    {formatDate(item.effectiveAt, locale)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </MerchantShell>
  );
}
