"use client";

import {
  Activity,
  Gem,
  HelpCircle,
  LayoutDashboard,
  Menu,
  Palette,
  Users,
  X,
} from "lucide-react";
import type { MerchantOverviewReportV1 } from "@starfiniti/contracts";
import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "@/app/actions";
import { MerchantLocaleSwitcher } from "@/components/merchant-locale-switcher";
import {
  merchantIntlLocale,
  merchantLocalePath,
  merchantText,
  type MerchantLocale,
} from "@/lib/merchant-locale";
import {
  formatExactInteger,
  overviewChartData,
  overviewMetrics,
  type OverviewRange,
} from "@/lib/overview";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const nav = [
  { label: "Overview", icon: LayoutDashboard, active: true, href: "/" },
  { label: "Programme overview", icon: Gem, href: "/programme" },
  { label: "Earning rules", href: "/programme#tiers-title" },
  { label: "Rewards", href: "/programme#rewards-title" },
  { label: "VIP tiers", href: "/programme#tiers-title" },
  { label: "Customers", icon: Users, group: "GROW", href: "/customers" },
  { label: "Connector operations", icon: Activity, href: "/operations" },
  {
    label: "Customer experience",
    icon: Palette,
    group: "PLATFORM",
    href: "/experience",
  },
];

export type DashboardTenant = Readonly<{
  organizationName: string;
  workspaceName: string;
  programmeName: string;
  role: string;
}>;

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function DashboardOverview({
  tenant,
  report,
  range,
  locale,
}: Readonly<{
  tenant: DashboardTenant;
  report: MerchantOverviewReportV1 | null;
  range: OverviewRange;
  locale: MerchantLocale;
}>) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rangePending, startRangeTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const text = (source: string) => merchantText(locale, source);
  const intlLocale = merchantIntlLocale(locale);
  const chartData = useMemo(
    () => (report ? overviewChartData(report) : []),
    [report],
  );
  const metrics = useMemo(
    () => (report ? overviewMetrics(report, intlLocale) : []),
    [intlLocale, report],
  );

  return (
    <div className="app-shell" lang={locale}>
      <button
        className="mobile-menu"
        type="button"
        aria-label={text("Open navigation")}
        onClick={() => setSidebarOpen(true)}
      >
        <Menu aria-hidden="true" />
      </button>
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <button
          className="sidebar-close"
          type="button"
          aria-label={text("Close navigation")}
          onClick={() => setSidebarOpen(false)}
        >
          <X aria-hidden="true" />
        </button>
        <div className="store-switcher">
          <div className="store-avatar">
            {initials(tenant.organizationName) || "SF"}
          </div>
          <div>
            <strong>{tenant.organizationName}</strong>
            <span>{tenant.workspaceName}</span>
          </div>
        </div>
        <div className="store-status">
          <span className="live">
            <i />
            {text("Live")}
          </span>
          <span className="draft-count">{text("Authenticated")}</span>
        </div>
        <nav aria-label={text("Main navigation")}>
          {nav.map((item, index) => (
            <div key={item.label}>
              {item.group ? (
                <div className="nav-group">{text(item.group)}</div>
              ) : index === 1 ? (
                <div className="nav-group">{text("PROGRAMME")}</div>
              ) : null}
              <a
                href={merchantLocalePath(item.href, locale)}
                className={item.active ? "nav-item active" : "nav-item"}
                onClick={() => setSidebarOpen(false)}
              >
                {item.icon ? (
                  <item.icon aria-hidden="true" />
                ) : (
                  <span className="nav-indent" />
                )}
                <span>{text(item.label)}</span>
              </a>
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="reporting-label">
            {text("Live tenant context · live reporting")}
          </span>
          <div className="user-card">
            <span className="user-avatar">
              {initials(tenant.organizationName) || "SF"}
            </span>
            <span>
              <strong>{text("Merchant member")}</strong>
              <small>{tenant.role}</small>
            </span>
            <form action={signOut}>
              <input name="lang" type="hidden" value={locale} />
              <button className="sign-out" type="submit">
                {text("Sign out")}
              </button>
            </form>
          </div>
        </div>
      </aside>

      {sidebarOpen ? (
        <button
          className="scrim"
          aria-label={text("Close navigation")}
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <main id="main-content" tabIndex={-1}>
        <header className="topbar">
          <div className="top-actions">
            <label className="range-select">
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
                <option value="7">{text("Last 7 days")}</option>
                <option value="30">{text("Last 30 days")}</option>
                <option value="90">{text("Last 90 days")}</option>
              </select>
            </label>
            <MerchantLocaleSwitcher locale={locale} />
          </div>
        </header>

        <section className="content">
          <div className="page-heading">
            <div>
              <h1>{text("Overview")}</h1>
              <p>
                {tenant.programmeName} · {tenant.workspaceName} ·
                Europe/Ljubljana
              </p>
            </div>
            <div className="heading-actions">
              <a
                className="primary"
                href={merchantLocalePath("/programme", locale)}
              >
                {text("Manage programme")}
              </a>
            </div>
          </div>

          {report ? (
            <div className="live-report-banner" role="status">
              {locale === "sl-SI"
                ? "Agregati organizacije, delovnega prostora in programa v živo na dan "
                : "Live tenant, workspace, and programme aggregates as of "}
              {new Intl.DateTimeFormat(intlLocale, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Europe/Ljubljana",
              }).format(new Date(report.asOf))}
              {locale === "sl-SI"
                ? ". Neobdelana naročila, identifikatorji strank in vrstice glavne knjige ostanejo samo na strežniku."
                : ". Raw orders, customer identifiers, and ledger rows remain server-only."}
            </div>
          ) : (
            <div className="preview-banner" role="note">
              {locale === "sl-SI"
                ? "Poročanje se bo aktiviralo, ko bo organizacija imela aktiven delovni prostor in dodeljeno skupino programa. Ponazoritvene vrednosti niso prikazane."
                : "Reporting will activate after this organization has an active workspace and programme-group assignment. No illustrative values are shown."}
            </div>
          )}

          {report ? (
            <>
              <div className="metrics-grid">
                {metrics.map((metric) => (
                  <article className="metric-card" key={metric.label}>
                    <p>
                      {text(metric.label)}
                      {metric.info ? (
                        <HelpCircle
                          className="metric-info"
                          aria-hidden="true"
                        />
                      ) : null}
                    </p>
                    <strong>{metric.value}</strong>
                    {metric.note ? (
                      <span className="metric-note">{text(metric.note)}</span>
                    ) : null}
                    {metric.delta ? (
                      <span className={`metric-delta ${metric.tone}`}>
                        {metric.delta} <em>{text(metric.suffix ?? "")}</em>
                      </span>
                    ) : null}
                  </article>
                ))}
              </div>

              <article className="chart-card">
                <div className="chart-header">
                  <div>
                    <strong>{text("New members")}</strong>
                    <span>
                      {formatExactInteger(report.membersNew, intlLocale)}{" "}
                      {locale === "sl-SI"
                        ? "v tem obdobju · dnevni UTC intervali"
                        : "this period · daily UTC buckets"}
                    </span>
                  </div>
                  <div className="legend">
                    <span>
                      <i className="current" />
                      {text("This period")}
                    </span>
                    <span>
                      <i />
                      {text("Previous")}
                    </span>
                  </div>
                </div>
                <div
                  className="chart-wrap"
                  aria-label={text("New members trend chart")}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 8, right: 8, bottom: 0, left: -24 }}
                    >
                      <CartesianGrid vertical={false} stroke="#f1f0ee" />
                      <XAxis
                        dataKey="day"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#a8a29e", fontSize: 11 }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#a8a29e", fontSize: 11 }}
                      />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="previous"
                        stroke="#d6d3d1"
                        fill="none"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="members"
                        stroke="#4f46e5"
                        fill="#4f46e5"
                        fillOpacity={0.08}
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </>
          ) : null}
        </section>
      </main>
    </div>
  );
}
