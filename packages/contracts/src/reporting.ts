import { z } from "zod";

const exactNonNegativeInteger = z.string().regex(/^(?:0|[1-9][0-9]*)$/u);
const exactInteger = z.string().regex(/^-?(?:0|[1-9][0-9]*)$/u);

export const analyticsMetricKeyV1 = z.enum([
  "points.snapshot.pending",
  "points.snapshot.available",
  "points.snapshot.reserved",
  "points.snapshot.spent",
  "points.snapshot.expired",
  "points.snapshot.reversed",
  "points.snapshot.outstanding",
  "points.flow.awarded",
  "points.flow.released",
  "points.flow.reserved",
  "points.flow.captured",
  "points.flow.cancelled",
  "points.flow.expired",
  "points.flow.refund_reversed",
  "points.flow.manual_credit",
  "points.flow.manual_debit",
  "points.flow.manual_net",
  "points.expiry.lot_backed",
  "points.expiry.overdue_available",
  "points.expiry.reserved_past_expiry",
  "points.expiry.next_30_days",
  "points.expiry.days_31_to_90",
  "points.expiry.beyond_90_days",
  "members.expiry_affected",
  "liability.monetary",
]);

export const analyticsMetricDefinitionV1 = z
  .object({
    key: analyticsMetricKeyV1,
    label: z.string().min(1).max(100),
    description: z.string().min(1).max(500),
    formula: z.string().min(1).max(1_000),
    sourceFields: z.array(z.string().min(1).max(200)).min(1).max(12),
    grain: z.string().min(1).max(200),
    timeBoundary: z.string().min(1).max(300),
    timeZone: z.literal("UTC"),
    currencyPolicy: z.enum([
      "not_applicable",
      "unavailable_without_valuation_policy",
    ]),
    owner: z.literal("loyalty_analytics"),
    caveats: z.array(z.string().min(1).max(400)).max(8),
    causalClass: z.enum(["operational", "descriptive", "unavailable"]),
    availability: z.enum(["available", "unavailable"]),
    displayFormat: z.enum(["points", "count", "currency_unavailable"]),
  })
  .strict();

export const analyticsMetricDictionaryV1Schema = z
  .object({
    dictionaryVersion: z.literal("1"),
    effectiveFrom: z.iso.datetime({ offset: true }),
    definitions: z.array(analyticsMetricDefinitionV1).length(25),
  })
  .strict()
  .superRefine((dictionary, context) => {
    const keys = dictionary.definitions.map((definition) => definition.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        message: "Analytics metric keys must be unique",
        path: ["definitions"],
      });
    }
  });

export type AnalyticsMetricKeyV1 = z.infer<typeof analyticsMetricKeyV1>;
export type AnalyticsMetricDefinitionV1 = z.infer<
  typeof analyticsMetricDefinitionV1
>;
export type AnalyticsMetricDictionaryV1 = z.infer<
  typeof analyticsMetricDictionaryV1Schema
>;

const snapshotSourceFields = [
  "loyalty.ledger_entries.points",
  "loyalty.ledger_accounts.account_kind",
  "loyalty.wallet_balances.points",
];
const flowSourceFields = [
  "loyalty.ledger_transactions.transaction_kind",
  "loyalty.ledger_transactions.effective_at",
  "loyalty.ledger_entries.points",
  "loyalty.ledger_accounts.account_kind",
];
const expirySourceFields = [
  "loyalty.point_lots.expires_at",
  "loyalty.point_lot_balances.remaining_points",
  "loyalty.redemption_allocations.points",
  "loyalty.ledger_transactions.transaction_kind",
];

