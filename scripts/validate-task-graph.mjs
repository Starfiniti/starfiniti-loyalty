import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const taskGraphPath = join(root, "docs/plan/TASKS.yaml");
const activeStatuses = new Set(["in_progress", "pending", "ready"]);
const allowedStatuses = new Set([
  "complete",
  "completed",
  "in_progress",
  "pending",
  "ready",
  "superseded",
]);
const requiredDeferredScope = [
  "shopify",
  "localization",
  "store-credit",
  "gift-cards",
  "cash-redemption",
];
const requiredActiveScope = [
  "self-hosted-supabase",
  "managed-starfiniti",
  "proxmox",
  "nextjs",
  "woocommerce",
  "english",
];
const enterpriseModules = Array.from(
  { length: 17 },
  (_, index) => `M${String(index).padStart(2, "0")}`,
);
const enterpriseModuleSet = new Set(enterpriseModules);
const enterpriseDependencies = new Map([
  ["M00", ["P7-WOOCOMMERCE-CONNECTOR"]],
  ["M01", ["M00-REALITY-AND-EVIDENCE"]],
  ["M02", ["M00-REALITY-AND-EVIDENCE"]],
  ["M03", ["M02-ENTITLEMENTS-AND-FLAGS"]],
  ["M04", ["M03-EARNING-RULES"]],
  ["M05", ["M04-REWARDS-AND-FULFILMENT"]],
  ["M06", ["M05-VIP-AND-EXPIRY"]],
  ["M07", ["M06-REFERRALS"]],
  ["M08", ["M07-CAMPAIGNS"]],
  ["M09", ["M08-NOTIFICATIONS"]],
  ["M10", ["M09-STOREFRONT-EXPERIENCE"]],
  ["M11", ["M10-ANALYTICS"]],
  ["M12", ["M11-ECOSYSTEM"]],
  ["M13", ["M12-MIGRATION"]],
  ["M14", ["M13-ENTERPRISE-IDENTITY"]],
  ["M15", ["M14-MANAGED-BILLING"]],
  ["M16", ["M15-GA-HARDENING"]],
]);
const terminalStatuses = new Set(["complete", "completed", "superseded"]);
const enterpriseStringFields = [
  "hypothesis",
  "baseline",
  "rollout",
  "rollback",
];
const enterpriseListFields = [
  "targets",
  "acceptance",
  "failure_modes",
  "verification",
  "evidence",
  "docs",
  "risks",
];
const idPattern = /^[A-Z0-9][A-Z0-9-]{2,95}$/u;
const scopePattern = /^[a-z0-9][a-z0-9-]{1,63}$/u;
const followUpPattern = /^follow_up_[a-z0-9_]{1,48}$/u;

function fail(message) {
  throw new Error(`Task graph validation failed: ${message}`);
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function containsTaskLikeObject(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (
    isPlainObject(value) &&
    (Object.hasOwn(value, "id") || Object.hasOwn(value, "status"))
  ) {
    return true;
  }
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.some((child) => containsTaskLikeObject(child, seen));
}

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) fail(`${label} must be a plain object`);
  return value;
}

function requireExactKeys(value, label, expectedKeys) {
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actualKeys.length !== expected.length ||
    actualKeys.some((key, index) => key !== expected[index])
  ) {
    fail(
      `${label} keys differ: expected ${expected.join(", ")}; received ${actualKeys.join(", ")}`,
    );
  }
}

function requireNarrative(value, label) {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length < 8 ||
    value.length > 4_096
  ) {
    fail(`${label} must be a trimmed bounded narrative`);
  }
  return value;
}

function requireStringList(
  value,
  label,
  { minItems = 0, maxItems = 256, itemPattern, maxLength = 4_096 } = {},
) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  if (value.length < minItems || value.length > maxItems) {
    fail(`${label} must contain between ${minItems} and ${maxItems} items`);
  }

  const seen = new Set();
  for (const [index, item] of value.entries()) {
    if (
      typeof item !== "string" ||
      item !== item.trim() ||
      item.length === 0 ||
      item.length > maxLength
    ) {
      fail(`${label}[${index}] must be a trimmed bounded string`);
    }
    if (itemPattern && !itemPattern.test(item)) {
      fail(`${label}[${index}] has an invalid format`);
    }
    if (seen.has(item)) fail(`${label} contains a duplicate item: ${item}`);
    seen.add(item);
  }

  return value;
}

