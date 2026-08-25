import { describe, expect, it } from "vitest";
import {
  analyticsMetricDefinition,
  analyticsShareBasisPoints,
  formatAnalyticsBasisPoints,
  formatAnalyticsCurrencyMinor,
  formatAnalyticsPeriod,
  formatAnalyticsPoints,
  parseAnalyticsCommercePerformanceRow,
  parseAnalyticsProgrammeOutcomeRow,
  parseAnalyticsValueTruthRow,
} from "./analytics";

const row = {
  report_version: "1",
  dictionary_version: "1",
  report_as_of: "2026-08-26T00:00:00Z",
  period_from: "2026-08-19T00:00:00Z",
  period_to: "2026-08-26T00:00:00Z",
  range_days: 7,
  projection_status: "reconciled",
  wallet_count: "1",
  wallet_account_count: "6",
  ledger_entry_count: "9",
  lot_count: "3",
  pending_points: "0",
  available_points: "9007199254741038",
  reserved_points: "0",
  spent_points: "40",
  expired_points: "20",
  reversed_points: "10",
  outstanding_points: "9007199254741038",
  awarded_flow_points: "9007199254740993",
  released_flow_points: "9007199254740993",
  reserved_flow_points: "40",
  captured_flow_points: "40",
  cancelled_flow_points: "0",
  expired_flow_points: "20",
  refund_reversed_flow_points: "10",
  manual_credit_points: "120",
  manual_debit_points: "5",
  manual_net_points: "115",
  lot_backed_points: "9007199254741038",
  overdue_available_points: "0",
  reserved_past_expiry_points: "0",
  expiring_next_30_days: "9007199254740938",
  expiring_days_31_to_90: "0",
  expiring_beyond_90_days: "100",
  affected_members: "1",
  next_expiry_at: "2026-09-10T00:00:00Z",
  monetary_liability_status: "unavailable",
  monetary_liability_reason: "valuation_policy_not_configured",
};

const commerceRow = {
  report_version: "1",
  dictionary_version: "2",
  report_as_of: "2026-08-26T00:00:00Z",
  period_from: "2026-08-19T00:00:00Z",
  period_to: "2026-08-26T00:00:00Z",
  range_days: 7,
  currency_status: "available",
  currency_code: "EUR",
  currency_minor_unit_digits: 2,
  currency_reason: null,
  members_total: "4",
  activation_window_days: 30,
  activation_cohort_from: "2026-07-20T00:00:00Z",
  activation_cohort_to: "2026-07-27T00:00:00Z",
  activation_cohort_members: "2",
  activated_members: "1",
  activation_rate_basis_points: "5000",
  participating_members: "2",
  participation_rate_basis_points: "5000",
  net_eligible_orders: "4",
  purchasing_members: "2",
  repeat_purchasing_members: "2",
  repeat_purchase_rate_basis_points: "10000",
  net_eligible_spend_minor: "9007199254740993",
  average_order_value_minor: "2251799813685248",
  observed_lifetime_eligible_spend_minor: "42000",
  observed_lifetime_purchasing_members: "3",
  observed_lifetime_value_minor: "14000",
  coverage_status: "partial_customer_linkage",
  v1_net_eligible_orders: "3",
  v2_net_eligible_orders: "1",
  guest_net_eligible_orders: "2",
  missing_customer_link_orders: "1",
  missing_customer_link_spend_minor: "0",
};

const outcomeRow = {
  report_version: "1",
  dictionary_version: "3",
  report_as_of: "2026-08-26T00:00:00Z",
  period_from: "2026-08-19T00:00:00Z",
  period_to: "2026-08-26T00:00:00Z",
  range_days: 7,
  reward_requests: "10",
  reward_captures: "8",
  reward_captured_points: "9007199254740993",
  reward_unresolved_at_as_of: "2",
  reward_maturity_window_hours: 24,
  reward_mature_cohort_from: "2026-08-18T00:00:00Z",
  reward_mature_cohort_to: "2026-08-25T00:00:00Z",
  reward_mature_requests: "8",
  reward_mature_captures: "6",
  reward_mature_unresolved: "1",
  reward_mature_capture_rate_basis_points: "7500",
  tier_decisions: "10",
  tier_moved_members: "6",
  tier_entry: "1",
  tier_reentry: "1",
  tier_upgrade: "2",
  tier_grace: "1",
  tier_downgrade: "1",
  tier_manual: "1",
  tier_none: "3",
  referral_active_advocates: "4",
  referral_attributions: "10",
  referral_pending: "2",
  referral_qualified: "5",
  referral_rejected: "2",
  referral_reversed: "1",
  referral_qualification_rate_basis_points: "5000",
  referral_issuances: "6",
  referral_compensations: "1",
  referral_advocate_points_issued: "600",
  referral_friend_points_issued: "300",
  referral_advocate_points_reversed: "100",
  referral_friend_points_reversed: "50",
  referral_advocate_points_net: "500",
  referral_friend_points_net: "250",
  campaign_currency_status: "available",
  campaign_currency_code: "EUR",
  campaign_currency_minor_unit_digits: 2,
  campaign_currency_reason: null,
  campaign_treatment_outcomes: "7",
  campaign_control_outcomes: "3",
  campaign_capacity_exhausted: "1",
  campaign_suppressed: "1",
  campaign_influenced_orders: "4",
  campaign_influenced_members: "3",
  campaign_influenced_eligible_spend_minor: "22000",
  campaign_points_awarded_gross: "1000",
  campaign_points_reversed: "200",
  campaign_points_net: "800",
  campaign_rewards_reserved: "2",
  campaign_manual_review_jobs: "1",
  campaign_incrementality_status: "unavailable",
  campaign_incrementality_reason: "estimator_not_configured",
  campaign_incremental_revenue_minor: null,
};

