import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import {
  getCustomerLoyaltyAccounts,
  type CustomerActivity,
  type CustomerLoyaltyAccount,
} from "@/lib/server/customer-account";
import {
  CUSTOMER_COPY,
  customerLocalePath,
  resolveCustomerLocale,
  type CustomerLocale,
} from "@/lib/customer-locale";
import { customerExportReauthenticationPath } from "@/lib/customer-export";

export default async function CustomerLoyaltyPage({
  searchParams,
}: {
  searchParams: Promise<{
    linked?: string;
    redeemed?: string;
    redemption?: string;
    lang?: string;
  }>;
}) {
  const [{ linked, redeemed, redemption, lang }, state] = await Promise.all([
    searchParams,
    getCustomerLoyaltyAccounts(),
  ]);
  if (state.kind === "unauthenticated") {
    const locale = resolveCustomerLocale(lang);
    redirect(customerLocalePath("/login?next=%2Faccount%2Floyalty", locale));
  }
  const locale = resolveCustomerLocale(lang);
  const copy = CUSTOMER_COPY[locale];

  return (
    <main className="member-page" id="main-content" tabIndex={-1}>
      <header className="member-topbar">
        <Link className="member-brand" href="/account/loyalty">
          <span aria-hidden="true">SF</span>
          Starfiniti Loyalty
        </Link>
        <form action={signOut}>
          <button className="secondary member-signout" type="submit">
            {copy.signOut}
          </button>
        </form>
      </header>
      <section className="member-content">
        {linked === "1" ? (
          <p className="member-success" role="status">
            {copy.connected}
          </p>
        ) : null}
        {redeemed === "1" ? (
          <p className="member-success" role="status">
            {copy.rewardReserved}
          </p>
        ) : null}
        {redemption ? (
          <p className="member-error" role="alert">
            {redemptionMessage(redemption, locale)}
          </p>
        ) : null}
        <div className="member-heading">
          <p>{copy.accountEyebrow}</p>
          <h1>{copy.accountTitle}</h1>
          <p>{copy.accountIntro}</p>
        </div>
        {state.accounts.length === 0 ? (
          <section className="member-empty">
            <h2>{copy.noAccountTitle}</h2>
            <p>{copy.noAccountBody}</p>
          </section>
        ) : (
          <div className="member-accounts">
            {state.accounts.map((account) => (
              <AccountCard
                account={account}
                key={account.account_id}
                locale={locale}
              />
            ))}
          </div>
        )}
        {state.accounts.length > 0 ? (
          <section className="member-empty">
            <h2>{copy.exportData}</h2>
            <p>{copy.exportDataIntro}</p>
            <Link
              className="member-public-link"
              href={customerExportReauthenticationPath(locale)}
            >
              {copy.exportData}
            </Link>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function AccountCard({
  account,
  locale,
}: {
  account: CustomerLoyaltyAccount;
  locale: CustomerLocale;
}) {
  const copy = CUSTOMER_COPY[locale];
  const ready = account.account_status === "ready";
  return (
    <article className="member-account-card">
      <div className="member-account-heading">
        <div>
          <p>{account.store_name}</p>
          <h2>{account.programme_name ?? copy.defaultProgramme}</h2>
        </div>
        <span className={ready ? "member-live" : "member-pending"}>
          {statusLabel(account.account_status, locale)}
        </span>
      </div>
      <div className="member-balance-grid">
        <section className="member-balance-primary">
          <span>{copy.availablePoints}</span>
          <strong>{formatPoints(account.available_points, locale)}</strong>
        </section>
        <section>
          <span>{copy.pending}</span>
          <strong>{formatPoints(account.pending_points, locale)}</strong>
        </section>
        <section>
          <span>{copy.reserved}</span>
          <strong>{formatPoints(account.reserved_points, locale)}</strong>
        </section>
        <section>
          <span>{copy.currentTier}</span>
          <strong>{account.tier_name ?? copy.notEvaluated}</strong>
        </section>
      </div>
      {account.next_expiry_at && account.next_expiry_points ? (
        <p className="member-expiry">
          {formatPoints(account.next_expiry_points, locale)} {copy.pointsExpire}{" "}
          {formatDate(account.next_expiry_at, locale)}.
        </p>
      ) : null}
      <div className="member-columns">
        <section>
          <h3>{copy.availableRewards}</h3>
          {account.rewards.length === 0 ? (
            <p className="member-muted">{copy.noRewards}</p>
          ) : (
            <ul className="member-list">
              {account.rewards.map((reward) => (
                <li key={reward.code}>
                  <div>
                    <strong>{reward.name}</strong>
                    <span>
                      {formatPoints(reward.costPoints, locale)}{" "}
                      {locale === "sl-SI" ? "točk" : "points"}
                    </span>
                  </div>
                  {ready && reward.affordable && isNativeReward(reward.kind) ? (
                    <Link
                      className="member-redeem"
                      href={customerLocalePath(
                        `/account/loyalty/redeem?account=${account.account_id}&reward=${encodeURIComponent(reward.code)}`,
                        locale,
                      )}
                    >
                      {copy.redeem}
                    </Link>
                  ) : (
                    <span
                      className={
                        reward.affordable
                          ? "member-affordable"
                          : "member-unavailable"
                      }
                    >
                      {reward.affordable ? copy.askStore : copy.keepEarning}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3>{copy.recentActivity}</h3>
          {account.activity.length === 0 ? (
            <p className="member-muted">{copy.noActivity}</p>
          ) : (
            <ul className="member-list member-activity">
              {account.activity.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{activityLabel(item, locale)}</strong>
                    <span>{formatDate(item.effectiveAt, locale)}</span>
                  </div>
                  <b>{formatPoints(item.points, locale)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {account.programme_id ? (
        <Link
          className="member-public-link"
          href={customerLocalePath(
            `/loyalty/${account.workspace_id}/${account.programme_id}`,
            locale,
          )}
        >
          {copy.publicDetails}
        </Link>
      ) : null}
    </article>
  );
}

function formatPoints(value: string, locale: CustomerLocale): string {
  try {
    return BigInt(value).toLocaleString(locale);
  } catch {
    return "0";
  }
}

function formatDate(value: string, locale: CustomerLocale): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? CUSTOMER_COPY[locale].unknownDate
    : new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
}

function statusLabel(status: string, locale: CustomerLocale): string {
  const copy = CUSTOMER_COPY[locale];
  if (status === "ready") return copy.live;
  if (status === "ready_without_activity") return copy.ready;
  if (status.startsWith("wallet_")) return copy.walletUnavailable;
  return copy.programmeUnavailable;
}

function activityLabel(item: CustomerActivity, locale: CustomerLocale): string {
  const copy = CUSTOMER_COPY[locale];
  const labels: Record<string, string> = {
    award: copy.earned,
    release: copy.available,
    reserve: copy.rewardReservedActivity,
    capture: copy.rewardUsed,
    cancel: copy.reservationReleased,
    expire: copy.pointsExpired,
    refund_reversal: copy.refundAdjustment,
    manual_adjustment: copy.accountAdjustment,
  };
  return labels[item.kind] ?? copy.loyaltyActivity;
}

function isNativeReward(kind: string): boolean {
  return ["fixed_discount", "percentage_discount", "free_shipping"].includes(
    kind,
  );
}

function redemptionMessage(status: string, locale: CustomerLocale): string {
  const copy = CUSTOMER_COPY[locale];
  if (status === "insufficient") {
    return copy.insufficient;
  }
  if (status === "invalid") {
    return copy.invalidRedemption;
  }
  return copy.unavailableRedemption;
}
