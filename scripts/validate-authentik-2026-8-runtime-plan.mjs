import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultPlan = join(
  root,
  "infrastructure/testing/authentik-2026-8-runtime/plan.yaml",
);
const digest = /^sha256:[0-9a-f]{64}$/u;
const imageRef = /^[a-z0-9./_-]+@sha256:[0-9a-f]{64}$/u;
const scenarioIds = Object.freeze([
  "R01-EXACT-IMAGE-IDENTITY",
  "R02-ISOLATED-BOOT-AND-HEALTH",
  "R03-OIDC-DISABLED-RECONCILIATION",
  "R04-IDEMPOTENT-SECRET-ROTATION",
  "R05-SAML-DISABLED-RECONCILIATION",
  "R06-DOWNSTREAM-OIDC-INVARIANTS",
  "R07-DOWNSTREAM-OIDC-DISCOVERY",
  "R08-SCIM-BEARER-FAIL-CLOSED",
  "R09-SCIM-DISCOVERY-AND-PAGINATION",
  "R10-SCIM-USER-GROUP-PROVISIONING",
  "R11-SCIM-GROUP-MEMBERSHIP",
  "R12-SCIM-MEMBERSHIP-REMOVAL",
  "R13-SCIM-DEPROVISIONING",
  "R14-TEARDOWN-AND-MINIMIZATION",
]);

function fail(message) {
  throw new Error(`Authentik 2026.8 runtime plan invalid: ${message}`);
}

function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  assert.deepEqual(
    Object.keys(record(value, label)).sort(),
    [...expected].sort(),
    `${label} keys differ`,
  );
}

