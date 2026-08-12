import {
  customerLocalePath,
  resolveCustomerLocale,
  type CustomerLocale,
} from "./customer-locale";

export type MerchantLocale = CustomerLocale;

export function resolveMerchantLocale(value: unknown): MerchantLocale {
  return resolveCustomerLocale(value);
}

export function merchantLocalePath(
  path: string,
  locale: MerchantLocale,
): string {
  return customerLocalePath(path, locale);
}

export function merchantIntlLocale(locale: MerchantLocale): string {
  return locale === "sl-SI" ? "sl-SI" : "en-GB";
}

const SLOVENIAN_TEXT: Readonly<Record<string, string>> = {
  Language: "Jezik",
  English: "Angleščina",
  Slovenian: "Slovenščina",
  Overview: "Pregled",
  "Programme overview": "Pregled programa",
  "Earning rules": "Pravila pridobivanja",
  Rewards: "Nagrade",
  "VIP tiers": "VIP stopnje",
  "Points expiry": "Potek točk",
  Customers: "Stranke",
  "Connector operations": "Operacije povezave",
  Campaigns: "Kampanje",
  Referrals: "Priporočila",
  "Customer experience": "Uporabniška izkušnja",
  GROW: "RAST",
  PROGRAMME: "PROGRAM",
  PLATFORM: "PLATFORMA",
  Live: "Aktivno",
  Authenticated: "Prijavljeno",
  "Main navigation": "Glavna navigacija",
  "Live tenant context · live reporting": "Aktivno okolje · poročanje v živo",
  "Merchant member": "Član trgovca",
  "Sign out": "Odjava",
  "Open navigation": "Odpri navigacijo",
  "Close navigation": "Zapri navigacijo",
  Search: "Iskanje",
  "Search customers, rewards, rules…": "Išči stranke, nagrade, pravila …",
  "Date range": "Časovno obdobje",
  "Last 7 days": "Zadnjih 7 dni",
  "Last 30 days": "Zadnjih 30 dni",
  "Last 90 days": "Zadnjih 90 dni",
  "Toggle dark mode": "Preklopi temni način",
  Help: "Pomoč",
  Notifications: "Obvestila",
  "Manage programme": "Upravljaj program",
  "Loyalty members": "Člani programa zvestobe",
  "Eligible loyalty spend": "Upravičena poraba",
  "Repeat-member rate": "Delež ponovnih članov",
  "Points redemption rate": "Delež unovčenih točk",
  "Points liability": "Obveznost iz točk",
  "new-member change vs previous period":
    "sprememba novih članov glede na prejšnje obdobje",
  "vs previous period": "glede na prejšnje obdobje",
  "members with 2+ eligible orders": "člani z vsaj 2 upravičenima naročiloma",
  "captured ÷ awarded points": "porabljene ÷ dodeljene točke",
  "pending + available + reserved": "v čakanju + razpoložljive + rezervirane",
  "New members": "Novi člani",
  "This period": "To obdobje",
  Previous: "Prejšnje",
  "New members trend chart": "Graf trenda novih članov",
  "No active workspace": "Ni aktivnega delovnega prostora",
  "Programme setup required": "Potrebna je nastavitev programa",
  "No organization access": "Ni dostopa do organizacije",
  "Your identity is valid, but it has no active organization membership. An owner must provision membership before tenant data is visible.":
    "Vaša identiteta je veljavna, vendar nima aktivnega članstva v organizaciji. Lastnik mora dodeliti članstvo, preden so podatki okolja vidni.",
};

export function merchantText(locale: MerchantLocale, source: string): string {
  return locale === "sl-SI" ? (SLOVENIAN_TEXT[source] ?? source) : source;
}

export function merchantTranslationEntries(): readonly (readonly [
  string,
  string,
])[] {
  return Object.entries(SLOVENIAN_TEXT);
}