export const analyticsMetricDictionaryV1 = {
  dictionaryVersion: "1",
  effectiveFrom: "2026-08-25T00:00:00Z",
  definitions: [
    ...(
      [
        ["pending", "Pending points"],
        ["available", "Available points"],
        ["reserved", "Reserved points"],
        ["spent", "Spent points"],
        ["expired", "Expired points"],
        ["reversed", "Reversed points"],
      ] as const
    ).map(([bucket, label]) => ({
      key: `points.snapshot.${bucket}` as AnalyticsMetricKeyV1,
      label,
      description: `Exact current ${bucket} wallet-account balance for the selected programme scope.`,
      formula: `SUM(ledger_entries.points) for wallet accounts where account_kind = '${bucket}', reconciled to wallet_balances.`,
      sourceFields: snapshotSourceFields,
      grain:
        "Selected organization and programme-group wallets at report as-of; workspace selector proves the active group link.",
      timeBoundary:
        "All immutable entries committed by the report statement snapshot.",
      timeZone: "UTC" as const,
      currencyPolicy: "not_applicable" as const,
      owner: "loyalty_analytics" as const,
      caveats:
        bucket === "available"
          ? [
              "Available points are signed because audited corrections can produce a negative balance.",
            ]
          : [],
      causalClass: "operational" as const,
      availability: "available" as const,
      displayFormat: "points" as const,
    })),
    {
      key: "points.snapshot.outstanding",
      label: "Outstanding points",
      description:
        "Exact point exposure that remains pending, available, or reserved.",
      formula: "pending points + available points + reserved points.",
      sourceFields: snapshotSourceFields,
      grain:
        "Selected organization and programme-group wallets at report as-of; workspace selector proves the active group link.",
      timeBoundary:
        "All immutable entries committed by the report statement snapshot.",
      timeZone: "UTC",
      currencyPolicy: "not_applicable",
      owner: "loyalty_analytics",
      caveats: [
        "This is point exposure, not accounting currency liability.",
        "Available points are signed, so the aggregate can be negative after audited corrections.",
      ],
      causalClass: "operational",
      availability: "available",
      displayFormat: "points",
    },
    ...(
      [
        ["awarded", "Awarded points", "award", "pending"],
        ["released", "Released points", "release", "available"],
        ["reserved", "Reserved points", "reserve", "reserved"],
        ["captured", "Captured points", "capture", "spent"],
        ["cancelled", "Cancelled reservation points", "cancel", "available"],
        ["expired", "Expired points", "expire", "expired"],
        [
          "refund_reversed",
          "Refund-reversed points",
          "refund_reversal",
          "reversed",
        ],
      ] as const
    ).map(([flow, label, transactionKind, accountKind]) => ({
      key: `points.flow.${flow}` as AnalyticsMetricKeyV1,
      label,
      description: `Gross positive ${label.toLowerCase()} entering the destination wallet account during the report period.`,
      formula: `SUM(positive ledger_entries.points) where transaction_kind = '${transactionKind}' and account_kind = '${accountKind}'.`,
      sourceFields: flowSourceFields,
      grain:
        "Selected organization, programme-group wallets, and report period; workspace selector proves the active group link.",
      timeBoundary:
        "transaction.effective_at in the UTC half-open interval [periodFrom, periodTo).",
      timeZone: "UTC" as const,
      currencyPolicy: "not_applicable" as const,
      owner: "loyalty_analytics" as const,
      caveats: [
        "Movement metrics are not net point supply unless their definition explicitly says so.",
      ],
      causalClass: "operational" as const,
      availability: "available" as const,
      displayFormat: "points" as const,
    })),
    {
      key: "points.flow.manual_credit",
      label: "Manual credits",
      description:
        "Gross positive audited manual adjustments during the report period.",
      formula:
        "SUM(positive available-account entries for manual_adjustment transactions).",
      sourceFields: flowSourceFields,
      grain:
        "Selected organization, programme-group wallets, and report period; workspace selector proves the active group link.",
      timeBoundary:
        "transaction.effective_at in the UTC half-open interval [periodFrom, periodTo).",
      timeZone: "UTC",
      currencyPolicy: "not_applicable",
      owner: "loyalty_analytics",
      caveats: [
        "Manual credits remain separate from commerce and campaign awards.",
      ],
      causalClass: "operational",
      availability: "available",
      displayFormat: "points",
    },
    {
      key: "points.flow.manual_debit",
      label: "Manual debits",
      description:
        "Absolute gross negative audited manual adjustments during the report period.",
      formula:
        "ABS(SUM(negative available-account entries for manual_adjustment transactions)).",
      sourceFields: flowSourceFields,
      grain:
        "Selected organization, programme-group wallets, and report period; workspace selector proves the active group link.",
      timeBoundary:
        "transaction.effective_at in the UTC half-open interval [periodFrom, periodTo).",
      timeZone: "UTC",
      currencyPolicy: "not_applicable",
      owner: "loyalty_analytics",
      caveats: [
        "Displayed as a positive magnitude; use manual net for signed movement.",
      ],
      causalClass: "operational",
      availability: "available",
      displayFormat: "points",
    },
    {
      key: "points.flow.manual_net",
      label: "Net manual adjustment",
      description:
        "Signed net audited manual point movement during the report period.",
      formula: "manual credits - manual debits.",
      sourceFields: flowSourceFields,
      grain:
        "Selected organization, programme-group wallets, and report period; workspace selector proves the active group link.",
      timeBoundary:
        "transaction.effective_at in the UTC half-open interval [periodFrom, periodTo).",
      timeZone: "UTC",
      currencyPolicy: "not_applicable",
      owner: "loyalty_analytics",
      caveats: ["Positive values add point supply; negative values remove it."],
      causalClass: "operational",
      availability: "available",
      displayFormat: "points",
    },
    ...(
      [
        [
          "lot_backed",
          "Lot-backed points",
          "All remaining and unresolved-reserved lot points.",
        ],
        [
          "overdue_available",
          "Overdue available points",
          "Remaining lot points whose expiry instant is at or before report as-of.",
        ],
        [
          "reserved_past_expiry",
          "Reserved past expiry",
          "Unresolved reserved allocations whose source lot expiry is at or before report as-of.",
        ],
        [
          "next_30_days",
          "Expiring in 30 days",
          "Lot-backed points expiring after as-of and no later than 30 days after as-of.",
        ],
        [
          "days_31_to_90",
          "Expiring in days 31–90",
          "Lot-backed points expiring after 30 days and no later than 90 days after as-of.",
        ],
        [
          "beyond_90_days",
          "Expiring after 90 days",
          "Lot-backed points expiring more than 90 days after report as-of.",
        ],
      ] as const
    ).map(([exposure, label, formula]) => ({
      key: `points.expiry.${exposure}` as AnalyticsMetricKeyV1,
      label,
      description: formula,
      formula,
      sourceFields: expirySourceFields,
      grain:
        "Selected organization, programme-group wallet, and point lot; workspace selector proves the active group link.",
      timeBoundary:
        "Exact expiry instants compared with report as-of; ranges are half-open except their documented inclusive upper boundary.",
      timeZone: "UTC" as const,
      currencyPolicy: "not_applicable" as const,
      owner: "loyalty_analytics" as const,
      caveats: [
        "Pending awards are not lot-backed until release and are excluded.",
      ],
      causalClass: "operational" as const,
      availability: "available" as const,
      displayFormat: "points" as const,
    })),
    {
      key: "members.expiry_affected",
      label: "Members with lot exposure",
      description:
        "Distinct wallets with positive remaining or unresolved-reserved lot points.",
      formula:
        "COUNT(DISTINCT wallet_id) where lot-backed points are greater than zero.",
      sourceFields: expirySourceFields,
      grain:
        "Selected organization and programme-group wallets at report as-of; workspace selector proves the active group link.",
      timeBoundary:
        "All point-lot evidence committed by the report statement snapshot.",
      timeZone: "UTC",
      currencyPolicy: "not_applicable",
      owner: "loyalty_analytics",
      caveats: [
        "A wallet represents a programme member; no customer identity is returned.",
      ],
      causalClass: "descriptive",
      availability: "available",
      displayFormat: "count",
    },
    {
      key: "liability.monetary",
      label: "Monetary liability",
      description:
        "Accounting-currency liability for outstanding loyalty value.",
      formula:
        "Unavailable until an immutable, version-attributed valuation policy is configured.",
      sourceFields: ["loyalty.programme_versions.configuration"],
      grain:
        "Selected organization and programme-group wallets at report as-of; workspace selector proves the active group link.",
      timeBoundary:
        "Would require valuation evidence effective at each value-creating event.",
      timeZone: "UTC",
      currencyPolicy: "unavailable_without_valuation_policy",
      owner: "loyalty_analytics",
      caveats: [
        "Never infer a global point value from a pilot, reward catalogue, or current programme configuration.",
        "Outstanding points and expiry exposure remain available independently.",
      ],
      causalClass: "unavailable",
      availability: "unavailable",
      displayFormat: "currency_unavailable",
    },
  ],
} satisfies AnalyticsMetricDictionaryV1;

