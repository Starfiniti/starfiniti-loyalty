import {
  analyticsCommercePerformanceReportV1,
  analyticsMetricDictionaryV2,
  analyticsValueTruthReportV1,
  type AnalyticsCommercePerformanceReportV1,
  type AnalyticsMetricDefinitionV2,
  type AnalyticsMetricKeyV2,
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
  key: AnalyticsMetricKeyV2,
): AnalyticsMetricDefinitionV2 {
  const definition = analyticsMetricDictionaryV2.definitions.find(
    (candidate) => candidate.key === key,
  );
  if (!definition) throw new Error("analytics_metric_definition_missing");
  return definition;
}

export function parseAnalyticsCommercePerformanceRow(
  row: AnalyticsRow,
): AnalyticsCommercePerformanceReportV1 {
  return analyticsCommercePerformanceReportV1.parse({
    reportVersion: row.report_version,
    dictionaryVersion: row.dictionary_version,
    asOf: row.report_as_of,
    period: {
      from: row.period_from,
      to: row.period_to,
      rangeDays: row.range_days,
      timeZone: "UTC",
    },
    currency: {
      status: row.currency_status,
      code: row.currency_code,
      minorUnitDigits: row.currency_minor_unit_digits,
      reason: row.currency_reason,
    },
    members: {
      total: row.members_total,
      activation: {
        windowDays: row.activation_window_days,
        cohortFrom: row.activation_cohort_from,
        cohortTo: row.activation_cohort_to,
        cohortMembers: row.activation_cohort_members,
        activatedMembers: row.activated_members,
        rateBasisPoints: row.activation_rate_basis_points,
      },
      participatingMembers: row.participating_members,
      participationRateBasisPoints: row.participation_rate_basis_points,
    },
    commerce: {
      netEligibleOrders: row.net_eligible_orders,
      purchasingMembers: row.purchasing_members,
      repeatPurchasingMembers: row.repeat_purchasing_members,
      repeatPurchaseRateBasisPoints: row.repeat_purchase_rate_basis_points,
      netEligibleSpendMinor: row.net_eligible_spend_minor,
      averageOrderValueMinor: row.average_order_value_minor,
      observedLifetimeEligibleSpendMinor:
        row.observed_lifetime_eligible_spend_minor,
      observedLifetimePurchasingMembers:
        row.observed_lifetime_purchasing_members,
      observedLifetimeValueMinor: row.observed_lifetime_value_minor,
    },
    coverage: {
      status: row.coverage_status,
      v1NetEligibleOrders: row.v1_net_eligible_orders,
      v2NetEligibleOrders: row.v2_net_eligible_orders,
      guestNetEligibleOrders: row.guest_net_eligible_orders,
      missingCustomerLinkOrders: row.missing_customer_link_orders,
      missingCustomerLinkSpendMinor: row.missing_customer_link_spend_minor,
    },
  });
}

export function formatAnalyticsPoints(
  value: string,
  locale: string = "en-GB",
): string {
  return `${formatExactInteger(value, locale)} pts`;
}

export function formatAnalyticsBasisPoints(value: string): string {
  const basisPoints = BigInt(value);
  const whole = basisPoints / 100n;
  const fraction = (basisPoints % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}%`;
}

export function formatAnalyticsCurrencyMinor(
  value: string,
  currencyCode: string,
  minorUnitDigits: number,
  locale: string = "en-GB",
): string {
  const amount = BigInt(value);
  const scale = 10n ** BigInt(minorUnitDigits);
  const whole = amount / scale;
  const fraction = amount % scale;
  const formattedWhole = new Intl.NumberFormat(locale).format(whole);
  if (minorUnitDigits === 0) return `${formattedWhole} ${currencyCode}`;
  const decimal =
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((part) => part.type === "decimal")?.value ?? ".";
  return `${formattedWhole}${decimal}${fraction
    .toString()
    .padStart(minorUnitDigits, "0")} ${currencyCode}`;
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
