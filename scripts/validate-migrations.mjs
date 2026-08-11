import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const directory = "supabase/migrations";
const migrations = readdirSync(directory)
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (migrations.length === 0)
  throw new Error("At least one migration is required.");

for (const file of migrations) {
  if (!/^\d{14}_[a-z0-9_]+\.sql$/u.test(file)) {
    throw new Error(`Invalid migration filename: ${file}`);
  }
  const sql = readFileSync(join(directory, file), "utf8");
  if (/service_role|secret_key|password\s*=/iu.test(sql)) {
    throw new Error(`Possible credential in migration: ${file}`);
  }
}

console.log(`Validated ${migrations.length} migration file(s).`);

const configPath = "supabase/config.toml";
const config = readFileSync(configPath, "utf8");
const dbBlock = config.match(/\[db\]([\s\S]*?)(?=\n\[|$)/u)?.[1] ?? "";
const apiBlock = config.match(/\[api\]([\s\S]*?)(?=\n\[|$)/u)?.[1] ?? "";

if (!/major_version\s*=\s*17/u.test(dbBlock)) {
  throw new Error(
    "supabase/config.toml must pin local Postgres major_version = 17",
  );
}

if (!/schemas\s*=\s*\[[^\]]*"public"[^\]]*\]/u.test(apiBlock)) {
  throw new Error("Supabase Data API must explicitly expose public");
}

if (!/schemas\s*=\s*\[[^\]]*"loyalty"[^\]]*\]/u.test(apiBlock)) {
  throw new Error("Supabase Data API must explicitly expose loyalty");
}

if (/schemas\s*=\s*\[[^\]]*"loyalty_private"[^\]]*\]/u.test(apiBlock)) {
  throw new Error("loyalty_private must never be exposed through the Data API");
}

const testsDirectory = "supabase/tests";
if (!existsSync(testsDirectory)) {
  throw new Error("Supabase pgTAP tests directory is required");
}

const databaseTests = readdirSync(testsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (databaseTests.length === 0) {
  throw new Error("At least one Supabase pgTAP test is required");
}

for (const file of databaseTests) {
  const sql = readFileSync(join(testsDirectory, file), "utf8");
  for (const required of [
    /\bbegin\s*;/iu,
    /\bselect\s+plan\s*\(/iu,
    /\bfinish\s*\(\s*\)/iu,
    /\brollback\s*;/iu,
  ]) {
    if (!required.test(sql)) {
      throw new Error(
        `${file} is missing required transactional pgTAP structure: ${required}`,
      );
    }
  }
}

console.log(
  `Validated Supabase config and ${databaseTests.length} pgTAP test file(s).`,
);
