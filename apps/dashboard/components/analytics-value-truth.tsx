import {
  analyticsMetricDictionaryV4,
  type AnalyticsCohortRetentionReportV1,
  type AnalyticsCommercePerformanceReportV1,
  type AnalyticsMetricKeyV4,
  type AnalyticsProgrammeOutcomeReportV1,
  type AnalyticsValueTruthReportV1,
} from "@starfiniti/contracts";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Crown,
  DatabaseZap,
  Gift,
  Info,
  Megaphone,
  Repeat2,
  RefreshCcw,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  UsersRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import {
  analyticsMetricDefinition,
  analyticsShareBasisPoints,
  formatAnalyticsBasisPoints,
  formatAnalyticsCurrencyMinor,
  formatAnalyticsPeriod,
  formatAnalyticsPoints,
  type AnalyticsRange,
} from "@/lib/analytics";

type AnalyticsState =
  | Readonly<{
      kind: "ready";
      report: AnalyticsValueTruthReportV1;
      commerce: AnalyticsCommercePerformanceReportV1 | null;
      outcomes: AnalyticsProgrammeOutcomeReportV1 | null;
      cohorts: AnalyticsCohortRetentionReportV1 | null;
    }>
  | Readonly<{ kind: "disabled" }>
  | Readonly<{ kind: "setup_required" }>
  | Readonly<{ kind: "unavailable" }>;

export function AnalyticsValueTruth({
  range,
  state,
}: Readonly<{
  range: AnalyticsRange;
  state: AnalyticsState;
}>) {
  return (
    <div className="analytics-workspace">
      <header className="analytics-heading">
        <div>
          <p className="login-eyebrow">Ledger-sourced analytics</p>
          <h1>Programme performance</h1>
          <p>
            Understand activation, repeat purchase, customer value, and every
            point movement from immutable, refund-aware evidence.
          </p>
        </div>
        <nav aria-label="Analytics period" className="analytics-range">
          {([7, 30, 90] as const).map((days) => (
            <Link
              aria-current={range === days ? "page" : undefined}
              className={range === days ? "is-active" : undefined}
              href={`/analytics?range=${days}`}
              key={days}
            >
              {days} days
            </Link>
          ))}
        </nav>
      </header>

      {state.kind === "ready" ? (
        <AnalyticsReport
          cohorts={state.cohorts}
          commerce={state.commerce}
          outcomes={state.outcomes}
          report={state.report}
        />
      ) : (
        <AnalyticsUnavailable kind={state.kind} />
      )}
    </div>
  );
}

function AnalyticsUnavailable({
  kind,
}: Readonly<{ kind: Exclude<AnalyticsState["kind"], "ready"> }>) {
  const content = {
    disabled: {
      title: "Analytics rollout is disabled",
      body: "The server-side tenant entitlement is off. Existing balances, refunds, redemption, reconciliation, and checkout remain available.",
      Icon: ShieldCheck,
    },
    setup_required: {
      title: "Programme setup required",
      body: "Create an active workspace and programme group before requesting a value-truth report.",
      Icon: WalletCards,
    },
    unavailable: {
      title: "Analytics stopped before showing uncertain data",
      body: "The report could not prove its source or projection reconciliation. Loyalty value is unaffected; refresh after the underlying incident is resolved.",
      Icon: AlertTriangle,
    },
  }[kind];
  return (
    <section className="analytics-state" role="status">
      <content.Icon aria-hidden="true" />
      <h2>{content.title}</h2>
      <p>{content.body}</p>
      {kind === "setup_required" ? (
        <Link className="ui-button ui-button-primary" href="/programme">
          Open programme setup
        </Link>
      ) : null}
    </section>
  );
}

