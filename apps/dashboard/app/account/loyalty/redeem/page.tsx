import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCustomerLoyaltyAccounts } from "@/lib/server/customer-account";
import { redeemCustomerReward } from "./actions";
import {
  CUSTOMER_COPY,
  customerLocalePath,
  type CustomerLocale,
} from "@/lib/customer-locale";
import { isSelfServiceRewardKind } from "@/lib/customer-rewards";

type Search = Record<string, string | string[] | undefined>;

export default async function CustomerRewardConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [search, state] = await Promise.all([
    searchParams,
    getCustomerLoyaltyAccounts(),
  ]);
  const locale: CustomerLocale = "en";
  const copy = CUSTOMER_COPY[locale];
  if (state.kind === "unauthenticated") {
    redirect(customerLocalePath("/login?next=%2Faccount%2Floyalty", locale));
  }
  if (state.kind === "unavailable") redirect("/account/loyalty");
  const accountId = typeof search.account === "string" ? search.account : "";
  const rewardCode = typeof search.reward === "string" ? search.reward : "";
  const account = state.accounts.find((item) => item.account_id === accountId);
  const reward = account?.rewards.find((item) => item.code === rewardCode);
  if (!account || !reward) notFound();

  const canRedeem =
    account.account_status === "ready" &&
    reward.affordable &&
    isSelfServiceRewardKind(reward.kind);
  const resultingBalance = canRedeem
    ? (
        BigInt(account.available_points) - BigInt(reward.costPoints)
      ).toLocaleString(locale)
    : null;

  return (
    <main className="access-page" id="main-content" tabIndex={-1}>
      <section
        className="access-card redemption-card"
        aria-labelledby="redeem-title"
      >
        <p className="login-eyebrow">{account.store_name}</p>
        <h1 id="redeem-title">{copy.confirmReward}</h1>
        <p>
          {copy.redeemBeforeReward} <strong>{reward.name}</strong>{" "}
          {copy.redeemFor}{" "}
          <strong>
            {formatPoints(reward.costPoints, locale)} {copy.pointsQuestion}
          </strong>
        </p>
        {canRedeem ? (
          <>
            <dl className="redemption-summary">
              <div>
                <dt>{copy.currentBalance}</dt>
                <dd>{formatPoints(account.available_points, locale)}</dd>
              </div>
              <div>
                <dt>{copy.afterReservation}</dt>
                <dd>{resultingBalance}</dd>
              </div>
            </dl>
            <p className="claim-safety-note">{copy.reservationSafety}</p>
            <form action={redeemCustomerReward} className="redemption-actions">
              <input
                name="accountId"
                type="hidden"
                value={account.account_id}
              />
              <input name="rewardCode" type="hidden" value={reward.code} />
              <input name="lang" type="hidden" value={locale} />
              <input
                name="requestId"
                type="hidden"
                value={crypto.randomUUID()}
              />
              <button className="primary" type="submit">
                {copy.confirmRedemption}
              </button>
              <Link
                className="secondary"
                href={customerLocalePath("/account/loyalty", locale)}
              >
                {copy.cancel}
              </Link>
            </form>
          </>
        ) : (
          <>
            <p className="claim-safety-note">
              {reward.affordable ? copy.manualReward : copy.notEnoughPoints}
            </p>
            <Link
              className="secondary redemption-back"
              href={customerLocalePath("/account/loyalty", locale)}
            >
              {copy.backToAccount}
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

function formatPoints(value: string, locale: CustomerLocale): string {
  try {
    return BigInt(value).toLocaleString(locale);
  } catch {
    return "0";
  }
}
