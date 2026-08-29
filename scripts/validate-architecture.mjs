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

const acceptedAdrs = [
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
  "0019-auth-derived-reversible-referral-review.md",
  "0020-auth-derived-referral-experience-and-fact-sourced-funnel.md",
  "0021-allowlisted-audiences-and-immutable-snapshots.md",
  "0022-explicit-instant-campaign-schedules-and-bound-control-assignment.md",
  "0023-atomic-campaign-capacity-and-attributed-value.md",
  "0024-canonical-campaign-triggers-and-campaign-funded-rewards.md",
  "0025-minimized-campaign-results-and-honest-attribution.md",
  "0026-cumulative-purchase-campaign-refund-compensation.md",
  "0027-derived-fixed-discount-campaign-liability.md",
  "0028-statement-consistent-audience-snapshots.md",
  "0029-database-timed-campaign-lifecycle.md",
  "0030-published-programme-campaign-selector-authority.md",
  "0031-provider-neutral-notification-events-and-local-consent-authority.md",
  "0032-isolated-database-authorized-smtp-delivery.md",
  "0033-tenant-bound-klaviyo-projection-and-consent-sync.md",
  "0034-standard-hmac-webhooks-with-pinned-public-destinations.md",
  "0035-immutable-tenant-email-templates-and-actor-bound-tests.md",
  "0037-demand-driven-woocommerce-snapshots-and-classic-placements.md",
  "0038-namespaced-store-api-and-flagged-blocks-panel.md",
  "0039-controlled-english-presentation-v2-and-degraded-delivery.md",
  "0040-ledger-sourced-versioned-analytics-and-explicit-liability-valuation.md",
  "0081-fail-closed-self-hosted-supabase-compatibility.md",
  "0082-request-bound-dashboard-content-security-policy.md",
  "0084-bounded-provider-source-provenance-snapshots.md",
  "0089-minimized-whole-host-proxmox-consumer-inventory.md",
  "0090-isolated-whole-host-proxmox-compatibility-rehearsal.md",
  "0097-source-and-origin-bound-prototype-messages-and-minimized-sast-evidence.md",
];

for (const adr of acceptedAdrs) {
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
  `Validated ${required.size} architecture models and ${acceptedAdrs.length} accepted architecture decisions.`,
);
