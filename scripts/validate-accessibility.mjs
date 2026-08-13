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
]) {
  if (!required.test(styles)) {
    throw new Error(`Accessibility CSS guard is missing: ${required}`);
  }
}

console.log(
  `Validated keyboard bypass targets on ${mainSources.length} route surfaces, focus visibility, reduced-motion coverage, and shrinkable authentication cards.`,
);
