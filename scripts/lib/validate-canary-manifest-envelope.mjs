const manifestKeys = [
  "schema",
  "status",
  "observedAt",
  "currentProduction",
  "candidate",
  "publicBaseline",
  "score",
  "checks",
  "artifacts",
  "automaticFails",
];
const currentProductionKeys = ["release", "applicationCommit"];
const scoreKeys = ["total", "target", "minimumCategoryRatio", "categories"];
const scoreCategoryKeys = ["id", "weight", "score", "evidence"];
const checkKeys = ["id", "status", "evidence"];
const artifactKeys = ["id", "status", "path", "sha256"];
const automaticFailKeys = ["id", "rule"];
const commonCandidateKeys = [
  "pullRequest",
  "commit",
  "approvedRelease",
  "operatorAccess",
  "pilotStoreApproved",
  "canaryApproved",
];
const commonPublicBaselineKeys = [
  "dashboardHealth",
  "login",
  "authWithoutKey",
  "restWithoutKey",
  "canonicalDns",
];
const wooPublicBaselineKeys = [
  "dashboardHealth",
  "login",
  "unsignedWooCommerceIngress",
  "canonicalDns",
];
const schemaCatalogue = new Map([
  [
    "starfiniti.rewards-canary.v1",
    {
      module: "M04",
      candidateKeys: commonCandidateKeys,
      publicBaselineKeys: wooPublicBaselineKeys,
    },
  ],
  [
    "starfiniti.vip-canary.v1",
    {
      module: "M05",
      candidateKeys: commonCandidateKeys,
      publicBaselineKeys: wooPublicBaselineKeys,
    },
  ],
  [
    "starfiniti.referral-canary.v1",
    {
      module: "M06",
      candidateKeys: commonCandidateKeys,
      publicBaselineKeys: wooPublicBaselineKeys,
    },
  ],
  [
    "starfiniti.campaign-canary.v1",
    {
      module: "M07",
      candidateKeys: commonCandidateKeys,
      publicBaselineKeys: wooPublicBaselineKeys,
    },
  ],
  [
    "starfiniti.notification-canary.v1",
    {
      module: "M08",
      candidateKeys: commonCandidateKeys,
      publicBaselineKeys: wooPublicBaselineKeys,
    },
  ],
  [
    "starfiniti.storefront-canary.v1",
    {
      module: "M09",
      candidateKeys: commonCandidateKeys,
      publicBaselineKeys: commonPublicBaselineKeys,
    },
  ],
  [
    "starfiniti.analytics-canary.v1",
    {
      module: "M10",
      candidateKeys: commonCandidateKeys,
      publicBaselineKeys: commonPublicBaselineKeys,
    },
  ],
  [
    "starfiniti.ecosystem-canary.v1",
    {
      module: "M11",
      candidateKeys: commonCandidateKeys,
      publicBaselineKeys: commonPublicBaselineKeys,
    },
  ],
  [
    "starfiniti.migration-canary.v1",
    {
      module: "M12",
      candidateKeys: [
        "pullRequest",
        "commit",
        "approvedRelease",
        "operatorAccess",
        "sourceApproved",
        "canaryApproved",
      ],
      publicBaselineKeys: commonPublicBaselineKeys,
    },
  ],
  [
    "starfiniti.enterprise-identity-canary.v1",
    {
      module: "M13",
      candidateKeys: [
        "pullRequest",
        "commit",
        "approvedRelease",
        "operatorAccess",
        "enterpriseIdentityApproved",
        "canaryApproved",
      ],
      publicBaselineKeys: [
        "dashboardHealth",
        "login",
        "authWithoutKey",
        "restWithoutKey",
        "authentikLive",
        "authentikReady",
        "canonicalDns",
      ],
    },
  ],
  [
    "starfiniti.managed-billing-canary.v1",
    {
      module: "M14",
      candidateKeys: [
        "pullRequest",
        "commit",
        "approvedRelease",
        "operatorAccess",
        "stripeSandboxApproved",
        "commercialPolicyApproved",
        "canaryApproved",
      ],
      publicBaselineKeys: commonPublicBaselineKeys,
    },
  ],
]);

export const canaryEnvelopeSchemas = Object.freeze([...schemaCatalogue.keys()]);
export const maximumCanaryEvidenceTextLength = 4_096;

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const exactKeys = (value, expected, label, fail) => {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${label} keys differ`);
  }
};

const inspectBoundedStructure = (
  value,
  fail,
  path = "manifest",
  ancestors = new WeakSet(),
) => {
  if (typeof value === "string") {
    if (value.length > maximumCanaryEvidenceTextLength) {
      fail(`evidence text at ${path} exceeds the bounded length`);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  if (ancestors.has(value)) fail(`cyclic evidence at ${path}`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      inspectBoundedStructure(item, fail, `${path}[${index}]`, ancestors),
    );
  } else {
    for (const [key, nested] of Object.entries(value)) {
      inspectBoundedStructure(nested, fail, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
};

const exactUtcTime = (value, label, fail) => {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) ||
    Number.isNaN(parsed) ||
    new Date(parsed).toISOString().replace(".000Z", "Z") !== value
  ) {
    fail(`${label} must be an exact UTC timestamp`);
  }
  return parsed;
};

const exactObjectArray = (value, keys, label, fail) => {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  value.forEach((item) => exactKeys(item, keys, label, fail));
};

export function validateCanaryManifestEnvelope(
  manifest,
  taskGraph,
  fail,
  { inspect, now = Date.now() } = {},
) {
  if (typeof fail !== "function") {
    throw new TypeError(
      "validateCanaryManifestEnvelope requires a failure callback",
    );
  }
  inspectBoundedStructure(manifest, fail);
  if (inspect !== undefined) {
    if (typeof inspect !== "function") {
      throw new TypeError("canary envelope inspect option must be a function");
    }
    inspect(manifest);
  }
  exactKeys(manifest, manifestKeys, "manifest", fail);
  const catalogueEntry = schemaCatalogue.get(manifest.schema);
  if (!catalogueEntry) fail("manifest schema is not registered");
  exactKeys(
    manifest.currentProduction,
    currentProductionKeys,
    "currentProduction",
    fail,
  );
  exactKeys(
    manifest.candidate,
    catalogueEntry.candidateKeys,
    "candidate",
    fail,
  );
  exactKeys(
    manifest.publicBaseline,
    catalogueEntry.publicBaselineKeys,
    "publicBaseline",
    fail,
  );
  exactKeys(manifest.score, scoreKeys, "score", fail);
  exactObjectArray(
    manifest.score.categories,
    scoreCategoryKeys,
    "score category",
    fail,
  );
  exactObjectArray(manifest.checks, checkKeys, "check", fail);
  exactObjectArray(manifest.artifacts, artifactKeys, "artifact", fail);
  exactObjectArray(
    manifest.automaticFails,
    automaticFailKeys,
    "automatic failure",
    fail,
  );
  const observedAt = exactUtcTime(manifest.observedAt, "observedAt", fail);
  if (observedAt > now + 5 * 60 * 1_000) {
    fail("observedAt must not be in the future");
  }
  if (!isPlainObject(taskGraph) || !Array.isArray(taskGraph.tasks)) {
    fail("task graph is invalid");
  }
  return { module: catalogueEntry.module, observedAt };
}