function AnalyticsReport({
  cohorts,
  commerce,
  outcomes,
  report,
}: Readonly<{
  cohorts: AnalyticsCohortRetentionReportV1 | null;
  commerce: AnalyticsCommercePerformanceReportV1 | null;
  outcomes: AnalyticsProgrammeOutcomeReportV1 | null;
  report: AnalyticsValueTruthReportV1;
}>) {
  const cards = [
    {
      icon: WalletCards,
      key: "points.snapshot.outstanding" as const,
      label: "Outstanding points",
      value: report.snapshot.outstandingPoints,
      note: "Pending + available + reserved",
      tone: "violet",
    },
    {
      icon: BadgeCheck,
      key: "points.snapshot.available" as const,
      label: "Available now",
      value: report.snapshot.availablePoints,
      note: "Signed, correction-aware balance",
      tone: "green",
    },
    {
      icon: ArrowDownToLine,
      key: "points.flow.captured" as const,
      label: "Captured this period",
      value: report.flows.capturedPoints,
      note: "Native rewards fulfilled",
      tone: "blue",
    },
    {
      icon: CalendarClock,
      key: "points.expiry.next_30_days" as const,
      label: "Expiring in 30 days",
      value: report.expiry.expiringNext30Days,
      note: `${formatCount(report.expiry.affectedMembers)} members with lot exposure`,
      tone: "amber",
    },
  ];
  return (
    <>
      <section className="analytics-integrity" aria-label="Report integrity">
        <span className="analytics-integrity-mark">
          <ShieldCheck aria-hidden="true" /> Reconciled
        </span>
        <span>
          <Clock3 aria-hidden="true" /> {formatAnalyticsPeriod(report)}
        </span>
        <span>
          <DatabaseZap aria-hidden="true" />{" "}
          {formatCount(report.projection.ledgerEntryCount)} wallet ledger
          entries
        </span>
        <span>Dictionary v{report.dictionaryVersion}</span>
      </section>

      <CommercePerformance report={commerce} />

      <ProgrammeOutcomes report={outcomes} />

      <CohortRetention report={cohorts} />

      <header className="analytics-section-heading">
        <div>
          <p className="login-eyebrow">Value lifecycle</p>
          <h2>Point position and movement</h2>
          <p>
            Current exposure reconciles to immutable entries before any value is
            shown.
          </p>
        </div>
        <WalletCards aria-hidden="true" />
      </header>

      <section className="analytics-summary" aria-label="Value summary">
        {cards.map((card) => (
          <article className={`analytics-kpi is-${card.tone}`} key={card.key}>
            <span className="analytics-kpi-icon">
              <card.icon aria-hidden="true" />
            </span>
            <div>
              <span>{card.label}</span>
              <strong>{formatAnalyticsPoints(card.value)}</strong>
              <small>{card.note}</small>
            </div>
            <MetricDefinitionButton metricKey={card.key} />
          </article>
        ))}
      </section>

      <div className="analytics-grid">
        <section className="analytics-panel" aria-labelledby="balances-title">
          <PanelHeading
            eyebrow="Point position"
            icon={WalletCards}
            id="balances-title"
            title="Wallet balances"
          />
          <dl className="analytics-ledger-list">
            <LedgerRow
              keyName="points.snapshot.pending"
              label="Pending"
              value={report.snapshot.pendingPoints}
            />
            <LedgerRow
              keyName="points.snapshot.available"
              label="Available"
              value={report.snapshot.availablePoints}
            />
            <LedgerRow
              keyName="points.snapshot.reserved"
              label="Reserved"
              value={report.snapshot.reservedPoints}
            />
            <LedgerRow
              keyName="points.snapshot.spent"
              label="Spent"
              value={report.snapshot.spentPoints}
            />
            <LedgerRow
              keyName="points.snapshot.expired"
              label="Expired"
              value={report.snapshot.expiredPoints}
            />
            <LedgerRow
              keyName="points.snapshot.reversed"
              label="Refund reversed"
              value={report.snapshot.reversedPoints}
            />
          </dl>
        </section>

        <section className="analytics-panel" aria-labelledby="flows-title">
          <PanelHeading
            eyebrow={`${report.period.rangeDays}-day movement`}
            icon={RefreshCcw}
            id="flows-title"
            title="Immutable point flows"
          />
          <div className="analytics-flow-grid">
            <FlowValue
              icon={ArrowUpFromLine}
              keyName="points.flow.awarded"
              label="Awarded"
              value={report.flows.awardedPoints}
            />
            <FlowValue
              icon={ArrowDownToLine}
              keyName="points.flow.captured"
              label="Captured"
              value={report.flows.capturedPoints}
            />
            <FlowValue
              icon={CalendarClock}
              keyName="points.flow.expired"
              label="Expired"
              value={report.flows.expiredPoints}
            />
            <FlowValue
              icon={RefreshCcw}
              keyName="points.flow.refund_reversed"
              label="Refund reversed"
              value={report.flows.refundReversedPoints}
            />
          </div>
          <dl className="analytics-adjustments">
            <LedgerRow
              keyName="points.flow.manual_credit"
              label="Manual credits"
              value={report.flows.manualCreditPoints}
            />
            <LedgerRow
              keyName="points.flow.manual_debit"
              label="Manual debits"
              value={report.flows.manualDebitPoints}
            />
            <LedgerRow
              keyName="points.flow.manual_net"
              label="Net manual adjustment"
              value={report.flows.manualNetPoints}
            />
          </dl>
        </section>
      </div>

      <section className="analytics-panel" aria-labelledby="expiry-title">
        <PanelHeading
          eyebrow="Expiry exposure"
          icon={CalendarClock}
          id="expiry-title"
          title="When lot-backed points expire"
        />
        <div className="analytics-expiry-layout">
          <div className="analytics-expiry-bars">
            <ExpiryBar
              keyName="points.expiry.overdue_available"
              label="Overdue available"
              total={report.expiry.lotBackedPoints}
              value={report.expiry.overdueAvailablePoints}
            />
            <ExpiryBar
              keyName="points.expiry.reserved_past_expiry"
              label="Reserved past expiry"
              total={report.expiry.lotBackedPoints}
              value={report.expiry.reservedPastExpiryPoints}
            />
            <ExpiryBar
              keyName="points.expiry.next_30_days"
              label="Next 30 days"
              total={report.expiry.lotBackedPoints}
              value={report.expiry.expiringNext30Days}
            />
            <ExpiryBar
              keyName="points.expiry.days_31_to_90"
              label="Days 31–90"
              total={report.expiry.lotBackedPoints}
              value={report.expiry.expiringDays31To90}
            />
            <ExpiryBar
              keyName="points.expiry.beyond_90_days"
              label="After 90 days"
              total={report.expiry.lotBackedPoints}
              value={report.expiry.expiringBeyond90Days}
            />
          </div>
          <aside className="analytics-expiry-note">
            <CalendarClock aria-hidden="true" />
            <span>Next positive expiry</span>
            <strong>
              {report.expiry.nextExpiryAt
                ? new Intl.DateTimeFormat("en-GB", {
                    dateStyle: "long",
                    timeZone: "UTC",
                  }).format(new Date(report.expiry.nextExpiryAt))
                : "No scheduled expiry"}
            </strong>
            <small>
              Pending awards are excluded until release creates an immutable
              point lot.
            </small>
          </aside>
        </div>
      </section>

      <section className="analytics-liability-note" role="note">
        <CircleDollarSign aria-hidden="true" />
        <div>
          <strong>Monetary liability is intentionally unavailable</strong>
          <p>
            Outstanding points are not accounting currency. A monetary amount
            will appear only after a versioned valuation policy records the
            value effective for each point-creating event.
          </p>
        </div>
        <MetricDefinitionButton metricKey="liability.monetary" />
      </section>

      <MetricDictionary />
    </>
  );
}

