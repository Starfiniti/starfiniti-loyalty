"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { merchantText, type MerchantLocale } from "@/lib/merchant-locale";

function localeHref(
  pathname: string,
  searchParams: URLSearchParams,
  locale: MerchantLocale,
): string {
  const next = new URLSearchParams(searchParams);
  if (locale === "sl-SI") next.set("lang", locale);
  else next.delete("lang");
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function MerchantLocaleSwitcher({
  locale,
}: Readonly<{ locale: MerchantLocale }>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <nav
      aria-label={merchantText(locale, "Language")}
      className="merchant-locale-switcher"
    >
      <Link
        aria-current={locale === "en" ? "page" : undefined}
        href={localeHref(pathname, searchParams, "en")}
        prefetch={false}
      >
        EN
      </Link>
      <Link
        aria-current={locale === "sl-SI" ? "page" : undefined}
        href={localeHref(pathname, searchParams, "sl-SI")}
        prefetch={false}
      >
        SL
      </Link>
    </nav>
  );
}
