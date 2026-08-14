import type { MerchantReferralDashboardV1 } from "@starfiniti/contracts";
import {
  BadgeCheck,
  CircleDot,
  Clock3,
  Coins,
  Link2,
  RotateCcw,
  ShieldAlert,
  Trophy,
  UserRoundCheck,
  UsersRound,
  XCircle,
} from "lucide-react";

function formatCount(value: string): string {
  try {
    return BigInt(value).toLocaleString("en-GB");
  } catch {
    return "0";
  }
}

function percentage(value: string, total: string): number {
  try {
    const numerator = BigInt(value);
    const denominator = BigInt(total);
    if (denominator === 0n) return 0;
    return Number((numerator * 10_000n) / denominator) / 100;
  } catch {
    return 0;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Ljubljana",
  }).format(new Date(value));
}

const referralState = {
  captured: { label: "Waiting for purchase", tone: "pending", icon: Clock3 },
  pending_review: {
    label: "Risk review",
    tone: "review",
    icon: ShieldAlert,
  },
  blocked: { label: "Blocked", tone: "closed", icon: XCircle },
  cooling: { label: "Cooling", tone: "pending", icon: Clock3 },
  qualified: { label: "Rewarded", tone: "success", icon: BadgeCheck },
  rejected: { label: "Rejected", tone: "closed", icon: XCircle },
  reversed: { label: "Reversed", tone: "closed", icon: RotateCcw },
} as const;

export function ReferralPerformance({
  dashboard,
}: Readonly<{ dashboard: MerchantReferralDashboardV1 }>) {
  const totalPoints = (
    BigInt(dashboard.totals.advocatePointsIssued) +
    BigInt(dashboard.totals.friendPointsIssued)
  ).toString();
  const qualifiedRate = percentage(
    dashboard.totals.qualified,
    dashboard.totals.attributions,
  );
  const funnel = [
    {
      label: "Attributed orders",
      value: dashboard.totals.attributions,
      help: "Orders carrying a valid opaque referral code",
      tone: "captured",
    },
    {
      label: "In progress",
      value: dashboard.totals.pending,
      help: "Waiting, review, or return-cooling states",
      tone: "pending",
    },
    {
      label: "Rewarded",
      value: dashboard.totals.qualified,
      help: "Both immutable point awards completed",
      tone: "qualified",
    },
  ] as const;

  return (
    <>
      <section
        className="referral-performance-summary"
        aria-label="Referral performance summary"
      >
        <div>
          <UsersRound aria-hidden="true" />
          <span>Active advocates</span>
          <strong>{formatCount(dashboard.totals.advocates)}</strong>
          <small>Customers with an active private link</small>
        </div>
        <div>
          <Link2 aria-hidden="true" />
          <span>Attributed orders</span>
          <strong>{formatCount(dashboard.totals.attributions)}</strong>
          <small>Canonical orders · {dashboard.lookbackDays} days</small>
        </div>
        <div>
          <UserRoundCheck aria-hidden="true" />
          <span>Rewarded referrals</span>
          <strong>{formatCount(dashboard.totals.qualified)}</strong>
          <small>{qualifiedRate.toFixed(1)}% of attributed orders</small>
        </div>
        <div>
          <Coins aria-hidden="true" />
          <span>Points issued</span>
          <strong>{formatCount(totalPoints)}</strong>
          <small>Advocate and friend awards</small>
        </div>
      </section>

      <div className="referral-performance-layout">
        <section
          className="referral-performance-panel"
          aria-labelledby="referral-funnel-title"
        >
          <div className="referral-panel-heading">
            <div>
              <p className="login-eyebrow">Canonical order evidence</p>
              <h2 id="referral-funnel-title">Referral funnel</h2>
              <p>
                Current outcomes for referral-attributed orders captured in the
                last {dashboard.lookbackDays} days.
              </p>
            </div>
            <span className="ui-badge ui-badge-neutral">
              Through {formatDate(dashboard.generatedAt)}
            </span>
          </div>
          <div className="referral-funnel">
            {funnel.map((stage) => (
              <div key={stage.label}>
                <div>
                  <span>{stage.label}</span>
                  <strong>{formatCount(stage.value)}</strong>
                </div>
                <div className="referral-funnel-track" aria-hidden="true">
                  <span
                    className={stage.tone}
                    style={{
                      width: `${Math.max(
                        stage.value === "0" ? 0 : 4,
                        percentage(stage.value, dashboard.totals.attributions),
                      )}%`,
                    }}
                  />
                </div>
                <small>{stage.help}</small>
              </div>
            ))}
          </div>
          <div className="referral-funnel-closed">
            <span>
              <XCircle aria-hidden="true" /> Rejected or blocked
              <strong>{formatCount(dashboard.totals.rejected)}</strong>
            </span>
            <span>
              <RotateCcw aria-hidden="true" /> Reversed after refund
              <strong>{formatCount(dashboard.totals.reversed)}</strong>
            </span>
          </div>
        </section>

        <section
          className="referral-performance-panel referral-advocates"
          aria-labelledby="top-advocates-title"
        >
          <div className="referral-panel-heading compact">
            <div>
              <p className="login-eyebrow">Customer advocacy</p>
              <h2 id="top-advocates-title">Top advocates</h2>
            </div>
            <Trophy aria-hidden="true" />
          </div>
          {dashboard.topAdvocates.length === 0 ? (
            <div className="referral-performance-empty">
              <CircleDot aria-hidden="true" />
              <p>No referral-attributed orders in this period.</p>
            </div>
          ) : (
            <ol>
              {dashboard.topAdvocates.map((advocate, index) => (
                <li key={advocate.customerId}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{advocate.reference}</strong>
                    <small>
                      {formatCount(advocate.attributions)} attributed ·{" "}
                      {formatCount(advocate.qualified)} rewarded
                    </small>
                  </div>
                  <b>{formatCount(advocate.pointsIssued)} pts</b>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section
        className="referral-performance-panel referral-recent"
        aria-labelledby="recent-referrals-title"
      >
        <div className="referral-panel-heading">
          <div>
            <p className="login-eyebrow">Immutable history</p>
            <h2 id="recent-referrals-title">Recent referrals</h2>
            <p>
              Latest current state from append-only attribution transitions.
            </p>
          </div>
          <span className="ui-badge ui-badge-violet">
            {dashboard.recent.length} shown
          </span>
        </div>
        {dashboard.recent.length === 0 ? (
          <div className="referral-performance-empty wide">
            <UserRoundCheck aria-hidden="true" />
            <p>Accepted referrals will appear here after a canonical order.</p>
          </div>
        ) : (
          <div className="referral-recent-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Advocate</th>
                  <th scope="col">Friend</th>
                  <th scope="col">WooCommerce order</th>
                  <th scope="col">Current state</th>
                  <th scope="col">Captured</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recent.map((item) => {
                  const presentation = referralState[item.state];
                  const Icon = presentation.icon;
                  return (
                    <tr key={item.referralId}>
                      <td>{item.advocateReference}</td>
                      <td>{item.friendReference}</td>
                      <td>{item.sourceOrderReference}</td>
                      <td>
                        <span className={`referral-state ${presentation.tone}`}>
                          <Icon aria-hidden="true" /> {presentation.label}
                        </span>
                      </td>
                      <td>{formatDate(item.capturedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="referral-metric-note">
          Metric boundary: Starfiniti counts active links, referral-attributed
          WooCommerce orders, state transitions, and immutable issued points. It
          does not infer shares, clicks, signups, revenue, or CAC without a
          canonical source fact.
        </p>
      </section>
    </>
  );
}
