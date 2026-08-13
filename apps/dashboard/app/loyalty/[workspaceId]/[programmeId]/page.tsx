import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { experienceFontStack } from "@/lib/experience-theme";
import {
  formatEurMinor,
  formatPublicPoints,
  isPublicId,
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
      <header className="public-loyalty-hero">
        <p>{labels.programme}</p>
        <h1>{experience.copy.heroText}</h1>
        <p>{experience.copy.earnMessage}</p>
        <span>{experience.programmeName}</span>
      </header>

      <section className="public-loyalty-section" aria-labelledby="how-title">
        <div>
          <p className="public-loyalty-kicker">01</p>
          <h2 id="how-title">{labels.how}</h2>
          <p>{labels.howText}</p>
        </div>
        <article>
          <span aria-hidden="true">◎</span>
          <h3>{labels.earn}</h3>
          <p>{labels.earnText}</p>
        </article>
      </section>

      {experience.showTier && experience.tiers.length > 0 ? (
        <section
          className="public-loyalty-section public-loyalty-catalogue"
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
        <strong>{experience.copy.joinLabel}</strong>
      </aside>
      <footer className="public-loyalty-footer">
        <span>{experience.programmeName}</span>
        <small>{labels.privacy}</small>
      </footer>
    </main>
  );
}
