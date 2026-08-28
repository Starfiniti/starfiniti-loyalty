import type {
  ExperienceHeroAssetV2,
  ExperienceSectionV2,
  PublicEarningSourceV1,
  PublicLoyaltyExperienceV4,
} from "@starfiniti/contracts";
import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  CakeSlice,
  Check,
  CircleUserRound,
  Clock3,
  Crown,
  Gift,
  HeartHandshake,
  History,
  KeyRound,
  MessageSquareCheck,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  UserPlus,
  Zap,
} from "lucide-react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { experienceFontStack } from "@/lib/experience-theme";
import { visibleCustomerExperienceSections } from "@/lib/customer-experience-presentation";
import {
  formatPublicPoints,
  formatPublicEarningEffect,
  formatPublicEarningSource,
  formatPublicEarningWindow,
  formatPublicVipPeriod,
  formatPublicVipThreshold,
  isPublicId,
  PUBLIC_LOYALTY_ACCOUNT_PATH,
} from "@/lib/public-loyalty";
import { getPublicLoyaltyExperience } from "@/lib/server/public-loyalty";

export const metadata: Metadata = {
  title: "Loyalty programme",
  description: "Rewards, tiers, referrals, and ways to earn.",
};

type PageProps = Readonly<{
  params: Promise<{ workspaceId: string; programmeId: string }>;
}>;

const heroIcons: Readonly<Record<ExperienceHeroAssetV2, LucideIcon | null>> = {
  none: null,
  sparkles: Sparkles,
  gift: Gift,
  crown: Crown,
};

const sectionLabels: Readonly<Record<ExperienceSectionV2, string>> = {
  overview: "Overview",
  earning: "Ways to earn",
  rewards: "Rewards",
  vip: "VIP tiers",
  referrals: "Referrals",
  history: "Points history",
  account: "My account",
};

const earningIcons: Readonly<Record<PublicEarningSourceV1, LucideIcon>> = {
  purchase: ShoppingBag,
  account_created: UserPlus,
  birthday: CakeSlice,
  verified_product_review: MessageSquareCheck,
  referral: HeartHandshake,
};

export default async function PublicLoyaltyPage({ params }: PageProps) {
  const { workspaceId, programmeId } = await params;
  if (!isPublicId(workspaceId) || !isPublicId(programmeId)) notFound();

  let experience: PublicLoyaltyExperienceV4 | null;
  try {
    experience = await getPublicLoyaltyExperience(workspaceId, programmeId);
  } catch {
    return (
      <PublicExperienceUnavailable
        programmeId={programmeId}
        workspaceId={workspaceId}
      />
    );
  }
  if (!experience) notFound();

  const { copy, theme } = experience.presentation;
  const HeroIcon = heroIcons[theme.heroAsset];
  const visibleSections = visibleCustomerExperienceSections(theme);
  const style = {
    "--loyalty-brand": theme.brandColor,
    "--loyalty-radius": `${theme.cardRadiusPx}px`,
    "--loyalty-font": experienceFontStack(theme.displayFont),
  } as CSSProperties;

  return (
    <main
      className={`public-loyalty-page public-loyalty-v2 public-loyalty-v3 public-loyalty-v4 ${theme.density}`}
      id="main-content"
      lang="en"
      style={style}
      tabIndex={-1}
    >
      <nav className="public-loyalty-nav" aria-label="Programme navigation">
        <Link
          className="public-loyalty-brand"
          href={`/loyalty/${workspaceId}/${programmeId}`}
        >
          <span aria-hidden="true">
            <Star />
          </span>
          <strong>{experience.programmeName}</strong>
        </Link>
        <div>
          {visibleSections.map((section) => (
            <a href={`#${section}`} key={section}>
              {sectionLabels[section]}
            </a>
          ))}
        </div>
      </nav>

      <header className="public-loyalty-hero" id="programme-introduction">
        <p>
          <Sparkles aria-hidden="true" /> Free to join
        </p>
        <h1>{copy.heroText}</h1>
        <p>{copy.earnMessage}</p>
        <div className="public-loyalty-actions">
          <Link href={PUBLIC_LOYALTY_ACCOUNT_PATH}>
            {copy.joinLabel} <ArrowRight aria-hidden="true" />
          </Link>
          <a href={`#${visibleSections[0] ?? "account"}`}>
            Discover your benefits
          </a>
        </div>
        <span>
          <ShieldCheck aria-hidden="true" /> Balances and redemptions stay
          private
        </span>
        {HeroIcon ? (
          <span className="public-loyalty-hero-icon" aria-hidden="true">
            <HeroIcon />
          </span>
        ) : null}
      </header>

      <div className="public-loyalty-composition">
        {visibleSections.map((section, index) => (
          <PublicSection
            experience={experience}
            index={index}
            key={section}
            section={section}
          />
        ))}
      </div>

      <footer className="public-loyalty-footer">
        <span>{experience.programmeName}</span>
        <small>This page contains no customer or order information.</small>
      </footer>
    </main>
  );
}

