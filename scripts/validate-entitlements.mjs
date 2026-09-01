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
const expectedAuthoringBoundaries = new Map([
  ["programme.root", "loyalty.programmes|programme.v2"],
  ["programme.version", "loyalty.programme_versions|programme.v2"],
  ["experience.theme", "loyalty.experience_themes|storefront.experience"],
  ["experience.copy", "loyalty.experience_translations|storefront.experience"],
  ["vip.manual_override", "loyalty.tier_manual_overrides|vip.advanced"],
  ["campaign.audience", "loyalty.audiences|campaigns"],
  ["campaign.audience_version", "loyalty.audience_versions|campaigns"],
  ["campaign.audience_snapshot", "loyalty.audience_snapshots|campaigns"],
  ["campaign.root", "loyalty.campaigns|campaigns"],
  ["campaign.version", "loyalty.campaign_versions|campaigns"],
  [
    "notification.template_version",
    "loyalty_private.notification_email_template_versions|notifications",
  ],
  [
    "notification.template_binding",
    "loyalty_private.notification_email_template_bindings|notifications",
  ],
  [
    "notification.test_delivery",
    "loyalty_private.notification_smtp_test_deliveries|notifications",
  ],
  [
    "notification.webhook_endpoint",
    "loyalty_private.notification_webhook_endpoints|notifications",
  ],
  ["analytics.report_schedule", "loyalty.analytics_report_schedules|analytics"],
  [
    "ecosystem.sharing_policy",
    "loyalty.programme_group_sharing_versions|ecosystem.api",
  ],
  [
    "ecosystem.currency_policy",
    "loyalty_private.currency_conversion_policy_versions|ecosystem.api",
  ],
  ["ecosystem.service_account", "loyalty.service_accounts|ecosystem.api"],
  [
    "ecosystem.service_credential",
    "loyalty_private.service_account_credentials|ecosystem.api",
  ],
  [
    "identity.federation_revision",
    "loyalty.organization_federation_source_revisions|enterprise.identity",
  ],
  [
    "identity.scim_endpoint_create",
    "loyalty.organization_scim_endpoints|enterprise.identity",
  ],
  ["migration.dry_run", "loyalty.migration_dry_runs|migration"],
  ["migration.import_batch", "loyalty.migration_import_batches|migration"],
]);
const expectedAuthoringCapabilities = new Set([
  "programme.v2",
  "storefront.experience",
  "vip.advanced",
  "campaigns",
  "notifications",
  "analytics",
  "ecosystem.api",
  "enterprise.identity",
  "migration",
]);

const sourcePaths = Object.freeze({
  entitlementMigration:
    "supabase/migrations/20260813190000_deployment_entitlements.sql",
  contract: "packages/contracts/src/entitlements.ts",
  adapter: "apps/dashboard/lib/server/entitlements.ts",
  entitlementTest: "supabase/tests/deployment_entitlements_test.sql",
  growthBoundarySql:
    "supabase/migrations/20260827050000_managed_billing_growth_configuration_enforcement.sql",
  storefrontGuardSql:
    "supabase/migrations/20260901150526_storefront_experience_entitlement_enforcement.sql",
  storefrontTest: "supabase/tests/experience_themes_test.sql",
  storefrontPage: "apps/dashboard/app/experience/page.tsx",
  storefrontActions: "apps/dashboard/app/experience/actions.ts",
  notificationAccess: "apps/dashboard/app/notifications/notification-access.ts",
  notificationAccessTest:
    "apps/dashboard/app/notifications/notification-access.test.ts",
  notificationRenderTest:
    "apps/dashboard/app/notifications/template-studio.test.tsx",
  notificationWebhookPanel:
    "apps/dashboard/app/notifications/webhook-endpoints-panel.tsx",
});

function fail(message) {
  throw new Error(message);
}

function requireMarkers(document, markers, label) {
  for (const marker of markers) {
    if (!document.includes(marker)) {
      fail(`${label} is missing marker: ${marker}`);
    }
  }
}

function readSources() {
  return Object.fromEntries(
    Object.entries(sourcePaths).map(([key, path]) => [
      key,
      readFileSync(path, "utf8"),
    ]),
  );
}

function parseAuthoringBoundaries(document) {
  const start = document.indexOf(") values");
  const end = document.indexOf(
    "create or replace function loyalty_private.evaluate_managed_growth_boundary_v1",
  );
  if (start < 0 || end <= start) fail("authoring boundary inventory is absent");
  const inventory = document.slice(start, end);
  const pattern =
    /\(\s*'([^']+)'\s*,\s*'(loyalty(?:_private)?)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'/gu;
  const boundaries = new Map();
  for (const match of inventory.matchAll(pattern)) {
    const [, key, schema, relation, capability] = match;
    if (boundaries.has(key)) fail(`duplicate authoring boundary: ${key}`);
    boundaries.set(key, `${schema}.${relation}|${capability}`);
  }
  return boundaries;
}

