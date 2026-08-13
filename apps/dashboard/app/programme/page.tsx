import { programmeDefinitionV1 } from "@starfiniti/contracts";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Coins,
  Gift,
  History,
  Rocket,
  ShieldCheck,
  Star,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MerchantShell } from "@/components/merchant-shell";
import {
  merchantIntlLocale,
  merchantLocalePath,
  merchantText,
  resolveMerchantLocale,
  type MerchantLocale,
} from "@/lib/merchant-locale";
import { getMerchantProgrammeState } from "@/lib/server/programme";
import { getAuthenticatedTenantState } from "@/lib/server/tenant-context";
import { ProgrammeOnboarding } from "./programme-onboarding";
import { VersionActions } from "./version-actions";

function formatDate(value: string | null, locale: MerchantLocale): string {
  return value
    ? new Intl.DateTimeFormat(merchantIntlLocale(locale), {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Ljubljana",
      }).format(new Date(value))
    : merchantText(locale, "Not set");
}

function actionLabel(action: string, locale: MerchantLocale): string {
  return merchantText(
    locale,
    {
      "programme.draft.create": "Draft created",
      "programme.create": "Programme created",
      "programme.version.publish": "Version published",
      "programme.version.schedule": "Publication scheduled",
    }[action] ?? action,
  );
}

