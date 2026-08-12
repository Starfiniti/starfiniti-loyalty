import type { MerchantOverviewReportV1 } from "@starfiniti/contracts";

export type OverviewRange = 7 | 30 | 90;

export type OverviewMetric = Readonly<{
  label: string;
  value: string;
  delta?: string;
  tone?: "positive" | "negative" | "neutral";
  suffix?: string;
  note?: string;
  info?: boolean;
}>;

export function parseOverviewRange(
  value: string | readonly string[] | undefined,
): OverviewRange {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === "7") return 7;
  if (candidate === "90") return 90;
  return 30;
}

export function formatExactInteger(value: string): string {
  return new Intl.NumberFormat("en-GB").format(BigInt(value));
}

export function formatExactMinorAmount(
  value: string,
  currencyCode: string | null,
  minorUnitsPerMajor: number | null,
): string {
  if (!currencyCode || !minorUnitsPerMajor) {
    return `${formatExactInteger(value)} minor units`;
  }
  const amount = BigInt(value);
  const sign = amount < 0n ? "−" : "";
  const absolute = amount < 0n ? -amount : amount;
  const units = BigInt(minorUnitsPerMajor);
  const digits = String(minorUnitsPerMajor).length - 1;
  const major = new Intl.NumberFormat("en-GB").format(absolute / units);
  const fraction = (absolute % units).toString().padStart(digits, "0");
  return `${currencyCode} ${sign}${major}${digits > 0 ? `.${fraction}` : ""}`;
}

export function formatBasisPoints(value: string): string {
  const basisPoints = BigInt(value);
  const whole = basisPoints / 100n;
  const fraction = (basisPoints % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}%`;
}

function signedIntegerDelta(
  current: string,
  previous: string,
): {
  label: string;
  tone: "positive" | "negative" | "neutral";
} {
  const delta = BigInt(current) - BigInt(previous);
  return {
    label: `${delta > 0n ? "+" : delta < 0n ? "−" : "±"}${formatExactInteger(
      (delta < 0n ? -delta : delta).toString(),
    )}`,
    tone: delta > 0n ? "positive" : delta < 0n ? "negative" : "neutral",
  };
}

function signedRateDelta(
  current: string,
  previous: string,
): {
  label: string;
  tone: "positive" | "negative" | "neutral";
} {
  const delta = BigInt(current) - BigInt(previous);
  const absolute = delta < 0n ? -delta : delta;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return {
    label: `${delta > 0n ? "+" : delta < 0n ? "−" : "±"}${whole}.${fraction} pts`,
    tone: delta > 0n ? "positive" : delta < 0n ? "negative" : "neutral",
  };
}

function signedPercentDelta(
  current: string,
  previous: string,
): {
  label: string;
  tone: "positive" | "negative" | "neutral";
} {
  const currentValue = BigInt(current);
  const previousValue = BigInt(previous);
  if (previousValue === 0n) {
    return {
      label: currentValue === 0n ? "±0.00%" : "+new",
      tone: currentValue === 0n ? "neutral" : "positive",
    };
  }
  const deltaBasisPoints =
    ((currentValue - previousValue) * 10_000n) / previousValue;
  const absolute = deltaBasisPoints < 0n ? -deltaBasisPoints : deltaBasisPoints;
  return {
    label: `${deltaBasisPoints > 0n ? "+" : deltaBasisPoints < 0n ? "−" : "±"}${
      absolute / 100n
    }.${(absolute % 100n).toString().padStart(2, "0")}%`,
    tone:
      deltaBasisPoints > 0n
        ? "positive"
        : deltaBasisPoints < 0n
          ? "negative"
          : "neutral",
  };
}

export function overviewMetrics(
  report: MerchantOverviewReportV1,
): readonly OverviewMetric[] {
  const members = signedIntegerDelta(
    report.membersNew,
    report.membersNewPrevious,
  );
  const spend = signedPercentDelta(
    report.eligibleSpendMinor,
    report.eligibleSpendMinorPrevious,
  );
  const repeat = signedRateDelta(
    report.repeatRateBasisPoints,
    report.repeatRateBasisPointsPrevious,
  );
  const redemption = signedRateDelta(
    report.redemptionRateBasisPoints,
    report.redemptionRateBasisPointsPrevious,
  );
  return [
    {
      label: "Loyalty members",
      value: formatExactInteger(report.membersTotal),
      delta: members.label,
      tone: members.tone,
      suffix: "new-member change vs previous period",
    },
    {
      label: "Eligible loyalty spend",
      value: formatExactMinorAmount(
        report.eligibleSpendMinor,
        report.currencyCode,
        report.minorUnitsPerMajor,
      ),
      delta: spend.label,
      tone: spend.tone,
      suffix: "vs previous period",
    },
    {
      label: "Repeat-member rate",
      value: formatBasisPoints(report.repeatRateBasisPoints),
      delta: repeat.label,
      tone: repeat.tone,
      suffix: "members with 2+ eligible orders",
    },
    {
      label: "Points redemption rate",
      value: formatBasisPoints(report.redemptionRateBasisPoints),
      delta: redemption.label,
      tone: redemption.tone,
      suffix: "captured ÷ awarded points",
    },
    {
      label: "Points liability",
      value: `${formatExactInteger(report.outstandingPoints)} pts`,
      note: "pending + available + reserved",
      info: true,
    },
  ];
}

export function overviewChartData(report: MerchantOverviewReportV1) {
  return report.dailyNewMembers.map((point) => ({
    day: point.date.slice(5),
    members: Number(point.current),
    previous: Number(point.previous),
  }));
}