function PublicSection({
  experience,
  index,
  section,
}: Readonly<{
  experience: PublicLoyaltyExperienceV4;
  index: number;
  section: ExperienceSectionV2;
}>) {
  const copy = experience.presentation.copy;
  if (section === "overview") {
    return (
      <section className="public-loyalty-section" id="overview">
        <PublicHeading index={index} title="How the programme works" />
        <div className="public-loyalty-steps">
          {[
            [ShoppingBag, "Shop", "Complete an eligible purchase."],
            [Crown, "Grow", "Progress through published VIP milestones."],
            [Gift, "Choose", "Redeem points for a published benefit."],
          ].map(([Icon, title, body]) => {
            const StepIcon = Icon as LucideIcon;
            return (
              <article key={title as string}>
                <span aria-hidden="true">
                  <StepIcon />
                </span>
                <h3>{title as string}</h3>
                <p>{body as string}</p>
              </article>
            );
          })}
        </div>
      </section>
    );
  }
  if (section === "earning") {
    return (
      <section className="public-loyalty-section" id="earning">
        <PublicHeading index={index} title="Ways to earn" />
        {experience.earningMethods.length ? (
          <div className="public-earning-catalogue">
            <header>
              <p>{copy.earnMessage}</p>
              <Link href={PUBLIC_LOYALTY_ACCOUNT_PATH}>
                See your exact limits <ArrowRight aria-hidden="true" />
              </Link>
            </header>
            <ol className="public-earning-methods">
              {experience.earningMethods.map((method, methodIndex) => {
                const MethodIcon = earningIcons[method.source];
                return (
                  <li key={method.code}>
                    <span className="public-earning-index" aria-hidden="true">
                      {String(methodIndex + 1).padStart(2, "0")}
                    </span>
                    <article>
                      <header>
                        <span
                          className="public-earning-icon"
                          aria-hidden="true"
                        >
                          <MethodIcon />
                        </span>
                        <div>
                          <small>
                            {formatPublicEarningSource(method.source)}
                          </small>
                          <h3>{method.name}</h3>
                        </div>
                        <span
                          className={`public-earning-status ${method.availableNow ? "available" : "scheduled"}`}
                        >
                          {method.availableNow ? "Live" : "Scheduled"}
                        </span>
                      </header>
                      <strong>
                        {formatPublicEarningEffect(method.effect, "en")}
                      </strong>
                      <footer>
                        <span>
                          <Clock3 aria-hidden="true" />
                          {formatPublicEarningWindow(method, "en")}
                        </span>
                        {method.hasRestrictions ? (
                          <span>
                            <ShieldCheck aria-hidden="true" /> Conditions apply
                          </span>
                        ) : null}
                      </footer>
                    </article>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <PublicEmpty
            icon={Sparkles}
            text="No public earning methods are listed for this programme. Sign in to view account-specific ways to earn."
          />
        )}
      </section>
    );
  }
  if (section === "rewards") {
    return (
      <section className="public-loyalty-section" id="rewards">
        <PublicHeading index={index} title={copy.rewardsLabel} />
        {experience.rewards.length ? (
          <div className="public-loyalty-cards">
            {experience.rewards.map((reward) => (
              <article key={reward.code}>
                <small>{copy.redeemLabel}</small>
                <h3>{reward.name}</h3>
                <strong>
                  {formatPublicPoints(reward.costPoints, "en")} points
                </strong>
              </article>
            ))}
          </div>
        ) : (
          <PublicEmpty icon={Gift} text="New rewards are being prepared." />
        )}
      </section>
    );
  }
  if (section === "vip") {
    const catalogue = experience.vipCatalogue;
    return (
      <section className="public-loyalty-section public-loyalty-vip" id="vip">
        <PublicHeading index={index} title="VIP tiers" />
        {catalogue.levels.length ? (
          <div className="public-vip-catalogue">
            <header className="public-vip-policy">
              <span aria-hidden="true">
                <Clock3 />
              </span>
              <div>
                <small>Qualification window</small>
                <strong>
                  {formatPublicVipPeriod(catalogue.qualificationPeriod)}
                </strong>
                <p>
                  {catalogue.downgradeGraceDays > 0
                    ? `${catalogue.downgradeGraceDays}-day grace period if your activity falls below the retention level.`
                    : "Tier changes follow the published qualification policy without a grace period."}
                </p>
              </div>
            </header>
            <ol className="public-vip-levels">
              {catalogue.levels.map((level, levelIndex) => (
                <li key={level.code}>
                  <div className="public-vip-marker" aria-hidden="true">
                    <span>{String(levelIndex + 1).padStart(2, "0")}</span>
                    <Crown />
                  </div>
                  <article>
                    <header>
                      <div>
                        <small>
                          {levelIndex === 0
                            ? "Your starting tier"
                            : `Milestone ${levelIndex}`}
                        </small>
                        <h3>{level.name}</h3>
                      </div>
                      <strong>
                        {formatPublicPoints(level.pointsPerMajorUnit, "en")}
                        <span> points / €1</span>
                      </strong>
                    </header>
                    {level.entry ? (
                      <div className="public-vip-qualification">
                        <p>
                          {level.entry.operator === "all"
                            ? "Complete every requirement"
                            : "Complete any one requirement"}
                        </p>
                        <ul>
                          {level.entry.thresholds.map(
                            (threshold, thresholdIndex) => (
                              <li
                                key={`${threshold.metric}:${threshold.minimum}:${thresholdIndex}`}
                              >
                                <Check aria-hidden="true" />
                                {formatPublicVipThreshold(threshold, "en")}
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    ) : (
                      <p className="public-vip-base">
                        <Check aria-hidden="true" /> Included when you join
                      </p>
                    )}
                    <div
                      className="public-vip-benefits"
                      aria-label="Tier benefits"
                    >
                      <span>
                        <Zap aria-hidden="true" /> Earning rate
                      </span>
                      {level.earlyAccess ? (
                        <span>
                          <Sparkles aria-hidden="true" /> Early access
                        </span>
                      ) : null}
                      {level.exclusiveRewardAccess ? (
                        <span>
                          <KeyRound aria-hidden="true" /> Exclusive rewards
                        </span>
                      ) : null}
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <PublicEmpty
            icon={Crown}
            text="VIP tiers are not part of this published programme."
          />
        )}
      </section>
    );
  }
  if (section === "referrals") {
    return (
      <section className="public-loyalty-section" id="referrals">
        <PublicHeading index={index} title="Refer friends" />
        <div className="public-loyalty-feature-card">
          <HeartHandshake aria-hidden="true" />
          <div>
            <h3>Share from your private account</h3>
            <p>
              When the store activates referrals, eligible members receive one
              customer-bound link and can follow qualification progress without
              exposing their identity.
            </p>
          </div>
        </div>
      </section>
    );
  }
  if (section === "history") {
    return (
      <section className="public-loyalty-section" id="history">
        <PublicHeading index={index} title="Transparent points history" />
        <div className="public-loyalty-feature-card">
          <History aria-hidden="true" />
          <div>
            <h3>Every value change stays attributable</h3>
            <p>
              Sign in to see earned, released, reserved, spent, expired, and
              reversed points. Corrections never rewrite prior history.
            </p>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="public-loyalty-section" id="account">
      <PublicHeading index={index} title="Your loyalty account" />
      <aside className="public-loyalty-account">
        <CircleUserRound aria-hidden="true" />
        <p>
          Use your verified store account to see balances, milestones,
          referrals, rewards, expiry, and immutable activity.
        </p>
        <Link href={PUBLIC_LOYALTY_ACCOUNT_PATH}>
          {copy.joinLabel} <ArrowRight aria-hidden="true" />
        </Link>
      </aside>
    </section>
  );
}

function PublicHeading({
  index,
  title,
}: Readonly<{ index: number; title: string }>) {
  return (
    <header className="public-loyalty-section-heading">
      <p className="public-loyalty-kicker">
        {String(index + 1).padStart(2, "0")}
      </p>
      <h2>{title}</h2>
    </header>
  );
}

function PublicEmpty({
  icon: Icon,
  text,
}: Readonly<{ icon: LucideIcon; text: string }>) {
  return (
    <div className="public-loyalty-empty">
      <Icon aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

function PublicExperienceUnavailable({
  programmeId,
  workspaceId,
}: Readonly<{ programmeId: string; workspaceId: string }>) {
  return (
    <main className="public-loyalty-recovery" id="main-content" tabIndex={-1}>
      <section role="alert">
        <ShieldAlert aria-hidden="true" />
        <p>LOYALTY PROGRAMME</p>
        <h1>Programme details are temporarily unavailable</h1>
        <p>
          We could not verify the current public programme safely. No partial
          programme or customer data is displayed. Store checkout remains
          available.
        </p>
        <Link href={`/loyalty/${workspaceId}/${programmeId}`} prefetch={false}>
          <RefreshCw aria-hidden="true" /> Try again
        </Link>
      </section>
    </main>
  );
}
