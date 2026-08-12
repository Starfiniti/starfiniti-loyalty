import type { Metadata } from "next";
import "geist/font/sans";
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
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
