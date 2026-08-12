"use server";

import { redirect } from "next/navigation";
import {
  consumeCustomerClaim,
  customerClaimPath,
  parseWooCommerceCustomerClaim,
} from "@/lib/server/woocommerce-customer-claim";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function confirmWooCommerceCustomerClaim(
  formData: FormData,
): Promise<void> {
  const claim = parseWooCommerceCustomerClaim(formData);
  if (!claim) redirect("/claim/woocommerce?status=invalid");

  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  const authUserId = claims.data?.claims?.sub;
  if (claims.error || typeof authUserId !== "string") {
    redirect(`/login?next=${encodeURIComponent(customerClaimPath(claim))}`);
  }

  try {
    const result = await consumeCustomerClaim(claim, authUserId);
    if (
      (result.outcome === "linked" || result.outcome === "already_linked") &&
      result.link_public_id &&
      result.customer_public_id
    ) {
      redirect("/account/loyalty?linked=1");
    }
    redirect("/claim/woocommerce?status=conflict");
  } catch (error) {
    if (isRedirect(error)) throw error;
    redirect("/claim/woocommerce?status=invalid");
  }
}

function isRedirect(error: unknown): boolean {
  return (
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}
