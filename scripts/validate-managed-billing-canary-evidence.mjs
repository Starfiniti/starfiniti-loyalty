import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = join(root, "docs/plan/evidence/M14/canary.yaml");
const tasksPath = join(root, "docs/plan/TASKS.yaml");

const evidence = YAML.parse(readFileSync(evidencePath, "utf8"));
const tasks = YAML.parse(readFileSync(tasksPath, "utf8"));

const requiredChecks = new Set([
  "exact_head_ci",
  "migration_replay",
  "contract_provider_matrix",
  "database_authority_matrix",
  "concurrency_matrix",
  "woocommerce_runtime_matrix",
  "browser_accessibility",
  "privacy_retention_matrix",
  "checkout_independence_matrix",
  "operations_documentation",
  "public_production_baseline",
  "operator_access",
  "self_hosted_no_call_repository",
  "approved_release",
  "approved_stripe_sandbox",
  "approved_catalogue",
  "approved_commercial_policy",
  "canary_approval",
  "pre_change_recovery_point",
  "production_billing_baseline",
  "secret_mounts",
  "disabled_deployment",
  "migration_registration",
  "self_hosted_runtime_no_call",
  "managed_entitlement_canary",
  "checkout_session_canary",
  "portal_session_canary",
  "verified_webhook_intake",
  "webhook_replay_disorder",
  "subscription_trial_activation",
  "subscription_renewal",
  "payment_failure_grace",
  "suspension_cancellation",
  "subscription_recovery",
  "usage_source_capture",
  "usage_dispatch_replay",
  "usage_correction",
  "provider_usage_reconciliation",
  "invoice_reconciliation",
  "manual_contract_override",
  "protected_operations_matrix",
  "provider_outage_recovery",
  "worker_outage_recovery",
  "return_navigation_no_authority",
  "cross_tenant_denial",
  "rollback_rehearsal",
  "observation_window",
  "final_reconciliation",
]);
const categoryWeights = new Map([
  ["correctness", 20],
  ["security", 15],
  ["ledger_reliability", 15],
  ["tests", 15],
  ["performance", 10],
  ["operability", 10],
  ["maintainability", 15],
]);
const allowedStatuses = new Set(["passed", "pending", "failed"]);
const completionApprovals = [
  "approvedRelease",
  "operatorAccess",
  "stripeSandboxApproved",
  "commercialPolicyApproved",
  "canaryApproved",
];
const fail = (message) => {
  throw new Error(`Managed billing canary evidence invalid: ${message}`);
};

