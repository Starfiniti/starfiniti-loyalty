"use client";

import {
  Bell,
  ChevronDown,
  Gem,
  HelpCircle,
  LayoutDashboard,
  Megaphone,
  Menu,
  Moon,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { signOut } from "@/app/actions";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ranges = {
  "7": [214, 238, 245, 276, 268, 302, 321],
  "30": [540, 610, 595, 670, 720, 684, 765, 820, 802, 870],
  "90": [1420, 1550, 1670, 1620, 1780, 1890, 2010, 2180, 2240, 2390],
} as const;

const nav = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Programme overview", icon: Gem },
  { label: "Earning rules" },
  { label: "Rewards" },
  { label: "VIP tiers" },
  { label: "Points expiry" },
  { label: "Customers", icon: Users, group: "GROW" },
  { label: "Campaigns", icon: Megaphone },
  { label: "Referrals", icon: Sparkles },
];

const metrics = [
  {
    label: "Loyalty members",
    value: "12,842",
    delta: "↑ 5.6%",
    tone: "positive",
    suffix: "vs prev. 30 days",
  },
  {
    label: "Member revenue",
    value: "€184,320",
    delta: "↑ 8.2%",
    tone: "positive",
    suffix: "vs prev. 30 days",
  },
  {
    label: "Repeat-purchase rate",
    value: "38.6%",
    delta: "↑ 2.1 pts",
    tone: "positive",
    suffix: "vs prev. 30 days",
  },
  {
    label: "Redemption rate",
    value: "14.8%",
    delta: "↓ 0.4 pts",
    tone: "negative",
    suffix: "vs prev. 30 days",
  },
  {
    label: "Points liability",
    value: "€8,462.70",
    note: "846,270 pts outstanding",
    info: true,
  },
] as const;

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

export function DashboardOverview({ tenant }: { tenant: DashboardTenant }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [range, setRange] = useState<keyof typeof ranges>("30");

  const chartData = useMemo(
    () =>
      ranges[range].map((members, index) => ({
        day: `${index + 1}`,
        members,
        previous: Math.round(members * 0.86),
      })),
    [range],
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
                href="#"
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
            Live tenant context · preview analytics
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

      <main>
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
                value={range}
                onChange={(event) =>
                  setRange(event.target.value as keyof typeof ranges)
                }
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

          <div className="preview-banner" role="note">
            Analytics below are an illustrative preview until the reporting
            queries are connected. Tenant, workspace, role, and programme scope
            above are live and RLS-protected.
          </div>

          <div className="metrics-grid">
            {metrics.map((metric) => (
              <article className="metric-card" key={metric.label}>
                <p>
                  {metric.label}
                  {"info" in metric && metric.info ? (
                    <HelpCircle className="metric-info" aria-hidden="true" />
                  ) : null}
                </p>
                <strong>{metric.value}</strong>
                {"note" in metric && metric.note ? (
                  <span className="metric-note">{metric.note}</span>
                ) : null}
                {"delta" in metric ? (
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
                  {range === "30" ? "684" : chartData.at(-1)?.members} this
                  period · daily
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
            <div className="chart-wrap" aria-label="New members trend chart">
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
        </section>
      </main>
    </div>
  );
}
