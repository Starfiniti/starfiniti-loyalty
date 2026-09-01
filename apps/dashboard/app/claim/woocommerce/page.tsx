import { redirect } from "next/navigation";
import { confirmWooCommerceCustomerClaim } from "./actions";
import {
  customerClaimPath,
  parseWooCommerceCustomerClaim,
  verifyCustomerClaim,
} from "@/lib/server/woocommerce-customer-claim";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CUSTOMER_COPY,
  customerLocalePath,
  resolveCustomerLocale,
} from "@/lib/customer-locale";

type Search = Record<string, string | string[] | undefined>;

export default async function WooCommerceClaimPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  const status = typeof search.status === "string" ? search.status : "";
  const locale = resolveCustomerLocale(search.lang);
  const copy = CUSTOMER_COPY[locale];
  const claim = parseWooCommerceCustomerClaim(search);
  if (!claim) return <ClaimFailure locale={locale} status={status} />;

  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || typeof claims.data?.claims?.sub !== "string") {
    redirect(
      customerLocalePath(
        `/login?next=${encodeURIComponent(customerClaimPath(claim, locale))}`,
        locale,
      ),
    );
  }

  let storeName: string;
  try {
    storeName = (await verifyCustomerClaim(claim)).display_name;
  } catch {
    return <ClaimFailure locale={locale} status="invalid" />;
  }

  return (
    <main className="access-page" id="main-content" tabIndex={-1}>
      <section className="access-card" aria-labelledby="claim-title">
        <p className="login-eyebrow">Starfiniti Loyalty</p>
        <h1 id="claim-title">{copy.connectTitle}</h1>
        <p>
          {copy.connectBeforeStore} <strong>{storeName}</strong>.
        </p>
        <p className="claim-safety-note">{copy.claimSafety}</p>
        <form action={confirmWooCommerceCustomerClaim}>
          {Object.entries(claim).map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={value} />
          ))}
          <input name="lang" type="hidden" value={locale} />
          <button className="primary claim-button" type="submit">
            {copy.connectAccount}
          </button>
        </form>
      </section>
    </main>
  );
}

function ClaimFailure({
  status,
  locale,
}: {
  status: string;
  locale: "en" | "sl-SI";
}) {
  const conflict = status === "conflict";
  const copy = CUSTOMER_COPY[locale];
  const valueConflict = status === "value-conflict";
  const sharingUnavailable = status === "sharing-unavailable";
  const title = valueConflict
    ? "These loyalty accounts need a reviewed migration"
    : sharingUnavailable
      ? "Shared-store linking is temporarily unavailable"
      : conflict
        ? copy.accountConnectedTitle
        : copy.linkUnavailableTitle;
  const body = valueConflict
    ? "Both store identities already have loyalty wallet state. We did not merge, move, or hide any points. Contact the merchant to review a traceable migration."
    : sharingUnavailable
      ? "The store proof was valid, but the current shared-wallet scope could not be verified. No account or points were changed."
      : conflict
        ? copy.accountConflict
        : copy.invalidLink;
  return (
    <main className="access-page" id="main-content" tabIndex={-1}>
      <section className="access-card" aria-labelledby="claim-title">
        <p className="login-eyebrow">Starfiniti Loyalty</p>
        <h1 id="claim-title">{title}</h1>
        <p>{body}</p>
      </section>
    </main>
  );
}
