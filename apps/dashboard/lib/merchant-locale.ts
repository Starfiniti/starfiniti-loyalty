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
  "Skip to main content": "Preskoči na glavno vsebino",
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
  Programme: "Program",
  "Tenant-scoped operations": "Operacije okolja",
  "Connector health": "Stanje povezave",
  "Inspect WooCommerce ingestion, effect, and outbound command queues. Private payloads and source customer identifiers stay outside the browser.":
    "Preglejte vrste za sprejem podatkov WooCommerce, učinke in izhodne ukaze. Zasebne vsebine ter izvorni identifikatorji strank ostanejo zunaj brskalnika.",
  "WooCommerce connection not ready": "Povezava WooCommerce še ni pripravljena",
  "A live owner or admin, active workspace, and published programme are required before guided provisioning. Signing material remains outside the browser.":
    "Pred vodenim povezovanjem so potrebni veljaven lastnik ali skrbnik, aktiven delovni prostor in objavljen program. Podpisno gradivo ostane zunaj brskalnika.",
  "Last verified delivery:": "Zadnja potrjena dostava:",
  Never: "Nikoli",
  healthy: "zdravo",
  stale: "zastarelo",
  attention: "pozornost",
  disabled: "onemogočeno",
  retryable: "ponovljivo",
  quarantined: "v karanteni",
  "dead letter": "trajno neuspešno",
  "Delivery queue": "Vrsta dostav",
  "Loyalty effects": "Učinki zvestobe",
  "Woo commands": "Ukazi Woo",
  "need attention": "zahteva pozornost",
  "Safe retry policy": "Pravila varnega ponovnega poskusa",
  "Only canonical effects can be replayed here.":
    "Tukaj je mogoče ponovno izvesti le kanonične učinke.",
  "Source reconciliation requires a live connector and an owner, admin, or operator role.":
    "Usklajevanje z virom zahteva aktivno povezavo in vlogo lastnika, skrbnika ali operaterja.",
  "recent queue issues": "nedavnih težav v vrstah",
  "Newest 25 · payloads withheld": "Najnovejših 25 · vsebine skrite",
  "No active queue issues": "Ni aktivnih težav v vrstah",
  "The bounded operational view contains no failures.":
    "Omejen operativni pregled ne vsebuje napak.",
  Operation: "Operacija",
  State: "Stanje",
  Attempts: "Poskusi",
  Observed: "Zaznano",
  Control: "Nadzor",
  "Delivery normalization": "Normalizacija dostave",
  "Loyalty effect": "Učinek zvestobe",
  "WooCommerce command": "Ukaz WooCommerce",
  "Connector operation": "Operacija povezave",
  "Inspect only — compensation may exist":
    "Samo pregled — morda obstaja kompenzacija",
  "Remediation required": "Potrebna je odprava",
  "Sanitized support diagnostics": "Prečiščena diagnostika za podporo",
  "Download tenant-scoped queue totals and a labelled, bounded sample of grouped error codes for a support request. Payloads, customer and commerce identifiers, actors, store names, and signing material are excluded.":
    "Prenesite vsote vrst za okolje ter označen in omejen vzorec združenih kod napak za zahtevo podpori. Vsebine, identifikatorji strank in trgovine, izvajalci, imena trgovin ter podpisno gradivo so izključeni.",
  "Download JSON": "Prenesi JSON",
  "One-time WooCommerce setup code": "Enkratna nastavitvena koda WooCommerce",
  Copied: "Kopirano",
  "Copy setup code": "Kopiraj nastavitveno kodo",
  "I saved it — show connector health":
    "Shranil/-a sem jo — prikaži stanje povezave",
  "Guided connection": "Vodeno povezovanje",
  "Connect WooCommerce": "Poveži WooCommerce",
  "WooCommerce store origin": "Izvor trgovine WooCommerce",
  "Lowercase HTTPS origin only; no path, query, or password.":
    "Samo izvor HTTPS z malimi črkami; brez poti, poizvedbe ali gesla.",
  "Store display name": "Prikazno ime trgovine",
  "Review connection": "Preglej povezavo",
  "I reviewed the store and programme.":
    "Pregledal/-a sem trgovino in program.",
  "Provisioning…": "Vzpostavljanje …",
  "Provision and show setup code": "Vzpostavi in prikaži nastavitveno kodo",
  "Reconcile a WooCommerce order": "Uskladi naročilo WooCommerce",
  "Ask the connector to re-read one source order and idempotently re-emit its order, refund, and coupon facts. This does not edit points directly.":
    "Povezavi naročite, naj znova prebere eno izvorno naročilo ter idempotentno ponovno pošlje podatke o naročilu, vračilu in kuponih. To ne ureja točk neposredno.",
  "WooCommerce order ID": "ID naročila WooCommerce",
  "Review reason": "Razlog pregleda",
  "Missing completed-order loyalty effect":
    "Manjka učinek zvestobe zaključenega naročila",
  "Review request": "Preglej zahtevo",
  "I reviewed the order ID and reason.":
    "Pregledal/-a sem ID naročila in razlog.",
  "Queuing…": "Dodajanje v vrsto …",
  "Queue reconciliation": "Dodaj uskladitev v vrsto",
  "Reason for retry": "Razlog ponovnega poskusa",
  "Reviewed reason for replay": "Pregledan razlog za ponovno izvedbo",
  Reviewed: "Pregledano",
  "Retry effect": "Ponovi učinek",
  "Review and confirm the WooCommerce connection.":
    "Preglejte in potrdite povezavo WooCommerce.",
  "The provisioning identity is invalid. Refresh and retry.":
    "Identiteta vzpostavljanja ni veljavna. Osvežite stran in poskusite znova.",
  "Enter the canonical lowercase HTTPS store origin and a single-line store name.":
    "Vnesite kanonični izvor trgovine HTTPS z malimi črkami in enovrstično ime trgovine.",
  "The public hub origin is not configured. No connection was created.":
    "Javni izvor središča ni nastavljen. Povezava ni bila ustvarjena.",
  "The public hub origin is not a canonical HTTPS origin. No connection was created.":
    "Javni izvor središča ni kanonični izvor HTTPS. Povezava ni bila ustvarjena.",
  "Your verified session expired. Sign in and retry.":
    "Vaša potrjena seja je potekla. Prijavite se in poskusite znova.",
  "This exact connection was already provisioned. Use the recovered setup code below.":
    "Ta točna povezava je bila že vzpostavljena. Uporabite spodnjo obnovljeno nastavitveno kodo.",
  "Connection provisioned. Copy the setup code now; it is hidden after leaving this page.":
    "Povezava je vzpostavljena. Nastavitveno kodo kopirajte zdaj; po odhodu s strani bo skrita.",
  "No unused connector key is available. An operator must replenish the signing-key pool.":
    "Na voljo ni neuporabljenega ključa povezave. Operater mora dopolniti zalogo podpisnih ključev.",
  "A live owner/admin, active workspace, and published programme are required.":
    "Potrebni so veljaven lastnik/skrbnik, aktiven delovni prostor in objavljen program.",
  "The store or workspace is already connected, or provisioning changed concurrently. No second connection was assumed.":
    "Trgovina ali delovni prostor je že povezan oziroma se je vzpostavljanje sočasno spremenilo. Druga povezava se ne šteje za ustvarjeno.",
  "Review and confirm the source-order reconciliation.":
    "Preglejte in potrdite uskladitev izvornega naročila.",
  "The reconciliation identity is invalid. Refresh and try again.":
    "Identiteta uskladitve ni veljavna. Osvežite stran in poskusite znova.",
  "Enter a positive WooCommerce order ID and a single-line review reason of at least 8 characters.":
    "Vnesite pozitiven ID naročila WooCommerce in enovrstični razlog pregleda z vsaj 8 znaki.",
  "Your role cannot reconcile this live connector.":
    "Vaša vloga ne more uskladiti te aktivne povezave.",
  "The connector or request changed. No reconciliation was assumed.":
    "Povezava ali zahteva se je spremenila. Uskladitev se ne šteje za izvedeno.",
  "The durable reconciliation result could not be verified.":
    "Trajnega rezultata uskladitve ni bilo mogoče preveriti.",
  "Reconciliation queued. The signed plugin command will re-emit the source order facts.":
    "Uskladitev je dodana v vrsto. Podpisan ukaz vtičnika bo ponovno poslal podatke izvornega naročila.",
  "Confirm the reviewed effect replay.":
    "Potrdite pregledano ponovno izvedbo učinka.",
  "The replay identity is invalid. Refresh and try again.":
    "Identiteta ponovne izvedbe ni veljavna. Osvežite stran in poskusite znova.",
  "Provide a single-line review reason of at least 8 characters.":
    "Navedite enovrstični razlog pregleda z vsaj 8 znaki.",
  "Your current organization role cannot replay connector effects.":
    "Vaša trenutna vloga v organizaciji ne more ponovno izvajati učinkov povezave.",
  "The effect state changed or the replay could not be authorized safely.":
    "Stanje učinka se je spremenilo ali ponovne izvedbe ni bilo mogoče varno odobriti.",
  "The replay result could not be verified.":
    "Rezultata ponovne izvedbe ni bilo mogoče preveriti.",
  "This exact replay was already requested.":
    "Ta točna ponovna izvedba je bila že zahtevana.",
  "The effect was returned to the idempotent worker queue.":
    "Učinek je bil vrnjen v idempotentno delovno vrsto.",
  Operations: "Operacije",
  "Search pseudonymous customer references and inspect authoritative wallet balances. Channel IDs stay masked in the interface.":
    "Iščite psevdonimne reference strank in preglejte avtoritativna stanja denarnic. ID-ji kanalov ostanejo v vmesniku prikriti.",
  "Bulk adjustment": "Množična prilagoditev",
  "Search customer references": "Išči reference strank",
  "Search display reference": "Išči prikazno referenco",
  Clear: "Počisti",
  customers: "strank",
  "Newest 50 · RLS protected": "Najnovejših 50 · zaščiteno z RLS",
  "No matching customers": "Ni ustreznih strank",
  "Try a different display reference. Email is deliberately not an identity or merge key.":
    "Poskusite z drugo prikazno referenco. E-pošta namenoma ni identiteta ali ključ za združevanje.",
  Customer: "Stranka",
  "Channel identity": "Identiteta kanala",
  Available: "Razpoložljivo",
  Pending: "V čakanju",
  Reserved: "Rezervirano",
  Created: "Ustvarjeno",
  Open: "Odpri",
  wallet: "denarnica",
  "not created": "ni ustvarjena",
  "Not linked": "Ni povezano",
  "No channel identity": "Ni identitete kanala",
  View: "Prikaži",
  "Back to customers": "Nazaj na stranke",
  Unlinked: "Nepovezano",
  "No channel ID": "Ni ID-ja kanala",
  "Tenant scoped": "Omejeno na okolje",
  "Wallet balances": "Stanja denarnice",
  Spent: "Porabljeno",
  Expired: "Poteklo",
  Reversed: "Razveljavljeno",
  "Tier qualification": "Uvrstitev v stopnjo",
  "Current immutable decision": "Trenutna nespremenljiva odločitev",
  "Effective tier": "Veljavna stopnja",
  "Qualified tier": "Dosežena stopnja",
  "Not recorded": "Ni zabeleženo",
  Decision: "Odločitev",
  "Rolling eligible spend": "Drseča upravičena poraba",
  "minor units": "manjših enot",
  "Effective since": "Velja od",
  "Grace until": "Prehodno obdobje do",
  "No active grace period": "Ni aktivnega prehodnega obdobja",
  "No tier decision has been recorded for this wallet yet.":
    "Za to denarnico še ni bila zabeležena odločitev o stopnji.",
  "Immutable ledger history": "Nespremenljiva zgodovina glavne knjige",
  of: "od",
  "latest entries": "najnovejših vnosov",
  "Filter customer activity": "Filtriraj dejavnost stranke",
  "All activity": "Vsa dejavnost",
  "Orders & refunds": "Naročila in vračila",
  "Release & expiry": "Sprostitev in potek",
  Adjustments: "Prilagoditve",
  "No ledger entries for this wallet.":
    "Za to denarnico ni vnosov glavne knjige.",
  "Manual adjustment": "Ročna prilagoditev",
  "Immutable ledger · programme": "Nespremenljiva glavna knjiga · program",
  "Points to add or remove": "Točke za dodajanje ali odvzem",
  Reason: "Razlog",
  "Approved customer correction": "Odobren popravek stranke",
  "Internal note (optional)": "Notranja opomba (neobvezno)",
  "Ticket or approval reference": "Referenca zahtevka ali odobritve",
  "Added points expire at (Europe/Ljubljana)":
    "Dodane točke potečejo (Europe/Ljubljana)",
  "Resulting available balance": "Končno razpoložljivo stanje",
  "Warning: this appends a compensating debit and may make the available balance negative. It never rewrites prior awards.":
    "Opozorilo: to doda kompenzacijsko bremenitev in lahko razpoložljivo stanje postane negativno. Preteklih dodelitev nikoli ne prepiše.",
  "Added points create a new expiry lot attributed to the current published programme version.":
    "Dodane točke ustvarijo nov paket s potekom, pripisan trenutni objavljeni različici programa.",
  "Review adjustment": "Preglej prilagoditev",
  "I reviewed the amount, resulting balance, reason, and expiry.":
    "Pregledal/-a sem znesek, končno stanje, razlog in potek.",
  "Recording…": "Beleženje …",
  "Confirm point removal": "Potrdi odvzem točk",
  "Confirm point credit": "Potrdi dodajanje točk",
  "Review and confirm the adjustment.": "Preglejte in potrdite prilagoditev.",
  "The adjustment identity is invalid. Refresh and try again.":
    "Identiteta prilagoditve ni veljavna. Osvežite stran in poskusite znova.",
  "Enter non-zero whole points, a single-line reason, and an expiry for added points.":
    "Vnesite neničelne cele točke, enovrstični razlog in potek za dodane točke.",
  "Your current organization role cannot adjust customer value.":
    "Vaša trenutna vloga v organizaciji ne more prilagajati vrednosti stranke.",
  "The wallet, programme version, or request changed. No adjustment was assumed.":
    "Denarnica, različica programa ali zahteva se je spremenila. Prilagoditev se ne šteje za izvedeno.",
  "The immutable ledger result could not be verified.":
    "Nespremenljivega rezultata glavne knjige ni bilo mogoče preveriti.",
  "Bulk point adjustment": "Množična prilagoditev točk",
  "Exact approval required": "Potrebna je točna odobritev",
  "Read-only customer access": "Dostop do strank samo za branje",
  "A published programme is required": "Potreben je objavljen program",
  "Publish the current loyalty programme before attributing new bulk ledger transactions to it.":
    "Pred pripisovanjem novih množičnih transakcij glavne knjige objavite trenutni program zvestobe.",
  "Select customers": "Izberite stranke",
  "2–50 active wallets · latest 50 customers":
    "2–50 aktivnih denarnic · zadnjih 50 strank",
  "At least two active customer wallets are required for a bulk operation.":
    "Za množično operacijo sta potrebni vsaj dve aktivni denarnici strank.",
  "available points": "razpoložljivih točk",
  "Points per customer": "Točke na stranko",
  "Approved campaign correction": "Odobren popravek kampanje",
  "Credit expiry (Europe/Ljubljana; required when adding points)":
    "Potek dobropisa (Europe/Ljubljana; obvezen pri dodajanju točk)",
  "Dry run first": "Najprej poskusni izračun",
  "Previewing is read-only. Execution later requires the exact customer set, balances, amount, reason, expiry, and published programme fingerprint shown in that preview.":
    "Predogled je samo za branje. Izvedba nato zahteva točen prikazan nabor strank, stanja, znesek, razlog, potek in prstni odtis objavljenega programa.",
  "Building dry run…": "Priprava poskusnega izračuna …",
  "Preview batch": "Predogled serije",
  "Each customer": "Vsaka stranka",
  "Total ledger effect": "Skupni učinek glavne knjige",
  "Available before": "Razpoložljivo prej",
  "Projected after": "Predvideno potem",
  "Credit expiry": "Potek dobropisa",
  "Not applicable to point removal": "Ne velja za odvzem točk",
  "Preview fingerprint": "Prstni odtis predogleda",
  "I approve this exact customer set, amount, projected balances, reason, expiry, and immutable ledger batch.":
    "Odobravam ta točen nabor strank, znesek, predvidena stanja, razlog, potek in nespremenljivo serijo glavne knjige.",
  "Recording batch…": "Beleženje serije …",
  "Execute approved batch": "Izvedi odobreno serijo",
  "Start a new dry run": "Začni nov poskusni izračun",
  "Select 2 to 50 unique customers, enter non-zero whole points and a single-line reason, and set an expiry for credits.":
    "Izberite 2 do 50 enoličnih strank, vnesite neničelne cele točke in enovrstični razlog ter nastavite potek za dobropise.",
  "Your current organization role cannot preview customer value changes.":
    "Vaša trenutna vloga v organizaciji ne more pregledovati sprememb vrednosti strank.",
  "The customer set, wallet balances, or published programme changed. No adjustment was assumed.":
    "Nabor strank, stanja denarnic ali objavljen program se je spremenil. Prilagoditev se ne šteje za izvedeno.",
  "The authoritative bulk preview could not be verified.":
    "Avtoritativnega množičnega predogleda ni bilo mogoče preveriti.",
  "The authoritative preview did not match the selected customers.":
    "Avtoritativni predogled se ni ujemal z izbranimi strankami.",
  "Dry run complete. No balances changed.":
    "Poskusni izračun je končan. Nobeno stanje se ni spremenilo.",
  "Review and approve the exact dry run.":
    "Preglejte in odobrite točen poskusni izračun.",
  "The batch identity is invalid. Start a new dry run.":
    "Identiteta serije ni veljavna. Začnite nov poskusni izračun.",
  "The approved dry run is invalid. Start a new preview.":
    "Odobren poskusni izračun ni veljaven. Začnite nov predogled.",
  "Your current organization role cannot change customer value.":
    "Vaša trenutna vloga v organizaciji ne more spreminjati vrednosti strank.",
  "The dry run is stale or conflicts with this batch identity. No partial batch was recorded.":
    "Poskusni izračun je zastarel ali v sporu z identiteto serije. Delna serija ni bila zabeležena.",
  "The batch could not be verified. No completed batch was assumed.":
    "Serije ni bilo mogoče preveriti. Serija se ne šteje za dokončano.",
  "The immutable batch result could not be verified.":
    "Nespremenljivega rezultata serije ni bilo mogoče preveriti.",
  "No workspace": "Ni delovnega prostora",
  "Customer experience": "Uporabniška izkušnja",
  "Brand the loyalty wallet": "Oblikujte denarnico zvestobe",
  "Preview a bounded token set before it reaches hosted or WooCommerce customer surfaces. Value rules remain in immutable programme versions.":
    "Predoglejte si omejen nabor oblikovnih žetonov, preden doseže gostovane ali WooCommerce površine za stranke. Pravila vrednosti ostanejo v nespremenljivih različicah programa.",
  Revision: "Revizija",
  "Unsaved default": "Neshranjena privzeta nastavitev",
  "Open hosted page": "Odpri gostovano stran",
  "Link an active workspace to an active programme group before saving a customer theme.":
    "Pred shranjevanjem teme za stranke povežite aktiven delovni prostor z aktivno skupino programov.",
  "Controlled design tokens": "Nadzorovani oblikovni žetoni",
  "Customer theme": "Tema za stranke",
  "Owner/admin": "Lastnik/skrbnik",
  "Read only": "Samo za branje",
  "Brand color": "Barva znamke",
  "Brand color picker": "Izbirnik barve znamke",
  "White-text contrast": "Kontrast belega besedila",
  minimum: "najmanj",
  "Display font": "Prikazna pisava",
  "System sans": "Sistemska brez serifov",
  "Editorial serif": "Uredniška serifna",
  "Modern serif": "Sodobna serifna",
  "Local stacks only; no remote font or tracking request.":
    "Samo lokalni skladi; brez oddaljene pisave ali sledilne zahteve.",
  "Card radius": "Polmer kartice",
  Compact: "Kompaktno",
  Balanced: "Uravnoteženo",
  Soft: "Mehko",
  "Widget position": "Položaj gradnika",
  Left: "Levo",
  Right: "Desno",
  "Visible sections": "Vidni razdelki",
  "Tier progress": "Napredek stopnje",
  "Available rewards": "Razpoložljive nagrade",
  "Raw CSS, JavaScript, font URLs, and uploads are excluded from this boundary.":
    "Surovi CSS, JavaScript, URL-ji pisav in nalaganja so izključeni iz te meje.",
  "Saving…": "Shranjevanje …",
  "Save theme": "Shrani temo",
  "Allowlisted locale copy": "Besedilo dovoljenih jezikov",
  "Customer translations": "Prevodi za stranke",
  "Preview and edit locale": "Jezik predogleda in urejanja",
  "Points label": "Oznaka točk",
  "Guest headline": "Naslov za gosta",
  "Balance label": "Oznaka stanja",
  "Rewards heading": "Naslov nagrad",
  "Redeem action": "Dejanje unovčenja",
  "Join action": "Dejanje pridružitve",
  "Guest earning message": "Sporočilo za pridobivanje točk gosta",
  "English and Slovenian are explicit launch locales. Unsupported locale selectors fail closed instead of silently mixing copy.":
    "Angleščina in slovenščina sta izrecna začetna jezika. Nepodprti izbirniki jezika odpovejo varno, namesto da bi neopazno mešali besedilo.",
  "Save copy": "Shrani besedilo",
  "Responsive preview": "Odzivni predogled",
  "Member wallet": "Denarnica člana",
  "Sample data": "Vzorčni podatki",
  "Free shipping": "Brezplačna dostava",
  "Widget preview on the": "Predogled gradnika na",
  "Use an accessible dark brand color and keep all customer copy within the displayed limits.":
    "Uporabite dostopno temno barvo znamke in ohranite vse besedilo za stranke znotraj prikazanih omejitev.",
  "Your current organization role cannot change this theme.":
    "Vaša trenutna vloga v organizaciji ne more spreminjati te teme.",
  "This save conflicts with a completed request. Refresh and retry.":
    "To shranjevanje je v sporu z dokončano zahtevo. Osvežite stran in poskusite znova.",
  "The theme could not be saved safely. No change was assumed.":
    "Teme ni bilo mogoče varno shraniti. Sprememba se ne šteje za izvedeno.",
  "The theme response could not be verified.":
    "Odgovora teme ni bilo mogoče preveriti.",
  "Use a supported locale and keep each customer-facing label single-line and within its displayed limit.":
    "Uporabite podprt jezik in ohranite vsako oznako za stranke enovrstično ter znotraj prikazane omejitve.",
  "Your current organization role cannot change customer copy.":
    "Vaša trenutna vloga v organizaciji ne more spreminjati besedila za stranke.",
  "This locale save conflicts with a completed request. Refresh and retry.":
    "Shranjevanje tega jezika je v sporu z dokončano zahtevo. Osvežite stran in poskusite znova.",
  "The customer copy could not be saved safely. No change was assumed.":
    "Besedila za stranke ni bilo mogoče varno shraniti. Sprememba se ne šteje za izvedeno.",
  "The translation response could not be verified.":
    "Odgovora prevoda ni bilo mogoče preveriti.",
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
