import type {
  CrossWorkspaceCustomerLinksV1,
  ExperienceHeroAssetV2,
  ExperienceSectionV2,
} from "@starfiniti/contracts";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CircleUserRound,
  Clock3,
  Crown,
  FileClock,
  Gift,
  HeartHandshake,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Megaphone,
  MessageSquareMore,
  PackageCheck,
  PartyPopper,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  TicketCheck,
  TimerReset,
  TrendingUp,
  UserRound,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { signOut } from "@/app/actions";
import { TierProgress } from "@/components/tier-progress";
import {
  activityPresentation,
  customerAccountStatus,
  earningCapLabel,
  earningEffectLabel,
  earningSourceLabel,
  formatCustomerDate,
  formatCustomerPoints,
  rewardKindLabel,
  visibleCustomerExperienceSections,
} from "@/lib/customer-experience-presentation";
import { customerExportReauthenticationPath } from "@/lib/customer-export";
import { experienceFontStack } from "@/lib/experience-theme";
import { isSelfServiceRewardKind } from "@/lib/customer-rewards";
import type {
  CustomerCampaignOpportunity,
  CustomerEarningMethod,
  CustomerLoyaltyAccount,
  CustomerReward,
} from "@/lib/server/customer-account";
import { CustomerReferralPanel } from "./customer-referral-panel";
import { CustomerLinkedStores } from "./customer-linked-stores";

type CustomerLinksPresentationState =
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "ready"; value: CrossWorkspaceCustomerLinksV1 }>;

const navigationIcons: Readonly<Record<ExperienceSectionV2, LucideIcon>> = {
  overview: LayoutDashboard,
  earning: Sparkles,
  rewards: Gift,
  vip: Crown,
  referrals: UsersRound,
  history: History,
  account: UserRound,
};

const navigationLabels: Readonly<Record<ExperienceSectionV2, string>> = {
  overview: "Overview",
  earning: "Ways to earn",
  rewards: "Rewards",
  vip: "VIP status",
  referrals: "Referrals",
  history: "History",
  account: "Account",
};

const heroIcons: Readonly<Record<ExperienceHeroAssetV2, LucideIcon | null>> = {
  none: null,
  sparkles: Sparkles,
  gift: Gift,
  crown: Crown,
};

const earningIcons: Record<CustomerEarningMethod["source"], LucideIcon> = {
  purchase: ShoppingBag,
  account_created: UserRoundPlus,
  birthday: PartyPopper,
  verified_product_review: MessageSquareMore,
  referral: HeartHandshake,
  custom_activity: Activity,
};

const rewardIcons: Record<CustomerReward["kind"], LucideIcon> = {
  fixed_discount: TicketCheck,
  percentage_discount: ReceiptText,
  free_product: PackageCheck,
  free_shipping: ShoppingBag,
  store_credit: FileClock,
  exclusive_access: Star,
  custom: Gift,
};

