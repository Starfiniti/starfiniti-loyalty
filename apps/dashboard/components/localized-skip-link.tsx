"use client";

import { useSearchParams } from "next/navigation";
import { merchantText, resolveMerchantLocale } from "@/lib/merchant-locale";

export function LocalizedSkipLink() {
  const searchParams = useSearchParams();
  const locale = resolveMerchantLocale(searchParams.get("lang"));

  return (
    <a className="skip-link" href="#main-content">
      {merchantText(locale, "Skip to main content")}
    </a>
  );
}