export const analyticsValueTruthReportV1 = z
  .object({
    reportVersion: z.literal("1"),
    dictionaryVersion: z.literal("1"),
    asOf: z.iso.datetime({ offset: true }),
    period: z
      .object({
        from: z.iso.datetime({ offset: true }),
        to: z.iso.datetime({ offset: true }),
        rangeDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
        timeZone: z.literal("UTC"),
      })
      .strict(),
    projection: z
      .object({
        status: z.literal("reconciled"),
        walletCount: exactNonNegativeInteger,
        walletAccountCount: exactNonNegativeInteger,
        ledgerEntryCount: exactNonNegativeInteger,
        lotCount: exactNonNegativeInteger,
      })
      .strict(),
    snapshot: z
      .object({
        pendingPoints: exactNonNegativeInteger,
        availablePoints: exactInteger,
        reservedPoints: exactNonNegativeInteger,
        spentPoints: exactNonNegativeInteger,
        expiredPoints: exactNonNegativeInteger,
        reversedPoints: exactNonNegativeInteger,
        outstandingPoints: exactInteger,
      })
      .strict(),
    flows: z
      .object({
        awardedPoints: exactNonNegativeInteger,
        releasedPoints: exactNonNegativeInteger,
        reservedPoints: exactNonNegativeInteger,
        capturedPoints: exactNonNegativeInteger,
        cancelledPoints: exactNonNegativeInteger,
        expiredPoints: exactNonNegativeInteger,
        refundReversedPoints: exactNonNegativeInteger,
        manualCreditPoints: exactNonNegativeInteger,
        manualDebitPoints: exactNonNegativeInteger,
        manualNetPoints: exactInteger,
      })
      .strict(),
    expiry: z
      .object({
        lotBackedPoints: exactNonNegativeInteger,
        overdueAvailablePoints: exactNonNegativeInteger,
        reservedPastExpiryPoints: exactNonNegativeInteger,
        expiringNext30Days: exactNonNegativeInteger,
        expiringDays31To90: exactNonNegativeInteger,
        expiringBeyond90Days: exactNonNegativeInteger,
        affectedMembers: exactNonNegativeInteger,
        nextExpiryAt: z.iso.datetime({ offset: true }).nullable(),
      })
      .strict(),
    monetaryLiability: z
      .object({
        status: z.literal("unavailable"),
        reason: z.literal("valuation_policy_not_configured"),
      })
      .strict(),
  })
  .strict()
  .superRefine((report, context) => {
    if (Date.parse(report.period.to) !== Date.parse(report.asOf)) {
      context.addIssue({
        code: "custom",
        message: "Analytics period must end exactly at report as-of",
        path: ["period", "to"],
      });
    }
    if (
      Date.parse(report.period.to) - Date.parse(report.period.from) !==
      report.period.rangeDays * 86_400_000
    ) {
      context.addIssue({
        code: "custom",
        message: "Analytics period must match rangeDays exactly",
        path: ["period", "from"],
      });
    }
    if (
      BigInt(report.snapshot.pendingPoints) +
        BigInt(report.snapshot.availablePoints) +
        BigInt(report.snapshot.reservedPoints) !==
      BigInt(report.snapshot.outstandingPoints)
    ) {
      context.addIssue({
        code: "custom",
        message: "Outstanding points must reconcile to active point buckets",
        path: ["snapshot", "outstandingPoints"],
      });
    }
    if (
      BigInt(report.flows.manualCreditPoints) -
        BigInt(report.flows.manualDebitPoints) !==
      BigInt(report.flows.manualNetPoints)
    ) {
      context.addIssue({
        code: "custom",
        message: "Manual net points must reconcile to credits and debits",
        path: ["flows", "manualNetPoints"],
      });
    }
    if (
      BigInt(report.expiry.overdueAvailablePoints) +
        BigInt(report.expiry.reservedPastExpiryPoints) +
        BigInt(report.expiry.expiringNext30Days) +
        BigInt(report.expiry.expiringDays31To90) +
        BigInt(report.expiry.expiringBeyond90Days) !==
      BigInt(report.expiry.lotBackedPoints)
    ) {
      context.addIssue({
        code: "custom",
        message: "Expiry buckets must reconcile to lot-backed points",
        path: ["expiry", "lotBackedPoints"],
      });
    }
  });