export function CustomerLoyaltyExperience({
  account,
  accounts,
  customerLinks,
  messages,
}: Readonly<{
  account: CustomerLoyaltyAccount;
  accounts: readonly CustomerLoyaltyAccount[];
  customerLinks: CustomerLinksPresentationState;
  messages: ReadonlyArray<
    Readonly<{ kind: "success" | "error"; text: string }>
  >;
}>) {
  const status = customerAccountStatus(account.account_status);
  const programmeName = account.programme_name ?? "Loyalty programme";
  const { theme } = account.presentation;
  const visibleSections = visibleCustomerExperienceSections(theme);
  const style = {
    "--member-brand": theme.brandColor,
    "--member-radius": `${theme.cardRadiusPx}px`,
    "--member-font": experienceFontStack(theme.displayFont),
  } as CSSProperties;

  return (
    <main
      className={`member-hub member-hub-v2 ${theme.density}`}
      id="main-content"
      style={style}
      tabIndex={-1}
    >
      <aside className="member-hub-sidebar" aria-label="Loyalty account">
        <Link className="member-hub-brand" href="/account/loyalty">
          <span aria-hidden="true">
            <Star />
          </span>
          <strong>Starfiniti</strong>
          <small>Loyalty</small>
        </Link>

        <div className="member-hub-store">
          <span aria-hidden="true">
            <Store />
          </span>
          <div>
            <small>Connected store</small>
            <strong>{account.store_name}</strong>
          </div>
          <BadgeCheck aria-label="Verified connection" />
        </div>

        {accounts.length > 1 ? (
          <nav className="member-hub-accounts" aria-label="Store accounts">
            <span>Your accounts</span>
            {accounts.map((item) => (
              <Link
                aria-current={item.account_id === account.account_id}
                href={`/account/loyalty?account=${item.account_id}`}
                key={item.account_id}
              >
                {item.store_name}
              </Link>
            ))}
          </nav>
        ) : null}

        <MemberNavigation sections={visibleSections} />

        <div className="member-hub-sidebar-footer">
          <div>
            <ShieldCheck aria-hidden="true" />
            <span>
              <strong>Protected account</strong>
              <small>Live ledger values</small>
            </span>
          </div>
          <form action={signOut}>
            <button type="submit">
              <LogOut aria-hidden="true" /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="member-hub-body">
        <header className="member-hub-topbar">
          <div>
            <small>{account.store_name}</small>
            <strong>{programmeName}</strong>
          </div>
          <span className={`member-hub-status ${status.tone}`}>
            <i aria-hidden="true" /> {status.label}
          </span>
        </header>

        <MemberNavigation mobile sections={visibleSections} />

        <div className="member-hub-content">
          {messages.map((message, index) => (
            <p
              className={`member-hub-message ${message.kind}`}
              key={`${message.kind}-${index}`}
              role={message.kind === "error" ? "alert" : "status"}
            >
              {message.kind === "success" ? (
                <CheckCircle2 aria-hidden="true" />
              ) : (
                <LockKeyhole aria-hidden="true" />
              )}
              {message.text}
            </p>
          ))}

          {visibleSections.map((section) => (
            <MemberExperienceArea
              account={account}
              customerLinks={customerLinks}
              key={section}
              programmeName={programmeName}
              section={section}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function MemberNavigation({
  mobile = false,
  sections,
}: Readonly<{ mobile?: boolean; sections: readonly ExperienceSectionV2[] }>) {
  return (
    <nav
      className={mobile ? "member-hub-mobile-nav" : "member-hub-navigation"}
      aria-label="Loyalty sections"
    >
      {mobile ? null : <span>My loyalty</span>}
      {sections.map((section) => {
        const Icon = navigationIcons[section];
        return (
          <a href={`#${section}`} key={section}>
            <Icon aria-hidden="true" />
            <span>{navigationLabels[section]}</span>
          </a>
        );
      })}
    </nav>
  );
}

function MemberExperienceArea({
  account,
  customerLinks,
  programmeName,
  section,
}: Readonly<{
  account: CustomerLoyaltyAccount;
  customerLinks: CustomerLinksPresentationState;
  programmeName: string;
  section: ExperienceSectionV2;
}>) {
  const { copy, theme } = account.presentation;
  if (section === "overview") {
    const HeroIcon = heroIcons[theme.heroAsset];
    const status = customerAccountStatus(account.account_status);
    const affordableRewards = account.rewards.filter(
      (reward) => reward.affordable,
    ).length;
    return (
      <section className="member-hub-overview" id="overview">
        <div className="member-hub-page-heading">
          <div className="member-hub-breadcrumb">
            <span>My loyalty</span>
            <ArrowRight aria-hidden="true" />
            <strong>Overview</strong>
          </div>
          <h1>{programmeName}</h1>
          <p>Your points, rewards, status, and progress at a glance.</p>
        </div>
        <div className="member-hub-hero">
          <div>
            <span className="member-hub-hero-eyebrow">
              <Sparkles aria-hidden="true" /> {copy.balanceLabel}
            </span>
            <div className="member-hub-balance">
              <strong>{formatCustomerPoints(account.available_points)}</strong>
              <span>{copy.pointsLabel}</span>
            </div>
            <p>
              {account.tier_name
                ? `${account.tier_name} member · keep earning toward your next milestone.`
                : "Your account is ready for its first tier milestone."}
            </p>
          </div>
          {HeroIcon ? (
            <div className="member-hub-hero-mark" aria-hidden="true">
              <HeroIcon />
            </div>
          ) : null}
        </div>

        <CampaignOpportunityPanel
          opportunities={account.campaign_opportunities}
        />

        <div className="member-hub-summary-grid">
          <SummaryCard
            detail="Becomes available after the return window"
            icon={Clock3}
            label="Pending"
            value={formatCustomerPoints(account.pending_points)}
          />
          <SummaryCard
            detail="Held safely for rewards in progress"
            icon={LockKeyhole}
            label="Reserved"
            value={formatCustomerPoints(account.reserved_points)}
          />
          <SummaryCard
            detail={`${account.rewards.length} rewards in the current catalogue`}
            icon={Gift}
            label="Ready to redeem"
            value={affordableRewards.toLocaleString("en-GB")}
          />
          <SummaryCard
            detail={
              account.next_expiry_at
                ? `${formatCustomerPoints(account.next_expiry_points ?? "0")} points expire`
                : "No points are scheduled to expire"
            }
            icon={CalendarClock}
            label="Next expiry"
            value={
              account.next_expiry_at
                ? formatCustomerDate(account.next_expiry_at)
                : "None"
            }
          />
        </div>

        <p className={`member-hub-account-note ${status.tone}`}>
          <ShieldCheck aria-hidden="true" />
          <span>
            <strong>{status.label}</strong>
            {status.detail}
          </span>
        </p>
      </section>
    );
  }

  if (section === "earning") {
    return (
      <ExperienceSection
        description="See exactly how eligible activities add points to your account. Restrictions and limits are shown before you participate."
        eyebrow="Build your balance"
        icon={Sparkles}
        id="earning"
        title="Ways to earn"
      >
        {account.earning_methods.length ? (
          <div className="member-earning-grid">
            {account.earning_methods.map((method) => (
              <EarningMethodCard key={method.code} method={method} />
            ))}
          </div>
        ) : (
          <EmptyExperience
            icon={ShoppingBag}
            title="Earning methods are being prepared"
          >
            Eligible store activity will still appear in your history when the
            programme publishes its customer catalogue.
          </EmptyExperience>
        )}
      </ExperienceSection>
    );
  }

  if (section === "rewards") {
    return (
      <ExperienceSection
        description="Discover benefits you can afford now and see how many more points you need for the rest."
        eyebrow="Use your points"
        icon={Gift}
        id="rewards"
        title={copy.rewardsLabel}
      >
        {account.rewards.length ? (
          <div className="member-reward-grid">
            {account.rewards.map((reward) => (
              <RewardCard
                account={account}
                key={reward.code}
                ready={account.account_status === "ready"}
                redeemLabel={copy.redeemLabel}
                reward={reward}
              />
            ))}
          </div>
        ) : (
          <EmptyExperience icon={Gift} title="No rewards published yet">
            Your points remain available. The store will show new rewards here
            as soon as they are published.
          </EmptyExperience>
        )}

        {account.reservations.length ? (
          <div className="member-reservation-strip">
            <div>
              <TicketCheck aria-hidden="true" />
              <span>
                <strong>Rewards in progress</strong>
                <small>
                  Native store benefits are prepared asynchronously.
                </small>
              </span>
            </div>
            <ul>
              {account.reservations.map((reservation) => (
                <li key={reservation.id}>
                  <strong>{reservation.rewardName}</strong>
                  <span>{reservation.state.replaceAll("_", " ")}</span>
                  <small>
                    {formatCustomerPoints(reservation.costPoints)} points ·
                    expires {formatCustomerDate(reservation.expiresAt)}
                  </small>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </ExperienceSection>
    );
  }

  if (section === "vip") {
    return (
      <ExperienceSection
        description="Track your qualification window, next milestone, retention requirements, grace period, and immutable tier history."
        eyebrow="Member progression"
        icon={Crown}
        id="vip"
        title="VIP status"
      >
        {account.tier_progress ? (
          <TierProgress
            availablePoints={account.available_points}
            mode="member"
            nextExpiryAt={account.next_expiry_at}
            nextExpiryPoints={account.next_expiry_points}
            progress={account.tier_progress}
          />
        ) : (
          <EmptyExperience icon={Crown} title="Tier evaluation pending">
            Keep earning normally. Your first qualification decision will appear
            here with its exact milestone evidence.
          </EmptyExperience>
        )}
      </ExperienceSection>
    );
  }

  if (section === "referrals") {
    return (
      <ExperienceSection
        description="Share one private advocate link, follow qualification progress, and see issued or reversed referral rewards."
        eyebrow="Give and get"
        icon={UsersRound}
        id="referrals"
        title="Referrals"
      >
        {account.referral ? (
          <CustomerReferralPanel
            experience={account.referral}
            operationId={crypto.randomUUID()}
          />
        ) : (
          <EmptyExperience
            icon={HeartHandshake}
            title="Referrals are not active yet"
          >
            Your existing points and rewards are unaffected. Referral sharing
            will appear here when the store publishes a policy.
          </EmptyExperience>
        )}
      </ExperienceSection>
    );
  }

  if (section === "history") {
    return (
      <ExperienceSection
        description="Every change is backed by immutable loyalty evidence. Corrections add a new entry instead of rewriting history."
        eyebrow="Your ledger"
        icon={History}
        id="history"
        title="Points history"
      >
        {account.activity.length ? (
          <ol className="member-history-list">
            {account.activity.map((item) => {
              const presentation = activityPresentation(item);
              return (
                <li key={item.id}>
                  <span
                    className={`member-history-icon ${presentation.tone}`}
                    aria-hidden="true"
                  >
                    <Activity />
                  </span>
                  <div>
                    <strong>{presentation.label}</strong>
                    <time dateTime={item.effectiveAt}>
                      {formatCustomerDate(item.effectiveAt)}
                    </time>
                  </div>
                  <b className={presentation.tone}>
                    {presentation.sign}
                    {formatCustomerPoints(item.points)}
                  </b>
                </li>
              );
            })}
          </ol>
        ) : (
          <EmptyExperience icon={History} title="No points activity yet">
            Your first eligible activity will appear here with its date and
            exact points effect.
          </EmptyExperience>
        )}
      </ExperienceSection>
    );
  }

  return (
    <ExperienceSection
      description="Manage this verified store connection and download a portable record of your loyalty data."
      eyebrow="Connection and privacy"
      icon={CircleUserRound}
      id="account"
      title="Account"
    >
      <div className="member-account-grid">
        <article>
          <span className="member-account-icon" aria-hidden="true">
            <Store />
          </span>
          <div>
            <small>Verified store</small>
            <h3>{account.store_name}</h3>
            <p>
              This account was connected using a signed one-time store link—not
              an email-address match.
            </p>
            {account.programme_id ? (
              <Link
                href={`/loyalty/${account.workspace_id}/${account.programme_id}`}
              >
                View public programme details <ArrowRight aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </article>
        <article>
          <span className="member-account-icon" aria-hidden="true">
            <ShieldCheck />
          </span>
          <div>
            <small>Privacy and portability</small>
            <h3>Your loyalty data</h3>
            <p>
              Download linked store identities, balances, tiers, reservations,
              and the complete immutable ledger as JSON.
            </p>
            <Link href={customerExportReauthenticationPath("en")}>
              Download my data <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </article>
      </div>
      <CustomerLinkedStores state={customerLinks} />
    </ExperienceSection>
  );
}

function CampaignOpportunityPanel({
  opportunities,
}: Readonly<{ opportunities: readonly CustomerCampaignOpportunity[] }>) {
  if (!opportunities.length) return null;
  return (
    <section
      aria-labelledby="member-campaign-opportunities-title"
      className="member-campaign-opportunities"
    >
      <header>
        <span aria-hidden="true">
          <Megaphone />
        </span>
        <div>
          <p>Picked for your account</p>
          <h2 id="member-campaign-opportunities-title">Current offers</h2>
        </div>
        <small>
          {opportunities.length}{" "}
          {opportunities.length === 1 ? "offer" : "offers"}
        </small>
      </header>
      <div className="member-campaign-grid">
        {opportunities.map((opportunity) => (
          <CampaignOpportunityCard
            key={opportunity.code}
            opportunity={opportunity}
          />
        ))}
      </div>
    </section>
  );
}

function CampaignOpportunityCard({
  opportunity,
}: Readonly<{ opportunity: CustomerCampaignOpportunity }>) {
  const multiplier =
    opportunity.effect.kind === "purchase_multiplier"
      ? formatCampaignMultiplier(opportunity.effect.multiplierBasisPoints)
      : null;
  return (
    <article className={`member-campaign-card ${opportunity.state}`}>
      <div className="member-campaign-card-topline">
        <span className="member-campaign-state">
          {opportunity.state === "active" ? (
            <TrendingUp aria-hidden="true" />
          ) : (
            <TimerReset aria-hidden="true" />
          )}
          {opportunity.state === "active" ? "Live now" : "Coming soon"}
        </span>
        <time
          dateTime={
            opportunity.state === "active"
              ? opportunity.endsAt
              : opportunity.startsAt
          }
        >
          {opportunity.state === "active" ? "Ends" : "Starts"}{" "}
          {formatCustomerDate(
            opportunity.state === "active"
              ? opportunity.endsAt
              : opportunity.startsAt,
          )}
        </time>
      </div>
      <div className="member-campaign-card-body">
        <span
          className="member-campaign-effect"
          aria-label={
            opportunity.effect.kind === "bonus_points"
              ? `${formatCustomerPoints(opportunity.effect.points)} bonus points`
              : `${multiplier} points multiplier`
          }
        >
          {opportunity.effect.kind === "bonus_points" ? (
            <>
              <strong>
                +{formatCustomerPoints(opportunity.effect.points)}
              </strong>
              <small>bonus points</small>
            </>
          ) : (
            <>
              <strong>{multiplier}</strong>
              <small>points</small>
            </>
          )}
        </span>
        <div>
          <h3>{opportunity.name}</h3>
          {opportunity.description ? <p>{opportunity.description}</p> : null}
        </div>
      </div>
      <footer>
        <span>
          <ShoppingBag aria-hidden="true" />
          {opportunity.hasPurchaseRestrictions
            ? "Eligible purchases only"
            : "Programme purchases"}
        </span>
        <small>
          {opportunity.effect.combination === "additive_bonus"
            ? "Adds to eligible earning"
            : "Highest eligible multiplier applies"}
        </small>
      </footer>
    </article>
  );
}

function formatCampaignMultiplier(multiplierBasisPoints: number): string {
  const whole = Math.trunc(multiplierBasisPoints / 10_000);
  const remainder = multiplierBasisPoints % 10_000;
  if (remainder === 0) return `${whole}×`;
  const fraction = remainder.toString().padStart(4, "0").replace(/0+$/u, "");
  return `${whole}.${fraction}×`;
}

function SummaryCard({
  detail,
  icon: Icon,
  label,
  value,
}: Readonly<{
  detail: string;
  icon: LucideIcon;
  label: string;
  value: string;
}>) {
  return (
    <article className="member-summary-card">
      <span aria-hidden="true">
        <Icon />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function ExperienceSection({
  children,
  description,
  eyebrow,
  icon: Icon,
  id,
  title,
}: Readonly<{
  children: React.ReactNode;
  description: string;
  eyebrow: string;
  icon: LucideIcon;
  id: ExperienceSectionV2;
  title: string;
}>) {
  return (
    <section className="member-experience-section" id={id}>
      <header className="member-section-heading">
        <span aria-hidden="true">
          <Icon />
        </span>
        <div>
          <p>{eyebrow}</p>
          <h2>{title}</h2>
          <small>{description}</small>
        </div>
      </header>
      {children}
    </section>
  );
}

function EarningMethodCard({
  method,
}: Readonly<{ method: CustomerEarningMethod }>) {
  const Icon = earningIcons[method.source];
  const cap = earningCapLabel(method.cap);
  const ending = method.endsAt
    ? `Available until ${formatCustomerDate(method.endsAt)}`
    : null;
  return (
    <article
      className={`member-earning-card${method.availableNow ? "" : " unavailable"}`}
    >
      <span className="member-earning-icon" aria-hidden="true">
        <Icon />
      </span>
      <div>
        <small>{earningSourceLabel(method.source)}</small>
        <h3>{method.name}</h3>
        <strong>{earningEffectLabel(method.effect)}</strong>
        <p>
          {[
            method.hasRestrictions ? "Eligibility rules apply" : null,
            cap,
            ending,
          ]
            .filter(Boolean)
            .join(" · ") ||
            "Available whenever the qualifying activity occurs."}
        </p>
      </div>
      <span
        className={`member-availability ${method.availableNow ? "live" : "scheduled"}`}
      >
        {method.availableNow ? "Available" : "Scheduled"}
      </span>
    </article>
  );
}

function RewardCard({
  account,
  ready,
  redeemLabel,
  reward,
}: Readonly<{
  account: CustomerLoyaltyAccount;
  ready: boolean;
  redeemLabel: string;
  reward: CustomerReward;
}>) {
  const Icon = rewardIcons[reward.kind];
  const shortfall =
    BigInt(reward.costPoints) - BigInt(account.available_points);
  const canSelfServe = ready && isSelfServiceRewardKind(reward.kind);
  return (
    <article
      className={`member-reward-card${reward.affordable ? " affordable" : ""}`}
    >
      <div className="member-reward-card-top">
        <span aria-hidden="true">
          <Icon />
        </span>
        <small>{rewardKindLabel(reward.kind)}</small>
      </div>
      <h3>{reward.name}</h3>
      <p>
        <strong>{formatCustomerPoints(reward.costPoints)}</strong> points
      </p>
      {reward.affordable ? (
        canSelfServe ? (
          <Link
            href={`/account/loyalty/redeem?account=${account.account_id}&reward=${encodeURIComponent(reward.code)}`}
          >
            {redeemLabel} <ArrowRight aria-hidden="true" />
          </Link>
        ) : (
          <span className="member-reward-ready">
            <CheckCircle2 aria-hidden="true" /> Available from the store
          </span>
        )
      ) : (
        <span className="member-reward-progress">
          Earn {formatCustomerPoints(shortfall.toString())} more points
        </span>
      )}
    </article>
  );
}

function EmptyExperience({
  children,
  icon: Icon,
  title,
}: Readonly<{
  children: React.ReactNode;
  icon: LucideIcon;
  title: string;
}>) {
  return (
    <div className="member-experience-empty">
      <span aria-hidden="true">
        <Icon />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
