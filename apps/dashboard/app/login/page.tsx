import { LoginForm } from "./login-form";
import { safeAppPath } from "@/lib/safe-navigation";
import {
  CUSTOMER_COPY,
  resolveCustomerNavigationLocale,
} from "@/lib/customer-locale";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; lang?: string }>;
}) {
  const { next, error, lang } = await searchParams;
  const nextPath = safeAppPath(next);
  const locale = resolveCustomerNavigationLocale(lang, nextPath);
  const copy = CUSTOMER_COPY[locale];

  return (
    <main className="login-page" id="main-content" tabIndex={-1}>
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-mark" aria-hidden="true">
          SF
        </div>
        <p className="login-eyebrow">Starfiniti Loyalty</p>
        <h1 id="login-title">{copy.signInTitle}</h1>
        <p className="login-intro">{copy.signInIntro}</p>
        <LoginForm
          initialMessage={
            error === "authentication_failed" ? copy.authLinkFailed : ""
          }
          locale={locale}
          nextPath={nextPath}
        />
        <p className="login-footnote">{copy.signInFootnote}</p>
      </section>
    </main>
  );
}
