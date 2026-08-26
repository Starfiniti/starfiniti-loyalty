import { LoginForm } from "./login-form";
import { safeAppPath } from "@/lib/safe-navigation";
import {
  CUSTOMER_COPY,
  customerLocalePath,
  resolveCustomerNavigationLocale,
} from "@/lib/customer-locale";
import { customerExportPath } from "@/lib/customer-export";
import { signInWithTenantSso, signInWithWorkforceSso } from "./actions";
import {
  WORKFORCE_SSO_COPY,
  workforceSsoFailureReason,
} from "@/lib/workforce-sso";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    error?: string;
    reason?: string;
    lang?: string;
    reauth?: string;
  }>;
}) {
  const { next, error, reason, lang, reauth } = await searchParams;
  const customerExportReauthentication = reauth === "customer-export";
  const requestedNextPath = safeAppPath(next);
  const locale = resolveCustomerNavigationLocale(lang, requestedNextPath);
  const nextPath = customerExportReauthentication
    ? customerExportPath(locale)
    : customerLocalePath(requestedNextPath, locale);
  const copy = CUSTOMER_COPY[locale];
  const workforceCopy = WORKFORCE_SSO_COPY.en;
  const authFailureReason = workforceSsoFailureReason(reason);

  return (
    <main className="login-page" id="main-content" lang={locale} tabIndex={-1}>
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-mark" aria-hidden="true">
          SF
        </div>
        <p className="login-eyebrow">Starfiniti Loyalty</p>
        <h1 id="login-title">
          {customerExportReauthentication
            ? copy.exportReauthTitle
            : copy.signInTitle}
        </h1>
        <p className="login-intro">
          {customerExportReauthentication
            ? copy.exportReauthIntro
            : copy.signInIntro}
        </p>
        <LoginForm
          initialMessage={
            error === "authentication_failed"
              ? copy.authLinkFailed
              : error === "workforce_sso_failed"
                ? workforceCopy.failed
                : error === "tenant_sso_failed"
                  ? "Company SSO could not be started. Confirm the organization slug and that this account was enrolled first."
                  : ""
          }
          locale={locale}
          nextPath={nextPath}
          {...(customerExportReauthentication
            ? { reauthentication: "customer-export" as const }
            : {})}
        />
        {error === "authentication_failed" && authFailureReason ? (
          <span data-auth-failure-reason={authFailureReason} hidden />
        ) : null}
        {!customerExportReauthentication ? (
          <>
            <div className="login-divider" role="separator">
              <span>{workforceCopy.divider}</span>
            </div>
            <form
              action={signInWithWorkforceSso}
              className="workforce-sso-form"
            >
              <input name="lang" type="hidden" value={locale} />
              <input name="next" type="hidden" value={nextPath} />
              <button className="secondary" type="submit">
                {workforceCopy.button}
              </button>
            </form>
            <div className="login-divider" role="separator">
              <span>Your company</span>
            </div>
            <form action={signInWithTenantSso} className="tenant-sso-form">
              <input name="next" type="hidden" value={nextPath} />
              <label htmlFor="organization-slug">Organization slug</label>
              <div>
                <input
                  autoCapitalize="none"
                  autoComplete="organization"
                  id="organization-slug"
                  maxLength={80}
                  minLength={2}
                  name="organizationSlug"
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  placeholder="your-company"
                  required
                />
                <button className="secondary" type="submit">
                  Continue with company SSO
                </button>
              </div>
              <p>
                An owner must invite your account and you must link SSO from
                Team &amp; access before using this button.
              </p>
            </form>
          </>
        ) : null}
        <p className="login-footnote">{copy.signInFootnote}</p>
      </section>
    </main>
  );
}
