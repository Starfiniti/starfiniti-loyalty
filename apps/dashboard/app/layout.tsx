import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import "geist/font/sans";
import { LocalizedSkipLink } from "@/components/localized-skip-link";
import { merchantText, resolveMerchantLocale } from "@/lib/merchant-locale";
import starfinitiIcon from "../../../docs/design/prototype-source/assets/images/starfiniti-icon.png";
import "./globals.css";

export const metadata: Metadata = {
  title: "Starfiniti Loyalty",
  description: "Self-hosted loyalty operations for WooCommerce.",
  icons: {
    icon: [{ url: starfinitiIcon.src, type: "image/png" }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const locale = resolveMerchantLocale(
    requestHeaders.get("x-starfiniti-locale"),
  );
  return (
    <html lang={locale}>
      <body>
        <Suspense
          fallback={
            <a className="skip-link" href="#main-content">
              {merchantText(locale, "Skip to main content")}
            </a>
          }
        >
          <LocalizedSkipLink />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
