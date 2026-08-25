import { readFileSync } from "node:fs";

const mainSources = [
  "apps/dashboard/app/page.tsx",
  "apps/dashboard/app/login/page.tsx",
  "apps/dashboard/app/programme/page.tsx",
  "apps/dashboard/app/programme/programme-section-page.tsx",
  "apps/dashboard/app/customers/page.tsx",
  "apps/dashboard/app/customers/bulk/page.tsx",
  "apps/dashboard/app/customers/[customerId]/page.tsx",
  "apps/dashboard/app/operations/page.tsx",
  "apps/dashboard/app/experience/page.tsx",
  "apps/dashboard/app/loyalty/[workspaceId]/[programmeId]/page.tsx",
  "apps/dashboard/app/claim/woocommerce/page.tsx",
  "apps/dashboard/app/account/loyalty/page.tsx",
  "apps/dashboard/app/account/loyalty/redeem/page.tsx",
  "apps/dashboard/app/account/loyalty/customer-loyalty-experience.tsx",
  "apps/dashboard/components/dashboard-overview.tsx",
];

for (const file of mainSources) {
  const source = readFileSync(file, "utf8");
  const mainTags = source.match(/<main\b[^>]*>/gu) ?? [];
  if (mainTags.length === 0) throw new Error(`${file} has no main landmark.`);
  for (const mainTag of mainTags) {
    if (!/\bid="main-content"/u.test(mainTag)) {
      throw new Error(`${file} has a main landmark without the skip target.`);
    }
    if (!/\btabIndex=\{-1\}/u.test(mainTag)) {
      throw new Error(`${file} has a skip target that cannot receive focus.`);
    }
  }
}

const layout = readFileSync("apps/dashboard/app/layout.tsx", "utf8");
if (!/className="skip-link"[^>]*href="#main-content"/u.test(layout)) {
  throw new Error("The shared layout must provide a main-content skip link.");
}

const styles = readFileSync("apps/dashboard/app/globals.css", "utf8");
for (const required of [
  /\.skip-link:focus-visible/u,
  /@media \(prefers-reduced-motion: reduce\)/u,
  /textarea:focus-visible/u,
  /\.login-card,\s*\.access-card\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*430px;[^}]*min-width:\s*0;/u,
  /\.member-hub-v2 :where\(a, button\):focus-visible/u,
  /\.public-loyalty-v2 :where\(a, button\):focus-visible/u,
  /html\[data-dashboard-theme="dark"\][\s\S]*?\.experience-editor-v2[\s\S]*?\.experience-fields[\s\S]*?select,/u,
  /html\[data-dashboard-theme="dark"\][\s\S]*?\.experience-editor-v2[\s\S]*?\.experience-visibility-grid[\s\S]*?label[\s\S]*?strong,/u,
  /html\[data-dashboard-theme="dark"\][\s\S]*?\.experience-preview-v2[\s\S]*?\.experience-preview-toolbar[\s\S]*?button\[aria-pressed="true"\]/u,
  /@media \(max-width: 420px\)/u,
]) {
  if (!required.test(styles)) {
    throw new Error(`Accessibility CSS guard is missing: ${required}`);
  }
}

const memberExperience = readFileSync(
  "apps/dashboard/app/account/loyalty/customer-loyalty-experience.tsx",
  "utf8",
);
for (const required of [
  /visibleCustomerExperienceSections\(theme\)/u,
  /visibleSections\.map\(\(section\)\s*=>/u,
  /<MemberNavigation mobile sections=\{visibleSections\}/u,
  /aria-label="Loyalty sections"/u,
]) {
  if (!required.test(memberExperience)) {
    throw new Error(`Customer composition guard is missing: ${required}`);
  }
}
if (/member-hub-orb/u.test(memberExperience)) {
  throw new Error("The customer experience must not restore CSS-drawn assets.");
}

const experienceEditor = readFileSync(
  "apps/dashboard/app/experience/experience-editor.tsx",
  "utf8",
);
for (const required of [
  /aria-label=\{`\$\{t\("Move"\)\}/u,
  /aria-pressed=\{surface === value\}/u,
  /aria-pressed=\{viewport === "mobile"\}/u,
  /aria-pressed=\{previewState === value\}/u,
  /visibleCustomerExperienceSections\(theme\)/u,
]) {
  if (!required.test(experienceEditor)) {
    throw new Error(
      `Experience editor accessibility guard is missing: ${required}`,
    );
  }
}

const customerLocale = readFileSync(
  "apps/dashboard/lib/customer-locale.ts",
  "utf8",
);
if (
  !/resolveCustomerLocale[\s\S]*?return "en";/u.test(customerLocale) ||
  !/target\.searchParams\.delete\("lang"\)/u.test(customerLocale)
) {
  throw new Error(
    "Customer navigation must remain English-only without lang selectors.",
  );
}

console.log(
  `Validated keyboard bypass targets on ${mainSources.length} route surfaces, controlled composition, English-only customer navigation, focus visibility, 320px reflow guards, reduced-motion coverage, and shrinkable authentication cards.`,
);
