import Link from "next/link";
import Image from "next/image";
import { RefreshCw, ShieldAlert } from "lucide-react";
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
  type CustomerLocale,
} from "@/lib/customer-locale";
import { customerExportReauthenticationPath } from "@/lib/customer-export";
import { isSelfServiceRewardKind } from "@/lib/customer-rewards";
import { selectCustomerAccount } from "@/lib/customer-experience-presentation";
import { TierProgress } from "@/components/tier-progress";
import { CustomerReferralPanel } from "./customer-referral-panel";
import { CustomerLoyaltyExperience } from "./customer-loyalty-experience";
import { CustomerLinkedStores } from "./customer-linked-stores";
import { getCustomerLinksState } from "@/lib/server/customer-links";
import starfinitiIcon from "../../../../../docs/design/prototype-source/assets/images/starfiniti-icon.png";

export default async function CustomerLoyaltyPage({
  searchParams,
}: {
  searchParams: Promise<{
    linked?: string;
    redeemed?: string;
    redemption?: string;
    account?: string;
  }>;
}) {
  const [query, state, customerLinks] = await Promise.all([
    searchParams,
    getCustomerLoyaltyAccounts(),
    getCustomerLinksState(),
  ]);
  const { linked, redeemed, redemption } = query;
  if (state.kind === "unauthenticated") {
    redirect(customerLocalePath("/login?next=%2Faccount%2Floyalty", "en"));
  }
  if (state.kind === "unavailable") return <CustomerExperienceUnavailable />;
  const locale: CustomerLocale = "en";
  const copy = CUSTOMER_COPY[locale];
  const selectedAccount = selectCustomerAccount(state.accounts, query.account);
  const messages = [
    linked === "1"
      ? ({ kind: "success", text: copy.connected } as const)
      : null,
    redeemed === "1"
      ? ({ kind: "success", text: copy.rewardReserved } as const)
      : null,
    redemption
      ? ({
          kind: "error",
          text: redemptionMessage(redemption, locale),
        } as const)
      : null,
  ].filter((message) => message !== null);

  if (selectedAccount?.enhancements_enabled) {
    return (
      <CustomerLoyaltyExperience
        account={selectedAccount}
        accounts={state.accounts}
        customerLinks={
          customerLinks.kind === "ready"
            ? customerLinks
            : { kind: "unavailable" }
        }
        messages={messages}
      />
    );
  }

  return (
    <main className="member-page" id="main-content" tabIndex={-1}>
      <header className="member-topbar">
        <Link className="member-brand" href="/account/loyalty">
          <span aria-hidden="true">
            <Image
              alt=""
              height={34}
              priority
              src={starfinitiIcon}
              width={34}
            />
          </span>
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
        {!selectedAccount ? (
          <section className="member-empty">
            <h2>{copy.noAccountTitle}</h2>
            <p>{copy.noAccountBody}</p>
          </section>
        ) : (
          <div className="member-accounts">
            {state.accounts.length > 1 ? (
              <nav
                className="member-core-account-switcher"
                aria-label="Store accounts"
              >
                {state.accounts.map((account) => (
                  <Link
                    aria-current={
                      account.account_id === selectedAccount.account_id
                    }
                    href={`/account/loyalty?account=${account.account_id}`}
                    key={account.account_id}
                  >
                    {account.store_name}
                  </Link>
                ))}
              </nav>
            ) : null}
            <AccountCard account={selectedAccount} locale={locale} />
            <CustomerLinkedStores
              state={
                customerLinks.kind === "ready"
                  ? customerLinks
                  : { kind: "unavailable" }
              }
            />
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

function CustomerExperienceUnavailable() {
  return (
    <main className="member-recovery" id="main-content" tabIndex={-1}>
      <section role="alert">
        <span aria-hidden="true">
          <ShieldAlert />
        </span>
        <p>LOYALTY ACCOUNT</p>
        <h1>Your loyalty details are temporarily unavailable</h1>
        <p>
          We could not verify your current balance safely. No customer, store,
          or programme details are shown from an incomplete response. Your
          points and account history are not changed.
        </p>
        <Link href="/account/loyalty">
          <RefreshCw aria-hidden="true" /> Try again
        </Link>
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
      {account.tier_progress ? (
        <TierProgress
          availablePoints={account.available_points}
          mode="member"
          nextExpiryAt={account.next_expiry_at}
          nextExpiryPoints={account.next_expiry_points}
          progress={account.tier_progress}
        />
      ) : null}
      {account.referral ? (
        <CustomerReferralPanel
          experience={account.referral}
          operationId={crypto.randomUUID()}
        />
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
                      {formatPoints(reward.costPoints, locale)} points
                    </span>
                  </div>
                  {ready &&
                  reward.affordable &&
                  isSelfServiceRewardKind(reward.kind) ? (
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