const validateDocument = (candidateEvidence, candidateTasks = tasks) => {
  if (candidateEvidence.schema !== "starfiniti.managed-billing-canary.v1") {
    fail("unexpected schema");
  }
  if (!new Set(["in_progress", "complete"]).has(candidateEvidence.status)) {
    fail("status must be in_progress or complete");
  }
  if (
    typeof candidateEvidence.observedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(
      candidateEvidence.observedAt,
    ) ||
    Number.isNaN(Date.parse(candidateEvidence.observedAt))
  ) {
    fail("observedAt must be an exact UTC timestamp");
  }
  if (
    typeof candidateEvidence.currentProduction?.release !== "string" ||
    !/^v\d+\.\d+\.\d+$/.test(candidateEvidence.currentProduction.release) ||
    typeof candidateEvidence.currentProduction?.applicationCommit !==
      "string" ||
    !/^[0-9a-f]{40}$/.test(
      candidateEvidence.currentProduction.applicationCommit,
    )
  ) {
    fail("current production release and commit must be exact");
  }
  if (
    typeof candidateEvidence.candidate?.commit !== "string" ||
    !/^[0-9a-f]{40}$/.test(candidateEvidence.candidate.commit)
  ) {
    fail("candidate commit must be a full lowercase Git SHA");
  }
  if (
    !Number.isSafeInteger(candidateEvidence.candidate.pullRequest) ||
    candidateEvidence.candidate.pullRequest < 1
  ) {
    fail("candidate pull request must be a positive integer");
  }
  for (const approval of completionApprovals) {
    if (typeof candidateEvidence.candidate[approval] !== "boolean") {
      fail(`candidate ${approval} must be boolean`);
    }
  }
  if (!Array.isArray(candidateEvidence.checks)) {
    fail("checks must be an array");
  }

  const checkIds = new Set();
  for (const check of candidateEvidence.checks) {
    if (!requiredChecks.has(check.id)) fail(`unknown check ${check.id}`);
    if (checkIds.has(check.id)) fail(`duplicate check ${check.id}`);
    if (!allowedStatuses.has(check.status)) {
      fail(`invalid status for ${check.id}`);
    }
    if (
      typeof check.evidence !== "string" ||
      check.evidence.length < 12 ||
      check.evidence !== check.evidence.trim()
    ) {
      fail(`missing minimized evidence for ${check.id}`);
    }
    if (
      check.status === "passed" &&
      /\b(pending|await(?:s|ing)?|not yet|has not|still required)\b/i.test(
        check.evidence,
      )
    ) {
      fail(`passed check ${check.id} contains forward-looking evidence`);
    }
    checkIds.add(check.id);
  }
  for (const id of requiredChecks) {
    if (!checkIds.has(id)) fail(`missing check ${id}`);
  }
  for (const [approval, checkId] of Object.entries({
    approvedRelease: "approved_release",
    operatorAccess: "operator_access",
    stripeSandboxApproved: "approved_stripe_sandbox",
    commercialPolicyApproved: "approved_commercial_policy",
    canaryApproved: "canary_approval",
  })) {
    const passed =
      candidateEvidence.checks.find((check) => check.id === checkId)?.status ===
      "passed";
    if (candidateEvidence.candidate[approval] !== passed) {
      fail(`candidate ${approval} must match ${checkId}`);
    }
  }

  if (
    candidateEvidence.score?.target !== 90 ||
    candidateEvidence.score.minimumCategoryRatio !== 0.8
  ) {
    fail("score target and minimum category ratio must remain 90 and 0.8");
  }
  if (!Array.isArray(candidateEvidence.score.categories)) {
    fail("score categories must be an array");
  }

  let calculatedScore = 0;
  let calculatedWeight = 0;
  const categoryIds = new Set();
  for (const category of candidateEvidence.score.categories) {
    const expectedWeight = categoryWeights.get(category.id);
    if (expectedWeight === undefined) {
      fail(`unknown score category ${category.id}`);
    }
    if (categoryIds.has(category.id)) {
      fail(`duplicate score category ${category.id}`);
    }
    if (category.weight !== expectedWeight) {
      fail(`unexpected weight for ${category.id}`);
    }
    if (
      !Number.isSafeInteger(category.score) ||
      category.score < 0 ||
      category.score > category.weight
    ) {
      fail(`invalid score for ${category.id}`);
    }
    if (
      typeof category.evidence !== "string" ||
      category.evidence.length < 12 ||
      category.evidence !== category.evidence.trim()
    ) {
      fail(`missing score evidence for ${category.id}`);
    }
    categoryIds.add(category.id);
    calculatedScore += category.score;
    calculatedWeight += category.weight;
  }
  for (const id of categoryWeights.keys()) {
    if (!categoryIds.has(id)) fail(`missing score category ${id}`);
  }
  if (
    calculatedWeight !== 100 ||
    candidateEvidence.score.total !== calculatedScore
  ) {
    fail("score total does not match category arithmetic");
  }

  for (const [name, expected] of Object.entries({
    dashboardHealth: 200,
    login: 200,
    authWithoutKey: 401,
    restWithoutKey: 401,
  })) {
    if (candidateEvidence.publicBaseline?.[name] !== expected) {
      fail(`unexpected public baseline ${name}`);
    }
  }
  if (candidateEvidence.publicBaseline.canonicalDns !== true) {
    fail("canonical DNS must be verified");
  }

  const forbiddenKey =
    /(password|passphrase|secret|private.?key|access.?token|refresh.?token|bearer|credential.?value|raw.?body|payment.?method|card|customer.?id|subscription.?id|invoice.?id|price.?id|meter.?id|provider.?event.?id|checkout.?session.?id|portal.?session.?id|idempotency.?key|auth.?uuid|tenant.?id|wallet.?id)/i;
  const forbiddenValue =
    /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\b(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9]{8,}\b|\b(?:whsec|epk)_[A-Za-z0-9]{8,}\b|\b(?:acct|bpc|ca|ch|coupon|cus|dp|evt|ii|il|in|invst|ipi|iss|mandate|me|mtr|pi|pm|price|prod|promo|re|req|seti|si|src|sub|sub_sched|tax|tok|txn)_[A-Za-z0-9]{12,}\b|\bcs_(?:test|live)_[A-Za-z0-9]{12,}\b|\bt=\d{9,},v1=[0-9a-f]{32,}\b)/i;
  const hasLikelyPaymentCard = (value) =>
    (value.match(/\b\d{13,19}\b/g) ?? []).some((candidate) => {
      let sum = 0;
      let doubleDigit = false;
      for (let index = candidate.length - 1; index >= 0; index -= 1) {
        let digit = Number(candidate[index]);
        if (doubleDigit) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }
        sum += digit;
        doubleDigit = !doubleDigit;
      }
      return sum % 10 === 0;
    });
  const inspectEvidence = (value, path = "evidence") => {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        inspectEvidence(item, `${path}[${index}]`),
      );
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        if (forbiddenKey.test(key)) {
          fail(`forbidden sensitive key ${path}.${key}`);
        }
        inspectEvidence(nested, `${path}.${key}`);
      }
      return;
    }
    if (typeof value === "string") {
      if (forbiddenValue.test(value)) {
        fail(`forbidden sensitive value at ${path}`);
      }
      if (hasLikelyPaymentCard(value)) {
        fail(`forbidden card-like value at ${path}`);
      }
    }
  };
  inspectEvidence(candidateEvidence);

  if (
    !Array.isArray(candidateEvidence.automaticFails) ||
    candidateEvidence.automaticFails.length < 14 ||
    candidateEvidence.automaticFails.some(
      (rule) =>
        typeof rule !== "string" || rule.length < 20 || rule !== rule.trim(),
    ) ||
    new Set(candidateEvidence.automaticFails).size !==
      candidateEvidence.automaticFails.length
  ) {
    fail("automatic failures must contain at least fourteen unique rules");
  }

  const m14 = candidateTasks.tasks.find(
    (task) => task.id === "M14-MANAGED-BILLING",
  );
  const requiredCompletedSlices = new Set([
    "M14-S01-BILLING-AUTHORITY-AND-SELF-HOSTED-INDEPENDENCE",
    "M14-S02-STRIPE-WEBHOOK-INBOX",
    "M14-S03-CHECKOUT-PORTAL-AND-SUBSCRIPTION-LIFECYCLE",
    "M14-S04-IDEMPOTENT-USAGE-METERING",
    "M14-S05-DELINQUENCY-ENTITLEMENTS-AND-MANUAL-CONTRACTS",
  ]);
  const s06 = m14?.slices?.find(
    (slice) => slice.id === "M14-S06-CANARY-AND-CLOSE",
  );
  if (!m14 || !s06) fail("M14 or M14-S06 task is missing");
  for (const id of requiredCompletedSlices) {
    const slice = m14.slices.find((candidate) => candidate.id === id);
    if (slice?.status !== "complete") {
      fail(`${id} must be complete before canary`);
    }
  }
  const s05 = m14.slices.find(
    (slice) =>
      slice.id === "M14-S05-DELINQUENCY-ENTITLEMENTS-AND-MANUAL-CONTRACTS",
  );
  for (const id of [
    "M14-S05A-COMMERCIAL-POLICY-CORE",
    "M14-S05B-GROWTH-CONFIGURATION-ENFORCEMENT",
    "M14-S05C-MERCHANT-EXPERIENCE-AND-CLOSE",
  ]) {
    const slice = s05?.slices?.find((candidate) => candidate.id === id);
    if (slice?.status !== "completed") {
      fail(`${id} must be completed before canary`);
    }
  }
  if (m14.module_score !== calculatedScore) {
    fail("TASKS.yaml module score must match canary evidence");
  }

  const incomplete = candidateEvidence.checks.filter(
    (check) => check.status !== "passed",
  );
  const belowFloor = candidateEvidence.score.categories.filter(
    (category) =>
      category.score / category.weight <
      candidateEvidence.score.minimumCategoryRatio,
  );
  if (candidateEvidence.status === "complete") {
    if (
      completionApprovals.some(
        (approval) => candidateEvidence.candidate[approval] !== true,
      )
    ) {
      fail(
        "complete evidence requires release, operator, Stripe sandbox, commercial policy, and canary approval",
      );
    }
    if (incomplete.length > 0) {
      fail(
        `complete evidence has non-passing checks: ${incomplete.map((check) => check.id).join(", ")}`,
      );
    }
    if (calculatedScore < candidateEvidence.score.target || belowFloor.length) {
      fail("complete evidence does not meet score and category floors");
    }
    if (m14.status !== "complete" || s06.status !== "complete") {
      fail("complete evidence requires completed M14 and S06 task state");
    }
  } else if (m14.status !== "in_progress" || s06.status !== "in_progress") {
    fail("in-progress evidence must match in-progress M14 and S06 task state");
  }

  return { calculatedScore, incomplete, belowFloor };
};

