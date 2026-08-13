"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  Coins,
  Gem,
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Palette,
  RefreshCw,
  Sparkles,
  Star,
  Sun,
  Users,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { signOut } from "@/app/actions";
import {
  merchantLocalePath,
  merchantText,
  type MerchantLocale,
} from "@/lib/merchant-locale";
import starfinitiIcon from "../../../docs/design/prototype-source/assets/images/starfiniti-icon.png";

type MerchantShellTenant = Readonly<{
  organizationName: string;
  workspaceName: string;
  programmeName: string;
  role: string;
}>;

type NavigationItem = Readonly<{
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  group?: "PROGRAMME" | "GROW" | "PLATFORM";
  match: (pathname: string) => boolean;
}>;

const navigation: readonly NavigationItem[] = [
  {
    label: "Overview",
    href: "/",
    icon: LayoutDashboard,
    match: (pathname) => pathname === "/",
  },
  {
    label: "Programme overview",
    href: "/programme",
    icon: Gem,
    group: "PROGRAMME",
    match: (pathname) => pathname.startsWith("/programme"),
  },
  {
    label: "Earning rules",
    href: "/programme#tiers-title",
    icon: Coins,
    match: () => false,
  },
  {
    label: "Rewards",
    href: "/programme#rewards-title",
    icon: Gift,
    match: () => false,
  },
  {
    label: "VIP tiers",
    href: "/programme#tiers-title",
    icon: Star,
    match: () => false,
  },
  {
    label: "Customers",
    href: "/customers",
    icon: Users,
    group: "GROW",
    match: (pathname) => pathname.startsWith("/customers"),
  },
  {
    label: "Connector operations",
    href: "/operations",
    icon: Activity,
    match: (pathname) => pathname.startsWith("/operations"),
  },
  {
    label: "Customer experience",
    href: "/experience",
    icon: Palette,
    group: "PLATFORM",
    match: (pathname) => pathname.startsWith("/experience"),
  },
];

const themeStorageKey = "starfiniti-loyalty-theme";
const themeChangeEvent = "starfiniti-loyalty-theme-change";

function subscribeToTheme(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(themeChangeEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(themeChangeEvent, onStoreChange);
  };
}

function getThemeSnapshot(): boolean {
  return window.localStorage.getItem(themeStorageKey) === "dark";
}

function getServerThemeSnapshot(): boolean {
  return false;
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function MerchantShell({
  activePath,
  children,
  locale,
  pageTitle,
  primaryAction,
  tenant,
}: Readonly<{
  activePath?: string;
  children: ReactNode;
  locale: MerchantLocale;
  pageTitle: string;
  primaryAction?: Readonly<{ href: string; label: string }>;
  tenant: MerchantShellTenant;
}>) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const darkMode = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );
  const [refreshPending, startRefreshTransition] = useTransition();
  const pathname = usePathname();
  const router = useRouter();
  const text = (source: string) => merchantText(locale, source);

  useEffect(() => {
    document.documentElement.dataset.dashboardTheme = darkMode
      ? "dark"
      : "light";
  }, [darkMode]);

  function toggleTheme() {
    const next = !darkMode;
    window.localStorage.setItem(themeStorageKey, next ? "dark" : "light");
    document.documentElement.dataset.dashboardTheme = next ? "dark" : "light";
    window.dispatchEvent(new Event(themeChangeEvent));
  }

  return (
    <div className="merchant-shell" lang={locale}>
      <aside
        aria-label={text("Merchant navigation")}
        className={`merchant-sidebar ${navigationOpen ? "is-open" : ""}`}
      >
        <div className="merchant-brand-lockup">
          <Image alt="" height={38} priority src={starfinitiIcon} width={38} />
          <span>
            <strong>Starfiniti</strong>
            <small>{text("Loyalty")}</small>
          </span>
          <button
            aria-label={text("Close navigation")}
            className="merchant-mobile-close ui-icon-button"
            onClick={() => setNavigationOpen(false)}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <nav className="merchant-nav" aria-label={text("Main navigation")}>
          {navigation.map((item, index) => {
            const previous = navigation[index - 1];
            const showGroup = item.group && previous?.group !== item.group;
            const active = item.match(activePath ?? pathname);
            return (
              <div key={item.label}>
                {showGroup ? (
                  <p className="merchant-nav-group">{text(item.group)}</p>
                ) : null}
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`merchant-nav-item ${active ? "is-active" : ""}`}
                  href={merchantLocalePath(item.href, locale)}
                  onClick={() => setNavigationOpen(false)}
                >
                  <item.icon aria-hidden="true" />
                  <span>{text(item.label)}</span>
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="merchant-sidebar-footer">
          <div className="merchant-user-avatar" aria-hidden="true">
            {tenant.organizationName.charAt(0).toUpperCase() || "S"}
          </div>
          <span className="merchant-user-copy">
            <strong>{text("Merchant member")}</strong>
            <small>{roleLabel(tenant.role)}</small>
          </span>
          <form action={signOut}>
            <input name="lang" type="hidden" value={locale} />
            <button
              aria-label={text("Sign out")}
              className="ui-icon-button merchant-sign-out"
              title={text("Sign out")}
              type="submit"
            >
              <LogOut aria-hidden="true" />
            </button>
          </form>
        </div>
      </aside>

      {navigationOpen ? (
        <button
          aria-label={text("Close navigation")}
          className="merchant-scrim"
          onClick={() => setNavigationOpen(false)}
          type="button"
        />
      ) : null}

      <div className="merchant-workspace">
        <header className="merchant-commandbar">
          <div className="merchant-commandbar-title">
            <button
              aria-label={text("Open navigation")}
              className="merchant-mobile-menu ui-icon-button"
              onClick={() => setNavigationOpen(true)}
              type="button"
            >
              <Menu aria-hidden="true" />
            </button>
            <Sparkles aria-hidden="true" className="merchant-page-mark" />
            <strong>{text(pageTitle)}</strong>
          </div>
          <div className="merchant-commandbar-actions">
            <button
              aria-label={text(darkMode ? "Use light theme" : "Use dark theme")}
              className="ui-icon-button"
              onClick={toggleTheme}
              title={text(darkMode ? "Use light theme" : "Use dark theme")}
              type="button"
            >
              {darkMode ? (
                <Moon aria-hidden="true" />
              ) : (
                <Sun aria-hidden="true" />
              )}
            </button>
            <button
              aria-busy={refreshPending}
              aria-label={text("Refresh data")}
              className="ui-icon-button"
              disabled={refreshPending}
              onClick={() => startRefreshTransition(() => router.refresh())}
              title={text("Refresh data")}
              type="button"
            >
              <RefreshCw
                aria-hidden="true"
                className={refreshPending ? "is-spinning" : undefined}
              />
            </button>
            {primaryAction ? (
              <Link
                className="ui-button ui-button-primary merchant-primary-action"
                href={merchantLocalePath(primaryAction.href, locale)}
              >
                {text(primaryAction.label)}
              </Link>
            ) : null}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
