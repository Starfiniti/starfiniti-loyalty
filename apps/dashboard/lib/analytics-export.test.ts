import { describe, expect, it } from "vitest";
import {
  analyticsExportDownloadPath,
  analyticsExportFilename,
  analyticsExportHeaders,
} from "./analytics-export";

describe("analytics export delivery", () => {
  it("keeps the capability out of the URL", () => {
    expect(
      analyticsExportDownloadPath("9a000000-0000-4000-8000-000000000001"),
    ).toBe("/analytics/exports/9a000000-0000-4000-8000-000000000001/download");
    expect(analyticsExportDownloadPath("export-id")).not.toContain("token");
  });

  it("uses a stable safe filename and private response headers", () => {
    expect(analyticsExportFilename("2026-08-25T20:00:00Z")).toBe(
      "starfiniti-loyalty-analytics-2026-08-25.json",
    );
    const headers = analyticsExportHeaders("2026-08-25T20:00:00Z");
    expect(headers["Cache-Control"]).toBe("private, no-store");
    expect(headers["Content-Disposition"]).toBe(
      'attachment; filename="starfiniti-loyalty-analytics-2026-08-25.json"',
    );
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });
});
