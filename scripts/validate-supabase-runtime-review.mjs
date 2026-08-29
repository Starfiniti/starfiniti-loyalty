import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const paths = Object.freeze({
  review: "infrastructure/governance/supabase-runtime-review.yaml",
  rootPackage: "package.json",
  dashboardPackage: "apps/dashboard/package.json",
  lock: "package-lock.json",
  config: "supabase/config.toml",
  tasks: "docs/plan/TASKS.yaml",
  adr: "docs/architecture/ADR/0103-reviewed-supabase-client-toolchain-refresh.md",
});

const locked = Object.freeze({
  schema: "starfiniti.supabase-runtime-review.v1",
  changelog: "https://supabase.com/changelog.md",
  dataApiSecurity: "https://supabase.com/docs/guides/api/securing-your-api",
  releases: {
    cli: [
      "https://github.com/supabase/cli/releases/tag/v2.116.0",
      "2.116.0",
      "2026-08-26T19:51:24Z",
    ],
    supabaseJs: [
      "https://github.com/supabase/supabase-js/releases/tag/v2.112.4",
      "2.112.4",
      "2026-08-24T10:32:46Z",
    ],
    ssr: [
      "https://github.com/supabase/ssr/releases/tag/v0.12.5",
      "0.12.5",
      "2026-08-24T11:32:32Z",
    ],
  },
  previous: {
    cli: [
      "2.113.0",
      "sha512-GWlx87NpsT1opPOLWRkaTnXEUUchWmCMPVCLRU22GD+oJEH/sVnUI9NCrMZuf5XpmQE+aSbPogHW69UIbVL32w==",
    ],
    supabaseJs: [
      "2.112.3",
      "sha512-Jv1bxVQmEJNkjvPEhFaKjPzsh+Ozyew6lWGD+SoYcsclDEP1z7yEvKvfUQfzy0DkxRIQnZNxmmWtAzw5XLTQoA==",
    ],
    ssr: [
      "0.12.4",
      "sha512-xHzcgI8cC1TpBKSwJcR5Yd8CCwfIq0SBc5yb4yz/YFw5tbCrEQ0QT3a+2jymCxHgQWLfzwN93HZ6eRbcoMkOlA==",
    ],
  },
  candidates: {
    cli: [
      "2.116.0",
      "https://registry.npmjs.org/supabase/-/supabase-2.116.0.tgz",
      "sha512-cMUHkpjBacq4oLGWnMM2HC2drmUlAlfN/PQb31RARoIdYJ8sqA0xONvqBR6yd5v7w8dXuCPwvfd4N1NTHjBKEw==",
      "f3628bddff4aed857dba5bea5211908a39c16e03",
    ],
    supabaseJs: [
      "2.112.4",
      "https://registry.npmjs.org/@supabase/supabase-js/-/supabase-js-2.112.4.tgz",
      "sha512-UiCX1udlFY1fQQrO7Z3GU7obQsju0w5Vk9mOOwalfo/+Gy+tahWVenSSuu5E/GTy/q//HxvGv2IrCdW66/61kw==",
      "a9f987cced71b7a4dda52d37f915a31c6fa265c9",
    ],
    ssr: [
      "0.12.5",
      "https://registry.npmjs.org/@supabase/ssr/-/ssr-0.12.5.tgz",
      "sha512-0GllaAtHe7FHs6tlSg1CwkFw0a7aai1Shs9rEqSs/HaVkJzPk35C9r0Z8WUtKJ3eY6G/Y5y47YvCro3LynrAJg==",
      "df9a289a7d3974e554da7a4741fb2320fcf06927",
    ],
  },
  jose: [
    "6.2.10",
    "https://registry.npmjs.org/jose/-/jose-6.2.10.tgz",
    "sha512-iiW7J9qRFlGxvCOIBDBDxFePQSn7ZMAnrYGhrrOo6siO/MIqwfyilLR27pkfDgUk+raLuzADS8A3S/KLBisc0g==",
  ],
  authorityKeys: [
    "deploymentApproved",
    "mergeApproved",
    "productionAccess",
    "productionMutation",
    "productionReconciled",
    "productionStackUpgradeApproved",
    "releaseApproved",
  ],
  lockPackages: [
    [
      "@supabase/auth-js",
      "2.112.4",
      "sha512-z8DesgwLzKM5PiT0yNmJU8VJyh1zAhYi+20Z7drdJQLXg/wWW4yGt/un+He5ERYUo94Vz66t5aeyr1DIDemI5A==",
    ],
    [
      "@supabase/functions-js",
      "2.112.4",
      "sha512-DQ0aVH8wSQAccVqNoEkec62qCu2QRNyoGN53RqsVZ1k6F1zq4/v8scrlR6LNT2RJmT97apiTmORijPVhErCS2g==",
    ],
    [
      "@supabase/postgrest-js",
      "2.112.4",
      "sha512-uaubtPSeg2TR4wrtfQoQWgkTAe+a0qWX2KhmwvTfNl5mGN9+U7owiJt6abk3o/V6O899PSRD1yzxs5RlF4xTug==",
    ],
    [
      "@supabase/realtime-js",
      "2.112.4",
      "sha512-vZ+j079SKrM0Xiq7MJCvQKLDpaH2kfKfLY68xuQE1sqsCsMmx1CyrDBJHsxZ3cX01VOs5SI9igmoZAF3BmdZxw==",
    ],
    [
      "@supabase/storage-js",
      "2.112.4",
      "sha512-lQ0JemuTlMIXVKgSci1qez8yPnM5hyDngeAfEBjZS2Om4D+Cus0EE5BE6glFobrxdyii1OF4UzWfF0zcQgDq5A==",
    ],
    [
      "@supabase/cli-darwin-arm64",
      "2.116.0",
      "sha512-Mvfxf5q7oQ1KR59ndFFyGkh12IfwKH5ZOv7OWtHsFkBuwHtHiJgY6Zwd3w09tnat4spkpDTFavclBlLsOQnh2A==",
    ],
    [
      "@supabase/cli-darwin-x64",
      "2.116.0",
      "sha512-dxKmIPcVunC8sPTuU+eVWj2SOB5tLoRTE5FX6J/KMZhGH03khTn6ptHvaanZp0YwaACbm//uoffUlJKZrAgt0w==",
    ],
    [
      "@supabase/cli-linux-arm64",
      "2.116.0",
      "sha512-ZmV96NQqcgx1MH4jWdfyqqjLghy57mRI5bysy6lM7MezsirQh+eXaOdWI0xCy7r7FA09k2fKLGh+r7r0X3mxBg==",
    ],
    [
      "@supabase/cli-linux-arm64-musl",
      "2.116.0",
      "sha512-6lYrbKFJT5NKbEKGBJTArEc1F3oMfWxnQeq8+RZ4wSLjCq4uwluh6+fzKCsLVxZgPOg4r+RZRqDdb+/cLi0yyg==",
    ],
    [
      "@supabase/cli-linux-x64",
      "2.116.0",
      "sha512-o0PvHKyQSKEuC3jJqeV2qorgyMIFGDWQ1Bj+OXf0p80ddgktnJFlDElCU+VDKZkuwLC6vO/LMoBql34zFHzXhw==",
    ],
    [
      "@supabase/cli-linux-x64-musl",
      "2.116.0",
      "sha512-EtPJPHUvLHvXHkvZHAEr+i6w/bDVm5BOPD+09uXgUffsUbNAzfZ8r7Fb94+SfWI+dQwivw4WmijsX7tlx61Zcg==",
    ],
    [
      "@supabase/cli-windows-arm64",
      "2.116.0",
      "sha512-IiglNMXXssDiZbeSRvixYH7eYDDvhiEa2CrOSj419jO5vLrMKvzi1ATxe8E4i7MpKuI9S5U/3tA3rFlIMHtwrg==",
    ],
    [
      "@supabase/cli-windows-x64",
      "2.116.0",
      "sha512-pz4zNDs3KCEx0l9JS9Xaiuzd5WXrISajVlBSxC5/2Jyo2+g+N/ftQJDYTHQ6Jir5fNelIqSHIXZelmGds14upw==",
    ],
  ],
});

