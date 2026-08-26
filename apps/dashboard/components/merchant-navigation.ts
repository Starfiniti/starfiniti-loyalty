import {
  Activity,
  Coins,
  Gem,
  Gift,
  FileUp,
  LayoutDashboard,
  MailCheck,
  Megaphone,
  Palette,
  Star,
  Users,
  UsersRound,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";

export type MerchantNavigationItem = Readonly<{
  label: string;
  href: string;
  icon: LucideIcon;
  group?: "PROGRAMME" | "GROW" | "PLATFORM";
  match: (pathname: string) => boolean;
}>;

export const merchantNavigation: readonly MerchantNavigationItem[] = [
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
    match: (pathname) => pathname === "/programme",
  },
  {
    label: "Earning rules",
    href: "/programme/earning-rules",
    icon: Coins,
    match: (pathname) => pathname === "/programme/earning-rules",
  },
  {
    label: "Rewards",
    href: "/programme/rewards",
    icon: Gift,
    match: (pathname) => pathname === "/programme/rewards",
  },
  {
    label: "VIP tiers",
    href: "/programme/vip-tiers",
    icon: Star,
    match: (pathname) => pathname === "/programme/vip-tiers",
  },
  {
    label: "Customers",
    href: "/customers",
    icon: Users,
    group: "GROW",
    match: (pathname) => pathname.startsWith("/customers"),
  },
  {
    label: "Referrals",
    href: "/referrals",
    icon: UserRoundPlus,
    match: (pathname) => pathname.startsWith("/referrals"),
  },
  {
    label: "Campaigns",
    href: "/campaigns",
    icon: Megaphone,
    match: (pathname) => pathname.startsWith("/campaigns"),
  },
  {
    label: "Connector operations",
    href: "/operations",
    icon: Activity,
    match: (pathname) => pathname.startsWith("/operations"),
  },
  {
    label: "Notifications",
    href: "/notifications",
    icon: MailCheck,
    group: "PLATFORM",
    match: (pathname) => pathname.startsWith("/notifications"),
  },
  {
    label: "Migrations",
    href: "/migrations",
    icon: FileUp,
    match: (pathname) => pathname.startsWith("/migrations"),
  },
  {
    label: "Customer experience",
    href: "/experience",
    icon: Palette,
    match: (pathname) => pathname.startsWith("/experience"),
  },
  {
    label: "Team & access",
    href: "/organization/access",
    icon: UsersRound,
    match: (pathname) => pathname.startsWith("/organization/access"),
  },
];
