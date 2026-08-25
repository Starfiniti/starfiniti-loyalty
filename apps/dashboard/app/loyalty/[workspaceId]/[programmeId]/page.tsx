import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Crown,
  Gift,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { notFound } from "next/navigation";
import { experienceFontStack } from "@/lib/experience-theme";
import {
  formatEurMinor,
  formatPublicPoints,
  isPublicId,
  PUBLIC_LOYALTY_ACCOUNT_PATH,
  resolvePublicLocale,
} from "@/lib/public-loyalty";
import { getPublicLoyaltyExperience } from "@/lib/server/public-loyalty";

export const metadata: Metadata = {
  title: "Loyalty programme",
  description: "Rewards, tiers, and ways to earn.",
};

type PageProps = Readonly<{
  params: Promise<{ workspaceId: string; programmeId: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
}>;

const language = {
  programme: "Loyalty programme",
  how: "How it works",
  howText: "Shop with your store account and eligible orders earn points.",
  earn: "Ways to earn",
  earnText: "Complete an eligible purchase",
  tiers: "Member tiers",
  from: "From",
  perEuro: "points per €1",
  rewardCost: "points",
  account: "Use your store account to join, see your balance, and redeem.",
  privacy: "This public page contains no customer or order information.",
  join: "Open my loyalty account",
  free: "Free to join",
  protected: "Balances and redemptions stay private",
  discover: "Discover your benefits",
} as const;

export default async function PublicLoyaltyPage({
  params,
  searchParams,
}: PageProps) {
  const [{ workspaceId, programmeId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = resolvePublicLocale(query.lang);
  if (!isPublicId(workspaceId) || !isPublicId(programmeId)) notFound();
  const experience = await getPublicLoyaltyExperience(
    workspaceId,
    programmeId,
    locale,
  );
  if (!experience) notFound();

  const labels = language;
  const style = {
    "--loyalty-brand": experience.brandColor,
    "--loyalty-radius": `${experience.cardRadiusPx}px`,
    "--loyalty-font": experienceFontStack(experience.displayFont),
  } as CSSProperties;
  return (
    <main
      className="public-loyalty-page"
      id="main-content"
      lang={experience.resolvedLocale}
      style={style}
      tabIndex={-1}
    >
      <nav className="public-loyalty-nav" aria-label="Programme navigation">
        <Link
          className="public-loyalty-brand"
          href={`/loyalty/${workspaceId}/${programmeId}`}
        >
          <span aria-hidden="true">
            <Sparkles />
          </span>
          <strong>{experience.programmeName}</strong>
        </Link>
        <div>
          <a href="#earn">{labels.earn}</a>
          {experience.showTier && experience.tiers.length ? (
            <a href="#tiers">{labels.tiers}</a>
          ) : null}
          {experience.showRewards && experience.rewards.length ? (
            <a href="#rewards">{experience.copy.rewardsLabel}</a>
          ) : null}
          <Link href={PUBLIC_LOYALTY_ACCOUNT_PATH}>{labels.join}</Link>
        </div>
      </nav>

      <header className="public-loyalty-hero">
        <p>
          <Sparkles aria-hidden="true" /> {labels.free}
        </p>
        <h1>{experience.copy.heroText}</h1>
        <p>{experience.copy.earnMessage}</p>
        <div className="public-loyalty-actions">
          <Link href={PUBLIC_LOYALTY_ACCOUNT_PATH}>
            {experience.copy.joinLabel} <ArrowRight aria-hidden="true" />
          </Link>
          <a href="#earn">{labels.discover}</a>
        </div>
        <span>
          <ShieldCheck aria-hidden="true" /> {labels.protected}
        </span>
      </header>

      <section
        className="public-loyalty-section public-loyalty-how"
        id="earn"
        aria-labelledby="how-title"
      >
        <div>
          <p className="public-loyalty-kicker">01</p>
          <h2 id="how-title">{labels.how}</h2>
          <p>{labels.howText}</p>
        </div>
        <div className="public-loyalty-steps">
          <article>
            <span aria-hidden="true">
              <ShoppingBag />
            </span>
            <small>01</small>
            <h3>{labels.earn}</h3>
            <p>{labels.earnText}</p>
          </article>
          <article>
            <span aria-hidden="true">
              <Crown />
            </span>
            <small>02</small>
            <h3>Grow your status</h3>
            <p>Progress through published tiers and see every milestone.</p>
          </article>
          <article>
            <span aria-hidden="true">
              <Gift />
            </span>
            <small>03</small>
            <h3>Choose a reward</h3>
            <p>Use available points for a benefit you actually want.</p>
          </article>
        </div>
      </section>

      {experience.showTier && experience.tiers.length > 0 ? (
        <section
          className="public-loyalty-section public-loyalty-catalogue"
          id="tiers"
          aria-labelledby="tiers-title"
        >
          <div>
            <p className="public-loyalty-kicker">02</p>
            <h2 id="tiers-title">{labels.tiers}</h2>
          </div>
          <div className="public-loyalty-cards">
            {experience.tiers.map((tier) => (
              <article key={tier.code}>
                <small>
                  {labels.from}{" "}
                  {formatEurMinor(tier.minimumEligibleSpendMinor, locale)}
                </small>
                <h3>{tier.name}</h3>
                <strong>
                  {formatPublicPoints(tier.pointsPerMajorUnit, locale)}{" "}
                  {labels.perEuro}
                </strong>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {experience.showRewards && experience.rewards.length > 0 ? (
        <section
          className="public-loyalty-section public-loyalty-catalogue"
          id="rewards"
          aria-labelledby="rewards-title"
        >
          <div>
            <p className="public-loyalty-kicker">03</p>
            <h2 id="rewards-title">{experience.copy.rewardsLabel}</h2>
          </div>
          <div className="public-loyalty-cards">
            {experience.rewards.map((reward) => (
              <article key={reward.code}>
                <small>{experience.copy.redeemLabel}</small>
                <h3>{reward.name}</h3>
                <strong>
                  {formatPublicPoints(reward.costPoints, locale)}{" "}
                  {labels.rewardCost}
                </strong>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <aside className="public-loyalty-account">
        <p>{labels.account}</p>
        <Link href={PUBLIC_LOYALTY_ACCOUNT_PATH}>
          {experience.copy.joinLabel} <ArrowRight aria-hidden="true" />
        </Link>
      </aside>
      <footer className="public-loyalty-footer">
        <span>{experience.programmeName}</span>
        <small>{labels.privacy}</small>
      </footer>
    </main>
  );
}
