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
  "Account navigation": "Navigacija računa",
  "Programme administration": "Upravljanje programa",
  "Drafts are new immutable versions. Publishing never rewrites prior transactions or their original value explanation.":
    "Osnutki so nove nespremenljive različice. Objava nikoli ne prepiše preteklih transakcij ali njihove prvotne razlage vrednosti.",
  "Programme setup requires an owner or admin":
    "Nastavitev programa zahteva lastnika ali skrbnika",
  "An active programme group and a live owner or admin membership are required before the first programme can be created.":
    "Pred ustvarjanjem prvega programa sta potrebna aktivna skupina programov in veljavno članstvo lastnika ali skrbnika.",
  "Read-only programme access": "Dostop do programa samo za branje",
  "Immutable history": "Nespremenljiva zgodovina",
  "Programme versions": "Različice programa",
  retained: "ohranjenih",
  "No programme versions yet.": "Različic programa še ni.",
  Version: "Različica",
  Fingerprint: "Prstni odtis",
  Published: "Objavljeno",
  Scheduled: "Načrtovano",
  "Not set": "Ni nastavljeno",
  draft: "osnutek",
  published: "objavljeno",
  scheduled: "načrtovano",
  Accountability: "Odgovornost",
  "Administration audit": "Revizijska sled upravljanja",
  "No visible programme audit events for this role.":
    "Za to vlogo ni vidnih revizijskih dogodkov programa.",
  Actor: "Izvajalec",
  Correlation: "Korelacija",
  "Draft created": "Osnutek ustvarjen",
  "Programme created": "Program ustvarjen",
  "Version published": "Različica objavljena",
  "Publication scheduled": "Objava načrtovana",
  "Step 1 of 2": "1. korak od 2",
  "Create your programme": "Ustvarite svoj program",
  "Not launched": "Še ni zagnano",
  "Programme name": "Ime programa",
  "Shown to merchant users and in programme history.":
    "Prikazano uporabnikom trgovca in v zgodovini programa.",
  "Programme slug": "Kratko ime programa",
  "Lowercase letters, numbers, and single hyphens only.":
    "Dovoljene so le male črke, številke in posamezni vezaji.",
  "Creating this container does not award points or publish a value policy.":
    "Ustvarjanje tega vsebnika ne dodeli točk in ne objavi pravil vrednosti.",
  "Creating programme...": "Ustvarjanje programa ...",
  "Create programme": "Ustvari program",
  "Earning policy": "Pravila pridobivanja",
  Tiers: "Stopnje",
  "Thresholds use eligible lifetime spend. Every tier starts from an exact euro amount and awards integer points per whole euro.":
    "Pragovi uporabljajo upravičeno življenjsko porabo. Vsaka stopnja se začne pri točnem znesku v evrih in dodeli celo število točk za vsak cel evro.",
  "Add tier": "Dodaj stopnjo",
  Tier: "Stopnja",
  Name: "Ime",
  Code: "Koda",
  "Spend threshold (EUR)": "Prag porabe (EUR)",
  "Points per EUR": "Točke na EUR",
  Remove: "Odstrani",
  tier: "stopnjo",
  reward: "nagrado",
  "Redemption catalogue": "Katalog unovčevanja",
  "Rewards remain connector-neutral here. WooCommerce executes the matching native coupon command asynchronously.":
    "Nagrade tukaj ostanejo neodvisne od povezave. WooCommerce ustrezen ukaz za kupon izvede asinhrono.",
  "Add reward": "Dodaj nagrado",
  "No redeemable rewards in this draft.":
    "V tem osnutku ni nagrad za unovčenje.",
  Reward: "Nagrada",
  Kind: "Vrsta",
  "Fixed discount": "Fiksni popust",
  "Percentage discount": "Odstotni popust",
  "Free product": "Brezplačen izdelek",
  "Free shipping": "Brezplačna dostava",
  "Store credit": "Dobroimetje v trgovini",
  "Exclusive access": "Ekskluziven dostop",
  Custom: "Po meri",
  "Cost (points)": "Cena (točke)",
  "Discount (EUR)": "Popust (EUR)",
  "Discount (%)": "Popust (%)",
  "Maximum (EUR, optional)": "Največ (EUR, neobvezno)",
  "Valid for (days)": "Velja (dni)",
  "Deterministic preview": "Deterministični predogled",
  "Example order": "Primer naročila",
  "Eligible spend (EUR)": "Upravičena poraba (EUR)",
  "Eligible spend": "Upravičena poraba",
  "Qualified tier": "Dosežena stopnja",
  "Configuration invalid": "Neveljavna konfiguracija",
  "Invalid amount": "Neveljaven znesek",
  "Pending award": "Čakajoča dodelitev",
  points: "točk",
  "Preview uses the same versioned contract validation. Publication revalidates and materializes the exact configuration in PostgreSQL.":
    "Predogled uporablja isto preverjanje različice pogodbe. Objava ponovno preveri in materializira točno konfiguracijo v PostgreSQL.",
  "Draft passes contract validation":
    "Osnutek uspešno prestane preverjanje pogodbe",
  "Draft needs attention": "Osnutek zahteva pozornost",
  "Draft contains invalid configuration.":
    "Osnutek vsebuje neveljavno konfiguracijo.",
  "Saving creates a new immutable version; it does not change the live programme.":
    "Shranjevanje ustvari novo nespremenljivo različico; aktivnega programa ne spremeni.",
  "Saving draft...": "Shranjevanje osnutka ...",
  "Save new draft version": "Shrani novo različico osnutka",
  "Owner or admin role required to publish.":
    "Za objavo je potrebna vloga lastnika ali skrbnika.",
  "I reviewed fingerprint": "Pregledal/-a sem prstni odtis",
  "Publishing...": "Objavljanje ...",
  "Publish now": "Objavi zdaj",
  "Schedule publication (Europe/Ljubljana)":
    "Načrtuj objavo (Europe/Ljubljana)",
  "Scheduling...": "Načrtovanje ...",
  "Schedule exact draft": "Načrtuj točen osnutek",
  "Your current organization role cannot perform this action.":
    "Vaša trenutna vloga v organizaciji ne dovoljuje tega dejanja.",
  "This request conflicts with an existing programme operation. Refresh and review the current state.":
    "Ta zahteva je v sporu z obstoječo operacijo programa. Osvežite stran in preverite trenutno stanje.",
  "The programme input failed server validation.":
    "Vnos programa ni prestal preverjanja na strežniku.",
  "The command could not be completed safely. No change was assumed.":
    "Ukaza ni bilo mogoče varno dokončati. Sprememba se ne šteje za izvedeno.",
  "Use a name up to 200 characters and a lowercase hyphenated slug.":
    "Uporabite ime do 200 znakov in kratko ime z malimi črkami ter vezaji.",
  "This programme was already created.": "Ta program je bil že ustvarjen.",
  "Programme created. Continue by saving and publishing its first draft.":
    "Program je ustvarjen. Nadaljujte s shranjevanjem in objavo prvega osnutka.",
  "The draft configuration is not valid.": "Konfiguracija osnutka ni veljavna.",
  "Fix the highlighted programme validation issues before saving.":
    "Pred shranjevanjem odpravite označene napake pri preverjanju programa.",
  "Confirm that you reviewed the exact draft before publishing.":
    "Pred objavo potrdite, da ste pregledali točen osnutek.",
  "This exact publication was already completed.":
    "Ta točna objava je bila že izvedena.",
  "The reviewed programme version is now published.":
    "Pregledana različica programa je zdaj objavljena.",
  "Choose a valid future publication time.":
    "Izberite veljaven prihodnji čas objave.",
  "This exact schedule was already recorded.":
    "Ta točen urnik je bil že zabeležen.",
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
