import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const suspicious = [
  {
    label: "SUPABASE_SECRET_KEY=ey",
    pattern: /SUPABASE_SECRET_KEY=ey/u,
  },
  {
    label: "SUPABASE_SERVICE_ROLE_KEY=ey",
    pattern: /SUPABASE_SERVICE_ROLE_KEY=ey/u,
  },
  { label: "consumer_secret=ck_", pattern: /consumer_secret=ck_/u },
  {
    label: "whsec_<base64-secret>",
    pattern: /whsec_[A-Za-z0-9+/]{32,}={0,2}/u,
  },
];

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split(/\r?\n/u)
  .filter(Boolean);

const leaks = [];
for (const file of files) {
  if (file.startsWith("docs/design/prototype-source/")) continue;
  if (file === "scripts/scan-secrets.mjs") continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const marker of suspicious) {
    if (marker.pattern.test(content)) leaks.push(`${file}: ${marker.label}`);
  }
}

if (leaks.length > 0) {
  console.error(`Potential committed secrets:\n${leaks.join("\n")}`);
  process.exit(1);
}

console.log(`Secret scan passed (${files.length} tracked files).`);
