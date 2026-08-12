"use server";

import { redirect } from "next/navigation";
import {
  consumeCustomerClaim,
  customerClaimPath,
  parseWooCommerceCustomerClaim,
} from "@/lib/server/woocommerce-customer-claim";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  customerLocalePath,
  resolveCustomerLocale,
} from "@/lib/customer-locale";

export async function confirmWooCommerceCustomerClaim(
  formData: FormData,
): Promise<void> {
  const claim = parseWooCommerceCustomerClaim(formData);
  const locale = resolveCustomerLocale(formData.get("lang"));
  if (!claim)
    redirect(customerLocalePath("/claim/woocommerce?status=invalid", locale));

  const supabase = await createSupabaseServerClient();
  const claims = await supabase.auth.getClaims();
  const authUserId = claims.data?.claims?.sub;
  if (claims.error || typeof authUserId !== "string") {
    redirect(
      customerLocalePath(
        `/login?next=${encodeURIComponent(customerClaimPath(claim, locale))}`,
        locale,
      ),
    );
  }

  try {
    const result = await consumeCustomerClaim(claim, authUserId);
    if (
      (result.outcome === "linked" || result.outcome === "already_linked") &&
      result.link_public_id &&
      result.customer_public_id
    ) {
      redirect(customerLocalePath("/account/loyalty?linked=1", locale));
    }
    redirect(customerLocalePath("/claim/woocommerce?status=conflict", locale));
  } catch (error) {
    if (isRedirect(error)) throw error;
    redirect(customerLocalePath("/claim/woocommerce?status=invalid", locale));
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
