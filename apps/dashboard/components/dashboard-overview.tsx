"use client";

import type { MerchantOverviewReportV1 } from "@starfiniti/contracts";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileText,
  Flower2,
  Gift,
  Percent,
  PlugZap,
  Rocket,
  Shield,
  Sparkles,
  Star,
  UsersRound,
  WalletCards,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { MerchantShell } from "@/components/merchant-shell";
import {
  merchantIntlLocale,
  merchantLocalePath,
  merchantText,
  type MerchantLocale,
} from "@/lib/merchant-locale";
import {
  formatBasisPoints,
  formatExactInteger,
  formatExactMinorAmount,
  type OverviewRange,
} from "@/lib/overview";

export type DashboardTenant = Readonly<{
  organizationName: string;
  workspaceName: string;
  programmeName: string;
  role: string;
}>;

export type DashboardProgrammeSummary = Readonly<{
  audit: readonly Readonly<{
    action: string;
    createdAt: string;
    id: string;
  }>[];
  hasPublishedVersion: boolean;
  id: string | null;
  name: string;
  reward: Readonly<{
    costPoints: string;
    kind: string;
    name: string;
  }> | null;
  tiers: readonly Readonly<{ code: string; name: string }>[];
  versionNumber: number | null;
  versionStatus: string | null;
}>;

export type DashboardConnectorSummary = Readonly<{
  connected: boolean;
  displayName: string | null;
  healthy: boolean;
}>;

function auditLabel(action: string): string {
  return (
    {
      "programme.create": "Programme created",
      "programme.draft.create": "Draft saved",
      "programme.version.publish": "Programme published",
      "programme.version.schedule": "Publication scheduled",
    }[action] ?? action.replaceAll(".", " ")
  );
}