export type AnalyticsValueTruthReportV1 = z.infer<
  typeof analyticsValueTruthReportV1
>;

const analyticsCommerceMetricKeysV2 = [
  "members.total",
  "members.activation.cohort",
  "members.activation.activated",
  "members.activation.rate",
  "members.participating",
  "members.participation_rate",
  "commerce.orders.net_eligible",
  "commerce.members.purchasing",
  "commerce.members.repeat_purchasing",
  "commerce.repeat_purchase_rate",
  "commerce.spend.net_eligible",
  "commerce.aov.net_eligible",
  "commerce.ltv.observed",
  "commerce.coverage.v1_net_orders",
  "commerce.coverage.v2_net_orders",
  "commerce.coverage.guest_net_orders",
  "commerce.coverage.missing_customer_link_orders",
  "commerce.coverage.missing_customer_link_spend",
] as const;

export const analyticsMetricKeyV2 = z.enum([
  ...analyticsMetricKeyV1.options,
  ...analyticsCommerceMetricKeysV2,
]);

export const analyticsMetricDefinitionV2 = z
  .object({
    key: analyticsMetricKeyV2,
    label: z.string().min(1).max(100),
    description: z.string().min(1).max(500),
    formula: z.string().min(1).max(1_000),
    sourceFields: z.array(z.string().min(1).max(200)).min(1).max(16),
    grain: z.string().min(1).max(300),
    timeBoundary: z.string().min(1).max(500),
    timeZone: z.literal("UTC"),
    currencyPolicy: z.enum([
      "not_applicable",
      "single_currency_minor_units",
      "unavailable_if_mixed_currency",
      "unavailable_without_valuation_policy",
    ]),
    owner: z.literal("loyalty_analytics"),
    caveats: z.array(z.string().min(1).max(500)).max(10),
    causalClass: z.enum([
      "operational",
      "descriptive",
      "experimental",
      "unavailable",
    ]),
    availability: z.enum(["available", "conditional", "unavailable"]),
    displayFormat: z.enum([
      "points",
      "count",
      "basis_points",
      "currency_minor",
      "currency_unavailable",
    ]),
  })
  .strict();