function validateSources(sources) {
  for (const key of capabilityKeys) {
    if (
      !sources.contract.includes(`"${key}"`) ||
      !sources.entitlementMigration.includes(`'${key}'`)
    ) {
      fail(`Entitlement capability is not synchronized: ${key}`);
    }
  }
  for (const key of protectedKeys) {
    const escaped = key.replaceAll(".", "\\.");
    if (
      !new RegExp(`\\(1, '${escaped}', [^\\n]+, true, true, true,`).test(
        sources.entitlementMigration,
      )
    ) {
      fail(`Protected capability is not always enabled: ${key}`);
    }
  }
  if (
    !sources.entitlementMigration.includes(
      "(1, 'managed.billing', 'Managed billing', false, false, false,",
    )
  ) {
    fail("Self-hosted mode must not enable managed billing");
  }
  requireMarkers(
    sources.entitlementMigration,
    [
      "protected value path cannot be disabled",
      "protected value path cannot be rolled back",
      "loyalty_private.is_organization_member",
      "target_organization.public_id::text",
    ],
    "entitlement authority",
  );
  if (
    /\b(?:fetch|XMLHttpRequest|https?:\/\/|stripe)\b/iu.test(sources.adapter)
  ) {
    fail(
      "Entitlement resolution must use the local database and make no provider request",
    );
  }
  if (!/select plan\(46\);/u.test(sources.entitlementTest)) {
    fail("M02 must retain its 46-assertion database test gate");
  }

  const boundaries = parseAuthoringBoundaries(sources.growthBoundarySql);
  if (boundaries.size !== expectedAuthoringBoundaries.size) {
    fail("authoring mutation-root inventory size differs");
  }
  for (const [key, expected] of expectedAuthoringBoundaries) {
    if (boundaries.get(key) !== expected) {
      fail(`authoring mutation-root boundary differs: ${key}`);
    }
  }
  const authoringCapabilities = new Set(
    [...boundaries.values()].map((value) => value.split("|")[1]),
  );
  if (
    authoringCapabilities.size !== expectedAuthoringCapabilities.size ||
    [...expectedAuthoringCapabilities].some(
      (capability) => !authoringCapabilities.has(capability),
    ) ||
    [...authoringCapabilities].some((capability) =>
      capability.startsWith("core."),
    )
  ) {
    fail(
      "authoring capability inventory differs or includes a protected value path",
    );
  }
  requireMarkers(
    sources.growthBoundarySql,
    [
      "('notification.webhook_endpoint', 'loyalty_private'",
      "array['disabled','retired']",
      "('analytics.report_schedule', 'loyalty'",
      "array['paused']",
      "safe risk-reducing transitions remain available",
    ],
    "risk-reducing authoring boundary",
  );

  requireMarkers(
    sources.storefrontGuardSql,
    [
      "loyalty_private.resolve_organization_entitlement",
      "'storefront.experience'",
      "storefront experience capability disabled",
      "zy_storefront_entitlement_experience_themes",
      "zy_storefront_entitlement_experience_translations",
    ],
    "storefront persistence entitlement",
  );
  requireMarkers(
    sources.storefrontTest,
    [
      "select plan(76);",
      "disabled capability rejects legacy theme authoring",
      "disabled capability rejects V2 theme authoring",
      "disabled capability rejects English copy authoring",
      "denied authoring leaves the existing theme revision unchanged",
      "explicit tenant canary enables V2 theme authoring",
      "a later disable decision stops new copy authoring",
    ],
    "storefront entitlement regression test",
  );
  requireMarkers(
    sources.storefrontPage,
    [
      'hasEntitlement(entitlementResult.value, "storefront.experience")',
      "const canEdit = canAdminister && storefrontExperienceEnabled;",
      "Customer experience authoring is disabled",
      "Existing theme and copy remain visible",
      "canEdit={canEdit}",
    ],
    "storefront merchant presentation",
  );
  requireMarkers(
    sources.storefrontActions,
    [
      "storefront experience capability disabled",
      "Customer experience authoring is disabled for this organization.",
    ],
    "storefront stale-command handling",
  );

  requireMarkers(
    sources.notificationAccess,
    [
      "if (!canManage)",
      "if (!entitlementEnabled)",
      "authoringEnabled: false",
      "lifecycleEnabled: true",
      'deploymentMode === "self_hosted"',
      "SMTP test delivery is available only in self-hosted mode.",
    ],
    "notification authoring access model",
  );
  requireMarkers(
    sources.notificationAccessTest,
    [
      "keeps safe lifecycle controls while rollout authoring is disabled",
      "does not grant lifecycle authority from entitlement alone",
      "keeps managed template authoring but withholds the self-hosted SMTP test",
      "expect(access.lifecycleEnabled).toBe(true)",
      "expect(access.testDeliveryEnabled).toBe(false)",
    ],
    "notification access regression test",
  );
  requireMarkers(
    sources.notificationRenderTest,
    [
      "renders disabled rollout as read-only without hiding existing content",
      'expect(html.match(/disabled=""/gu)).toHaveLength(4)',
      "keeps managed publication editable but disables self-hosted SMTP test",
      'expect(html.match(/disabled=""/gu)).toHaveLength(1)',
    ],
    "notification rendered-markup regression test",
  );
  requireMarkers(
    sources.notificationWebhookPanel,
    [
      "access.authoringEnabled ?",
      "canManage={access.lifecycleEnabled}",
      "canRotate={access.authoringEnabled}",
    ],
    "notification endpoint presentation",
  );
}

