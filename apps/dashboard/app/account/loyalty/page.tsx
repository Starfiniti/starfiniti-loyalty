import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import {
  getCustomerLoyaltyAccounts,
  type CustomerActivity,
  type CustomerLoyaltyAccount,
} from "@/lib/server/customer-account";

export default async function CustomerLoyaltyPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string }>;
}) {
  const [{ linked }, state] = await Promise.all([
    searchParams,
    getCustomerLoyaltyAccounts(),
  ]);
  if (state.kind === "unauthenticated") {
    redirect("/login?next=%2Faccount%2Floyalty");
  }

  return (
    <main className="member-page" id="main-content" tabIndex={-1}>
      <header className="member-topbar">
        <Link className="member-brand" href="/account/loyalty">
          <span aria-hidden="true">SF</span>
          Starfiniti Loyalty
        </Link>
        <form action={signOut}>
          <button className="secondary member-signout" type="submit">
            Sign out
          </button>
        </form>
      </header>
      <section className="member-content">
        {linked === "1" ? (
          <p className="member-success" role="status">
            Your verified store account is now connected.
          </p>
        ) : null}
        <div className="member-heading">
          <p>Your loyalty account</p>
          <h1>Points, tier, and rewards</h1>
          <p>
            Live values from the self-hosted loyalty ledger. Store checkout
            continues to work even if this page is temporarily unavailable.
          </p>
        </div>
        {state.accounts.length === 0 ? (
          <section className="member-empty">
            <h2>No store account connected</h2>
            <p>
              Sign in to your WooCommerce store, open My account, then choose
              Loyalty rewards and Open loyalty account.
            </p>
          </section>
        ) : (
          <div className="member-accounts">
            {state.accounts.map((account) => (
              <AccountCard account={account} key={account.account_id} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function AccountCard({ account }: { account: CustomerLoyaltyAccount }) {
  const ready = account.account_status === "ready";
  return (
    <article className="member-account-card">
      <div className="member-account-heading">
        <div>
          <p>{account.store_name}</p>
          <h2>{account.programme_name ?? "Loyalty programme"}</h2>
        </div>
        <span className={ready ? "member-live" : "member-pending"}>
          {statusLabel(account.account_status)}
        </span>
      </div>
      <div className="member-balance-grid">
        <section className="member-balance-primary">
          <span>Available points</span>
          <strong>{formatPoints(account.available_points)}</strong>
        </section>
        <section>
          <span>Pending</span>
          <strong>{formatPoints(account.pending_points)}</strong>
        </section>
        <section>
          <span>Reserved</span>
          <strong>{formatPoints(account.reserved_points)}</strong>
        </section>
        <section>
          <span>Current tier</span>
          <strong>{account.tier_name ?? "Not evaluated yet"}</strong>
        </section>
      </div>
      {account.next_expiry_at && account.next_expiry_points ? (
        <p className="member-expiry">
          {formatPoints(account.next_expiry_points)} points expire on{" "}
          {formatDate(account.next_expiry_at)}.
        </p>
      ) : null}
      <div className="member-columns">
        <section>
          <h3>Available rewards</h3>
          {account.rewards.length === 0 ? (
            <p className="member-muted">No published rewards are available.</p>
          ) : (
            <ul className="member-list">
              {account.rewards.map((reward) => (
                <li key={reward.code}>
                  <div>
                    <strong>{reward.name}</strong>
                    <span>{formatPoints(reward.costPoints)} points</span>
                  </div>
                  <span
                    className={
                      reward.affordable
                        ? "member-affordable"
                        : "member-unavailable"
                    }
                  >
                    {reward.affordable ? "Available" : "Keep earning"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3>Recent activity</h3>
          {account.activity.length === 0 ? (
            <p className="member-muted">No points activity yet.</p>
          ) : (
            <ul className="member-list member-activity">
              {account.activity.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{activityLabel(item)}</strong>
                    <span>{formatDate(item.effectiveAt)}</span>
                  </div>
                  <b>{formatPoints(item.points)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {account.programme_id ? (
        <Link
          className="member-public-link"
          href={`/loyalty/${account.workspace_id}/${account.programme_id}`}
        >
          View public programme details
        </Link>
      ) : null}
    </article>
  );
}

function formatPoints(value: string): string {
  try {
    return BigInt(value).toLocaleString("en-US");
  } catch {
    return "0";
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "an unknown date"
    : new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
}

function statusLabel(status: string): string {
  if (status === "ready") return "Live";
  if (status === "ready_without_activity") return "Ready";
  if (status.startsWith("wallet_")) return "Wallet unavailable";
  return "Programme unavailable";
}

function activityLabel(item: CustomerActivity): string {
  const labels: Record<string, string> = {
    award: "Points earned",
    release: "Points available",
    reserve: "Reward reserved",
    capture: "Reward used",
    cancel: "Reservation released",
    expire: "Points expired",
    refund_reversal: "Refund adjustment",
    manual_adjustment: "Account adjustment",
  };
  return labels[item.kind] ?? "Loyalty activity";
}
