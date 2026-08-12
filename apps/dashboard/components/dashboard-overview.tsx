"use client";

import {
  Bell,
  Activity,
  ChevronDown,
  Gem,
  HelpCircle,
  LayoutDashboard,
  Megaphone,
  Menu,
  Moon,
  Palette,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type { MerchantOverviewReportV1 } from "@starfiniti/contracts";
import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "@/app/actions";
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
  { label: "Earning rules" },
  { label: "Rewards" },
  { label: "VIP tiers" },
  { label: "Points expiry" },
  { label: "Customers", icon: Users, group: "GROW", href: "/customers" },
  { label: "Connector operations", icon: Activity, href: "/operations" },
  { label: "Campaigns", icon: Megaphone },
  { label: "Referrals", icon: Sparkles },
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
}: Readonly<{
  tenant: DashboardTenant;
  report: MerchantOverviewReportV1 | null;
  range: OverviewRange;
}>) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rangePending, startRangeTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const chartData = useMemo(
    () => (report ? overviewChartData(report) : []),
    [report],
  );
  const metrics = useMemo(
    () => (report ? overviewMetrics(report) : []),
    [report],
  );

  return (
    <div className="app-shell">
      <button
        className="mobile-menu"
        type="button"
        aria-label="Open navigation"
        onClick={() => setSidebarOpen(true)}
      >
        <Menu aria-hidden="true" />
      </button>
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <button
          className="sidebar-close"
          type="button"
          aria-label="Close navigation"
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
          <ChevronDown className="switcher-icon" aria-hidden="true" />
        </div>
        <div className="store-status">
          <span className="live">
            <i />
            Live
          </span>
          <span className="draft-count">Authenticated</span>
        </div>
        <nav aria-label="Main navigation">
          {nav.map((item, index) => (
            <div key={item.label}>
              {item.group ? (
                <div className="nav-group">{item.group}</div>
              ) : index === 1 ? (
                <div className="nav-group">PROGRAMME</div>
              ) : null}
              <a
                href={item.href ?? "#"}
                className={item.active ? "nav-item active" : "nav-item"}
                onClick={() => setSidebarOpen(false)}
              >
                {item.icon ? (
                  <item.icon aria-hidden="true" />
                ) : (
                  <span className="nav-indent" />
                )}
                <span>{item.label}</span>
              </a>
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="demo-label">
            Live tenant context · live reporting
          </span>
          <div className="user-card">
            <span className="user-avatar">
              {initials(tenant.organizationName) || "SF"}
            </span>
            <span>
              <strong>Merchant member</strong>
              <small>{tenant.role}</small>
            </span>
            <form action={signOut}>
              <button className="sign-out" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {sidebarOpen ? (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <main id="main-content" tabIndex={-1}>
        <header className="topbar">
          <label className="search">
            <Search aria-hidden="true" />
            <input
              aria-label="Search"
              placeholder="Search customers, rewards, rules…"
            />
            <kbd>⌘K</kbd>
          </label>
          <div className="top-actions">
            <label className="range-select">
              <span className="sr-only">Date range</span>
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
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </label>
            <button type="button" aria-label="Toggle dark mode">
              <Moon aria-hidden="true" />
            </button>
            <button type="button" aria-label="Help">
              <HelpCircle aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Notifications"
              className="notification"
            >
              <Bell aria-hidden="true" />
              <i />
            </button>
          </div>
        </header>

        <section className="content">
          <div className="page-heading">
            <div>
              <h1>Overview</h1>
              <p>
                {tenant.programmeName} · {tenant.workspaceName} ·
                Europe/Ljubljana
              </p>
            </div>
            <div className="heading-actions">
              <a className="primary" href="/programme">
                Manage programme
              </a>
            </div>
          </div>

          {report ? (
            <div className="live-report-banner" role="status">
              Live tenant, workspace, and programme aggregates as of{" "}
              {new Intl.DateTimeFormat("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Europe/Ljubljana",
              }).format(new Date(report.asOf))}
              . Raw orders, customer identifiers, and ledger rows remain
              server-only.
            </div>
          ) : (
            <div className="preview-banner" role="note">
              Reporting will activate after this organization has an active
              workspace and programme-group assignment. No illustrative values
              are shown.
            </div>
          )}

          {report ? (
            <>
              <div className="metrics-grid">
                {metrics.map((metric) => (
                  <article className="metric-card" key={metric.label}>
                    <p>
                      {metric.label}
                      {metric.info ? (
                        <HelpCircle
                          className="metric-info"
                          aria-hidden="true"
                        />
                      ) : null}
                    </p>
                    <strong>{metric.value}</strong>
                    {metric.note ? (
                      <span className="metric-note">{metric.note}</span>
                    ) : null}
                    {metric.delta ? (
                      <span className={`metric-delta ${metric.tone}`}>
                        {metric.delta} <em>{metric.suffix}</em>
                      </span>
                    ) : null}
                  </article>
                ))}
              </div>

              <article className="chart-card">
                <div className="chart-header">
                  <div>
                    <strong>New members</strong>
                    <span>
                      {formatExactInteger(report.membersNew)} this period ·
                      daily UTC buckets
                    </span>
                  </div>
                  <div className="legend">
                    <span>
                      <i className="current" />
                      This period
                    </span>
                    <span>
                      <i />
                      Previous
                    </span>
                  </div>
                </div>
                <div
                  className="chart-wrap"
                  aria-label="New members trend chart"
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
