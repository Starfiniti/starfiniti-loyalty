export const ANALYTICS_EXPORT_COOKIE = "starfiniti_analytics_export";

export function analyticsExportDownloadPath(exportId: string): string {
  return `/analytics/exports/${exportId}/download`;
}

export function analyticsExportFilename(generatedAt: string): string {
  const date = generatedAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(date)
    ? `starfiniti-loyalty-analytics-${date}.json`
    : "starfiniti-loyalty-analytics.json";
}

export function analyticsExportHeaders(
  generatedAt: string,
): Readonly<Record<string, string>> {
  return {
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="${analyticsExportFilename(generatedAt)}"`,
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Type": "application/json; charset=utf-8",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    Vary: "Cookie",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
}
