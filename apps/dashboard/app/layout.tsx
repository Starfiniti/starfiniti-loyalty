import type { Metadata } from "next";
import { Suspense } from "react";
import "geist/font/sans";
import { LocalizedSkipLink } from "@/components/localized-skip-link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Starfiniti Loyalty",
  description: "Self-hosted loyalty operations for WooCommerce.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Suspense
          fallback={
            <a className="skip-link" href="#main-content">
              Skip to main content
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
