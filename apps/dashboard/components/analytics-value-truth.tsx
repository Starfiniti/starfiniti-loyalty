import {
  analyticsMetricDictionaryV1,
  type AnalyticsMetricKeyV1,
  type AnalyticsValueTruthReportV1,
} from "@starfiniti/contracts";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  DatabaseZap,
  Info,
  RefreshCcw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import {
  analyticsMetricDefinition,
  analyticsShareBasisPoints,
  formatAnalyticsPeriod,
  formatAnalyticsPoints,
  type AnalyticsRange,
} from "@/lib/analytics";

type AnalyticsState =
  | Readonly<{ kind: "ready"; report: AnalyticsValueTruthReportV1 }>
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
          <h1>Value &amp; liability truth</h1>
          <p>
            Follow every point from issue to expiry. Values only appear after
            immutable history and operational projections reconcile exactly.
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
        <AnalyticsReport report={state.report} />
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
  report,
}: Readonly<{ report: AnalyticsValueTruthReportV1 }>) {
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
  keyName: AnalyticsMetricKeyV1;
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
  keyName: AnalyticsMetricKeyV1;
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
  keyName: AnalyticsMetricKeyV1;
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
}: Readonly<{ metricKey: AnalyticsMetricKeyV1 }>) {
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
          <p className="login-eyebrow">Metric dictionary v1</p>
          <h2 id="dictionary-title">Definitions behind every value</h2>
          <p>
            Formula, source, grain, UTC boundary, caveats, and causal class are
            part of the product contract—not dashboard copy.
          </p>
        </div>
        <DatabaseZap aria-hidden="true" />
      </header>
      <div className="analytics-definition-list">
        {analyticsMetricDictionaryV1.definitions.map((definition) => (
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