function validateRuntimeManifests() {
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
      fail(`Self-hosted runtime includes a Stripe dependency: ${manifestPath}`);
    }
  }
}

function selfTest(sources) {
  const cases = [
    [
      "catalogue capability drift",
      (value) =>
        (value.contract = value.contract.replace(
          '"notifications"',
          '"notice"',
        )),
    ],
    [
      "authoring root omission",
      (value) =>
        (value.growthBoundarySql = value.growthBoundarySql.replace(
          "'migration.import_batch'",
          "'migration.import_removed'",
        )),
    ],
    [
      "protected value authoring boundary",
      (value) =>
        (value.growthBoundarySql = value.growthBoundarySql.replace(
          "'programme.v2'",
          "'core.balance_read'",
        )),
    ],
    [
      "storefront persistence trigger omission",
      (value) =>
        (value.storefrontGuardSql = value.storefrontGuardSql.replace(
          "zy_storefront_entitlement_experience_themes",
          "removed_storefront_trigger",
        )),
    ],
    [
      "storefront denial regression omission",
      (value) =>
        (value.storefrontTest = value.storefrontTest.replace(
          "disabled capability rejects V2 theme authoring",
          "removed denial case",
        )),
    ],
    [
      "storefront UI entitlement bypass",
      (value) =>
        (value.storefrontPage = value.storefrontPage.replace(
          "const canEdit = canAdminister && storefrontExperienceEnabled;",
          "const canEdit = canAdminister;",
        )),
    ],
    [
      "notification safe shutdown omission",
      (value) =>
        (value.notificationAccessTest = value.notificationAccessTest.replaceAll(
          "expect(access.lifecycleEnabled).toBe(true)",
          "expect(access.lifecycleEnabled).toBe(false)",
        )),
    ],
    [
      "managed SMTP presentation drift",
      (value) =>
        (value.notificationAccess = value.notificationAccess.replace(
          'deploymentMode === "self_hosted"',
          "true",
        )),
    ],
    [
      "notification endpoint lifecycle collapse",
      (value) =>
        (value.notificationWebhookPanel =
          value.notificationWebhookPanel.replace(
            "canManage={access.lifecycleEnabled}",
            "canManage={access.authoringEnabled}",
          )),
    ],
    [
      "rendered disabled controls erased",
      (value) =>
        (value.notificationRenderTest = value.notificationRenderTest.replace(
          "toHaveLength(4)",
          "toHaveLength(0)",
        )),
    ],
    [
      "remote entitlement authority",
      (value) => (value.adapter = `${value.adapter}\nfetch('https://invalid')`),
    ],
  ];
  for (const [label, mutate] of cases) {
    const candidate = structuredClone(sources);
    mutate(candidate);
    let rejected = false;
    try {
      validateSources(candidate);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test accepted ${label}`);
  }
  return cases.length;
}

const args = process.argv.slice(2);
if (args.some((argument) => argument !== "--self-test")) {
  fail("usage: node scripts/validate-entitlements.mjs [--self-test]");
}
const sources = readSources();
validateSources(sources);
validateRuntimeManifests();
const caseCount = args.includes("--self-test") ? selfTest(sources) : 0;
console.log(
  `Validated ${capabilityKeys.length} synchronized capabilities, ${protectedKeys.length} protected value paths, ${expectedAuthoringBoundaries.size} authoring mutation roots across ${expectedAuthoringCapabilities.size} capabilities, and the no-provider self-hosted runtime boundary${caseCount ? ` with ${caseCount} adversarial cases` : ""}.`,
);