function ProgrammeOutcomes({
  report,
}: Readonly<{ report: AnalyticsProgrammeOutcomeReportV1 | null }>) {
  if (!report) {
    return (
      <section className="analytics-module-unavailable" role="status">
        <AlertTriangle aria-hidden="true" />
        <div>
          <strong>
            Programme outcomes stopped before showing uncertain data
          </strong>
          <p>
            Commerce and point truth remain available. Reward, VIP, referral,
            and campaign metrics return only after their independent transition
            and reversal evidence reconciles.
          </p>
        </div>
      </section>
    );
  }

  const campaignMoney =
    report.campaigns.currency.status === "available" &&
    report.campaigns.influencedEligibleSpendMinor !== null
      ? formatAnalyticsCurrencyMinor(
          report.campaigns.influencedEligibleSpendMinor,
          report.campaigns.currency.code,
          report.campaigns.currency.minorUnitDigits,
        )
      : "Unavailable";
  const cards = [
    {
      icon: Gift,
      key: "rewards.mature.capture_rate" as const,
      label: "24-hour realization",
      value: formatAnalyticsBasisPoints(
        report.rewards.maturity.captureRateBasisPoints,
      ),
      note: `${formatCount(report.rewards.maturity.captures)} of ${formatCount(
        report.rewards.maturity.requests,
      )} mature requests`,
      tone: "violet",
    },
    {
      icon: Crown,
      key: "tiers.movements.members" as const,
      label: "Members changing tier",
      value: formatCount(report.tiers.movedMembers),
      note: `${formatCount(report.tiers.decisions)} qualification decisions`,
      tone: "amber",
    },
    {
      icon: UsersRound,
      key: "referrals.qualified" as const,
      label: "Qualified referrals",
      value: formatCount(report.referrals.qualified),
      note: `${formatAnalyticsBasisPoints(
        report.referrals.qualificationRateBasisPoints,
      )} observed qualification`,
      tone: "green",
    },
    {
      icon: Megaphone,
      key: "campaigns.influenced_orders" as const,
      label: "Influenced orders",
      value: formatCount(report.campaigns.influencedOrders),
      note: campaignMoney,
      tone: "blue",
    },
  ];

  return (
    <section
      className="analytics-performance analytics-outcomes"
      aria-labelledby="outcomes-title"
    >
      <header className="analytics-section-heading">
        <div>
          <p className="login-eyebrow">Programme outcomes</p>
          <h2 id="outcomes-title">Value customers actually reached</h2>
          <p>
            Requests, movements, referrals, and campaign effects remain tied to
            immutable transitions, reversals, and their exact knowledge time.
          </p>
        </div>
        <Gift aria-hidden="true" />
      </header>

      <div className="analytics-summary analytics-performance-summary">
        {cards.map((card) => (
          <article className={`analytics-kpi is-${card.tone}`} key={card.key}>
            <span className="analytics-kpi-icon">
              <card.icon aria-hidden="true" />
            </span>
            <div>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </div>
            <MetricDefinitionButton metricKey={card.key} />
          </article>
        ))}
      </div>

      <div className="analytics-grid analytics-commerce-grid">
        <section className="analytics-panel" aria-labelledby="rewards-title">
          <PanelHeading
            eyebrow="Realization"
            icon={Gift}
            id="rewards-title"
            title="Reward delivery"
          />
          <dl className="analytics-ledger-list analytics-commerce-list">
            <PerformanceRow
              definition="rewards.requests"
              label="Requests"
              value={formatCount(report.rewards.requests)}
            />
            <PerformanceRow
              definition="rewards.captures"
              label="Captured"
              value={formatCount(report.rewards.captures)}
            />
            <PerformanceRow
              definition="rewards.captured_points"
              label="Points captured"
              value={formatAnalyticsPoints(report.rewards.capturedPoints)}
            />
            <PerformanceRow
              definition="rewards.unresolved"
              label="Unresolved now"
              value={formatCount(report.rewards.unresolvedAtAsOf)}
            />
            <PerformanceRow
              definition="rewards.mature.unresolved"
              label="Unresolved after 24 hours"
              value={formatCount(report.rewards.maturity.unresolved)}
            />
          </dl>
        </section>

        <section className="analytics-panel" aria-labelledby="tiers-title">
          <PanelHeading
            eyebrow="Progression"
            icon={Crown}
            id="tiers-title"
            title="VIP movement"
          />
          <dl className="analytics-ledger-list analytics-commerce-list">
            <PerformanceRow
              definition="tiers.movements.entry"
              label="Entries"
              value={formatCount(report.tiers.entry)}
            />
            <PerformanceRow
              definition="tiers.movements.upgrade"
              label="Upgrades"
              value={formatCount(report.tiers.upgrade)}
            />
            <PerformanceRow
              definition="tiers.movements.grace"
              label="Grace"
              value={formatCount(report.tiers.grace)}
            />
            <PerformanceRow
              definition="tiers.movements.downgrade"
              label="Downgrades"
              value={formatCount(report.tiers.downgrade)}
            />
            <PerformanceRow
              definition="tiers.movements.manual"
              label="Manual decisions"
              value={formatCount(report.tiers.manual)}
            />
          </dl>
        </section>
      </div>

      <div className="analytics-grid analytics-commerce-grid">
        <section className="analytics-panel" aria-labelledby="referrals-title">
          <PanelHeading
            eyebrow={`${formatCount(report.referrals.activeAdvocates)} active advocates`}
            icon={UsersRound}
            id="referrals-title"
            title="Referral funnel"
          />
          <dl className="analytics-ledger-list analytics-commerce-list">
            <PerformanceRow
              definition="referrals.attributions"
              label="Attributed"
              value={formatCount(report.referrals.attributions)}
            />
            <PerformanceRow
              definition="referrals.pending"
              label="Pending or cooling"
              value={formatCount(report.referrals.pending)}
            />
            <PerformanceRow
              definition="referrals.qualified"
              label="Qualified"
              value={formatCount(report.referrals.qualified)}
            />
            <PerformanceRow
              definition="referrals.rejected"
              label="Rejected"
              value={formatCount(report.referrals.rejected)}
            />
            <PerformanceRow
              definition="referrals.reversed"
              label="Reversed"
              value={formatCount(report.referrals.reversed)}
            />
          </dl>
          <p className="analytics-panel-footnote">
            Net referral value:{" "}
            <strong>
              {formatAnalyticsPoints(report.referrals.advocatePointsNet)}
            </strong>{" "}
            to advocates and{" "}
            <strong>
              {formatAnalyticsPoints(report.referrals.friendPointsNet)}
            </strong>{" "}
            to friends.
          </p>
        </section>

        <section className="analytics-panel" aria-labelledby="campaign-title">
          <PanelHeading
            eyebrow="Direct attribution"
            icon={Megaphone}
            id="campaign-title"
            title="Campaign influence"
          />
          <dl className="analytics-ledger-list analytics-commerce-list">
            <PerformanceRow
              definition="campaigns.treatment_outcomes"
              label="Treatment outcomes"
              value={formatCount(report.campaigns.treatmentOutcomes)}
            />
            <PerformanceRow
              definition="campaigns.control_outcomes"
              label="Control observations"
              value={formatCount(report.campaigns.controlOutcomes)}
            />
            <PerformanceRow
              definition="campaigns.influenced_eligible_spend"
              label="Influenced eligible spend"
              value={campaignMoney}
            />
            <PerformanceRow
              definition="campaigns.points_net"
              label="Net campaign points"
              value={formatAnalyticsPoints(report.campaigns.pointsNet)}
            />
            <PerformanceRow
              definition="campaigns.manual_review_jobs"
              label="Manual review jobs"
              value={formatCount(report.campaigns.manualReviewJobs)}
            />
          </dl>
          <p className="analytics-panel-footnote">
            <strong>Incremental revenue unavailable.</strong> Treatment/control
            assignment alone is not an estimator. S03 must declare the
            population, window, exclusions, samples, and formula first.
          </p>
        </section>
      </div>

      <div className="analytics-cohort-note">
        <Clock3 aria-hidden="true" />
        <div>
          <strong>Reward realization has a complete observation window</strong>
          <p>
            Requests from {formatUtcDate(report.rewards.maturity.cohortFrom)}–
            {formatUtcDate(report.rewards.maturity.cohortTo)} each had 24 hours
            to reach a ledger-backed capture. Ambiguous issued work does not
            count as realized.
          </p>
        </div>
      </div>
    </section>
  );
}