function exactArray(value, expected, label) {
  assert.deepEqual(value, expected, `${label} differs`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function planDigest(planBytes) {
  return sha256(planBytes);
}

export function validateAuthentikRuntimePlan(plan) {
  exactKeys(
    plan,
    [
      "schema",
      "reviewedAt",
      "candidate",
      "dependencies",
      "isolation",
      "runtime",
      "scenarios",
      "report",
      "officialSources",
      "limitations",
    ],
    "plan",
  );
  if (
    plan.schema !== "starfiniti.authentik-2026-8-runtime-plan.v1" ||
    plan.reviewedAt !== "2026-08-31"
  ) {
    fail("schema or review date differs");
  }

  exactKeys(plan.candidate, ["version", "commit", "image"], "candidate");
  exactKeys(
    plan.candidate.image,
    ["ref", "indexDigest", "linuxAmd64ManifestDigest"],
    "candidate image",
  );
  if (
    plan.candidate.version !== "2026.8.0" ||
    plan.candidate.commit !== "f3753ec20ce13ef672401a131379d1a5a2d3439b" ||
    !imageRef.test(plan.candidate.image.ref) ||
    !digest.test(plan.candidate.image.indexDigest) ||
    !digest.test(plan.candidate.image.linuxAmd64ManifestDigest) ||
    !plan.candidate.image.ref.endsWith(
      plan.candidate.image.linuxAmd64ManifestDigest,
    )
  ) {
    fail("candidate identity is not exact");
  }

  exactKeys(plan.dependencies, ["postgres", "operator"], "dependencies");
  for (const [id, dependency] of Object.entries(plan.dependencies)) {
    exactKeys(
      dependency,
      ["version", "ref", "linuxAmd64ManifestDigest"],
      `${id} dependency`,
    );
    if (
      typeof dependency.version !== "string" ||
      !imageRef.test(dependency.ref) ||
      !digest.test(dependency.linuxAmd64ManifestDigest) ||
      !dependency.ref.endsWith(dependency.linuxAmd64ManifestDigest)
    ) {
      fail(`${id} dependency is not digest-bound`);
    }
  }

  exactKeys(
    plan.isolation,
    [
      "networkInternal",
      "publishedHostPorts",
      "dockerSocketMounted",
      "hostBindMounts",
      "productionRoutesAllowed",
      "productionCredentialsAllowed",
      "syntheticCredentialsOnly",
      "removeContainersAndNetworkAlways",
      "pullImagesBeforeIsolation",
    ],
    "isolation",
  );
  if (
    plan.isolation.networkInternal !== true ||
    plan.isolation.publishedHostPorts !== 0 ||
    plan.isolation.dockerSocketMounted !== false ||
    plan.isolation.productionRoutesAllowed !== false ||
    plan.isolation.productionCredentialsAllowed !== false ||
    plan.isolation.syntheticCredentialsOnly !== true ||
    plan.isolation.removeContainersAndNetworkAlways !== true ||
    plan.isolation.pullImagesBeforeIsolation !== true
  ) {
    fail("fail-closed isolation controls differ");
  }
  exactArray(
    plan.isolation.hostBindMounts,
    ["repository source files read-only"],
    "host bind mounts",
  );

  exactKeys(
    plan.runtime,
    [
      "platform",
      "startupTimeoutSeconds",
      "scenarioTimeoutSeconds",
      "maximumReportBytes",
      "reportPathPattern",
      "authentikHealthPaths",
      "authentikApiOrigin",
      "scimBaseUrl",
      "supabaseCallbackUrl",
    ],
    "runtime",
  );
  if (
    plan.runtime.platform !== "linux/amd64" ||
    plan.runtime.startupTimeoutSeconds !== 300 ||
    plan.runtime.scenarioTimeoutSeconds !== 180 ||
    plan.runtime.maximumReportBytes !== 65_536 ||
    plan.runtime.reportPathPattern !==
      "dist/authentik-2026-8-runtime/[a-z0-9][a-z0-9._-]{1,79}.json" ||
    plan.runtime.authentikApiOrigin !==
      "http://authentik-runtime-server:9000" ||
    plan.runtime.scimBaseUrl !== "http://scim-runtime-sink:8080/v2" ||
    plan.runtime.supabaseCallbackUrl !==
      "https://supabase.runtime.invalid/auth/v1/callback"
  ) {
    fail("runtime boundary differs");
  }
  exactArray(
    plan.runtime.authentikHealthPaths,
    ["/-/health/live/", "/-/health/ready/"],
    "health paths",
  );

  if (!Array.isArray(plan.scenarios) || plan.scenarios.length !== 14) {
    fail("exactly fourteen scenarios are required");
  }
  exactArray(
    plan.scenarios.map((scenario) => {
      exactKeys(scenario, ["id", "proves"], `scenario ${scenario?.id}`);
      if (typeof scenario.proves !== "string" || scenario.proves.length < 30) {
        fail(`scenario ${scenario.id} has no measurable proof statement`);
      }
      return scenario.id;
    }),
    scenarioIds,
    "scenario IDs",
  );

  exactKeys(
    plan.report,
    ["schema", "minimumPassedScenarios", "forbiddenKeys", "forbiddenValues"],
    "report",
  );
  if (
    plan.report.schema !== "starfiniti.authentik-2026-8-runtime-report.v1" ||
    plan.report.minimumPassedScenarios !== scenarioIds.length
  ) {
    fail("report pass threshold differs");
  }
  exactArray(
    plan.report.forbiddenKeys,
    [
      "token",
      "secret",
      "password",
      "email",
      "username",
      "name",
      "raw",
      "body",
      "response",
    ],
    "forbidden report keys",
  );
  exactArray(
    plan.report.forbiddenValues,
    [
      "loyalty.starfiniti.com",
      "auth.starfiniti.com",
      "api.loyalty.starfiniti.com",
    ],
    "forbidden report values",
  );
  exactArray(
    plan.officialSources,
    [
      "https://docs.goauthentik.io/install-config/automated-install/",
      "https://docs.goauthentik.io/install-config/install/docker-compose/",
      "https://docs.goauthentik.io/add-secure-apps/providers/scim/",
      "https://docs.goauthentik.io/releases/2026.8/",
      "https://supabase.com/docs/guides/self-hosting/self-hosted-oauth",
      "https://supabase.com/docs/guides/auth/sessions",
    ],
    "official sources",
  );
  if (
    !Array.isArray(plan.limitations) ||
    plan.limitations.length !== 4 ||
    !plan.limitations.some((item) => item.includes("Must not change any M13"))
  ) {
    fail("honest limitations are required");
  }
  return true;
}

export function validateAuthentikRuntimeReport(report, plan) {
  exactKeys(
    report,
    [
      "schema",
      "planSha256",
      "candidateCommit",
      "candidateVersion",
      "platform",
      "imageDigests",
      "scenarios",
      "summary",
      "limitations",
    ],
    "runtime report",
  );
  if (
    report.schema !== plan.report.schema ||
    !/^[0-9a-f]{64}$/u.test(report.planSha256) ||
    report.candidateCommit !== plan.candidate.commit ||
    report.candidateVersion !== plan.candidate.version ||
    report.platform !== plan.runtime.platform
  ) {
    fail("runtime report identity differs");
  }
  exactKeys(
    report.imageDigests,
    ["authentik", "postgres", "operator"],
    "runtime image digests",
  );
  const expectedDigests = {
    authentik: plan.candidate.image.linuxAmd64ManifestDigest,
    postgres: plan.dependencies.postgres.linuxAmd64ManifestDigest,
    operator: plan.dependencies.operator.linuxAmd64ManifestDigest,
  };
  assert.deepEqual(
    report.imageDigests,
    expectedDigests,
    "image digests differ",
  );
  if (!Array.isArray(report.scenarios))
    fail("report scenarios must be an array");
  exactArray(
    report.scenarios.map((scenario) => {
      exactKeys(scenario, ["id", "status", "checks"], `report ${scenario?.id}`);
      if (
        scenario.status !== "passed" ||
        !Number.isSafeInteger(scenario.checks) ||
        scenario.checks < 1
      ) {
        fail(`report scenario ${scenario.id} did not pass deterministically`);
      }
      return scenario.id;
    }),
    scenarioIds,
    "report scenario IDs",
  );
  exactKeys(
    report.summary,
    [
      "passed",
      "failed",
      "federationResources",
      "flowBindings",
      "scimOperations",
      "scimAuthorizationRejects",
    ],
    "report summary",
  );
  if (
    report.summary.passed !== scenarioIds.length ||
    report.summary.failed !== 0 ||
    report.summary.federationResources !== 2 ||
    report.summary.flowBindings !== 4 ||
    !Number.isSafeInteger(report.summary.scimOperations) ||
    report.summary.scimOperations < 12 ||
    !Number.isSafeInteger(report.summary.scimAuthorizationRejects) ||
    report.summary.scimAuthorizationRejects < 1
  ) {
    fail("runtime report summary does not meet the exact gate");
  }
  exactArray(report.limitations, plan.limitations, "report limitations");

  const lowerForbiddenKeys = new Set(plan.report.forbiddenKeys);
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (typeof value !== "object" || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      if (lowerForbiddenKeys.has(key.toLowerCase())) {
        fail(`forbidden report key ${key}`);
      }
      walk(child);
    }
  };
  walk(report);
  const serialized = JSON.stringify(report).toLowerCase();
  for (const forbidden of plan.report.forbiddenValues) {
    if (serialized.includes(forbidden.toLowerCase())) {
      fail(`forbidden report value ${forbidden}`);
    }
  }
  if (Buffer.byteLength(serialized, "utf8") > plan.runtime.maximumReportBytes) {
    fail("runtime report exceeds the size bound");
  }
  return true;
}

function loadPlan(path = defaultPlan) {
  const bytes = readFileSync(path);
  return { bytes, plan: YAML.parse(bytes.toString("utf8")) };
}

function selfTest() {
  const { bytes, plan } = loadPlan();
  validateAuthentikRuntimePlan(plan);
  assert.match(planDigest(bytes), /^[0-9a-f]{64}$/u);

  const clone = structuredClone(plan);
  clone.isolation.networkInternal = false;
  assert.throws(
    () => validateAuthentikRuntimePlan(clone),
    /fail-closed isolation controls/u,
  );

  const report = {
    schema: plan.report.schema,
    planSha256: planDigest(bytes),
    candidateCommit: plan.candidate.commit,
    candidateVersion: plan.candidate.version,
    platform: plan.runtime.platform,
    imageDigests: {
      authentik: plan.candidate.image.linuxAmd64ManifestDigest,
      postgres: plan.dependencies.postgres.linuxAmd64ManifestDigest,
      operator: plan.dependencies.operator.linuxAmd64ManifestDigest,
    },
    scenarios: scenarioIds.map((id) => ({ id, status: "passed", checks: 1 })),
    summary: {
      passed: 14,
      failed: 0,
      federationResources: 2,
      flowBindings: 4,
      scimOperations: 12,
      scimAuthorizationRejects: 1,
    },
    limitations: plan.limitations,
  };
  validateAuthentikRuntimeReport(report, plan);
  const leaking = structuredClone(report);
  leaking.summary.token = "synthetic";
  assert.throws(
    () => validateAuthentikRuntimeReport(leaking, plan),
    /runtime report summary|keys differ/u,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--self-test") {
    selfTest();
    console.log("Authentik 2026.8 runtime plan self-test passed.");
  } else if (args.length === 0) {
    validateAuthentikRuntimePlan(loadPlan().plan);
    console.log("Authentik 2026.8 runtime plan is valid.");
  } else {
    fail("use no arguments or --self-test");
  }
}

export { defaultPlan, scenarioIds };
