import { readFileSync } from "node:fs";

const capabilityKeys = [
  "core.balance_read",
  "core.refund",
  "core.reconciliation",
  "core.checkout_independence",
  "core.export",
  "core.promised_reward_redemption",
  "programme.v2",
  "rewards.expanded",
  "vip.advanced",
  "referrals",
  "campaigns",
  "notifications",
  "storefront.experience",
  "analytics",
  "ecosystem.api",
  "migration",
  "enterprise.identity",
  "managed.billing",
];
const protectedKeys = capabilityKeys.filter((key) => key.startsWith("core."));
const migration = readFileSync(
  "supabase/migrations/20260813190000_deployment_entitlements.sql",
  "utf8",
);
const contract = readFileSync("packages/contracts/src/entitlements.ts", "utf8");
const adapter = readFileSync(
  "apps/dashboard/lib/server/entitlements.ts",
  "utf8",
);
const databaseTest = readFileSync(
  "supabase/tests/deployment_entitlements_test.sql",
  "utf8",
);

for (const key of capabilityKeys) {
  if (!contract.includes(`"${key}"`) || !migration.includes(`'${key}'`)) {
    throw new Error(`Entitlement capability is not synchronized: ${key}`);
  }
}
for (const key of protectedKeys) {
  const escaped = key.replaceAll(".", "\\.");
  if (
    !new RegExp(`\\(1, '${escaped}', [^\\n]+, true, true, true,`).test(
      migration,
    )
  ) {
    throw new Error(`Protected capability is not always enabled: ${key}`);
  }
}
if (
  !migration.includes(
    "(1, 'managed.billing', 'Managed billing', false, false, false,",
  )
) {
  throw new Error("Self-hosted mode must not enable managed billing");
}
for (const marker of [
  "protected value path cannot be disabled",
  "protected value path cannot be rolled back",
  "loyalty_private.is_organization_member",
  "target_organization.public_id::text",
]) {
  if (!migration.includes(marker)) {
    throw new Error(`Entitlement authority is missing marker: ${marker}`);
  }
}
if (/\b(?:fetch|XMLHttpRequest|https?:\/\/|stripe)\b/iu.test(adapter)) {
  throw new Error(
    "Entitlement resolution must use the local database and make no provider request",
  );
}

for (const manifestPath of [
  "package.json",
  "apps/dashboard/package.json",
  "apps/worker/package.json",
  "packages/contracts/package.json",
  "packages/database/package.json",
  "packages/domain/package.json",
]) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
  };
  if (
    Object.keys(dependencies).some((name) =>
      name.toLowerCase().includes("stripe"),
    )
  ) {
    throw new Error(
      `Self-hosted runtime includes a Stripe dependency: ${manifestPath}`,
    );
  }
}

if (!/select plan\(46\);/u.test(databaseTest)) {
  throw new Error("M02 must retain its 46-assertion database test gate");
}

console.log(
  `Validated ${capabilityKeys.length} synchronized capabilities, ${protectedKeys.length} protected value paths, and the no-provider self-hosted runtime boundary.`,
);