function rewardKind(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function compactCurrency(value: string): string {
  return value.startsWith("EUR ") ? `€${value.slice(4)}` : value;
}

export function DashboardOverview({
  connector,
  greeting,
  locale,
  programme,
  range,
  report,
  tenant,
}: Readonly<{
  connector: DashboardConnectorSummary;
  greeting: string;
  locale: MerchantLocale;
  programme: DashboardProgrammeSummary;
  range: OverviewRange;
  report: MerchantOverviewReportV1 | null;
  tenant: DashboardTenant;
}>) {
  const [rangePending, startRangeTransition] = useTransition();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const text = (source: string) => merchantText(locale, source);
  const intlLocale = merchantIntlLocale(locale);
  const structureComplete = programme.id !== null && programme.tiers.length > 0;
  const rewardComplete = programme.reward !== null;
  const connectionComplete = connector.connected;
  const publishComplete = programme.hasPublishedVersion;
  const completedCount = [
    structureComplete,
    rewardComplete,
    connectionComplete,
    publishComplete,
  ].filter(Boolean).length;

  const performance = [
    {
      icon: UsersRound,
      label: "Members",
      tone: "violet",
      value: report ? formatExactInteger(report.membersTotal, intlLocale) : "—",
    },
    {
      icon: WalletCards,
      label: "Eligible spend",
      tone: "green",
      value:
        report?.currencyCode && report.minorUnitsPerMajor
          ? compactCurrency(
              formatExactMinorAmount(
                report.eligibleSpendMinor,
                report.currencyCode,
                report.minorUnitsPerMajor,
                intlLocale,
              ),
            )
          : "—",
    },
    {
      icon: Percent,
      label: "Redemption",
      tone: "violet",
      value: report
        ? formatBasisPoints(report.redemptionRateBasisPoints, intlLocale)
        : "—",
    },
    {
      icon: Shield,
      label: "Outstanding points",
      tone: "amber",
      value: report
        ? `${formatExactInteger(report.outstandingPoints, intlLocale)} pts`
        : "—",
    },
  ] as const;

  return (
    <MerchantShell
      activePath="/"
      locale={locale}
      pageTitle="Overview"
      primaryAction={{ href: "/programme", label: "Manage programme" }}
      tenant={tenant}
    >
      <main
        className="merchant-main overview-command-center"
        id="main-content"
        tabIndex={-1}
      >
        <section className="overview-intro">
          <h1>{text(greeting)}</h1>
          <p>
            {text("Here’s what needs your attention in Starfiniti Loyalty.")}
          </p>
        </section>

        <section
          className="programme-context-strip"
          aria-label={text("Programme context")}
        >
          <strong>{programme.name}</strong>
          <span>{tenant.workspaceName}</span>
          <span className="ui-badge ui-badge-neutral">
            {programme.versionNumber
              ? `${text(programme.versionStatus === "draft" ? "Draft" : "Version")} v${programme.versionNumber}`
              : text("No version")}
          </span>
          <span className="programme-tier-summary">
            {programme.tiers.slice(0, 3).map((tier, index) => {
              const TierIcon = index === 2 ? Star : Flower2;
              return (
                <span key={tier.code}>
                  <TierIcon aria-hidden="true" />
                  {tier.name}
                </span>
              );
            })}
          </span>
          <Link
            className="context-link"
            href={merchantLocalePath("/programme", locale)}
          >
            {text("Open programme")} <ExternalLink aria-hidden="true" />
          </Link>
        </section>

        <div className="launch-layout">
          <section
            className="ui-card launch-checklist"
            aria-labelledby="launch-checklist-title"
          >
            <header className="surface-header checklist-heading">
              <h2 id="launch-checklist-title">{text("Launch checklist")}</h2>
              <span>
                {completedCount} {text("of 4 complete")}
              </span>
            </header>

            <details className="checklist-item">
              <summary>
                <span
                  className={`checklist-icon ${structureComplete ? "success" : "violet"}`}
                >
                  {structureComplete ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : (
                    <Workflow aria-hidden="true" />
                  )}
                </span>
                <span className="checklist-number">1</span>
                <span className="checklist-copy">
                  <strong>{text("Programme structure")}</strong>
                  <small>
                    {text("Set up the core of your loyalty programme.")}
                  </small>
                </span>
                <span
                  className={`ui-badge ${structureComplete ? "ui-badge-success" : "ui-badge-warning"}`}
                >
                  {text(structureComplete ? "Complete" : "Required")}
                </span>
                <ChevronDown aria-hidden="true" className="checklist-chevron" />
              </summary>
              <div className="checklist-detail compact-detail">
                <p>
                  {programme.tiers.length > 0
                    ? `${programme.tiers.length} ${text("tiers configured")}: ${programme.tiers.map((tier) => tier.name).join(", ")}.`
                    : text(
                        "Add at least one tier to define how members earn points.",
                      )}
                </p>
                <Link
                  className="ui-button ui-button-secondary"
                  href={merchantLocalePath("/programme#tiers-title", locale)}
                >
                  {text("Review structure")}
                </Link>
              </div>
            </details>

            <details className="checklist-item" open={!rewardComplete}>
              <summary>
                <span
                  className={`checklist-icon ${rewardComplete ? "success" : "violet"}`}
                >
                  {rewardComplete ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : (
                    <Gift aria-hidden="true" />
                  )}
                </span>
                <span className="checklist-number">2</span>
                <span className="checklist-copy">
                  <strong>{text("First reward")}</strong>
                  <small>
                    {text("Create your first reward for members to redeem.")}
                  </small>
                </span>
                <span
                  className={`ui-badge ${rewardComplete ? "ui-badge-success" : "ui-badge-warning"}`}
                >
                  {text(rewardComplete ? "Complete" : "Required")}
                </span>
                <ChevronDown aria-hidden="true" className="checklist-chevron" />
              </summary>
              <div className="checklist-detail reward-detail">
                <dl>
                  <div>
                    <dt>{text("Reward name")}</dt>
                    <dd>{programme.reward?.name ?? text("Not set")}</dd>
                  </div>
                  <div>
                    <dt>{text("Reward type")}</dt>
                    <dd>
                      {programme.reward
                        ? rewardKind(programme.reward.kind)
                        : text("No reward added")}
                    </dd>
                  </div>
                  <div>
                    <dt>{text("Cost")}</dt>
                    <dd>
                      {programme.reward
                        ? `${formatExactInteger(programme.reward.costPoints, intlLocale)} pts`
                        : text("Not set")}
                    </dd>
                  </div>
                  <div>
                    <dt>{text("Availability")}</dt>
                    <dd>
                      {programme.reward
                        ? text("Current version")
                        : text("Not set")}
                    </dd>
                  </div>
                </dl>
                <div className="reward-callout">
                  <p>
                    {text(
                      programme.reward
                        ? "Your first reward is configured. Review its value before publishing."
                        : "Add your first reward to give members something to redeem.",
                    )}
                  </p>
                  <Link
                    className="ui-button ui-button-primary"
                    href={merchantLocalePath(
                      "/programme#rewards-title",
                      locale,
                    )}
                  >
                    {text(programme.reward ? "Review reward" : "Add reward")}
                  </Link>
                </div>
              </div>
            </details>

            <details className="checklist-item">
              <summary>
                <span
                  className={`checklist-icon ${connectionComplete ? "success" : "violet"}`}
                >
                  {connectionComplete ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : (
                    <Clock3 aria-hidden="true" />
                  )}
                </span>
                <span className="checklist-number">3</span>
                <span className="checklist-copy">
                  <strong>{text("WooCommerce connection")}</strong>
                  <small>
                    {text("Connect your store to sync orders and customers.")}
                  </small>
                </span>
                <span
                  className={`ui-badge ${connectionComplete ? "ui-badge-success" : "ui-badge-violet"}`}
                >
                  {text(
                    connectionComplete
                      ? connector.healthy
                        ? "Healthy"
                        : "Attention"
                      : "Waiting",
                  )}
                </span>
                <ChevronDown aria-hidden="true" className="checklist-chevron" />
              </summary>
              <div className="checklist-detail compact-detail">
                <p>
                  {connector.displayName
                    ? `${connector.displayName} ${text("is connected to this workspace.")}`
                    : text("No WooCommerce store is connected yet.")}
                </p>
                <Link
                  className="ui-button ui-button-secondary"
                  href={merchantLocalePath("/operations", locale)}
                >
                  <PlugZap aria-hidden="true" />{" "}
                  {text(
                    connectionComplete ? "Open operations" : "Connect store",
                  )}
                </Link>
              </div>
            </details>

            <details className="checklist-item">
              <summary>
                <span
                  className={`checklist-icon ${publishComplete ? "success" : "danger"}`}
                >
                  {publishComplete ? (
                    <Rocket aria-hidden="true" />
                  ) : (
                    <Ban aria-hidden="true" />
                  )}
                </span>
                <span className="checklist-number">4</span>
                <span className="checklist-copy">
                  <strong>{text("Publish programme")}</strong>
                  <small>{text("Review and publish your programme.")}</small>
                </span>
                <span
                  className={`ui-badge ${publishComplete ? "ui-badge-success" : "ui-badge-danger"}`}
                >
                  {text(
                    publishComplete
                      ? "Published"
                      : rewardComplete
                        ? "Ready to review"
                        : "Blocked",
                  )}
                </span>
                <ChevronDown aria-hidden="true" className="checklist-chevron" />
              </summary>
              <div className="checklist-detail compact-detail">
                <p>
                  {text(
                    publishComplete
                      ? "A published version is live. Future edits create a new immutable draft."
                      : "Review the current draft and its immutable fingerprint before publishing.",
                  )}
                </p>
                <Link
                  className="ui-button ui-button-secondary"
                  href={merchantLocalePath("/programme", locale)}
                >
                  {text("Review programme")}
                </Link>
              </div>
            </details>
          </section>

          <aside
            className="ui-card performance-rail"
            aria-labelledby="performance-title"
          >
            <header className="surface-header performance-heading">
              <div>
                <h2 id="performance-title">{text("Performance")}</h2>
                <span>{text("Authoritative reporting")}</span>
              </div>
              <label className="compact-range-select">
                <span className="sr-only">{text("Date range")}</span>
                <select
                  aria-busy={rangePending}
                  disabled={rangePending}
                  value={String(range)}
                  onChange={(event) => {
                    const parameters = new URLSearchParams(searchParams);
                    parameters.set("range", event.target.value);
                    startRangeTransition(() => {
                      router.replace(`${pathname}?${parameters.toString()}`);
                    });
                  }}
                >
                  <option value="7">7d</option>
                  <option value="30">30d</option>
                  <option value="90">90d</option>
                </select>
              </label>
            </header>
            <div className="performance-list">
              {performance.map((metric) => (
                <article key={metric.label}>
                  <span className={`performance-icon ${metric.tone}`}>
                    <metric.icon aria-hidden="true" />
                  </span>
                  <span>
                    <small>{text(metric.label)}</small>
                    <strong>{metric.value}</strong>
                  </span>
                </article>
              ))}
            </div>
          </aside>
        </div>

        <section
          className="ui-card recent-activity"
          aria-labelledby="recent-activity-title"
        >
          <header className="surface-header">
            <h2 id="recent-activity-title">{text("Recent activity")}</h2>
          </header>
          {programme.audit.length > 0 ? (
            <ol>
              {programme.audit.slice(0, 3).map((event, index) => (
                <li key={event.id}>
                  <span
                    className={`activity-icon ${index === 0 ? "blue" : "green"}`}
                  >
                    {index === 0 ? (
                      <FileText aria-hidden="true" />
                    ) : (
                      <Sparkles aria-hidden="true" />
                    )}
                  </span>
                  <span className="activity-copy">
                    <strong>
                      {event.action === "programme.draft.create" &&
                      programme.versionNumber
                        ? `${text("Draft")} v${programme.versionNumber} ${text("saved")}`
                        : text(auditLabel(event.action))}
                    </strong>
                    <small>
                      {event.action === "programme.create" &&
                      programme.versionNumber
                        ? `${text("Draft")} v${programme.versionNumber} ${text("created")}.`
                        : text(
                            index === 0
                              ? "Programme settings updated."
                              : "Programme activity recorded.",
                          )}
                    </small>
                  </span>
                  <time dateTime={event.createdAt}>
                    {new Intl.DateTimeFormat(intlLocale, {
                      dateStyle: "medium",
                      timeZone: "Europe/Ljubljana",
                    }).format(new Date(event.createdAt))}
                  </time>
                  <span className="activity-actor">
                    {text("Merchant member")}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="activity-empty">
              <Sparkles aria-hidden="true" />
              <span>{text("Programme activity will appear here.")}</span>
            </div>
          )}
          <Link
            className="activity-link"
            href={merchantLocalePath("/programme#audit-title", locale)}
          >
            {text("View all activity")}
          </Link>
        </section>
      </main>
    </MerchantShell>
  );
}
