"use client";

import { Download, ShieldCheck } from "lucide-react";
import { merchantText, type MerchantLocale } from "@/lib/merchant-locale";
import type { SupportDiagnostics } from "@/lib/support-diagnostics";

export function SupportDiagnosticsDownload({
  diagnostics,
  locale,
}: Readonly<{ diagnostics: SupportDiagnostics; locale: MerchantLocale }>) {
  const t = (source: string) => merchantText(locale, source);
  function download() {
    const body = `${JSON.stringify(diagnostics, null, 2)}\n`;
    const url = URL.createObjectURL(
      new Blob([body], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    const timestamp = diagnostics.generatedAt.replaceAll(/[:.]/gu, "-");
    anchor.href = url;
    anchor.download = `starfiniti-support-${timestamp}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <section className="support-diagnostics" aria-labelledby="support-title">
      <div>
        <ShieldCheck aria-hidden="true" />
        <div>
          <h2 id="support-title">{t("Sanitized support diagnostics")}</h2>
          <p id="support-description">
            {t(
              "Download tenant-scoped queue totals and a labelled, bounded sample of grouped error codes for a support request. Payloads, customer and commerce identifiers, actors, store names, and signing material are excluded.",
            )}
          </p>
        </div>
      </div>
      <button
        className="secondary"
        type="button"
        onClick={download}
        aria-describedby="support-description"
      >
        <Download aria-hidden="true" />
        {t("Download JSON")}
      </button>
    </section>
  );
}
