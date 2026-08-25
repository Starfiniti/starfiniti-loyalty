import { describe, expect, it } from "vitest";
import {
  analyticsMetricDefinition,
  analyticsShareBasisPoints,
  formatAnalyticsPeriod,
  formatAnalyticsPoints,
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
  });
});
