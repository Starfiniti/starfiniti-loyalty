import {
  analyticsMetricDictionaryV1,
  analyticsValueTruthReportV1,
  type AnalyticsMetricDefinitionV1,
  type AnalyticsMetricKeyV1,
  type AnalyticsValueTruthReportV1,
} from "@starfiniti/contracts";
import { formatExactInteger, type OverviewRange } from "./overview";

export type AnalyticsRange = OverviewRange;
export type AnalyticsRow = Readonly<Record<string, unknown>>;

export function parseAnalyticsValueTruthRow(
  row: AnalyticsRow,
): AnalyticsValueTruthReportV1 {
  return analyticsValueTruthReportV1.parse({
    reportVersion: row.report_version,
    dictionaryVersion: row.dictionary_version,
    asOf: row.report_as_of,
    period: {
      from: row.period_from,
      to: row.period_to,
      rangeDays: row.range_days,
      timeZone: "UTC",
    },
    projection: {
      status: row.projection_status,
      walletCount: row.wallet_count,
      walletAccountCount: row.wallet_account_count,
      ledgerEntryCount: row.ledger_entry_count,
      lotCount: row.lot_count,
    },
    snapshot: {
      pendingPoints: row.pending_points,
      availablePoints: row.available_points,
      reservedPoints: row.reserved_points,
      spentPoints: row.spent_points,
      expiredPoints: row.expired_points,
      reversedPoints: row.reversed_points,
      outstandingPoints: row.outstanding_points,
    },
    flows: {
      awardedPoints: row.awarded_flow_points,
      releasedPoints: row.released_flow_points,
      reservedPoints: row.reserved_flow_points,
      capturedPoints: row.captured_flow_points,
      cancelledPoints: row.cancelled_flow_points,
      expiredPoints: row.expired_flow_points,
      refundReversedPoints: row.refund_reversed_flow_points,
      manualCreditPoints: row.manual_credit_points,
      manualDebitPoints: row.manual_debit_points,
      manualNetPoints: row.manual_net_points,
    },
    expiry: {
      lotBackedPoints: row.lot_backed_points,
      overdueAvailablePoints: row.overdue_available_points,
      reservedPastExpiryPoints: row.reserved_past_expiry_points,
      expiringNext30Days: row.expiring_next_30_days,
      expiringDays31To90: row.expiring_days_31_to_90,
      expiringBeyond90Days: row.expiring_beyond_90_days,
      affectedMembers: row.affected_members,
      nextExpiryAt: row.next_expiry_at,
    },
    monetaryLiability: {
      status: row.monetary_liability_status,
      reason: row.monetary_liability_reason,
    },
  });
}

export function analyticsMetricDefinition(
  key: AnalyticsMetricKeyV1,
): AnalyticsMetricDefinitionV1 {
  const definition = analyticsMetricDictionaryV1.definitions.find(
    (candidate) => candidate.key === key,
  );
  if (!definition) throw new Error("analytics_metric_definition_missing");
  return definition;
}

export function formatAnalyticsPoints(
  value: string,
  locale: string = "en-GB",
): string {
  return `${formatExactInteger(value, locale)} pts`;
}

export function analyticsShareBasisPoints(
  value: string,
  total: string,
): number {
  const numerator = BigInt(value);
  const denominator = BigInt(total);
  if (numerator <= 0n || denominator <= 0n) return 0;
  const basisPoints = (numerator * 10_000n) / denominator;
  return Number(basisPoints > 10_000n ? 10_000n : basisPoints);
}

export function formatAnalyticsPeriod(
  report: AnalyticsValueTruthReportV1,
  locale: string = "en-GB",
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(new Date(report.period.from))} – ${formatter.format(
    new Date(report.period.to),
  )} · UTC`;
}