export const analyticsMetricDictionaryV2Schema = z
  .object({
    dictionaryVersion: z.literal("2"),
    effectiveFrom: z.iso.datetime({ offset: true }),
    definitions: z.array(analyticsMetricDefinitionV2).length(43),
  })
  .strict()
  .superRefine((dictionary, context) => {
    const keys = dictionary.definitions.map((definition) => definition.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        message: "Analytics metric keys must be unique",
        path: ["definitions"],
      });
    }
  });

export type AnalyticsMetricKeyV2 = z.infer<typeof analyticsMetricKeyV2>;
export type AnalyticsMetricDefinitionV2 = z.infer<
  typeof analyticsMetricDefinitionV2
>;
export type AnalyticsMetricDictionaryV2 = z.infer<
  typeof analyticsMetricDictionaryV2Schema
>;

const commerceFactSources = [
  "loyalty_private.tier_qualification_facts.fact_kind",
  "loyalty_private.tier_qualification_facts.eligible_spend_minor_delta",
  "loyalty_private.tier_qualification_facts.order_count_delta",
  "loyalty_private.tier_qualification_facts.effective_at",
  "loyalty_private.tier_qualification_facts.recorded_at",
  "loyalty_private.programme_evaluations.result",
  "loyalty_private.canonical_commerce_events.occurred_at",
  "loyalty.programme_versions.configuration",
];
const memberFactSources = [
  "loyalty.wallets.created_at",
  "loyalty_private.tier_qualification_facts.customer_id",
  "loyalty.ledger_transactions.transaction_kind",
  "loyalty.ledger_transactions.effective_at",
  "loyalty.ledger_accounts.wallet_id",
  "loyalty.point_lots.available_at",
];

const commerceDefinition = (
  key: (typeof analyticsCommerceMetricKeysV2)[number],
  label: string,
  description: string,
  formula: string,
  options: Readonly<{
    sources?: readonly string[];
    grain?: string;
    timeBoundary?: string;
    currencyPolicy?: "not_applicable" | "single_currency_minor_units";
    caveats?: readonly string[];
    causalClass?: "operational" | "descriptive";
    displayFormat?: "count" | "basis_points" | "currency_minor";
  }> = {},
) => ({
  key,
  label,
  description,
  formula,
  sourceFields: [...(options.sources ?? commerceFactSources)],
  grain:
    options.grain ??
    "Selected organization and programme group; no customer or order identity leaves PostgreSQL.",
  timeBoundary:
    options.timeBoundary ??
    "Original fact occurrence in the UTC half-open report period and immutable evidence recorded before report as-of.",
  timeZone: "UTC" as const,
  currencyPolicy: options.currencyPolicy ?? ("not_applicable" as const),
  owner: "loyalty_analytics" as const,
  caveats: [...(options.caveats ?? [])],
  causalClass: options.causalClass ?? ("operational" as const),
  availability:
    options.currencyPolicy === "single_currency_minor_units"
      ? ("conditional" as const)
      : ("available" as const),
  displayFormat: options.displayFormat ?? ("count" as const),
});

