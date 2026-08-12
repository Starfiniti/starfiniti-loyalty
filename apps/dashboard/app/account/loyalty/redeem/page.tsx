import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCustomerLoyaltyAccounts } from "@/lib/server/customer-account";
import { redeemCustomerReward } from "./actions";

type Search = Record<string, string | string[] | undefined>;

const NATIVE_REWARD_KINDS = new Set([
  "fixed_discount",
  "percentage_discount",
  "free_shipping",
]);

export default async function CustomerRewardConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [search, state] = await Promise.all([
    searchParams,
    getCustomerLoyaltyAccounts(),
  ]);
  if (state.kind === "unauthenticated") {
    redirect("/login?next=%2Faccount%2Floyalty");
  }
  const accountId = typeof search.account === "string" ? search.account : "";
  const rewardCode = typeof search.reward === "string" ? search.reward : "";
  const account = state.accounts.find((item) => item.account_id === accountId);
  const reward = account?.rewards.find((item) => item.code === rewardCode);
  if (!account || !reward) notFound();

  const canRedeem =
    account.account_status === "ready" &&
    reward.affordable &&
    NATIVE_REWARD_KINDS.has(reward.kind);
  const resultingBalance = canRedeem
    ? (
        BigInt(account.available_points) - BigInt(reward.costPoints)
      ).toLocaleString("en-US")
    : null;

  return (
    <main className="access-page" id="main-content" tabIndex={-1}>
      <section
        className="access-card redemption-card"
        aria-labelledby="redeem-title"
      >
        <p className="login-eyebrow">{account.store_name}</p>
        <h1 id="redeem-title">Confirm reward</h1>
        <p>
          Redeem <strong>{reward.name}</strong> for{" "}
          <strong>{formatPoints(reward.costPoints)} points</strong>?
        </p>
        {canRedeem ? (
          <>
            <dl className="redemption-summary">
              <div>
                <dt>Current balance</dt>
                <dd>{formatPoints(account.available_points)}</dd>
              </div>
              <div>
                <dt>After reservation</dt>
                <dd>{resultingBalance}</dd>
              </div>
            </dl>
            <p className="claim-safety-note">
              Your points will be reserved now. WooCommerce creates a
              customer-only coupon asynchronously; if issuance fails, the ledger
              releases the points automatically.
            </p>
            <form action={redeemCustomerReward} className="redemption-actions">
              <input
                name="accountId"
                type="hidden"
                value={account.account_id}
              />
              <input name="rewardCode" type="hidden" value={reward.code} />
              <input
                name="requestId"
                type="hidden"
                value={crypto.randomUUID()}
              />
              <button className="primary" type="submit">
                Confirm redemption
              </button>
              <Link className="secondary" href="/account/loyalty">
                Cancel
              </Link>
            </form>
          </>
        ) : (
          <>
            <p className="claim-safety-note">
              {reward.affordable
                ? "This reward is fulfilled directly by the store and is not available as an automatic coupon."
                : "You do not currently have enough available points for this reward."}
            </p>
            <Link className="secondary redemption-back" href="/account/loyalty">
              Back to loyalty account
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

function formatPoints(value: string): string {
  try {
    return BigInt(value).toLocaleString("en-US");
  } catch {
    return "0";
  }
}
