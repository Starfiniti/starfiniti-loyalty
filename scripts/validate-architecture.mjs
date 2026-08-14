import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const required = new Map([
  [
    "docs/architecture/SYSTEM_ARCHITECTURE.md",
    ["## Trust boundaries", "## Database access roles", "failure rules"],
  ],
  [
    "docs/architecture/DATA_MODEL.md",
    [
      "## Wallet and double-entry ledger",
      "## RLS and privileges",
      "## Transaction",
    ],
  ],
  [
    "docs/architecture/EVENT_MODEL.md",
    ["## Idempotency layers", "## Transactional outbox", "## Reconciliation"],
  ],
  [
    "docs/architecture/IDENTITY_MODEL.md",
    [
      "## Merchant authorization",
      "## Channel claim flow",
      "## Link, merge, and split",
    ],
  ],
  [
    "docs/security/THREAT_MODEL.md",
    ["## Threat/control/test register", "T-001", "T-020", "## Residual risk"],
  ],
  [
    "docs/security/PRIVACY_MODEL.md",
    [
      "## Processing inventory",
      "## Subject rights workflow",
      "## Deletion semantics",
    ],
  ],
  [
    "docs/operations/BACKUP_RESTORE.md",
    ["## Objectives", "## Restore drill", "## Verification queries/gates"],
  ],
  [
    "docs/operations/DEPLOYMENT.md",
    ["## Current Supabase contract", "Envoy", "/auth/v1", "PostgreSQL 17"],
  ],
]);

for (const [relativePath, markers] of required) {
  const content = readFileSync(join(root, relativePath), "utf8");
  if (content.length < 1_000) {
    throw new Error(
      `${relativePath} is too small to be a reviewable Phase 2 model`,
    );
  }
  for (const marker of markers) {
    if (!content.includes(marker)) {
      throw new Error(`${relativePath} is missing required marker: ${marker}`);
    }
  }
  if (/\b(?:TODO|TBD|FIXME)\b/i.test(content)) {
    throw new Error(`${relativePath} contains an unresolved placeholder`);
  }
}

for (const adr of [
  "0005-database-authorization-boundaries.md",
  "0006-double-entry-points-ledger.md",
  "0007-transactional-inbox-outbox.md",
  "0008-broker-workforce-authentik-through-supabase-auth.md",
  "0009-sequential-evidence-gated-enterprise-modules.md",
  "0010-database-authoritative-entitlements.md",
  "0011-versioned-earning-rules-and-authoritative-cap-accounting.md",
  "0012-purpose-bound-merchant-activity-ingestion.md",
  "0013-capability-negotiated-native-reward-fulfilment.md",
  "0016-first-attribution-and-minimized-referral-risk.md",
  "0017-historical-referral-qualification-and-cooling.md",
  "0018-leased-atomic-referral-reward-lifecycle.md",
]) {
  const relativePath = `docs/architecture/ADR/${adr}`;
  const content = readFileSync(join(root, relativePath), "utf8");
  for (const marker of [
    "- Status: Accepted",
    "## Context",
    "## Decision",
    "## Alternatives",
    "## Security and integrity effects",
    "## Operations",
    "## Migration and rollback",
  ]) {
    if (!content.includes(marker)) {
      throw new Error(
        `${relativePath} is missing required ADR marker: ${marker}`,
      );
    }
  }
}

console.log(
  `Validated ${required.size} architecture models and 11 accepted architecture decisions.`,
);