function formatThreshold(minor: string, locale: MerchantLocale): string {
  return new Intl.NumberFormat(merchantIntlLocale(locale), {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(minor) / 100);
}

export default async function ProgrammePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ lang?: string | string[] }>;
}>) {
  const locale = resolveMerchantLocale((await searchParams).lang);
  const t = (source: string) => merchantText(locale, source);
  const tenant = await getAuthenticatedTenantState();
  if (tenant.kind === "unauthenticated") {
    const programmePath = merchantLocalePath("/programme", locale);
    redirect(
      merchantLocalePath(
        `/login?next=${encodeURIComponent(programmePath)}`,
        locale,
      ),
    );
  }
  if (tenant.kind === "unassigned") redirect(merchantLocalePath("/", locale));

  const state = await getMerchantProgrammeState(tenant.context);
  const canEdit = ["owner", "admin"].includes(tenant.context.membershipRole);
  const draft = state.versions.find((version) => version.status === "draft");
  const published = state.versions.find(
    (version) => version.status === "published",
  );
  const baseline = draft ?? published ?? state.versions[0];
  const parsedDefinition = programmeDefinitionV1.safeParse(
    baseline?.configuration,
  );
  const tiers = parsedDefinition.success ? parsedDefinition.data.tiers : [];
  const rewards = parsedDefinition.success ? parsedDefinition.data.rewards : [];
  const earningRates = tiers.map((tier) => Number(tier.pointsPerMajorUnit));
  const readiness = [tiers.length > 0, rewards.length > 0, Boolean(published)];
  const readinessComplete = readiness.filter(Boolean).length;
  const primaryAction = state.programme
    ? rewards.length === 0
      ? { href: "/programme/rewards", label: "Add first reward" }
      : draft
        ? { href: "#version-history", label: "Review draft" }
        : { href: "/programme/earning-rules", label: "Edit programme" }
    : undefined;

  return (
    <MerchantShell
      activePath="/programme"
      locale={locale}
      pageTitle="Programme"
      {...(primaryAction ? { primaryAction } : {})}
      tenant={{
        organizationName: tenant.context.organization.name,
        workspaceName: tenant.context.workspace?.name ?? t("No workspace"),
        programmeName: state.programme?.name ?? t("Programme setup required"),
        role: tenant.context.membershipRole,
      }}
    >
      <main
        className="merchant-main programme-page programme-overview-page"
        id="main-content"
        lang={locale}
        tabIndex={-1}
      >
        <div className="programme-heading programme-overview-heading">
          <div>
            <p className="login-eyebrow">Programme overview</p>
            <h1>{state.programme?.name ?? t("Programme setup required")}</h1>
            <p>
              Configure how members earn, what they can redeem, and how they
              progress. Every saved change becomes a reviewable immutable
              version.
            </p>
          </div>
          <span className="role-badge">{tenant.context.membershipRole}</span>
        </div>

        {!state.programme ? (
          canEdit && tenant.context.programmeGroup ? (
            <ProgrammeOnboarding
              locale={locale}
              operationId={crypto.randomUUID()}
              programmeGroupId={tenant.context.programmeGroup.public_id}
              programmeGroupName={tenant.context.programmeGroup.name}
              suggestedName={`${tenant.context.organization.name} Loyalty`.slice(
                0,
                200,
              )}
            />
          ) : (
            <section className="programme-panel empty-programme">
              <h2>{t("Programme setup requires an owner or admin")}</h2>
              <p>
                {t(
                  "An active programme group and a live owner or admin membership are required before the first programme can be created.",
                )}
              </p>
            </section>
          )
        ) : (
          <>
            <section
              aria-labelledby="programme-readiness-title"
              className="ui-surface programme-readiness"
            >
              <div className="programme-readiness-copy">
                <span
                  className={`programme-readiness-icon ${readinessComplete === readiness.length ? "is-complete" : ""}`}
                  aria-hidden="true"
                >
                  {readinessComplete === readiness.length ? (
                    <CheckCircle2 />
                  ) : (
                    <Rocket />
                  )}
                </span>
                <div>
                  <span className="programme-workflow-kicker">
                    Launch status
                  </span>
                  <h2 id="programme-readiness-title">
                    {readinessComplete === readiness.length
                      ? "Programme is live and configured"
                      : `${readinessComplete} of ${readiness.length} launch essentials complete`}
                  </h2>
                  <p>
                    {draft
                      ? `Draft version ${draft.versionNumber} is saved and waiting for review.`
                      : published
                        ? `Version ${published.versionNumber} is live for members.`
                        : "Complete the core programme setup, then publish the reviewed version."}
                  </p>
                </div>
              </div>
              <div
                aria-label={`${readinessComplete} of ${readiness.length} launch essentials complete`}
                className="programme-readiness-progress"
                role="img"
              >
                {readiness.map((complete, index) => (
                  <span className={complete ? "is-complete" : ""} key={index} />
                ))}
              </div>
            </section>

            <section
              aria-labelledby="programme-foundation-title"
              className="programme-overview-section"
            >
              <header className="programme-overview-section-heading">
                <div>
                  <p className="login-eyebrow">Programme foundation</p>
                  <h2 id="programme-foundation-title">
                    Core member experience
                  </h2>
                </div>
                <span>Saved from version {baseline?.versionNumber ?? "—"}</span>
              </header>

              <div className="programme-overview-cards">
                <Link
                  className="ui-surface programme-overview-card"
                  href={merchantLocalePath("/programme/earning-rules", locale)}
                >
                  <span className="programme-overview-card-icon violet">
                    <Coins aria-hidden="true" />
                  </span>
                  <span className="programme-overview-card-copy">
                    <small>Earning rules</small>
                    <strong>
                      {earningRates.length > 0
                        ? `${Math.min(...earningRates)}–${Math.max(...earningRates)} pts / €1`
                        : "Not configured"}
                    </strong>
                    <span>
                      {tiers.length > 0
                        ? `${tiers.length} tier-based purchase ${tiers.length === 1 ? "rate" : "rates"}`
                        : "Set the base purchase earning rate"}
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </Link>

                <Link
                  className="ui-surface programme-overview-card"
                  href={merchantLocalePath("/programme/rewards", locale)}
                >
                  <span className="programme-overview-card-icon rose">
                    <Gift aria-hidden="true" />
                  </span>
                  <span className="programme-overview-card-copy">
                    <small>Rewards catalogue</small>
                    <strong>
                      {rewards.length}{" "}
                      {rewards.length === 1 ? "reward" : "rewards"}
                    </strong>
                    <span>
                      {rewards.length > 0
                        ? "Discounts and shipping rewards"
                        : "Create the first redeemable reward"}
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </Link>

                <Link
                  className="ui-surface programme-overview-card"
                  href={merchantLocalePath("/programme/vip-tiers", locale)}
                >
                  <span className="programme-overview-card-icon amber">
                    <Star aria-hidden="true" />
                  </span>
                  <span className="programme-overview-card-copy">
                    <small>VIP tiers</small>
                    <strong>
                      {tiers.length} {tiers.length === 1 ? "tier" : "tiers"}
                    </strong>
                    <span>
                      {tiers.length > 0
                        ? tiers
                            .map(
                              (tier) =>
                                `${tier.name} ${formatThreshold(tier.minimumEligibleSpendMinor, locale)}+`,
                            )
                            .join(" · ")
                        : "Create the member progression ladder"}
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            </section>

            <div className="programme-overview-bottom-grid">
              <section
                aria-labelledby="history-title"
                className="ui-surface programme-history programme-version-surface"
                id="version-history"
              >
                <div className="programme-overview-section-heading">
                  <div>
                    <p className="login-eyebrow">Immutable history</p>
                    <h2 id="history-title">Programme versions</h2>
                  </div>
                  <span>{state.versions.length} retained</span>
                </div>
                {state.versions.length === 0 ? (
                  <p className="empty-state">No programme versions yet.</p>
                ) : (
                  <div className="version-list">
                    {state.versions.slice(0, 8).map((version) => (
                      <article className="version-list-item" key={version.id}>
                        <div className="version-list-icon" aria-hidden="true">
                          {version.status === "published" ? (
                            <CheckCircle2 />
                          ) : version.status === "scheduled" ? (
                            <Clock3 />
                          ) : (
                            <History />
                          )}
                        </div>
                        <div className="version-list-copy">
                          <span>
                            <strong>Version {version.versionNumber}</strong>
                            <span className={`status-pill ${version.status}`}>
                              {version.status}
                            </span>
                          </span>
                          <small>
                            Created {formatDate(version.createdAt, locale)} ·
                            fingerprint{" "}
                            {version.configurationSha256.slice(0, 10)}…
                          </small>
                        </div>
                        <time
                          dateTime={version.publishedAt ?? version.createdAt}
                        >
                          {version.publishedAt
                            ? `Published ${formatDate(version.publishedAt, locale)}`
                            : version.scheduledFor
                              ? `Scheduled ${formatDate(version.scheduledFor, locale)}`
                              : "Not live"}
                        </time>
                        {version.status === "draft" ? (
                          <div className="version-list-actions">
                            <VersionActions
                              canEdit={canEdit}
                              configurationSha256={version.configurationSha256}
                              locale={locale}
                              publishOperationId={crypto.randomUUID()}
                              scheduleOperationId={crypto.randomUUID()}
                              versionId={version.id}
                            />
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <aside
                aria-labelledby="audit-title"
                className="ui-surface programme-audit-surface"
              >
                <div className="programme-overview-section-heading">
                  <div>
                    <p className="login-eyebrow">Accountability</p>
                    <h2 id="audit-title">Recent changes</h2>
                  </div>
                  <ShieldCheck aria-hidden="true" />
                </div>
                {state.audit.length === 0 ? (
                  <p className="programme-audit-empty">
                    No visible programme audit events for this role.
                  </p>
                ) : (
                  <ol className="programme-audit-list">
                    {state.audit.slice(0, 6).map((event) => (
                      <li key={event.id}>
                        <span className="audit-dot" aria-hidden="true" />
                        <div>
                          <strong>{actionLabel(event.action, locale)}</strong>
                          <span>
                            Actor {event.actorUserId.slice(0, 8)}… ·{" "}
                            {formatDate(event.createdAt, locale)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </MerchantShell>
  );
}