function CohortRetention({
  report,
}: Readonly<{ report: AnalyticsCohortRetentionReportV1 | null }>) {
  if (!report) {
    return (
      <section className="analytics-module-unavailable" role="status">
        <AlertTriangle aria-hidden="true" />
        <div>
          <strong>Cohort evidence stopped before showing uncertain data</strong>
          <p>
            Point, commerce, and programme outcomes remain available. Cohort
            retention and experiments return after maturity, assignment,
            currency, and purchase evidence independently reconcile.
          </p>
        </div>
      </section>
    );
  }

  const experiment = report.campaignExperiments;
  const cards = [
    {
      icon: BadgeCheck,
      key: "cohorts.members.activation_rate_30d" as const,
      label: "30-day activation",
      value: formatAnalyticsBasisPoints(
        report.membershipActivation.activationRateBasisPoints,
      ),
      note: `${formatCount(report.membershipActivation.activatedMembers)} of ${formatCount(
        report.membershipActivation.joinedMembers,
      )} mature members`,
      tone: "violet",
    },
    {
      icon: Repeat2,
      key: "cohorts.earning.retention_rate_days_31_60" as const,
      label: "Days 31–60 retention",
      value: formatAnalyticsBasisPoints(
        report.earningRetention.retentionRateBasisPoints,
      ),
      note: `${formatCount(report.earningRetention.retainedMembers)} of ${formatCount(
        report.earningRetention.qualifiedMembers,
      )} first earners`,
      tone: "green",
    },
    {
      icon: Megaphone,
      key: "experiments.campaigns.available" as const,
      label: "Measured experiments",
      value: formatCount(experiment.availableCampaigns),
      note: `${formatCount(experiment.eligibleCampaigns)} eligible campaign windows`,
      tone: "blue",
    },
    {
      icon: ShieldCheck,
      key: "experiments.campaigns.unavailable" as const,
      label: "Evidence-gated",
      value: formatCount(experiment.unavailableCampaigns),
      note: "No missing evidence is represented as zero",
      tone: "amber",
    },
  ];

  return (
    <section
      className="analytics-performance analytics-cohorts"
      aria-labelledby="cohorts-title"
    >
      <header className="analytics-section-heading">
        <div>
          <p className="login-eyebrow">Cohorts &amp; experiments</p>
          <h2 id="cohorts-title">Retention with a complete window</h2>
          <p>
            Daily cohorts are mature before they enter a denominator. Campaign
            lift appears only when immutable control evidence supports the
            declared estimator.
          </p>
        </div>
        <Activity aria-hidden="true" />
      </header>

      <div className="analytics-summary analytics-performance-summary">
        {cards.map((card) => (
          <article className={`analytics-kpi is-${card.tone}`} key={card.key}>
            <span className="analytics-kpi-icon">
              <card.icon aria-hidden="true" />
            </span>
            <div>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </div>
            <MetricDefinitionButton metricKey={card.key} />
          </article>
        ))}
      </div>

      <div className="analytics-grid analytics-commerce-grid">
        <CohortTable
          caption="Membership activation by join date"
          definition="cohorts.members.activation_rate_30d"
          eligibleLabel="Joined"
          outcomeLabel="Activated"
          rows={report.membershipActivation.cohorts}
          title="Join → first earning"
        />
        <CohortTable
          caption="Earning retention by first earning date"
          definition="cohorts.earning.retention_rate_days_31_60"
          eligibleLabel="First earned"
          outcomeLabel="Returned"
          rows={report.earningRetention.cohorts}
          title="First earning → return"
        />
      </div>

      <section
        className="analytics-panel analytics-experiments"
        aria-labelledby="experiments-title"
      >
        <PanelHeading
          eyebrow="Intention-to-treat evidence"
          icon={Megaphone}
          id="experiments-title"
          title="Campaign incrementality"
        />
        {experiment.campaigns.length === 0 ? (
          <div className="analytics-experiment-empty">
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>No experiment window overlaps this period</strong>
              <p>
                Approve a campaign with a control group to begin collecting
                immutable assignment and eligible-spend evidence.
              </p>
            </div>
          </div>
        ) : (
          <div className="analytics-experiment-list">
            {experiment.campaigns.map((campaign) => {
              const result = campaign.incrementality;
              const estimate =
                result.status === "available"
                  ? formatAnalyticsCurrencyMinor(
                      result.estimatedIncrementalEligibleSpendMinor,
                      result.currencyCode,
                      result.minorUnitDigits,
                    )
                  : "Unavailable";
              return (
                <article key={campaign.campaignVersionPublicId}>
                  <header>
                    <div>
                      <span>{campaign.code.replaceAll("_", " ")}</span>
                      <small>Version {campaign.versionNumber}</small>
                    </div>
                    <span
                      className={`analytics-experiment-status is-${result.status}`}
                    >
                      {result.status === "available"
                        ? "Measured"
                        : "Evidence required"}
                    </span>
                  </header>
                  <dl>
                    <div>
                      <dt>Treatment</dt>
                      <dd>{formatCount(campaign.treatmentMembers)}</dd>
                    </div>
                    <div>
                      <dt>Control</dt>
                      <dd>{formatCount(campaign.controlMembers)}</dd>
                    </div>
                    <div>
                      <dt>Estimated lift</dt>
                      <dd>{estimate}</dd>
                    </div>
                  </dl>
                  <p>
                    {result.status === "available"
                      ? "Refund-compensated eligible-spend point estimate; statistical significance is not claimed."
                      : `Unavailable: ${result.reason.replaceAll("_", " ")}. No monetary value is emitted.`}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="analytics-cohort-note">
        <Clock3 aria-hidden="true" />
        <div>
          <strong>
            Cohort dates use {report.cohortPeriod.timeZone} local days
          </strong>
          <p>
            {formatLocalDate(report.cohortPeriod.fromLocalDate)}–
            {formatLocalDate(report.cohortPeriod.toLocalDateExclusive)}. The end
            is exclusive and shifted back 60 days so every retention opportunity
            is fully observed.
          </p>
        </div>
      </div>
    </section>
  );
}

function CohortTable({
  caption,
  definition,
  eligibleLabel,
  outcomeLabel,
  rows,
  title,
}: Readonly<{
  caption: string;
  definition: AnalyticsMetricKeyV4;
  eligibleLabel: string;
  outcomeLabel: string;
  rows: AnalyticsCohortRetentionReportV1["membershipActivation"]["cohorts"];
  title: string;
}>) {
  return (
    <section className="analytics-panel analytics-cohort-panel">
      <header className="analytics-cohort-table-heading">
        <div>
          <p>Daily mature cohorts</p>
          <h3>{title}</h3>
        </div>
        <MetricDefinitionButton metricKey={definition} />
      </header>
      <div className="analytics-cohort-table-wrap">
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col">Cohort</th>
              <th scope="col">{eligibleLabel}</th>
              <th scope="col">{outcomeLabel}</th>
              <th scope="col">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.localDate}>
                <th scope="row">{formatLocalDate(row.localDate)}</th>
                <td>{formatCount(row.eligibleMembers)}</td>
                <td>{formatCount(row.outcomeMembers)}</td>
                <td>{formatAnalyticsBasisPoints(row.rateBasisPoints)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CommercePerformance({
  report,
}: Readonly<{ report: AnalyticsCommercePerformanceReportV1 | null }>) {
  if (!report) {
    return (
      <section className="analytics-module-unavailable" role="status">
        <AlertTriangle aria-hidden="true" />
        <div>
          <strong>
            Commerce performance stopped before showing uncertain data
          </strong>
          <p>
            Point value remains available above. Commerce metrics will return
            after V1/V2 source, refund, customer-link, and currency evidence
            passes its independent contract.
          </p>
        </div>
      </section>
    );
  }

  const currency = report.currency;
  const money = (value: string | null) =>
    currency.status === "available" && value !== null
      ? formatAnalyticsCurrencyMinor(
          value,
          currency.code,
          currency.minorUnitDigits,
        )
      : "Unavailable";
  const cards = [
    {
      icon: TrendingUp,
      key: "members.activation.rate" as const,
      label: "30-day activation",
      value: formatAnalyticsBasisPoints(
        report.members.activation.rateBasisPoints,
      ),
      note: `${formatCount(report.members.activation.activatedMembers)} of ${formatCount(
        report.members.activation.cohortMembers,
      )} mature members`,
      tone: "violet",
    },
    {
      icon: Activity,
      key: "members.participation_rate" as const,
      label: "Participation",
      value: formatAnalyticsBasisPoints(
        report.members.participationRateBasisPoints,
      ),
      note: `${formatCount(report.members.participatingMembers)} active members`,
      tone: "green",
    },
    {
      icon: ShoppingBag,
      key: "commerce.spend.net_eligible" as const,
      label: "Net eligible spend",
      value: money(report.commerce.netEligibleSpendMinor),
      note: `${formatCount(report.commerce.netEligibleOrders)} refund-adjusted orders`,
      tone: "blue",
    },
    {
      icon: Repeat2,
      key: "commerce.repeat_purchase_rate" as const,
      label: "Repeat purchase",
      value: formatAnalyticsBasisPoints(
        report.commerce.repeatPurchaseRateBasisPoints,
      ),
      note: `${formatCount(report.commerce.repeatPurchasingMembers)} repeat purchasers`,
      tone: "amber",
    },
  ];

  return (
    <section
      className="analytics-performance"
      aria-labelledby="performance-title"
    >
      <header className="analytics-section-heading">
        <div>
          <p className="login-eyebrow">Member &amp; commerce outcomes</p>
          <h2 id="performance-title">What the programme is doing</h2>
          <p>
            Original order timing, later refund knowledge, and legacy coverage
            remain separate and auditable.
          </p>
        </div>
        <TrendingUp aria-hidden="true" />
      </header>

      <div className="analytics-summary analytics-performance-summary">
        {cards.map((card) => (
          <article className={`analytics-kpi is-${card.tone}`} key={card.key}>
            <span className="analytics-kpi-icon">
              <card.icon aria-hidden="true" />
            </span>
            <div>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </div>
            <MetricDefinitionButton metricKey={card.key} />
          </article>
        ))}
      </div>

      <div className="analytics-grid analytics-commerce-grid">
        <section className="analytics-panel" aria-labelledby="commerce-title">
          <PanelHeading
            eyebrow={`${report.period.rangeDays}-day outcomes`}
            icon={ShoppingBag}
            id="commerce-title"
            title="Commerce pulse"
          />
          <dl className="analytics-ledger-list analytics-commerce-list">
            <PerformanceRow
              definition="commerce.orders.net_eligible"
              label="Net eligible orders"
              value={formatCount(report.commerce.netEligibleOrders)}
            />
            <PerformanceRow
              definition="commerce.members.purchasing"
              label="Purchasing members"
              value={formatCount(report.commerce.purchasingMembers)}
            />
            <PerformanceRow
              definition="commerce.members.repeat_purchasing"
              label="Repeat purchasers"
              value={formatCount(report.commerce.repeatPurchasingMembers)}
            />
            <PerformanceRow
              definition="commerce.aov.net_eligible"
              label="Net eligible AOV"
              value={money(report.commerce.averageOrderValueMinor)}
            />
            <PerformanceRow
              definition="commerce.ltv.observed"
              label="Observed member LTV"
              value={money(report.commerce.observedLifetimeValueMinor)}
            />
          </dl>
          <p className="analytics-panel-footnote">
            Observed LTV uses{" "}
            {formatCount(report.commerce.observedLifetimePurchasingMembers)}{" "}
            linked lifetime purchasers. It is descriptive—not forecast or
            incrementality.
          </p>
        </section>

        <section className="analytics-panel" aria-labelledby="coverage-title">
          <PanelHeading
            eyebrow="Source integrity"
            icon={DatabaseZap}
            id="coverage-title"
            title="Coverage &amp; identity"
          />
          <div
            className={`analytics-coverage-status is-${report.coverage.status}`}
          >
            {report.coverage.status === "complete" ? (
              <ShieldCheck aria-hidden="true" />
            ) : (
              <AlertTriangle aria-hidden="true" />
            )}
            <div>
              <strong>
                {report.coverage.status === "complete"
                  ? "Customer linkage complete"
                  : "Partial customer linkage"}
              </strong>
              <small>
                Missing links stay in commerce totals and out of member-only
                denominators.
              </small>
            </div>
          </div>
          <dl className="analytics-ledger-list analytics-commerce-list">
            <PerformanceRow
              definition="commerce.coverage.v1_net_orders"
              label="Legacy V1 net orders"
              value={formatCount(report.coverage.v1NetEligibleOrders)}
            />
            <PerformanceRow
              definition="commerce.coverage.v2_net_orders"
              label="V2 fact net orders"
              value={formatCount(report.coverage.v2NetEligibleOrders)}
            />
            <PerformanceRow
              definition="commerce.coverage.guest_net_orders"
              label="Guest net orders"
              value={formatCount(report.coverage.guestNetEligibleOrders)}
            />
            <PerformanceRow
              definition="commerce.coverage.missing_customer_link_orders"
              label="Orders missing member linkage"
              value={formatCount(report.coverage.missingCustomerLinkOrders)}
            />
          </dl>
          <p className="analytics-panel-footnote">
            Currency:{" "}
            {currency.status === "available" ? (
              <strong>
                {currency.code} · {currency.minorUnitDigits} decimal places
              </strong>
            ) : (
              <strong>
                unavailable · {currency.reason.replaceAll("_", " ")}
              </strong>
            )}
          </p>
        </section>
      </div>

      <div className="analytics-cohort-note">
        <UsersRound aria-hidden="true" />
        <div>
          <strong>Activation cohort is fully mature</strong>
          <p>
            Joined {formatUtcDate(report.members.activation.cohortFrom)}–
            {formatUtcDate(report.members.activation.cohortTo)}. Only a first
            released earning within 30 days counts; pending awards and manual
            credits do not.
          </p>
        </div>
      </div>
    </section>
  );
}

function PerformanceRow({
  definition,
  label,
  value,
}: Readonly<{
  definition: AnalyticsMetricKeyV4;
  label: string;
  value: string;
}>) {
  return (
    <div>
      <dt>
        {label} <MetricDefinitionButton metricKey={definition} />
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function PanelHeading({
  eyebrow,
  icon: Icon,
  id,
  title,
}: Readonly<{
  eyebrow: string;
  icon: typeof WalletCards;
  id: string;
  title: string;
}>) {
  return (
    <header className="analytics-panel-heading">
      <span>
        <Icon aria-hidden="true" />
      </span>
      <div>
        <p>{eyebrow}</p>
        <h2 id={id}>{title}</h2>
      </div>
    </header>
  );
}

function LedgerRow({
  keyName,
  label,
  value,
}: Readonly<{
  keyName: AnalyticsMetricKeyV4;
  label: string;
  value: string;
}>) {
  return (
    <div>
      <dt>
        {label} <MetricDefinitionButton metricKey={keyName} />
      </dt>
      <dd>{formatAnalyticsPoints(value)}</dd>
    </div>
  );
}

function FlowValue({
  icon: Icon,
  keyName,
  label,
  value,
}: Readonly<{
  icon: typeof WalletCards;
  keyName: AnalyticsMetricKeyV4;
  label: string;
  value: string;
}>) {
  return (
    <article>
      <Icon aria-hidden="true" />
      <span>{label}</span>
      <strong>{formatAnalyticsPoints(value)}</strong>
      <MetricDefinitionButton metricKey={keyName} />
    </article>
  );
}

function ExpiryBar({
  keyName,
  label,
  total,
  value,
}: Readonly<{
  keyName: AnalyticsMetricKeyV4;
  label: string;
  total: string;
  value: string;
}>) {
  const basisPoints = analyticsShareBasisPoints(value, total);
  return (
    <div className="analytics-expiry-row">
      <div>
        <span>
          {label} <MetricDefinitionButton metricKey={keyName} />
        </span>
        <strong>{formatAnalyticsPoints(value)}</strong>
      </div>
      <div
        aria-label={`${label}: ${(basisPoints / 100).toFixed(2)}% of lot-backed points`}
        className="analytics-expiry-track"
        role="img"
      >
        <span style={{ width: `${basisPoints / 100}%` }} />
      </div>
    </div>
  );
}

function MetricDefinitionButton({
  metricKey,
}: Readonly<{ metricKey: AnalyticsMetricKeyV4 }>) {
  const definition = analyticsMetricDefinition(metricKey);
  return (
    <span
      aria-label={`${definition.label} definition: ${definition.description}`}
      className="analytics-info"
      role="img"
      title={`${definition.description} Formula: ${definition.formula}`}
    >
      <Info aria-hidden="true" />
    </span>
  );
}

function MetricDictionary() {
  return (
    <section
      className="analytics-dictionary"
      aria-labelledby="dictionary-title"
    >
      <header>
        <div>
          <p className="login-eyebrow">Metric dictionary v4</p>
          <h2 id="dictionary-title">Definitions behind every value</h2>
          <p>
            Formula, source, grain, timezone boundary, caveats, and causal class
            are part of the product contract—not dashboard copy.
          </p>
        </div>
        <DatabaseZap aria-hidden="true" />
      </header>
      <div className="analytics-definition-list">
        {analyticsMetricDictionaryV4.definitions.map((definition) => (
          <details key={definition.key}>
            <summary>
              <span>{definition.label}</span>
              <code>{definition.key}</code>
            </summary>
            <div>
              <p>{definition.description}</p>
              <dl>
                <div>
                  <dt>Formula</dt>
                  <dd>{definition.formula}</dd>
                </div>
                <div>
                  <dt>Grain</dt>
                  <dd>{definition.grain}</dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>{definition.timeBoundary}</dd>
                </div>
                <div>
                  <dt>Classification</dt>
                  <dd>{definition.causalClass}</dd>
                </div>
              </dl>
              {definition.caveats.map((caveat) => (
                <small key={caveat}>{caveat}</small>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function formatCount(value: string): string {
  return new Intl.NumberFormat("en-GB").format(BigInt(value));
}

function formatUtcDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatLocalDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
