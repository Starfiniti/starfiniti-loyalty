"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { merchantText, resolveMerchantLocale } from "@/lib/merchant-locale";

export function LocalizedSkipLink() {
  const searchParams = useSearchParams();
  const locale = resolveMerchantLocale(searchParams.get("lang"));

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <a className="skip-link" href="#main-content">
      {merchantText(locale, "Skip to main content")}
    </a>
  );
}
