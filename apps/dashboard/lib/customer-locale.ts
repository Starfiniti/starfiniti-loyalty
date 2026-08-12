export type CustomerLocale = "en" | "sl-SI";

export function resolveCustomerLocale(value: unknown): CustomerLocale {
  return value === "sl-SI" ? "sl-SI" : "en";
}

export function resolveCustomerNavigationLocale(
  explicitLocale: unknown,
  nextPath: unknown,
): CustomerLocale {
  if (resolveCustomerLocale(explicitLocale) === "sl-SI") return "sl-SI";
  if (
    typeof nextPath !== "string" ||
    !nextPath.startsWith("/") ||
    nextPath.startsWith("//") ||
    nextPath.includes("\\") ||
    nextPath.length > 4096
  ) {
    return "en";
  }
  try {
    return resolveCustomerLocale(
      new URL(nextPath, "https://local.invalid").searchParams.get("lang"),
    );
  } catch {
    return "en";
  }
}

export function customerLocalePath(
  path: string,
  locale: CustomerLocale,
): string {
  if (locale === "en") return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}lang=sl-SI`;
}

export const CUSTOMER_COPY = {
  en: {
    language: "Language",
    english: "English",
    slovenian: "Slovenščina",
    signOut: "Sign out",
    connected: "Your verified store account is now connected.",
    rewardReserved:
      "Reward reserved. Your customer-only WooCommerce coupon is being created now.",
    accountEyebrow: "Your loyalty account",
    accountTitle: "Points, tier, and rewards",
    accountIntro:
      "Live values from the self-hosted loyalty ledger. Store checkout continues to work even if this page is temporarily unavailable.",
    noAccountTitle: "No store account connected",
    noAccountBody:
      "Sign in to your WooCommerce store, open My account, then choose Loyalty rewards and Open loyalty account.",
    defaultProgramme: "Loyalty programme",
    availablePoints: "Available points",
    pending: "Pending",
    reserved: "Reserved",
    currentTier: "Current tier",
    notEvaluated: "Not evaluated yet",
    pointsExpire: "points expire on",
    availableRewards: "Available rewards",
    noRewards: "No published rewards are available.",
    redeem: "Redeem",
    askStore: "Ask store",
    keepEarning: "Keep earning",
    recentActivity: "Recent activity",
    noActivity: "No points activity yet.",
    publicDetails: "View public programme details",
    live: "Live",
    ready: "Ready",
    walletUnavailable: "Wallet unavailable",
    programmeUnavailable: "Programme unavailable",
    unknownDate: "an unknown date",
    earned: "Points earned",
    available: "Points available",
    rewardReservedActivity: "Reward reserved",
    rewardUsed: "Reward used",
    reservationReleased: "Reservation released",
    pointsExpired: "Points expired",
    refundAdjustment: "Refund adjustment",
    accountAdjustment: "Account adjustment",
    loyaltyActivity: "Loyalty activity",
    insufficient:
      "Your available points changed before confirmation. No reward was reserved.",
    invalidRedemption:
      "That redemption request was invalid. No reward was reserved.",
    unavailableRedemption:
      "This reward cannot be redeemed right now. No points were changed.",
    connectTitle: "Connect your loyalty account",
    connectBeforeStore:
      "Confirm that you want to connect this signed-in account to your verified customer record at",
    claimSafety:
      "This one-time link came from your WooCommerce account. We do not use an email address to match customers.",
    connectAccount: "Connect account",
    accountConnectedTitle: "Account already connected",
    linkUnavailableTitle: "Link unavailable",
    accountConflict:
      "This store customer or signed-in account is already connected differently. No account was changed.",
    invalidLink:
      "This secure link is invalid or has expired. Return to your store account and open Loyalty rewards again.",
    signInTitle: "Account sign in",
    signInIntro:
      "Use the account provisioned for your organization or customer loyalty access. Self-service sign-up is disabled on this private hub.",
    authLinkFailed: "The authentication link could not be verified.",
    email: "Email address",
    password: "Password",
    signingIn: "Signing in...",
    signIn: "Sign in",
    invalidCredentials: "Enter a valid email address and password.",
    rejectedCredentials: "The email address or password was not accepted.",
    sessionFailed: "A secure session could not be established.",
    signInFootnote:
      "Sessions are verified by self-hosted Supabase Auth. Merchant and customer access are checked against live database links on every request.",
    exportData: "Download my data",
    exportDataIntro:
      "Download your linked store identities, wallets, tiers, reservations, and complete loyalty ledger as JSON.",
    exportReauthTitle: "Confirm your identity",
    exportReauthIntro:
      "Enter your password again. The download authorization is valid once for five minutes and is tied to this session.",
    exportAuthorizing: "Confirming...",
    exportAuthorize: "Confirm and download",
    exportAuthorizationFailed:
      "The secure download could not be authorized. Try again.",
    confirmReward: "Confirm reward",
    redeemBeforeReward: "Redeem",
    redeemFor: "for",
    pointsQuestion: "points?",
    currentBalance: "Current balance",
    afterReservation: "After reservation",
    reservationSafety:
      "Your points will be reserved now. WooCommerce creates a customer-only coupon asynchronously; if issuance fails, the ledger releases the points automatically.",
    confirmRedemption: "Confirm redemption",
    cancel: "Cancel",
    manualReward:
      "This reward is fulfilled directly by the store and is not available as an automatic coupon.",
    notEnoughPoints:
      "You do not currently have enough available points for this reward.",
    backToAccount: "Back to loyalty account",
  },
  "sl-SI": {
    language: "Jezik",
    english: "English",
    slovenian: "Slovenščina",
    signOut: "Odjava",
    connected: "Vaš preverjeni račun trgovine je zdaj povezan.",
    rewardReserved:
      "Nagrada je rezervirana. Vaš osebni kupon WooCommerce se ustvarja.",
    accountEyebrow: "Vaš račun zvestobe",
    accountTitle: "Točke, stopnja in nagrade",
    accountIntro:
      "Prikazane so trenutne vrednosti iz samostojno gostovane evidence zvestobe. Nakup v trgovini deluje tudi, če ta stran začasno ni dosegljiva.",
    noAccountTitle: "Noben račun trgovine ni povezan",
    noAccountBody:
      "Prijavite se v trgovino WooCommerce, odprite Moj račun ter izberite Nagrade zvestobe in Odpri račun zvestobe.",
    defaultProgramme: "Program zvestobe",
    availablePoints: "Razpoložljive točke",
    pending: "V čakanju",
    reserved: "Rezervirano",
    currentTier: "Trenutna stopnja",
    notEvaluated: "Še ni ocenjeno",
    pointsExpire: "točk poteče dne",
    availableRewards: "Razpoložljive nagrade",
    noRewards: "Objavljene nagrade niso na voljo.",
    redeem: "Unovči",
    askStore: "Vprašajte trgovino",
    keepEarning: "Zbirajte naprej",
    recentActivity: "Nedavna dejavnost",
    noActivity: "Dejavnosti s točkami še ni.",
    publicDetails: "Prikaži javne podrobnosti programa",
    live: "Aktivno",
    ready: "Pripravljeno",
    walletUnavailable: "Denarnica ni na voljo",
    programmeUnavailable: "Program ni na voljo",
    unknownDate: "neznan datum",
    earned: "Pridobljene točke",
    available: "Razpoložljive točke",
    rewardReservedActivity: "Rezervirana nagrada",
    rewardUsed: "Uporabljena nagrada",
    reservationReleased: "Sproščena rezervacija",
    pointsExpired: "Potekle točke",
    refundAdjustment: "Prilagoditev vračila",
    accountAdjustment: "Prilagoditev računa",
    loyaltyActivity: "Dejavnost zvestobe",
    insufficient:
      "Razpoložljive točke so se pred potrditvijo spremenile. Nagrada ni bila rezervirana.",
    invalidRedemption:
      "Zahteva za unovčenje ni veljavna. Nagrada ni bila rezervirana.",
    unavailableRedemption:
      "Nagrade trenutno ni mogoče unovčiti. Točke se niso spremenile.",
    connectTitle: "Povežite račun zvestobe",
    connectBeforeStore:
      "Potrdite povezavo prijavljenega računa s preverjenim zapisom kupca v trgovini",
    claimSafety:
      "Ta enkratna povezava prihaja iz vašega računa WooCommerce. Kupcev ne povezujemo po e-poštnem naslovu.",
    connectAccount: "Poveži račun",
    accountConnectedTitle: "Račun je že povezan",
    linkUnavailableTitle: "Povezava ni na voljo",
    accountConflict:
      "Ta kupec trgovine ali prijavljeni račun je že drugače povezan. Noben račun ni bil spremenjen.",
    invalidLink:
      "Varna povezava ni veljavna ali je potekla. Vrnite se v račun trgovine in znova odprite Nagrade zvestobe.",
    signInTitle: "Prijava v račun",
    signInIntro:
      "Uporabite račun, pripravljen za vašo organizacijo ali dostop do programa zvestobe. Samostojna registracija je v tem zasebnem središču izklopljena.",
    authLinkFailed:
      "Povezave za preverjanje pristnosti ni bilo mogoče potrditi.",
    email: "E-poštni naslov",
    password: "Geslo",
    signingIn: "Prijavljanje ...",
    signIn: "Prijava",
    invalidCredentials: "Vnesite veljaven e-poštni naslov in geslo.",
    rejectedCredentials: "E-poštni naslov ali geslo ni bilo sprejeto.",
    sessionFailed: "Varne seje ni bilo mogoče vzpostaviti.",
    signInFootnote:
      "Seje preverja samostojno gostovani Supabase Auth. Dostop trgovcev in kupcev se ob vsaki zahtevi preveri glede na aktivne povezave v podatkovni zbirki.",
    exportData: "Prenesi moje podatke",
    exportDataIntro:
      "Prenesite povezane identitete trgovin, denarnice, stopnje, rezervacije in celotno evidenco zvestobe v obliki JSON.",
    exportReauthTitle: "Potrdite svojo identiteto",
    exportReauthIntro:
      "Znova vnesite geslo. Dovoljenje za prenos velja enkrat, pet minut in je vezano na to sejo.",
    exportAuthorizing: "Potrjevanje ...",
    exportAuthorize: "Potrdi in prenesi",
    exportAuthorizationFailed:
      "Varnega prenosa ni bilo mogoÄŤe odobriti. Poskusite znova.",
    confirmReward: "Potrdite nagrado",
    redeemBeforeReward: "Unovčite",
    redeemFor: "za",
    pointsQuestion: "točk?",
    currentBalance: "Trenutno stanje",
    afterReservation: "Po rezervaciji",
    reservationSafety:
      "Točke bodo zdaj rezervirane. WooCommerce bo asinhrono ustvaril osebni kupon; če izdaja ne uspe, evidenca samodejno sprosti točke.",
    confirmRedemption: "Potrdi unovčenje",
    cancel: "Prekliči",
    manualReward:
      "To nagrado izpolni trgovina neposredno in ni na voljo kot samodejni kupon.",
    notEnoughPoints:
      "Trenutno nimate dovolj razpoložljivih točk za to nagrado.",
    backToAccount: "Nazaj na račun zvestobe",
  },
} as const;
