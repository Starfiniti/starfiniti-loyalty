import { LoginForm } from "./login-form";
import { safeAppPath } from "@/lib/safe-navigation";
import {
  CUSTOMER_COPY,
  customerLocalePath,
  resolveCustomerNavigationLocale,
} from "@/lib/customer-locale";
import { customerExportPath } from "@/lib/customer-export";
import { MerchantLocaleSwitcher } from "@/components/merchant-locale-switcher";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    error?: string;
    lang?: string;
    reauth?: string;
  }>;
}) {
  const { next, error, lang, reauth } = await searchParams;
  const customerExportReauthentication = reauth === "customer-export";
  const requestedNextPath = safeAppPath(next);
  const locale = resolveCustomerNavigationLocale(lang, requestedNextPath);
  const nextPath = customerExportReauthentication
    ? customerExportPath(locale)
    : customerLocalePath(requestedNextPath, locale);
  const copy = CUSTOMER_COPY[locale];

  return (
    <main className="login-page" id="main-content" lang={locale} tabIndex={-1}>
      <section className="login-card" aria-labelledby="login-title">
        <MerchantLocaleSwitcher locale={locale} />
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
            error === "authentication_failed" ? copy.authLinkFailed : ""
          }
          locale={locale}
          nextPath={nextPath}
          {...(customerExportReauthentication
            ? { reauthentication: "customer-export" as const }
            : {})}
        />
        <p className="login-footnote">{copy.signInFootnote}</p>
      </section>
    </main>
  );
}