describe("analytics presentation", () => {
  it("maps snake-case RPC evidence into the strict value-truth contract", () => {
    const report = parseAnalyticsValueTruthRow(row);
    expect(report.snapshot.availablePoints).toBe("9007199254741038");
    expect(report.projection.status).toBe("reconciled");
    expect(report.monetaryLiability.status).toBe("unavailable");
  });

  it("rejects arithmetic drift before the browser can render it", () => {
    expect(() =>
      parseAnalyticsValueTruthRow({ ...row, outstanding_points: "1" }),
    ).toThrow();
  });

  it("formats exact points and UTC period labels without precision loss", () => {
    const report = parseAnalyticsValueTruthRow(row);
    expect(formatAnalyticsPoints(report.snapshot.availablePoints)).toBe(
      "9,007,199,254,741,038 pts",
    );
    expect(formatAnalyticsPeriod(report)).toBe(
      "19 Aug 2026 – 26 Aug 2026 · UTC",
    );
  });

  it("calculates bounded visualization shares using bigint arithmetic", () => {
    expect(analyticsShareBasisPoints("25", "100")).toBe(2500);
    expect(analyticsShareBasisPoints("0", "0")).toBe(0);
    expect(analyticsShareBasisPoints("101", "100")).toBe(10000);
  });

  it("exposes the exact metric definition beside each value", () => {
    expect(
      analyticsMetricDefinition("points.snapshot.outstanding"),
    ).toMatchObject({
      availability: "available",
      currencyPolicy: "not_applicable",
      causalClass: "operational",
    });
    expect(analyticsMetricDefinition("liability.monetary")).toMatchObject({
      availability: "unavailable",
      currencyPolicy: "unavailable_without_valuation_policy",
    });
    expect(analyticsMetricDefinition("commerce.ltv.observed")).toMatchObject({
      causalClass: "descriptive",
      currencyPolicy: "single_currency_minor_units",
      displayFormat: "currency_minor",
    });
  });

  it("maps exact commerce performance and formats money without Number", () => {
    const report = parseAnalyticsCommercePerformanceRow(commerceRow);
    expect(report.commerce.netEligibleSpendMinor).toBe("9007199254740993");
    expect(report.coverage.status).toBe("partial_customer_linkage");
    expect(formatAnalyticsBasisPoints("4166")).toBe("41.66%");
    expect(
      formatAnalyticsCurrencyMinor(
        report.commerce.netEligibleSpendMinor ?? "0",
        "EUR",
        2,
      ),
    ).toBe("90,071,992,547,409.93 EUR");
  });

  it("rejects commerce source and denominator drift before rendering", () => {
    expect(() =>
      parseAnalyticsCommercePerformanceRow({
        ...commerceRow,
        v2_net_eligible_orders: "2",
      }),
    ).toThrow();
    expect(() =>
      parseAnalyticsCommercePerformanceRow({
        ...commerceRow,
        participation_rate_basis_points: "5001",
      }),
    ).toThrow();
  });

  it("maps exact programme outcomes without coercing bigint values", () => {
    const report = parseAnalyticsProgrammeOutcomeRow(outcomeRow);
    expect(report.rewards.capturedPoints).toBe("9007199254740993");
    expect(report.campaigns.incrementality).toEqual({
      status: "unavailable",
      reason: "estimator_not_configured",
      incrementalRevenueMinor: null,
    });
    expect(
      analyticsMetricDefinition("campaigns.incremental_revenue"),
    ).toMatchObject({
      availability: "unavailable",
      causalClass: "unavailable",
    });
  });

  it("rejects programme outcome funnel and reversal drift", () => {
    expect(() =>
      parseAnalyticsProgrammeOutcomeRow({
        ...outcomeRow,
        referral_pending: "3",
      }),
    ).toThrow();
    expect(() =>
      parseAnalyticsProgrammeOutcomeRow({
        ...outcomeRow,
        campaign_points_net: "801",
      }),
    ).toThrow();
  });
});