function fail(message) {
  throw new Error(`Supabase runtime review invalid: ${message}`);
}

function sameArray(actual, expected, label) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  )
    fail(`${label} differs`);
}

function validateReview(bundle) {
  const { review, rootPackage, dashboardPackage, lock, config, tasks, adr } =
    bundle;
  if (
    review?.schema !== locked.schema ||
    review.reviewedAt !== "2026-08-29" ||
    review.owner !== "engineering"
  )
    fail("review identity differs");
  if (
    review.officialSources?.changelog !== locked.changelog ||
    review.officialSources?.dataApiSecurity !== locked.dataApiSecurity
  )
    fail("official source differs");
  for (const [id, expected] of Object.entries(locked.releases)) {
    const actual = review.officialSources?.releases?.[id];
    sameArray(
      [actual?.url, actual?.version, actual?.publishedAt],
      expected,
      `${id} release`,
    );
  }
  for (const [id, expected] of Object.entries(locked.previous)) {
    const actual = review.packages?.previous?.[id];
    sameArray(
      [actual?.version, actual?.integrity],
      expected,
      `${id} previous package`,
    );
  }
  for (const [id, expected] of Object.entries(locked.candidates)) {
    const actual = review.packages?.candidate?.[id];
    sameArray(
      [actual?.version, actual?.tarball, actual?.integrity, actual?.shasum],
      expected,
      `${id} candidate package`,
    );
  }
  sameArray(
    [
      review.packages?.candidate?.jose?.version,
      review.packages?.candidate?.jose?.integrity,
    ],
    [locked.jose[0], locked.jose[2]],
    "jose candidate package",
  );
  const reviewedLocks = review.packages?.candidate?.lockPackages;
  if (
    !Array.isArray(reviewedLocks) ||
    reviewedLocks.length !== locked.lockPackages.length
  )
    fail("reviewed lock package count differs");
  for (const [index, expected] of locked.lockPackages.entries()) {
    const actual = reviewedLocks[index];
    sameArray(
      [actual?.id, actual?.version, actual?.integrity],
      expected,
      `reviewed lock package ${index}`,
    );
  }

  if (
    rootPackage.devDependencies?.supabase !== "2.116.0" ||
    rootPackage.engines?.node !== ">=24.0.0"
  )
    fail("root runtime pins differ");
  if (
    dashboardPackage.dependencies?.["@supabase/supabase-js"] !== "2.112.4" ||
    dashboardPackage.dependencies?.["@supabase/ssr"] !== "0.12.5"
  )
    fail("dashboard Supabase pins differ");
  if (
    lock.packages?.[""]?.devDependencies?.supabase !== "2.116.0" ||
    lock.packages?.["apps/dashboard"]?.dependencies?.[
      "@supabase/supabase-js"
    ] !== "2.112.4" ||
    lock.packages?.["apps/dashboard"]?.dependencies?.["@supabase/ssr"] !==
      "0.12.5"
  )
    fail("workspace lock roots differ");
  for (const [id, version, integrity] of locked.lockPackages) {
    const actual = lock.packages?.[`node_modules/${id}`];
    if (
      actual?.version !== version ||
      actual?.integrity !== integrity ||
      actual?.resolved !==
        `https://registry.npmjs.org/${id}/-/${id.split("/").at(-1)}-${version}.tgz`
    )
      fail(`lock package ${id} differs`);
  }
  const cli = lock.packages?.["node_modules/supabase"];
  if (
    cli?.version !== "2.116.0" ||
    cli.resolved !== locked.candidates.cli[1] ||
    cli.integrity !== locked.candidates.cli[2] ||
    cli.dependencies?.jose !== "^6.2.9"
  )
    fail("CLI lock entry differs");
  const optionalIds = locked.lockPackages
    .filter(([id]) => id.startsWith("@supabase/cli-"))
    .map(([id]) => id);
  if (
    Object.keys(cli.optionalDependencies ?? {})
      .sort()
      .join("\n") !== [...optionalIds].sort().join("\n") ||
    optionalIds.some((id) => cli.optionalDependencies[id] !== "2.116.0")
  )
    fail("CLI optional platform set differs");
  const supabaseJs = lock.packages?.["node_modules/@supabase/supabase-js"];
  if (
    supabaseJs?.version !== "2.112.4" ||
    supabaseJs.resolved !== locked.candidates.supabaseJs[1] ||
    supabaseJs.integrity !== locked.candidates.supabaseJs[2] ||
    supabaseJs.engines?.node !== ">=22.0.0"
  )
    fail("supabase-js lock entry differs");
  const jsIds = locked.lockPackages
    .filter(([id]) => id.endsWith("-js") && id !== "@supabase/supabase-js")
    .map(([id]) => id);
  if (jsIds.some((id) => supabaseJs.dependencies?.[id] !== "2.112.4"))
    fail("supabase-js subpackage set differs");
  const ssr = lock.packages?.["node_modules/@supabase/ssr"];
  if (
    ssr?.version !== "0.12.5" ||
    ssr.resolved !== locked.candidates.ssr[1] ||
    ssr.integrity !== locked.candidates.ssr[2] ||
    ssr.peerDependencies?.["@supabase/supabase-js"] !== "^2.112.4"
  )
    fail("SSR lock entry differs");
  const jose = lock.packages?.["node_modules/jose"];
  if (
    jose?.version !== locked.jose[0] ||
    jose.resolved !== locked.jose[1] ||
    jose.integrity !== locked.jose[2]
  )
    fail("jose lock entry differs");

  sameArray(
    review.configuration?.dataApiSchemas,
    ["public", "graphql_public", "loyalty"],
    "reviewed Data API schemas",
  );
  if (
    review.configuration?.privateSchemaExcluded !== "loyalty_private" ||
    review.configuration?.autoExposeNewTables !== false ||
    review.configuration?.authorization !== "explicit-grants-plus-rls"
  )
    fail("reviewed Data API boundary differs");
  const apiBlock = config.match(/\[api\]([\s\S]*?)(?=\n\[|$)/u)?.[1] ?? "";
  const autoExposeAssignments =
    apiBlock.match(/^\s*auto_expose_new_tables\s*=\s*(?:true|false)\s*$/gmu) ??
    [];
  if (
    autoExposeAssignments.length !== 1 ||
    !/^\s*auto_expose_new_tables\s*=\s*false\s*$/u.test(
      autoExposeAssignments[0],
    ) ||
    /schemas\s*=\s*\[[^\]]*"loyalty_private"[^\]]*\]/u.test(apiBlock)
  )
    fail("repository Data API boundary differs");
  const schemaMatch = apiBlock.match(/schemas\s*=\s*\[([^\]]*)\]/u)?.[1] ?? "";
  const schemas = [...schemaMatch.matchAll(/"([^"]+)"/gu)].map(
    (match) => match[1],
  );
  sameArray(
    schemas,
    ["public", "graphql_public", "loyalty"],
    "repository Data API schemas",
  );

  if (
    review.compatibility?.repositoryNode !== ">=24.0.0" ||
    review.compatibility?.packageMinimumNode !== ">=22.0.0" ||
    [
      "contractChange",
      "migrationChange",
      "ledgerChange",
      "productionStackChange",
    ].some((key) => review.compatibility?.[key] !== false)
  )
    fail("compatibility boundary differs");
  if (
    review.decision?.disposition !==
      "exact-patch-refresh-with-explicit-api-grant-boundary" ||
    review.decision?.breakingChangeIdentified !== false ||
    !review.decision?.rollback?.includes("never restore implicit grants")
  )
    fail("decision or rollback differs");
  if (
    Object.keys(review.authority ?? {})
      .sort()
      .join("\n") !== locked.authorityKeys.join("\n") ||
    Object.values(review.authority).some((value) => value !== false)
  )
    fail("authority must remain entirely false");

  if (
    rootPackage.scripts?.[
      "continuous-improvement:supabase-runtime:validate"
    ] !== "node scripts/validate-supabase-runtime-review.mjs --self-test" ||
    !rootPackage.scripts?.check?.includes(
      "npm run continuous-improvement:supabase-runtime:validate",
    )
  )
    fail("repository validation command is not gated");
  const task = tasks.tasks?.find(
    (item) => item.id === "M16-CONTINUOUS-IMPROVEMENT",
  );
  if (
    !task ||
    !task.evidence?.includes(paths.review) ||
    !task.evidence?.includes("scripts/validate-supabase-runtime-review.mjs") ||
    !task.docs?.includes(paths.adr)
  )
    fail("task graph evidence is incomplete");
  for (const phrase of [
    "Keep the existing package set",
    "Upgrade without an explicit API grant boundary",
    "exact patch refresh",
    "Rollback",
    "auto_expose_new_tables = false",
  ]) {
    if (!adr.includes(phrase)) fail(`ADR is missing ${phrase}`);
  }
}

