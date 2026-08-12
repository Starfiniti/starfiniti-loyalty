import { customerLocalePath, type CustomerLocale } from "./customer-locale";

export function customerExportPath(locale: CustomerLocale): string {
  return customerLocalePath("/account/loyalty/export", locale);
}

export function customerExportReauthenticationPath(
  locale: CustomerLocale,
): string {
  const exportPath = customerExportPath(locale);
  const query = new URLSearchParams({
    reauth: "customer-export",
    next: exportPath,
  });
  if (locale === "sl-SI") query.set("lang", locale);
  return `/login?${query.toString()}`;
}

export function customerDataExportFilename(generatedAt: string): string {
  const date = generatedAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(date)
    ? `starfiniti-loyalty-data-${date}.json`
    : "starfiniti-loyalty-data.json";
}

export function customerDataExportHeaders(
  generatedAt: string,
): Readonly<Record<string, string>> {
  return {
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="${customerDataExportFilename(generatedAt)}"`,
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Type": "application/json; charset=utf-8",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

export function isSupabaseSessionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}