const result = validateDocument(evidence);

if (process.argv.includes("--self-test")) {
  const markPassed = (check) => {
    check.status = "passed";
    check.evidence =
      "Verified immutable canary evidence reconciles this mandatory result exactly.";
  };
  const expectRejected = (
    candidateEvidence,
    messagePart,
    label,
    candidateTasks = tasks,
  ) => {
    try {
      validateDocument(candidateEvidence, candidateTasks);
    } catch (error) {
      if (error instanceof Error && error.message.includes(messagePart)) return;
      throw error;
    }
    fail(`self-test accepted ${label}`);
  };

  const unapprovedCompletion = structuredClone(evidence);
  unapprovedCompletion.status = "complete";
  expectRejected(
    unapprovedCompletion,
    "requires release, operator, Stripe sandbox, commercial policy, and canary approval",
    "unapproved evidence as complete",
  );

  const pendingCompletion = structuredClone(evidence);
  pendingCompletion.status = "complete";
  completionApprovals.forEach((approval) => {
    pendingCompletion.candidate[approval] = true;
  });
  for (const checkId of [
    "approved_release",
    "operator_access",
    "approved_stripe_sandbox",
    "approved_commercial_policy",
    "canary_approval",
  ]) {
    markPassed(pendingCompletion.checks.find((check) => check.id === checkId));
  }
  expectRejected(
    pendingCompletion,
    "complete evidence has non-passing checks",
    "pending evidence as complete",
  );

  const sensitiveKey = structuredClone(evidence);
  sensitiveKey.providerSecretValue = "must never be accepted";
  expectRejected(
    sensitiveKey,
    "forbidden sensitive key",
    "a sensitive evidence key",
  );

  const stripeResource = structuredClone(evidence);
  stripeResource.checks[0].evidence =
    "Unsafe raw resource cus_A1B2C3D4E5F6G7H8 must be rejected.";
  expectRejected(
    stripeResource,
    "forbidden sensitive value",
    "a raw Stripe resource value",
  );

  const cardValue = structuredClone(evidence);
  cardValue.checks[0].evidence =
    "Unsafe payment test value 4242424242424242 must be rejected.";
  expectRejected(
    cardValue,
    "forbidden card-like value",
    "a payment-card-like value",
  );

  const missingCheck = structuredClone(evidence);
  missingCheck.checks = missingCheck.checks.slice(1);
  expectRejected(missingCheck, "missing check", "a missing mandatory check");

  const duplicateCheck = structuredClone(evidence);
  duplicateCheck.checks.push(structuredClone(duplicateCheck.checks[0]));
  expectRejected(duplicateCheck, "duplicate check", "a duplicate check");

  const forwardLookingPass = structuredClone(evidence);
  forwardLookingPass.checks[0].evidence =
    "The exact repository run is still pending external confirmation.";
  expectRejected(
    forwardLookingPass,
    "contains forward-looking evidence",
    "a passed check with pending evidence",
  );

  const approvalDrift = structuredClone(evidence);
  approvalDrift.candidate.approvedRelease = true;
  expectRejected(
    approvalDrift,
    "must match approved_release",
    "approval and check drift",
  );

  const scoreDrift = structuredClone(evidence);
  scoreDrift.score.total += 1;
  expectRejected(scoreDrift, "score total", "score arithmetic drift");

  const nonExactCommit = structuredClone(evidence);
  nonExactCommit.candidate.commit = nonExactCommit.candidate.commit.slice(
    0,
    12,
  );
  expectRejected(nonExactCommit, "full lowercase Git SHA", "a short commit");

  const shortAutomaticFailure = structuredClone(evidence);
  shortAutomaticFailure.automaticFails[0] = "too short";
  expectRejected(
    shortAutomaticFailure,
    "at least fourteen unique rules",
    "a hollow automatic failure rule",
  );

  const baselineDrift = structuredClone(evidence);
  baselineDrift.publicBaseline.authWithoutKey = 200;
  expectRejected(
    baselineDrift,
    "unexpected public baseline",
    "an unsafe public baseline",
  );

  const incompleteSliceTasks = structuredClone(tasks);
  incompleteSliceTasks.tasks
    .find((task) => task.id === "M14-MANAGED-BILLING")
    .slices.find(
      (slice) => slice.id === "M14-S04-IDEMPOTENT-USAGE-METERING",
    ).status = "in_progress";
  expectRejected(
    evidence,
    "must be complete before canary",
    "an incomplete prerequisite slice",
    incompleteSliceTasks,
  );

  const incompleteNestedSliceTasks = structuredClone(tasks);
  incompleteNestedSliceTasks.tasks
    .find((task) => task.id === "M14-MANAGED-BILLING")
    .slices.find(
      (slice) =>
        slice.id === "M14-S05-DELINQUENCY-ENTITLEMENTS-AND-MANUAL-CONTRACTS",
    )
    .slices.find(
      (slice) => slice.id === "M14-S05C-MERCHANT-EXPERIENCE-AND-CLOSE",
    ).status = "in_progress";
  expectRejected(
    evidence,
    "must be completed before canary",
    "an incomplete nested prerequisite slice",
    incompleteNestedSliceTasks,
  );

  const belowFloorCompletion = structuredClone(evidence);
  belowFloorCompletion.status = "complete";
  completionApprovals.forEach((approval) => {
    belowFloorCompletion.candidate[approval] = true;
  });
  belowFloorCompletion.checks.forEach((check) => {
    markPassed(check);
  });
  expectRejected(
    belowFloorCompletion,
    "score and category floors",
    "completion below a category floor",
  );
}

console.log(
  `Validated ${evidence.checks.length} M14 canary checks and ${evidence.score.categories.length} score categories; score ${result.calculatedScore}/100 with ${evidence.checks.filter((check) => check.status === "passed").length} passed, ${evidence.checks.filter((check) => check.status === "pending").length} pending, and ${evidence.checks.filter((check) => check.status === "failed").length} failed.`,
);