function loadBundle() {
  const read = (path) => readFileSync(join(root, path), "utf8");
  return {
    review: YAML.parse(read(paths.review)),
    rootPackage: JSON.parse(read(paths.rootPackage)),
    dashboardPackage: JSON.parse(read(paths.dashboardPackage)),
    lock: JSON.parse(read(paths.lock)),
    config: read(paths.config),
    tasks: YAML.parse(read(paths.tasks)),
    adr: read(paths.adr),
  };
}

function selfTest(bundle) {
  validateReview(bundle);
  const cases = [
    (x) => {
      x.review.schema = "wrong";
    },
    (x) => {
      x.review.officialSources.dataApiSecurity = "https://example.invalid";
    },
    (x) => {
      x.review.officialSources.releases.cli.version = "2.116.1";
    },
    (x) => {
      x.review.packages.candidate.supabaseJs.integrity = "sha512-wrong";
    },
    (x) => {
      x.review.packages.candidate.lockPackages.pop();
    },
    (x) => {
      x.review.configuration.autoExposeNewTables = true;
    },
    (x) => {
      x.review.authority.productionMutation = true;
    },
    (x) => {
      delete x.review.authority.productionMutation;
      x.review.authority.noOp = false;
    },
    (x) => {
      x.review.compatibility.productionStackChange = true;
    },
    (x) => {
      x.rootPackage.devDependencies.supabase = "2.113.0";
    },
    (x) => {
      x.rootPackage.engines.node = ">=22.0.0";
    },
    (x) => {
      x.lock.packages[""].devDependencies.supabase = "2.113.0";
    },
    (x) => {
      x.lock.packages["apps/dashboard"].dependencies["@supabase/supabase-js"] =
        "2.112.3";
    },
    (x) => {
      x.dashboardPackage.dependencies["@supabase/supabase-js"] = "2.112.3";
    },
    (x) => {
      x.dashboardPackage.dependencies["@supabase/ssr"] = "0.12.4";
    },
    (x) => {
      x.lock.packages["node_modules/@supabase/cli-linux-x64"].version =
        "2.113.0";
    },
    (x) => {
      x.lock.packages["node_modules/@supabase/cli-windows-x64"].integrity =
        "sha512-wrong";
    },
    (x) => {
      x.lock.packages["node_modules/supabase"].resolved =
        "https://example.invalid/supabase.tgz";
    },
    (x) => {
      x.lock.packages["node_modules/@supabase/auth-js"].version = "2.112.3";
    },
    (x) => {
      x.lock.packages["node_modules/@supabase/supabase-js"].resolved =
        "https://example.invalid/supabase-js.tgz";
    },
    (x) => {
      x.lock.packages["node_modules/@supabase/ssr"].peerDependencies[
        "@supabase/supabase-js"
      ] = "^2.111.0";
    },
    (x) => {
      x.review.packages.candidate.jose.integrity = "sha512-wrong";
    },
    (x) => {
      x.lock.packages["node_modules/jose"].version = "6.2.8";
    },
    (x) => {
      x.config = x.config.replace("auto_expose_new_tables = false", "");
    },
    (x) => {
      x.config = x.config.replace(
        "auto_expose_new_tables = false",
        "auto_expose_new_tables = true",
      );
    },
    (x) => {
      x.config = x.config.replace(
        "auto_expose_new_tables = false",
        "auto_expose_new_tables = false\nauto_expose_new_tables = true",
      );
    },
    (x) => {
      x.config = x.config.replace(
        '"loyalty"]',
        '"loyalty", "loyalty_private"]',
      );
    },
    (x) => {
      delete x.rootPackage.scripts[
        "continuous-improvement:supabase-runtime:validate"
      ];
    },
    (x) => {
      x.rootPackage.scripts.check = x.rootPackage.scripts.check.replace(
        "npm run continuous-improvement:supabase-runtime:validate",
        "",
      );
    },
    (x) => {
      x.tasks.tasks.find(
        (item) => item.id === "M16-CONTINUOUS-IMPROVEMENT",
      ).evidence = [];
    },
    (x) => {
      x.adr = x.adr.replaceAll(
        "auto_expose_new_tables = false",
        "automatic grants",
      );
    },
  ];
  for (const [index, mutate] of cases.entries()) {
    const candidate = structuredClone(bundle);
    mutate(candidate);
    let rejected = false;
    try {
      validateReview(candidate);
    } catch {
      rejected = true;
    }
    if (!rejected) fail(`self-test corruption ${index + 1} was accepted`);
  }
  console.log(
    `Validated Supabase runtime review and rejected ${cases.length} corruptions.`,
  );
}

const bundle = loadBundle();
if (process.argv.includes("--self-test")) selfTest(bundle);
else {
  validateReview(bundle);
  console.log("Validated Supabase runtime review.");
}
