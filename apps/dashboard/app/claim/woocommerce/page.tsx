import { redirect } from "next/navigation";
import { confirmWooCommerceCustomerClaim } from "./actions";
import {
  customerClaimPath,
  parseWooCommerceCustomerClaim,
  verifyCustomerClaim,
} from "@/lib/server/woocommerce-customer-claim";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Search = Record<string, string | string[] | undefined>;

export default async function WooCommerceClaimPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  const status = typeof search.status === "string" ? search.status : "";
  const claim = parseWooCommerceCustomerClaim(search);
  if (!claim) return <ClaimFailure status={status} />;

  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || typeof claims.data?.claims?.sub !== "string") {
    redirect(`/login?next=${encodeURIComponent(customerClaimPath(claim))}`);
  }

  let storeName: string;
  try {
    storeName = (await verifyCustomerClaim(claim)).display_name;
  } catch {
    return <ClaimFailure status="invalid" />;
  }

  return (
    <main className="access-page" id="main-content" tabIndex={-1}>
      <section className="access-card" aria-labelledby="claim-title">
        <p className="login-eyebrow">Starfiniti Loyalty</p>
        <h1 id="claim-title">Connect your loyalty account</h1>
        <p>
          Confirm that you want to connect this signed-in account to your
          verified customer record at <strong>{storeName}</strong>.
        </p>
        <p className="claim-safety-note">
          This one-time link came from your WooCommerce account. We do not use
          an email address to match customers.
        </p>
        <form action={confirmWooCommerceCustomerClaim}>
          {Object.entries(claim).map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={value} />
          ))}
          <button className="primary claim-button" type="submit">
            Connect account
          </button>
        </form>
      </section>
    </main>
  );
}

function ClaimFailure({ status }: { status: string }) {
  const conflict = status === "conflict";
  return (
    <main className="access-page" id="main-content" tabIndex={-1}>
      <section className="access-card" aria-labelledby="claim-title">
        <p className="login-eyebrow">Starfiniti Loyalty</p>
        <h1 id="claim-title">
          {conflict ? "Account already connected" : "Link unavailable"}
        </h1>
        <p>
          {conflict
            ? "This store customer or signed-in account is already connected differently. No account was changed."
            : "This secure link is invalid or has expired. Return to your store account and open Loyalty rewards again."}
        </p>
      </section>
    </main>
  );
}
