import type {
  CustomerTierProgressV1,
  TierMilestoneProgressV1,
  TierProgressThresholdV1,
} from "@starfiniti/contracts";
import {
  Activity,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Crown,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";

export function TierProgress({
  progress,
  availablePoints,
  nextExpiryAt,
  nextExpiryPoints,
  mode,
}: Readonly<{
  progress: CustomerTierProgressV1;
  availablePoints: string;
  nextExpiryAt?: string | null;
  nextExpiryPoints?: string | null;
  mode: "merchant" | "member";
}>) {
  const current = progress.currentTier;
  return (
    <section
      className={`tier-progress tier-progress-${mode}`}
      aria-labelledby={`tier-progress-${mode}-title`}
    >
      <header className="tier-progress-heading">
        <div className="tier-progress-emblem" aria-hidden="true">
          <Crown />
        </div>
        <div>
          <span>
            {mode === "merchant" ? "Member progression" : "Your VIP status"}
          </span>
          <h2 id={`tier-progress-${mode}-title`}>
            {current?.name ?? "Qualification pending"}
          </h2>
          <p>{windowLabel(progress)}</p>
        </div>
        {progress.transition ? (
          <span
            className={`tier-transition tier-transition-${progress.transition}`}
          >
            {progress.transition.replaceAll("_", " ")}
          </span>
        ) : null}
      </header>

      <div className="tier-progress-separation">
        <article>
          <span>Spendable balance</span>
          <strong>{formatCount(availablePoints)}</strong>
          <small>available points</small>
        </article>
        <article>
          <span>Qualification progress</span>
          <strong>
            {formatMetric(
              "eligible_spend",
              progress.metrics.eligibleSpendMinor,
            )}
          </strong>
          <small>eligible spend in this tier window</small>
        </article>
        <article>
          <span>Retention review</span>
          <strong>{dateOrDash(progress.window.endsAt)}</strong>
          <small>
            {progress.window.endsAt ? "window ends" : "no reset date"}
          </small>
        </article>
        <article>
          <span>Next points expiry</span>
          <strong>
            {nextExpiryPoints ? formatCount(nextExpiryPoints) : "—"}
          </strong>
          <small>
            {nextExpiryAt ? dateOrDash(nextExpiryAt) : "none scheduled"}
          </small>
        </article>
      </div>

      {progress.activeOverrideUntil ? (
        <p className="tier-progress-notice">
          <ShieldCheck aria-hidden="true" />A manual tier override is active
          until {dateOrDash(progress.activeOverrideUntil)}. Automatic
          qualification continues in the background.
        </p>
      ) : null}
      {progress.graceUntil ? (
        <p className="tier-progress-notice warning">
          <Clock3 aria-hidden="true" />
          Retention grace remains active until {dateOrDash(progress.graceUntil)}
          .
        </p>
      ) : null}

      <div className="tier-progress-columns">
        <ProgressMilestone
          empty="This member has reached the highest configured tier."
          icon="next"
          milestone={progress.nextMilestone}
          title="Next milestone"
        />
        <ProgressMilestone
          empty={
            current
              ? "The base tier has no retention threshold."
              : "Retention starts after the first tier decision."
          }
          icon="retention"
          milestone={progress.retention}
          title="Keep this tier"
        />
      </div>

      {progress.history.length ? (
        <section
          className="tier-history"
          aria-labelledby={`tier-history-${mode}-title`}
        >
          <div className="tier-history-heading">
            <div>
              <CalendarRange aria-hidden="true" />
              <h3 id={`tier-history-${mode}-title`}>Tier history</h3>
            </div>
            <span>Immutable membership intervals</span>
          </div>
          <ol>
            {progress.history.map((item) => (
              <li key={item.membershipId}>
                <i aria-hidden="true" />
                <div>
                  <strong>{item.tier.name}</strong>
                  <span>{item.transition.replaceAll("_", " ")}</span>
                </div>
                <time dateTime={item.effectiveFrom}>
                  {dateOrDash(item.effectiveFrom)}
                  {item.effectiveUntil
                    ? ` – ${dateOrDash(item.effectiveUntil)}`
                    : " – Current"}
                </time>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
}

function ProgressMilestone({
  empty,
  icon,
  milestone,
  title,
}: Readonly<{
  empty: string;
  icon: "next" | "retention";
  milestone: TierMilestoneProgressV1 | null;
  title: string;
}>) {
  const Icon = icon === "next" ? TrendingUp : Sparkles;
  return (
    <article className="tier-milestone">
      <header>
        <Icon aria-hidden="true" />
        <div>
          <span>{title}</span>
          <strong>{milestone?.tier.name ?? "Complete"}</strong>
        </div>
        {milestone?.matched ? (
          <CheckCircle2 aria-label="Requirement met" />
        ) : null}
      </header>
      {milestone ? (
        <>
          <p>
            {milestone.operator === "all"
              ? "Meet every requirement"
              : "Meet any requirement"}
            {` · ${milestone.thresholdKind}`}
          </p>
          <div className="tier-threshold-progress">
            {milestone.thresholds.map((threshold) => (
              <ThresholdProgress
                key={`${threshold.metric}:${threshold.activityCodes.join(",")}`}
                threshold={threshold}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="tier-milestone-empty">{empty}</p>
      )}
    </article>
  );
}

function ThresholdProgress({
  threshold,
}: {
  threshold: TierProgressThresholdV1;
}) {
  const actual = BigInt(threshold.actual);
  const minimum = BigInt(threshold.minimum);
  const percentage = Number((actual * 100n) / minimum);
  const bounded = Math.max(0, Math.min(100, percentage));
  return (
    <div>
      <div className="tier-threshold-label">
        <span>
          <Activity aria-hidden="true" /> {metricLabel(threshold)}
        </span>
        <strong>
          {threshold.matched
            ? "Met"
            : `${formatMetric(threshold.metric, threshold.remaining)} to go`}
        </strong>
      </div>
      <div
        aria-label={`${bounded}% of ${metricLabel(threshold)} requirement complete`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={bounded}
        className="tier-progress-bar"
        role="progressbar"
      >
        <i style={{ width: `${bounded}%` }} />
      </div>
      <small>
        {formatMetric(threshold.metric, threshold.actual)} of{" "}
        {formatMetric(threshold.metric, threshold.minimum)}
      </small>
    </div>
  );
}

function metricLabel(threshold: TierProgressThresholdV1): string {
  if (threshold.metric === "eligible_spend") return "Eligible spend";
  if (threshold.metric === "earned_points") return "Earned points";
  if (threshold.metric === "order_count") return "Orders";
  if (threshold.metric === "referral_count") return "Referrals";
  return threshold.activityCodes.length
    ? threshold.activityCodes.join(", ").replaceAll("_", " ")
    : "Verified actions";
}

function formatMetric(
  metric: TierProgressThresholdV1["metric"],
  value: string,
): string {
  if (metric === "eligible_spend") {
    try {
      const amount = BigInt(value);
      const major = amount / 100n;
      const minor = (amount % 100n).toString().padStart(2, "0");
      return `€${major.toLocaleString("en")}.${minor}`;
    } catch {
      return "€0.00";
    }
  }
  return formatCount(value);
}

function formatCount(value: string): string {
  try {
    return BigInt(value).toLocaleString("en");
  } catch {
    return "0";
  }
}

function dateOrDash(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(date);
}

function windowLabel(progress: CustomerTierProgressV1): string {
  if (progress.window.kind === "lifetime")
    return "Lifetime qualification · no reset";
  if (progress.window.kind === "calendar_year")
    return "Calendar-year qualification";
  return "Rolling qualification window";
}