export const analyticsMetricDictionaryV2 = {
  dictionaryVersion: "2",
  effectiveFrom: "2026-08-25T00:00:00Z",
  definitions: [
    ...analyticsMetricDictionaryV1.definitions,
    commerceDefinition(
      "members.total",
      "Members",
      "Programme-group wallets created before report as-of.",
      "COUNT(wallets) where created_at < asOf.",
      { sources: memberFactSources },
    ),
    commerceDefinition(
      "members.activation.cohort",
      "Mature activation cohort",
      "New wallets whose complete 30-day activation window ended inside the selected report range.",
      "COUNT(wallets) where created_at is in [periodFrom - 30 days, periodTo - 30 days).",
      {
        sources: memberFactSources,
        timeBoundary:
          "Wallet creation in the shifted UTC half-open cohort interval; every wallet has a full 30-day observation window.",
      },
    ),
    commerceDefinition(
      "members.activation.activated",
      "Activated members",
      "Mature-cohort wallets with a first released earning within 30 days of joining.",
      "COUNT(cohort wallets with a release-backed point lot available_at between wallet.created_at and wallet.created_at + 30 days inclusive).",
      {
        sources: memberFactSources,
        caveats: [
          "Pending awards and manual credits do not activate a member.",
        ],
      },
    ),
    commerceDefinition(
      "members.activation.rate",
      "Activation rate",
      "Share of the mature activation cohort that received a released earning within 30 days.",
      "FLOOR(activated members * 10000 / mature activation cohort); zero when the cohort is empty.",
      {
        sources: memberFactSources,
        displayFormat: "basis_points",
        causalClass: "descriptive",
      },
    ),
    commerceDefinition(
      "members.participating",
      "Participating members",
      "Linked wallets with positive net purchase, referral, or verified-action activity, or a captured reward, in the period.",
      "COUNT(DISTINCT linked wallet) meeting at least one declared net activity condition.",
      {
        sources: memberFactSources,
        causalClass: "descriptive",
        caveats: ["Fully refunded purchases do not qualify by purchase alone."],
      },
    ),
    commerceDefinition(
      "members.participation_rate",
      "Participation rate",
      "Share of all programme-group members participating in the period.",
      "FLOOR(participating members * 10000 / members); zero when there are no members.",
      {
        sources: memberFactSources,
        displayFormat: "basis_points",
        causalClass: "descriptive",
      },
    ),
    commerceDefinition(
      "commerce.orders.net_eligible",
      "Net eligible orders",
      "Eligible orders after full-refund compensation.",
      "SUM(order_count_delta) across normalized purchase and refund facts.",
      { causalClass: "descriptive" },
    ),
    commerceDefinition(
      "commerce.members.purchasing",
      "Purchasing members",
      "Linked members with at least one net eligible order in the period.",
      "COUNT(linked customer groups where SUM(order_count_delta) >= 1).",
      {
        causalClass: "descriptive",
        caveats: ["Missing customer links remain in order totals only."],
      },
    ),
    commerceDefinition(
      "commerce.members.repeat_purchasing",
      "Repeat purchasers",
      "Linked members with at least two net eligible orders in the period.",
      "COUNT(linked customer groups where SUM(order_count_delta) >= 2).",
      { causalClass: "descriptive" },
    ),
    commerceDefinition(
      "commerce.repeat_purchase_rate",
      "Repeat-purchase rate",
      "Share of linked purchasing members with at least two net eligible orders.",
      "FLOOR(repeat purchasers * 10000 / purchasing members); zero when no member purchased.",
      { displayFormat: "basis_points", causalClass: "descriptive" },
    ),
    commerceDefinition(
      "commerce.spend.net_eligible",
      "Net eligible spend",
      "Version-evaluated eligible spend after refund compensation.",
      "SUM(eligible_spend_minor_delta) across normalized purchase and refund facts.",
      {
        currencyPolicy: "single_currency_minor_units",
        displayFormat: "currency_minor",
        causalClass: "descriptive",
        caveats: [
          "Unavailable when contributing historical versions do not share one currency and precision.",
        ],
      },
    ),
    commerceDefinition(
      "commerce.aov.net_eligible",
      "Net eligible AOV",
      "Average eligible spend per net eligible order after refunds.",
      "TRUNC(net eligible spend minor / net eligible orders); zero when there are no net orders.",
      {
        currencyPolicy: "single_currency_minor_units",
        displayFormat: "currency_minor",
        causalClass: "descriptive",
      },
    ),
    commerceDefinition(
      "commerce.ltv.observed",
      "Observed member LTV",
      "Average linked lifetime eligible spend through report as-of; descriptive and non-predictive.",
      "TRUNC(linked lifetime eligible spend minor / linked lifetime purchasing members); zero when there are no lifetime purchasers.",
      {
        currencyPolicy: "single_currency_minor_units",
        displayFormat: "currency_minor",
        causalClass: "descriptive",
        timeBoundary:
          "All original occurrences before as-of whose immutable purchase/refund evidence was recorded before as-of.",
        caveats: [
          "This is not gross merchandise value, margin, forecast LTV, or incremental revenue.",
          "Orders without a customer link are excluded from both the numerator and denominator.",
        ],
      },
    ),
    commerceDefinition(
      "commerce.coverage.v1_net_orders",
      "Legacy V1 net orders",
      "Net eligible orders reconstructed from immutable legacy evaluations.",
      "SUM(order_count_delta) where normalized source version = 1.",
    ),
    commerceDefinition(
      "commerce.coverage.v2_net_orders",
      "V2 net orders",
      "Net eligible orders read from immutable V2 qualification facts.",
      "SUM(order_count_delta) where normalized source version = 2.",
    ),
    commerceDefinition(
      "commerce.coverage.guest_net_orders",
      "Guest net orders",
      "Net eligible orders attributed to channel-scoped guest customers.",
      "SUM(order_count_delta) where original order customer kind = guest.",
      {
        caveats: [
          "Guest identity remains channel-scoped and is never merged by email.",
        ],
      },
    ),
    commerceDefinition(
      "commerce.coverage.missing_customer_link_orders",
      "Orders missing member linkage",
      "Eligible legacy purchase facts that cannot be mapped to a current canonical customer link.",
      "COUNT(purchase facts) where normalized customer_id is null; later refunds remain visible in missing-link spend.",
      {
        caveats: [
          "These orders remain in commerce totals but not member-grained metrics.",
        ],
      },
    ),
    commerceDefinition(
      "commerce.coverage.missing_customer_link_spend",
      "Spend missing member linkage",
      "Net eligible spend retained in commerce totals but excluded from member-grained LTV.",
      "SUM(eligible_spend_minor_delta) where normalized customer_id is null.",
      {
        currencyPolicy: "single_currency_minor_units",
        displayFormat: "currency_minor",
      },
    ),
  ],
} satisfies AnalyticsMetricDictionaryV2;