function requireOwnerInputs(value, label, { allowEmpty = true } = {}) {
  const ownerInputs = requireStringList(value, label, {
    minItems: allowEmpty ? 0 : 1,
    maxItems: 32,
    maxLength: 512,
  });
  for (const [index, ownerInput] of ownerInputs.entries()) {
    if (ownerInput.length < 8) {
      fail(`${label}[${index}] is too short to identify an owner input`);
    }
  }
  return ownerInputs;
}

function validateTaskGraph(taskGraph) {
  requirePlainObject(taskGraph, "root");
  requireExactKeys(taskGraph, "root", [
    "version",
    "updated",
    "scope",
    "roadmap",
    "tasks",
  ]);
  if (taskGraph.version !== 3) fail("version must be exactly 3");
  if (typeof taskGraph.updated !== "string") {
    fail("updated must be an ISO calendar date");
  }
  const updatedMatch = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(taskGraph.updated);
  if (!updatedMatch) fail("updated must be an ISO calendar date");
  const updatedDate = new Date(
    Date.UTC(
      Number(updatedMatch[1]),
      Number(updatedMatch[2]) - 1,
      Number(updatedMatch[3]),
    ),
  );
  if (updatedDate.toISOString().slice(0, 10) !== taskGraph.updated) {
    fail("updated must be a real ISO calendar date");
  }

  const scope = requirePlainObject(taskGraph.scope, "scope");
  requireExactKeys(scope, "scope", ["active", "deferred"]);
  const activeScope = requireStringList(scope.active, "scope.active", {
    minItems: 1,
    itemPattern: scopePattern,
    maxLength: 64,
  });
  const deferredScope = requireStringList(scope.deferred, "scope.deferred", {
    minItems: 1,
    itemPattern: scopePattern,
    maxLength: 64,
  });
  for (const item of requiredActiveScope) {
    if (!activeScope.includes(item)) fail(`active scope is missing ${item}`);
  }
  if (activeScope.includes("shopify")) {
    fail("shopify must remain deferred and absent from active scope");
  }
  if (activeScope.length !== requiredActiveScope.length) {
    fail("active scope contains an unreviewed item");
  }
  for (const item of requiredDeferredScope) {
    if (!deferredScope.includes(item))
      fail(`deferred scope is missing ${item}`);
  }
  if (deferredScope.length !== requiredDeferredScope.length) {
    fail("deferred scope contains an unreviewed item");
  }
  for (const item of activeScope) {
    if (deferredScope.includes(item)) {
      fail(`scope item is both active and deferred: ${item}`);
    }
  }

  const roadmap = requirePlainObject(taskGraph.roadmap, "roadmap");
  requireExactKeys(roadmap, "roadmap", [
    "authority",
    "baseline_release",
    "baseline_commit",
    "evaluation",
    "evidence_root",
    "completion_score",
    "minimum_category_ratio",
    "deterministic_failures_override_score",
  ]);
  if (roadmap.authority !== "docs/plan/ENTERPRISE_ROADMAP.md") {
    fail("roadmap authority differs from the approved enterprise roadmap");
  }
  if (
    roadmap.baseline_release !== "v0.1.10" ||
    roadmap.baseline_commit !== "ff7978dd8faa4519a378f5bb538c7956905b2125"
  ) {
    fail("roadmap historical baseline identity differs");
  }
  if (roadmap.evaluation !== "docs/plan/evaluations/product-score.json") {
    fail("roadmap evaluation authority differs");
  }
  if (roadmap.evidence_root !== "docs/plan/evidence") {
    fail("roadmap evidence root differs");
  }
  if (roadmap.completion_score !== 90) {
    fail("roadmap completion score must remain 90");
  }
  if (roadmap.minimum_category_ratio !== 0.8) {
    fail("roadmap minimum category ratio must remain 0.8");
  }
  if (roadmap.deterministic_failures_override_score !== true) {
    fail("deterministic failures must override the numeric score");
  }

  if (!Array.isArray(taskGraph.tasks) || taskGraph.tasks.length < 17) {
    fail("tasks must contain the enterprise module graph");
  }

  const nodes = [];
  const nodesById = new Map();

  function collectNode(value, kind, parentTask) {
    const node = requirePlainObject(value, `${kind} node`);
    if (typeof node.id !== "string" || !idPattern.test(node.id)) {
      fail(`${kind} node has an invalid id`);
    }
    if (nodesById.has(node.id)) fail(`duplicate node id: ${node.id}`);
    if (!allowedStatuses.has(node.status)) {
      fail(`${node.id} has an unsupported status: ${String(node.status)}`);
    }
    if (kind === "task" && !Array.isArray(node.dependencies)) {
      fail(`${node.id}.dependencies must be an array`);
    }
    if (node.dependencies !== undefined) {
      requireStringList(node.dependencies, `${node.id}.dependencies`, {
        maxItems: 64,
        itemPattern: idPattern,
        maxLength: 96,
      });
    }
    if (node.owner_inputs !== undefined) {
      requireOwnerInputs(node.owner_inputs, `${node.id}.owner_inputs`);
    }
    if (node.slices !== undefined && !Array.isArray(node.slices)) {
      fail(`${node.id}.slices must be an array`);
    }

    const record = { node, kind, parentTask };
    nodes.push(record);
    nodesById.set(node.id, record);
    const recognizedChildValues = new Set(node.slices ?? []);
    for (const [key, child] of Object.entries(node)) {
      if (followUpPattern.test(key)) {
        requirePlainObject(child, `${node.id}.${key}`);
        recognizedChildValues.add(child);
      } else if (key !== "slices" && containsTaskLikeObject(child)) {
        fail(`${node.id} has an unrecognized child task container: ${key}`);
      }
    }
    for (const slice of recognizedChildValues) {
      collectNode(slice, "slice", parentTask ?? node);
    }
  }

  for (const task of taskGraph.tasks) collectNode(task, "task", null);

  for (const task of taskGraph.tasks) {
    const idModuleMatch = /^(M\d{2})-/u.exec(task.id);
    if (idModuleMatch && task.module !== idModuleMatch[1]) {
      fail(`${task.id} module identity differs from its id`);
    }
    if (
      typeof task.module === "string" &&
      /^M\d{2}$/u.test(task.module) &&
      !enterpriseModuleSet.has(task.module)
    ) {
      fail(`unreviewed enterprise module: ${task.module}`);
    }
  }

  const enterpriseTasks = new Map();
  for (const moduleId of enterpriseModules) {
    const matches = taskGraph.tasks.filter((task) => task.module === moduleId);
    if (matches.length !== 1) {
      fail(`enterprise graph must contain exactly one task for ${moduleId}`);
    }
    const task = matches[0];
    if (!task.id.startsWith(`${moduleId}-`)) {
      fail(`${moduleId} task id must begin with ${moduleId}-`);
    }
    enterpriseTasks.set(moduleId, task);

    const expectedDependencies = enterpriseDependencies.get(moduleId);
    if (
      task.dependencies.length !== expectedDependencies.length ||
      task.dependencies.some(
        (dependency, index) => dependency !== expectedDependencies[index],
      )
    ) {
      fail(`${task.id}.dependencies differ from the approved graph`);
    }

    for (const field of enterpriseStringFields) {
      requireNarrative(task[field], `${task.id}.${field}`);
    }
    for (const field of enterpriseListFields) {
      requireStringList(task[field], `${task.id}.${field}`, { minItems: 1 });
    }

    const ownerInputs = requireOwnerInputs(
      task.owner_inputs,
      `${task.id}.owner_inputs`,
      { allowEmpty: !activeStatuses.has(task.status) },
    );
    if (activeStatuses.has(task.status) && ownerInputs.length === 0) {
      fail(`${task.id} must declare owner inputs while active`);
    }
    if (
      (task.status === "complete" || task.status === "completed") &&
      (!Number.isInteger(task.module_score) ||
        task.module_score < 90 ||
        task.module_score > 100)
    ) {
      fail(`${task.id} completed module score must be between 90 and 100`);
    }
  }

  for (const { node, kind, parentTask } of nodes) {
    for (const dependency of node.dependencies ?? []) {
      if (dependency === node.id) fail(`${node.id} depends on itself`);
      if (!nodesById.has(dependency)) {
        fail(`${node.id} has an unknown dependency: ${dependency}`);
      }
    }

    if (node.status === "superseded") {
      const replacements = requireStringList(
        node.superseded_by,
        `${node.id}.superseded_by`,
        {
          minItems: 1,
          maxItems: 16,
          itemPattern: idPattern,
          maxLength: 96,
        },
      );
      for (const replacement of replacements) {
        if (!nodesById.has(replacement)) {
          fail(`${node.id} has an unknown replacement: ${replacement}`);
        }
      }
    }

    if (
      kind === "slice" &&
      activeStatuses.has(node.status) &&
      parentTask &&
      enterpriseModuleSet.has(parentTask.module)
    ) {
      const explicitInputs = Array.isArray(node.owner_inputs)
        ? node.owner_inputs
        : [];
      const inheritedInputs = Array.isArray(parentTask.owner_inputs)
        ? parentTask.owner_inputs
        : [];
      if (explicitInputs.length === 0 && inheritedInputs.length === 0) {
        fail(`${node.id} has no effective owner inputs while active`);
      }
    }
    if (
      kind === "slice" &&
      activeStatuses.has(node.status) &&
      parentTask &&
      terminalStatuses.has(parentTask.status)
    ) {
      fail(`${parentTask.id} is terminal while ${node.id} remains active`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const trail = [];

  function visit(nodeId) {
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) {
      const cycleStart = trail.indexOf(nodeId);
      const cycle = [...trail.slice(cycleStart), nodeId];
      fail(`dependency cycle detected: ${cycle.join(" -> ")}`);
    }

    visiting.add(nodeId);
    trail.push(nodeId);
    for (const dependency of nodesById.get(nodeId).node.dependencies ?? []) {
      visit(dependency);
    }
    trail.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  for (const nodeId of nodesById.keys()) visit(nodeId);

  return {
    taskCount: taskGraph.tasks.length,
    nodeCount: nodes.length,
    enterpriseModuleCount: enterpriseTasks.size,
  };
}

function expectRejected(taskGraph, name, expectedMessage, mutate) {
  const candidate = structuredClone(taskGraph);
  mutate(candidate);
  try {
    validateTaskGraph(candidate);
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage))
      return;
    throw new Error(
      `Task graph self-test ${name} failed with an unexpected error: ${String(error)}`,
    );
  }
  throw new Error(`Task graph self-test ${name} accepted invalid evidence`);
}

function findModule(taskGraph, moduleId) {
  return taskGraph.tasks.find((task) => task.module === moduleId);
}

function runSelfTests(taskGraph) {
  const cases = [
    [
      "duplicate-id",
      "duplicate node id",
      (graph) => {
        graph.tasks[1].id = graph.tasks[0].id;
      },
    ],
    [
      "missing-dependency",
      "unknown dependency",
      (graph) => {
        findModule(graph, "M13").slices.find(
          (slice) => slice.id === "M13-S06-CANARY-AND-CLOSE",
        ).dependencies = ["M99-ABSENT"];
      },
    ],
    [
      "dependency-cycle",
      "dependency cycle detected",
      (graph) => {
        findModule(graph, "M15").slices.find(
          (slice) => slice.id === "M15-S01-CAPACITY-ENVELOPE",
        ).dependencies = ["M15-S02-FAULT-INJECTION"];
      },
    ],
    [
      "missing-module",
      "exactly one task for M09",
      (graph) => {
        graph.tasks = graph.tasks.filter((task) => task.module !== "M09");
      },
    ],
    [
      "duplicate-module",
      "exactly one task for M09",
      (graph) => {
        const duplicate = structuredClone(findModule(graph, "M09"));
        duplicate.id = "M09-DUPLICATE";
        duplicate.dependencies = [];
        duplicate.slices = [];
        graph.tasks.push(duplicate);
      },
    ],
    [
      "missing-active-owner-input",
      "owner_inputs must contain",
      (graph) => {
        findModule(graph, "M09").owner_inputs = [];
      },
    ],
    [
      "missing-slice-effective-input",
      "no effective owner inputs",
      (graph) => {
        const task = findModule(graph, "M09");
        task.status = "complete";
        task.module_score = 90;
        task.owner_inputs = [];
        delete task.slices.find((slice) =>
          slice.id.endsWith("CANARY-AND-CLOSE"),
        ).owner_inputs;
      },
    ],
    [
      "missing-deferred-shopify",
      "deferred scope is missing shopify",
      (graph) => {
        graph.scope.deferred = graph.scope.deferred.filter(
          (item) => item !== "shopify",
        );
      },
    ],
    [
      "active-shopify",
      "shopify must remain deferred",
      (graph) => {
        graph.scope.active.push("shopify");
      },
    ],
    [
      "lowered-score",
      "completion score must remain 90",
      (graph) => {
        graph.roadmap.completion_score = 89;
      },
    ],
    [
      "subjective-override",
      "deterministic failures must override",
      (graph) => {
        graph.roadmap.deterministic_failures_override_score = false;
      },
    ],
    [
      "duplicate-owner-input",
      "contains a duplicate item",
      (graph) => {
        const task = findModule(graph, "M09");
        task.owner_inputs = [task.owner_inputs[0], task.owner_inputs[0]];
      },
    ],
    [
      "unknown-status",
      "unsupported status",
      (graph) => {
        findModule(graph, "M09").status = "paused";
      },
    ],
    [
      "pending-owner-input",
      "owner_inputs must contain",
      (graph) => {
        const task = findModule(graph, "M09");
        task.status = "pending";
        task.owner_inputs = [];
      },
    ],
    [
      "hidden-child-node",
      "unrecognized child task container",
      (graph) => {
        findModule(graph, "M09").hidden_slices = [
          {
            id: "M09-HIDDEN-SLICE",
            status: "in_progress",
          },
        ];
      },
    ],
    [
      "invalid-calendar-date",
      "real ISO calendar date",
      (graph) => {
        graph.updated = "2026-02-31";
      },
    ],
    [
      "unreviewed-active-scope",
      "active scope contains an unreviewed item",
      (graph) => {
        graph.scope.active.push("slovenian");
      },
    ],
    [
      "unknown-root-field",
      "root keys differ",
      (graph) => {
        graph.completion_override = true;
      },
    ],
    [
      "removed-module-dependency",
      "dependencies differ from the approved graph",
      (graph) => {
        findModule(graph, "M09").dependencies = [];
      },
    ],
    [
      "terminal-task-active-slice",
      "is terminal while M09-S06-CANARY-AND-CLOSE remains active",
      (graph) => {
        const task = findModule(graph, "M09");
        task.status = "complete";
        task.module_score = 90;
      },
    ],
    [
      "completed-low-score",
      "completed module score must be between 90 and 100",
      (graph) => {
        findModule(graph, "M03").module_score = 89;
      },
    ],
    [
      "historical-baseline-drift",
      "historical baseline identity differs",
      (graph) => {
        graph.roadmap.baseline_release = "v0.1.99";
      },
    ],
    [
      "unreviewed-enterprise-module",
      "unreviewed enterprise module",
      (graph) => {
        graph.tasks.push({
          id: "M17-UNREVIEWED",
          module: "M17",
          status: "pending",
          dependencies: [],
        });
      },
    ],
  ];

  for (const [name, expectedMessage, mutate] of cases) {
    expectRejected(taskGraph, name, expectedMessage, mutate);
  }
  return cases.length;
}

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--self-test")) {
  fail("only --self-test is supported");
}

const taskGraph = YAML.parse(readFileSync(taskGraphPath, "utf8"));
const summary = validateTaskGraph(taskGraph);
const selfTestCount = args.includes("--self-test")
  ? runSelfTests(taskGraph)
  : 0;

console.log(
  `Validated ${summary.taskCount} top-level tasks, ${summary.nodeCount} task/slice nodes, ${summary.enterpriseModuleCount} enterprise modules, and ${selfTestCount} adversarial cases.`,
);
