import {
  merchantIntlLocale,
  type MerchantLocale,
} from "../../lib/merchant-locale";
import { MERCHANT_TIME_ZONE } from "../../lib/merchant-date-time";

export function programmeDraftResultText(
  locale: MerchantLocale,
  versionNumber: number,
  duplicate: boolean,
): string {
  if (locale === "sl-SI") {
    return duplicate
      ? `Osnutek v${versionNumber} je bil že shranjen.`
      : `Osnutek v${versionNumber} je shranjen z nespremenljivim prstnim odtisom konfiguracije.`;
  }
  return duplicate
    ? `Draft v${versionNumber} was already saved.`
    : `Draft v${versionNumber} saved with an immutable configuration fingerprint.`;
}

export function programmeScheduleResultText(
  locale: MerchantLocale,
  effectiveAt: string,
  duplicate: boolean,
): string {
  if (duplicate) {
    return locale === "sl-SI"
      ? "Ta točen urnik je bil že zabeležen."
      : "This exact schedule was already recorded.";
  }
  const formatted = new Intl.DateTimeFormat(merchantIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: MERCHANT_TIME_ZONE,
  }).format(new Date(effectiveAt));
  return locale === "sl-SI"
    ? `Objava je načrtovana za ${formatted}.`
    : `Publication scheduled for ${formatted}.`;
}
