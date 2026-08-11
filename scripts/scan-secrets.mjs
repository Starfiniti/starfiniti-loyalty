import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const suspicious = [
  "SUPABASE_SECRET_KEY=ey",
  "SUPABASE_SERVICE_ROLE_KEY=ey",
  "consumer_secret=ck_",
  "whsec_",
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
    if (content.includes(marker)) leaks.push(`${file}: ${marker}`);
  }
}

if (leaks.length > 0) {
  console.error(`Potential committed secrets:\n${leaks.join("\n")}`);
  process.exit(1);
}

console.log(`Secret scan passed (${files.length} tracked files).`);