const analyticsPeriodV1 = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    rangeDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    timeZone: z.literal("UTC"),
  })
  .strict();

const analyticsCurrencyScopeV1 = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      code: z.string().regex(/^[A-Z]{3}$/u),
      minorUnitDigits: z.int().min(0).max(6),
      reason: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      code: z.null(),
      minorUnitDigits: z.null(),
      reason: z.enum([
        "mixed_currency_scope",
        "programme_currency_unavailable",
      ]),
    })
    .strict(),
]);

export const analyticsCommercePerformanceReportV1 = z
  .object({
    reportVersion: z.literal("1"),
    dictionaryVersion: z.literal("2"),
    asOf: z.iso.datetime({ offset: true }),
    period: analyticsPeriodV1,
    currency: analyticsCurrencyScopeV1,
    members: z
      .object({
        total: exactNonNegativeInteger,
        activation: z
          .object({
            windowDays: z.literal(30),
            cohortFrom: z.iso.datetime({ offset: true }),
            cohortTo: z.iso.datetime({ offset: true }),
            cohortMembers: exactNonNegativeInteger,
            activatedMembers: exactNonNegativeInteger,
            rateBasisPoints: exactNonNegativeInteger,
          })
          .strict(),
        participatingMembers: exactNonNegativeInteger,
        participationRateBasisPoints: exactNonNegativeInteger,
      })
      .strict(),
    commerce: z
      .object({
        netEligibleOrders: exactNonNegativeInteger,
        purchasingMembers: exactNonNegativeInteger,
        repeatPurchasingMembers: exactNonNegativeInteger,
        repeatPurchaseRateBasisPoints: exactNonNegativeInteger,
        netEligibleSpendMinor: exactNonNegativeInteger.nullable(),
        averageOrderValueMinor: exactNonNegativeInteger.nullable(),
        observedLifetimeEligibleSpendMinor: exactNonNegativeInteger.nullable(),
        observedLifetimePurchasingMembers: exactNonNegativeInteger,
        observedLifetimeValueMinor: exactNonNegativeInteger.nullable(),
      })
      .strict(),
    coverage: z
      .object({
        status: z.enum(["complete", "partial_customer_linkage"]),
        v1NetEligibleOrders: exactNonNegativeInteger,
        v2NetEligibleOrders: exactNonNegativeInteger,
        guestNetEligibleOrders: exactNonNegativeInteger,
        missingCustomerLinkOrders: exactNonNegativeInteger,
        missingCustomerLinkSpendMinor: exactNonNegativeInteger.nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((report, context) => {
    const from = Date.parse(report.period.from);
    const to = Date.parse(report.period.to);
    if (to !== Date.parse(report.asOf)) {
      context.addIssue({
        code: "custom",
        message: "Commerce performance period must end at report as-of",
        path: ["period", "to"],
      });
    }
    if (to - from !== report.period.rangeDays * 86_400_000) {
      context.addIssue({
        code: "custom",
        message: "Commerce performance period must match rangeDays",
        path: ["period", "from"],
      });
    }
    if (
      Date.parse(report.members.activation.cohortFrom) !==
        from - 30 * 86_400_000 ||
      Date.parse(report.members.activation.cohortTo) !== to - 30 * 86_400_000
    ) {
      context.addIssue({
        code: "custom",
        message: "Activation cohort must be fully mature",
        path: ["members", "activation"],
      });
    }

    const ratio = (numerator: string, denominator: string) =>
      BigInt(denominator) === 0n
        ? 0n
        : (BigInt(numerator) * 10_000n) / BigInt(denominator);
    const exactChecks = [
      [
        report.members.activation.rateBasisPoints,
        ratio(
          report.members.activation.activatedMembers,
          report.members.activation.cohortMembers,
        ),
        ["members", "activation", "rateBasisPoints"],
      ],
      [
        report.members.participationRateBasisPoints,
        ratio(report.members.participatingMembers, report.members.total),
        ["members", "participationRateBasisPoints"],
      ],
      [
        report.commerce.repeatPurchaseRateBasisPoints,
        ratio(
          report.commerce.repeatPurchasingMembers,
          report.commerce.purchasingMembers,
        ),
        ["commerce", "repeatPurchaseRateBasisPoints"],
      ],
    ] as const;
    for (const [actual, expected, path] of exactChecks) {
      if (BigInt(actual) !== expected) {
        context.addIssue({
          code: "custom",
          message: "Analytics rate does not reconcile to its exact counts",
          path: [...path],
        });
      }
    }
    if (
      BigInt(report.members.activation.activatedMembers) >
        BigInt(report.members.activation.cohortMembers) ||
      BigInt(report.members.participatingMembers) >
        BigInt(report.members.total) ||
      BigInt(report.commerce.repeatPurchasingMembers) >
        BigInt(report.commerce.purchasingMembers) ||
      BigInt(report.coverage.v1NetEligibleOrders) +
        BigInt(report.coverage.v2NetEligibleOrders) !==
        BigInt(report.commerce.netEligibleOrders)
    ) {
      context.addIssue({
        code: "custom",
        message: "Analytics commerce counts do not reconcile",
        path: ["coverage"],
      });
    }

    const monetaryValues = [
      report.commerce.netEligibleSpendMinor,
      report.commerce.averageOrderValueMinor,
      report.commerce.observedLifetimeEligibleSpendMinor,
      report.commerce.observedLifetimeValueMinor,
      report.coverage.missingCustomerLinkSpendMinor,
    ];
    if (
      (report.currency.status === "available" &&
        monetaryValues.some((value) => value === null)) ||
      (report.currency.status === "unavailable" &&
        monetaryValues.some((value) => value !== null))
    ) {
      context.addIssue({
        code: "custom",
        message: "Monetary fields must match the exact currency scope",
        path: ["currency"],
      });
    }
    if (report.currency.status === "available") {
      const netSpend = BigInt(report.commerce.netEligibleSpendMinor ?? "0");
      const netOrders = BigInt(report.commerce.netEligibleOrders);
      const lifetimeSpend = BigInt(
        report.commerce.observedLifetimeEligibleSpendMinor ?? "0",
      );
      const lifetimePurchasers = BigInt(
        report.commerce.observedLifetimePurchasingMembers,
      );
      if (
        BigInt(report.commerce.averageOrderValueMinor ?? "0") !==
          (netOrders === 0n ? 0n : netSpend / netOrders) ||
        BigInt(report.commerce.observedLifetimeValueMinor ?? "0") !==
          (lifetimePurchasers === 0n ? 0n : lifetimeSpend / lifetimePurchasers)
      ) {
        context.addIssue({
          code: "custom",
          message: "Commerce monetary averages do not reconcile",
          path: ["commerce"],
        });
      }
    }
    if (
      (report.coverage.status === "complete") !==
      (report.coverage.missingCustomerLinkOrders === "0")
    ) {
      context.addIssue({
        code: "custom",
        message: "Coverage status must match missing customer linkage",
        path: ["coverage", "status"],
      });
    }
  });

export type AnalyticsCommercePerformanceReportV1 = z.infer<
  typeof analyticsCommercePerformanceReportV1
>;

export const merchantOverviewReportV1 = z
  .object({
    reportVersion: z.literal("1"),
    asOf: z.iso.datetime({ offset: true }),
    rangeDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    currencyCode: z
      .string()
      .regex(/^[A-Z]{3}$/u)
      .nullable(),
    minorUnitsPerMajor: z
      .union([
        z.literal(1),
        z.literal(10),
        z.literal(100),
        z.literal(1_000),
        z.literal(10_000),
        z.literal(100_000),
        z.literal(1_000_000),
      ])
      .nullable(),
    membersTotal: exactNonNegativeInteger,
    membersNew: exactNonNegativeInteger,
    membersNewPrevious: exactNonNegativeInteger,
    eligibleSpendMinor: exactNonNegativeInteger,
    eligibleSpendMinorPrevious: exactNonNegativeInteger,
    repeatRateBasisPoints: exactNonNegativeInteger,
    repeatRateBasisPointsPrevious: exactNonNegativeInteger,
    redemptionRateBasisPoints: exactNonNegativeInteger,
    redemptionRateBasisPointsPrevious: exactNonNegativeInteger,
    outstandingPoints: z.string().regex(/^-?(?:0|[1-9][0-9]*)$/u),
    dailyNewMembers: z
      .array(
        z
          .object({
            date: z.iso.date(),
            current: exactNonNegativeInteger,
            previous: exactNonNegativeInteger,
          })
          .strict(),
      )
      .max(90),
  })
  .strict()
  .superRefine((report, context) => {
    if (report.dailyNewMembers.length !== report.rangeDays) {
      context.addIssue({
        code: "custom",
        message: "Overview trend must contain exactly one point per report day",
        path: ["dailyNewMembers"],
      });
    }
    if (
      (report.currencyCode === null) !==
      (report.minorUnitsPerMajor === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Overview currency metadata must be complete or absent",
        path: ["currencyCode"],
      });
    }
  });

export type MerchantOverviewReportV1 = z.infer<typeof merchantOverviewReportV1>;
