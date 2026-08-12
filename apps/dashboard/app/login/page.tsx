import { LoginForm } from "./login-form";
import { safeAppPath } from "@/lib/safe-navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const nextPath = safeAppPath(next);

  return (
    <main className="login-page" id="main-content" tabIndex={-1}>
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-mark" aria-hidden="true">
          SF
        </div>
        <p className="login-eyebrow">Starfiniti Loyalty</p>
        <h1 id="login-title">Account sign in</h1>
        <p className="login-intro">
          Use the account provisioned for your organization or customer loyalty
          access. Self-service sign-up is disabled on this private hub.
        </p>
        <LoginForm
          initialMessage={
            error === "authentication_failed"
              ? "The authentication link could not be verified."
              : ""
          }
          nextPath={nextPath}
        />
        <p className="login-footnote">
          Sessions are verified by self-hosted Supabase Auth. Merchant and
          customer access are checked against live database links on every
          request.
        </p>
      </section>
    </main>
  );
}
