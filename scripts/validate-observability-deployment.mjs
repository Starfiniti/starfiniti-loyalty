import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const paths = {
  plan: "infrastructure/observability/deployment/plan.yaml",
  compose: "infrastructure/observability/compose.yml",
  prometheus: "infrastructure/observability/prometheus/prometheus.yml",
  rules: "infrastructure/observability/prometheus/rules.yaml",
  alertmanager: "infrastructure/observability/alertmanager/safe-default.yml",
  blackbox: "infrastructure/observability/blackbox/blackbox.yml",
  postgres: "infrastructure/observability/postgres-exporter/safe-default.yml",
  datasource:
    "infrastructure/observability/grafana/provisioning/datasources/prometheus.yaml",
  dashboard:
    "infrastructure/observability/grafana/provisioning/starfiniti-dashboards/starfiniti-operations.json",
  nodeUnit:
    "infrastructure/observability/node-exporter/starfiniti-node-exporter.service",
  backupNetworkScript:
    "infrastructure/observability/node-exporter/starfiniti-backup-network-counters",
  backupNetworkUnit:
    "infrastructure/observability/node-exporter/starfiniti-backup-network-counters.service",
  backupNetworkTimer:
    "infrastructure/observability/node-exporter/starfiniti-backup-network-counters.timer",
  backupNetworkEnvExample:
    "infrastructure/observability/node-exporter/backup-network-counters.env.example",
  envExample: "infrastructure/observability/deployment/.env.example",
  runtimeExample:
    "infrastructure/observability/deployment/examples/runtime.example.json",
  hostExample:
    "infrastructure/observability/deployment/examples/host.example.json",
  postgresExample:
    "infrastructure/observability/deployment/examples/postgres.example.json",
  blackboxExample:
    "infrastructure/observability/deployment/examples/blackbox.example.json",
  evidence: "docs/plan/evidence/M15/observability-deployment.yaml",
  tasks: "docs/plan/TASKS.yaml",
  adr: "docs/architecture/ADR/0112-digest-pinned-observability-deployment-boundary.md",
  backupNetworkAdr:
    "docs/architecture/ADR/0120-semantic-backup-network-rate-guard.md",
  runbook: "docs/operations/OBSERVABILITY_DEPLOYMENT.md",
};

const readText = (path) => readFileSync(join(root, path), "utf8");
const parseYaml = (raw) =>
  YAML.parseDocument(raw, { merge: true }).toJS({ mapAsMap: false });
const digest = (raw) => createHash("sha256").update(raw).digest("hex");

const knownComponents = {
  prometheus: {
    repository: "prom/prometheus",
    version: "3.14.0",
    tag: "v3.14.0",
    tagObject: "b0fe514e0dd48d35050bda4da9bd35aafcfd159b",
    commit: "d7598b7141418fa35be2b5ec5d0fefb634199610",
    imageIndex:
      "sha256:5ce7540c3c00ef4ab0c9d2c995c6a5b9c421f44b4a115d97a2c7af3b1c21cbb0",
    linuxAmd64Manifest:
      "sha256:e906cef998316bbe319f98711e1b4d8613ad37e14b08ff831d7036e77b7464f9",
    license: "Apache-2.0",
  },
  alertmanager: {
    repository: "prom/alertmanager",
    version: "0.34.0",
    tag: "v0.34.0",
    tagObject: "dd880f3d3ce50aab11167f2f45ba16ce8d1ff73a",
    commit: "085f0ef7eb41da24cab8cd000f1345b6250f2edb",
    imageIndex:
      "sha256:690c7b525f4367aa91f73e2f91c632206d32e97c6384bdbf2fb7a861b420340d",
    linuxAmd64Manifest:
      "sha256:268d4bf0e4bc0fe6dbdef6a59ce81a2918c88458bf8edf7dd0572ad372a093e6",
    license: "Apache-2.0",
  },
  grafana: {
    repository: "grafana/grafana",
    version: "13.2.0",
    tag: "v13.2.0",
    tagObject: "71fb24253535ba580fd0ded62430270afe8fd30e",
    commit: "f681b1359f6a0b8ecb9f2c49a88ac72b75bde73b",
    imageIndex:
      "sha256:3fd54ae1214669f8355f065ec9f6445d5279a3d77095ab048ca045685272429b",
    linuxAmd64Manifest:
      "sha256:95a8098fb092130e111b0264a9be4d3a2bd5405e5dba88d4b8f1f630b389614e",
    license: "AGPL-3.0-only",
  },
  "blackbox-exporter": {
    repository: "prom/blackbox-exporter",
    version: "0.28.0",
    tag: "v0.28.0",
    tagObject: null,
    commit: "5a059bee8d8ffa4e75947c5055fb0abeefc582e6",
    imageIndex:
      "sha256:e753ff9f3fc458d02cca5eddab5a77e1c175eee484a8925ac7d524f04366c2fc",
    linuxAmd64Manifest:
      "sha256:43027b43fb785b7c5adc53bd3b5dbc1a258270a2e8aff24f477b45c4e38dac68",
    license: "Apache-2.0",
  },
  "postgres-exporter": {
    repository: "prometheuscommunity/postgres-exporter",
    version: "0.20.1",
    tag: "v0.20.1",
    tagObject: "eeda61f11c918c1b8c0d410b911e4b004669e57a",
    commit: "867fbcac31cd18c143e244190ea9168cca069827",
    imageIndex:
      "sha256:ac5ec343104fae0e2d84a27bb8d69b38430a11910c5382cad85d478d2bab713e",
    linuxAmd64Manifest:
      "sha256:4f3d82803c1f99ea5e767890de3557d2479ebbc711f63f2e04c663daa840057a",
    license: "Apache-2.0",
  },
};

const knownHostExporter = {
  id: "node-exporter",
  repository: "prometheus/node_exporter",
  version: "1.12.1",
  tag: "v1.12.1",
  tagObject: "fc12f2c0ca65e65f046a5583bbcaf996a578afb4",
  commit: "6044da783597cc3b57aef7580ddcdcff58a4ee99",
  archive: "node_exporter-1.12.1.linux-amd64.tar.gz",
  archiveSize: 12168577,
  archiveSha256:
    "b51d8a76aa2a9156a55d501aca6276fae09e262259a5e4e831d2c2222f084e63",
  license: "Apache-2.0",
};

const requiredChecks = new Set([
  "official_provenance",
  "image_digest_binding",
  "compose_isolation",
  "operator_secret_separation",
  "prometheus_discovery_minimization",
  "component_configuration",
  "grafana_locked_provisioning",
  "native_textfile_exporter",
  "validator_selftest",
  "exact_head_linux_canary",
  "approved_monitoring_environment",
  "live_target_inventory",
  "receiver_binding",
  "dead_man_delivery",
  "production_activation",
  "observation_and_reconciliation",
]);
const passedEvidenceChecks = new Set([
  "official_provenance",
  "image_digest_binding",
  "compose_isolation",
  "operator_secret_separation",
  "prometheus_discovery_minimization",
  "component_configuration",
  "grafana_locked_provisioning",
  "native_textfile_exporter",
  "validator_selftest",
  "exact_head_linux_canary",
]);
const acceptedLinuxCanary = {
  path: "docs/plan/evidence/M15/runs/observability-deployment-canary-f822a79.json",
  reportSha256:
    "66800ed2f7691a7d76016db4864fb9f1b56e90a3e29607e92c6c467dcf72a25f",
  candidateCommit: "f822a7933ac207e83ec780b3cbe1c8cdb704cedb",
  runId: 33518906410,
  jobId: 99892856858,
  artifactId: 9804957219,
  artifactSha256:
    "fc11949574cfc57d5878593f78e1f0a33e109a6be95234cc961788d899d927e2",
};
const linuxCanaryPathPattern =
  /^docs\/plan\/evidence\/M15\/runs\/observability-deployment-canary-[0-9a-f]{7}\.json$/u;
const componentIds = new Set(Object.keys(knownComponents));
const operatorVariables = new Set([
  "STARFINITI_ALERTMANAGER_CONFIG",
  "STARFINITI_GRAFANA_ADMIN_PASSWORD_FILE",
  "STARFINITI_POSTGRES_EXPORTER_CONFIG",
  "STARFINITI_PROMETHEUS_TARGETS_DIR",
]);
const forbiddenText =
  /(?:(?<![A-Za-z0-9_./-])password\s*[:=]\s*[^${\s]|bearer[_-]?token|authorization\s*:|sk_(?:live|test)_|whsec_|eyJ[A-Za-z0-9_-]{20,}|@(?:gmail|outlook|starfiniti)\.)/iu;
const privateAddress =
  /\b(?:10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0)(?:\d{1,3}\.)*\d{0,3}\b/u;

function fail(message) {
  throw new Error(`Observability deployment invalid: ${message}`);
}

function exactSet(actualValues, expected, label) {
  const actual = new Set(actualValues);
  if (
    actual.size !== expected.size ||
    [...expected].some((value) => !actual.has(value))
  ) {
    fail(`${label} differs from the required closed set`);
  }
}

function uniqueById(items, label) {
  if (!Array.isArray(items) || items.length === 0) fail(`${label} is empty`);
  const map = new Map();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || map.has(item.id)) {
      fail(`${label} contains a missing or duplicate id`);
    }
    map.set(item.id, item);
  }
  return map;
}

function validatePlan(plan) {
  if (
    plan?.schema !== "starfiniti.observability-deployment-plan.v1" ||
    plan.platform?.os !== "linux" ||
    plan.platform?.architecture !== "amd64" ||
    plan.platform?.centralRuntime !== "docker-compose" ||
    plan.platform?.hostExporterRuntime !== "native-systemd" ||
    plan.platform?.productionActivationApproved !== false ||
    plan.platform?.receiverBindingApproved !== false ||
    plan.platform?.liveTargetsApproved !== false ||
    plan.approach?.selected !==
      "digest-pinned-central-compose-native-textfile-agent"
  ) {
    fail("plan identity, platform, approach, or false authority drifted");
  }
  if (Number.isNaN(Date.parse(plan.reviewedAt))) fail("review date is invalid");
  const components = uniqueById(plan.components, "components");
  exactSet(components.keys(), componentIds, "component inventory");
  for (const [id, expected] of Object.entries(knownComponents)) {
    const actual = components.get(id);
    for (const [key, value] of Object.entries(expected)) {
      if (actual[key] !== value) fail(`${id} ${key} provenance drifted`);
    }
    if (
      !actual.release?.startsWith("https://github.com/") ||
      !actual.registry?.startsWith("https://hub.docker.com/v2/repositories/")
    ) {
      fail(`${id} official source links are invalid`);
    }
  }
  for (const [key, value] of Object.entries(knownHostExporter)) {
    if (plan.hostExporter?.[key] !== value) {
      fail(`node exporter ${key} provenance drifted`);
    }
  }
  if (
    !plan.hostExporter.download?.startsWith(
      "https://github.com/prometheus/node_exporter/releases/download/",
    ) ||
    plan.policy?.administrationBind !== "127.0.0.1" ||
    plan.policy?.productionAuthority !== false ||
    plan.canary?.publicIngress !== false ||
    plan.canary?.productionRoute !== false ||
    plan.canary?.realCredential !== false ||
    plan.canary?.rawTargetRetention !== false ||
    plan.canary?.exactVersionRequired !== true ||
    plan.canary?.exactTeardownRequired !== true
  ) {
    fail("host download, policy, or canary boundary drifted");
  }
  exactSet(plan.policy.centralServices, componentIds, "central service policy");
  exactSet(
    plan.policy.operatorPaths,
    operatorVariables,
    "operator path variables",
  );
  exactSet(
    plan.policy.hostExporterCollectors,
    new Set(["textfile"]),
    "host exporter collectors",
  );
}

function validateCompose(compose, raw) {
  const services = compose?.services ?? {};
  exactSet(Object.keys(services), componentIds, "Compose services");
  if (raw.includes(":latest") || raw.includes("build:")) {
    fail("Compose contains a mutable tag or local build");
  }
  if (forbiddenText.test(raw)) fail("Compose contains credential material");
  if (/docker\.sock|network_mode:\s*host|pid:\s*host|ipc:\s*host/iu.test(raw)) {
    fail("Compose reaches a forbidden host authority boundary");
  }
  const commonKeys = [
    "cap_drop",
    "cpus",
    "image",
    "init",
    "logging",
    "mem_limit",
    "networks",
    "pids_limit",
    "read_only",
    "restart",
    "security_opt",
    "tmpfs",
    "volumes",
  ];
  const expectedKeys = {
    prometheus: new Set([...commonKeys, "command", "ports"]),
    alertmanager: new Set([...commonKeys, "command", "ports"]),
    grafana: new Set([...commonKeys, "environment"]),
    "blackbox-exporter": new Set([...commonKeys, "command"]),
    "postgres-exporter": new Set([...commonKeys, "command"]),
  };
  for (const [id, expected] of Object.entries(knownComponents)) {
    const service = services[id];
    exactSet(Object.keys(service), expectedKeys[id], `${id} service keys`);
    if (service.image !== `${expected.repository}@${expected.imageIndex}`) {
      fail(`${id} image digest differs from the reviewed index`);
    }
    if (
      service.read_only !== true ||
      service.init !== true ||
      service.privileged === true ||
      !Array.isArray(service.cap_drop) ||
      service.cap_drop.length !== 1 ||
      service.cap_drop[0] !== "ALL" ||
      !service.security_opt?.includes("no-new-privileges:true") ||
      !Number.isInteger(service.pids_limit) ||
      service.pids_limit > 256 ||
      typeof service.mem_limit !== "string" ||
      typeof service.cpus !== "number" ||
      service.logging?.driver !== "json-file" ||
      service.logging?.options?.["max-size"] !== "10m" ||
      service.logging?.options?.["max-file"] !== "3" ||
      service.restart !== "unless-stopped" ||
      service.tmpfs?.length !== 1 ||
      service.tmpfs[0] !== "/tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777"
    ) {
      fail(`${id} hardening or resource bounds drifted`);
    }
  }
  const expectedPorts = {
    prometheus:
      "${STARFINITI_MONITORING_BIND_ADDRESS:-127.0.0.1}:${STARFINITI_PROMETHEUS_PORT:-9090}:9090",
    alertmanager:
      "${STARFINITI_MONITORING_BIND_ADDRESS:-127.0.0.1}:${STARFINITI_ALERTMANAGER_PORT:-9093}:9093",
  };
  for (const id of ["prometheus", "alertmanager"]) {
    const ports = services[id].ports;
    if (
      !Array.isArray(ports) ||
      ports.length !== 1 ||
      ports[0] !== expectedPorts[id]
    ) {
      fail(`${id} administration port is not loopback-defaulted`);
    }
    if (!raw.includes(`- "${expectedPorts[id]}"`)) {
      fail(`${id} administration port must use quoted Compose syntax`);
    }
  }
  for (const id of ["grafana", "blackbox-exporter", "postgres-exporter"]) {
    if (services[id].ports !== undefined) {
      fail(`${id} must not publish a host port`);
    }
  }
  exactSet(
    Object.keys(compose.networks ?? {}),
    new Set(["monitoring-control", "monitoring-egress"]),
    "Compose networks",
  );
  if (
    compose.networks["monitoring-control"].internal !== true ||
    compose.networks["monitoring-egress"].internal !== false
  ) {
    fail("control or egress network semantics drifted");
  }
  exactSet(
    Object.keys(compose.volumes ?? {}),
    new Set(["prometheus-data", "alertmanager-data", "grafana-data"]),
    "Compose data volumes",
  );
  exactSet(
    services.grafana.networks,
    new Set(["monitoring-control"]),
    "Grafana networks",
  );
  for (const id of [
    "prometheus",
    "alertmanager",
    "blackbox-exporter",
    "postgres-exporter",
  ]) {
    exactSet(
      services[id].networks,
      new Set(["monitoring-control", "monitoring-egress"]),
      `${id} networks`,
    );
  }
  const allVolumes = Object.values(services)
    .flatMap((service) => service.volumes ?? [])
    .map(String);
  for (const variable of operatorVariables) {
    if (!allVolumes.some((volume) => volume.includes(`\${${variable}:?`))) {
      fail(`Compose does not require operator path ${variable}`);
    }
  }
  const expectedVolumes = {
    prometheus: [
      "./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro",
      "./prometheus/rules.yaml:/etc/prometheus/rules/starfiniti-rules.yaml:ro",
      "${STARFINITI_PROMETHEUS_TARGETS_DIR:?owner-controlled target directory required}:/etc/prometheus/targets:ro",
      "prometheus-data:/prometheus",
    ],
    alertmanager: [
      "${STARFINITI_ALERTMANAGER_CONFIG:?owner-controlled Alertmanager config required}:/etc/alertmanager/alertmanager.yml:ro",
      "alertmanager-data:/alertmanager",
    ],
    grafana: [
      "./grafana/provisioning:/etc/grafana/provisioning:ro",
      "${STARFINITI_GRAFANA_ADMIN_PASSWORD_FILE:?owner-controlled Grafana password file required}:/run/secrets/grafana_admin_password:ro",
      "grafana-data:/var/lib/grafana",
    ],
    "blackbox-exporter": [
      "./blackbox/blackbox.yml:/etc/blackbox_exporter/blackbox.yml:ro",
    ],
    "postgres-exporter": [
      "${STARFINITI_POSTGRES_EXPORTER_CONFIG:?owner-controlled PostgreSQL exporter config required}:/run/secrets/postgres_exporter.yml:ro",
    ],
  };
  for (const [id, volumes] of Object.entries(expectedVolumes)) {
    if (JSON.stringify(services[id].volumes) !== JSON.stringify(volumes)) {
      fail(`${id} mount boundary drifted`);
    }
  }
  const expectedCommands = {
    prometheus: [
      "--config.file=/etc/prometheus/prometheus.yml",
      "--storage.tsdb.path=/prometheus",
      "--storage.tsdb.retention.time=30d",
      "--storage.tsdb.retention.size=20GB",
      "--log.format=json",
    ],
    alertmanager: [
      "--config.file=/etc/alertmanager/alertmanager.yml",
      "--storage.path=/alertmanager",
      "--data.retention=120h",
      "--log.format=json",
    ],
    "blackbox-exporter": [
      "--config.file=/etc/blackbox_exporter/blackbox.yml",
      "--log.prober=warn",
      "--log.format=json",
    ],
    "postgres-exporter": [
      "--config.file=/run/secrets/postgres_exporter.yml",
      "--log.format=json",
      "--no-collector.stat_statements",
      "--no-collector.settings",
    ],
  };
  for (const [id, command] of Object.entries(expectedCommands)) {
    if (JSON.stringify(services[id].command) !== JSON.stringify(command)) {
      fail(`${id} command boundary drifted`);
    }
  }
  const expectedGrafanaEnvironment = {
    GF_SERVER_HTTP_ADDR: "0.0.0.0",
    GF_SERVER_ROOT_URL:
      "${STARFINITI_GRAFANA_ROOT_URL:?approved externally terminated HTTPS URL required}",
    GF_SECURITY_ADMIN_PASSWORD__FILE: "/run/secrets/grafana_admin_password",
    GF_AUTH_ANONYMOUS_ENABLED: "false",
    GF_USERS_ALLOW_SIGN_UP: "false",
    GF_ANALYTICS_REPORTING_ENABLED: "false",
    GF_ANALYTICS_CHECK_FOR_UPDATES: "false",
    GF_PLUGINS_PLUGIN_ADMIN_ENABLED: "false",
    GF_SECURITY_COOKIE_SECURE: "true",
    STARFINITI_PROMETHEUS_URL: "http://prometheus:9090",
  };
  if (
    JSON.stringify(services.grafana.environment) !==
    JSON.stringify(expectedGrafanaEnvironment)
  ) {
    fail("Grafana environment boundary drifted");
  }
  if (
    services.prometheus.command.includes("--web.enable-lifecycle") ||
    services.prometheus.command.some((argument) =>
      argument.startsWith("--web.enable-admin-api"),
    ) ||
    services.grafana.environment?.GF_AUTH_ANONYMOUS_ENABLED !== "false" ||
    services.grafana.environment?.GF_USERS_ALLOW_SIGN_UP !== "false" ||
    services.grafana.environment?.GF_ANALYTICS_REPORTING_ENABLED !== "false" ||
    services.grafana.environment?.GF_PLUGINS_PLUGIN_ADMIN_ENABLED !== "false" ||
    services.grafana.environment?.GF_SECURITY_COOKIE_SECURE !== "true" ||
    services.grafana.environment?.GF_SERVER_ROOT_URL !==
      "${STARFINITI_GRAFANA_ROOT_URL:?approved externally terminated HTTPS URL required}"
  ) {
    fail("Prometheus or Grafana control-plane safety drifted");
  }
}

function validatePrometheus(config, raw) {
  if (
    forbiddenText.test(raw) ||
    privateAddress.test(raw.replaceAll("127.0.0.1", ""))
  ) {
    fail("Prometheus configuration embeds authority or private topology");
  }
  if (
    config.global?.scrape_interval !== "15s" ||
    config.global?.scrape_timeout !== "10s" ||
    config.global?.evaluation_interval !== "15s" ||
    !config.rule_files?.includes("/etc/prometheus/rules/*.yaml")
  ) {
    fail("Prometheus global or rule configuration drifted");
  }
  const jobs = uniqueById(
    config.scrape_configs?.map((job) => ({ ...job, id: job.job_name })),
    "Prometheus jobs",
  );
  exactSet(
    jobs.keys(),
    new Set([
      "monitoring-plane",
      "starfiniti-runtime",
      "starfiniti-host-textfile",
      "starfiniti-postgres",
      "starfiniti-edge-probes",
    ]),
    "Prometheus jobs",
  );
  const expectedBuildInfoMetrics =
    "(?:prometheus_build_info|alertmanager_build_info|grafana_build_info|blackbox_exporter_build_info|postgres_exporter_build_info)";
  const monitoringPlane = jobs.get("monitoring-plane");
  if (
    !monitoringPlane.metric_relabel_configs?.some(
      (rule) =>
        rule.action === "keep" &&
        rule.source_labels?.[0] === "__name__" &&
        rule.regex === expectedBuildInfoMetrics,
    )
  ) {
    fail("monitoring-plane build-info metric contract drifted");
  }
  exactSet(
    monitoringPlane.static_configs?.flatMap((config) => config.targets ?? []),
    new Set([
      "prometheus:9090",
      "alertmanager:9093",
      "grafana:3000",
      "blackbox-exporter:9115",
      "postgres-exporter:9187",
    ]),
    "monitoring-plane targets",
  );
  const expectedGlobs = {
    "starfiniti-runtime": "/etc/prometheus/targets/runtime-*.json",
    "starfiniti-host-textfile": "/etc/prometheus/targets/host-*.json",
    "starfiniti-postgres": "/etc/prometheus/targets/postgres-*.json",
    "starfiniti-edge-probes": "/etc/prometheus/targets/blackbox-*.json",
  };
  for (const [id, expectedGlob] of Object.entries(expectedGlobs)) {
    const job = jobs.get(id);
    if (
      job.file_sd_configs?.length !== 1 ||
      job.file_sd_configs[0].files?.length !== 1 ||
      job.file_sd_configs[0].files[0] !== expectedGlob ||
      !job.relabel_configs?.some(
        (rule) =>
          rule.target_label === "instance" &&
          rule.source_labels?.length === 1 &&
          rule.source_labels[0] === "service",
      ) ||
      !job.metric_relabel_configs?.some(
        (rule) =>
          rule.action === "keep" && rule.source_labels?.[0] === "__name__",
      ) ||
      !job.metric_relabel_configs?.some(
        (rule) =>
          rule.action === "labelkeep" && !String(rule.regex).includes("tenant"),
      )
    ) {
      fail(`${id} discovery, identity minimization, or metric bounds drifted`);
    }
  }
  const postgres = jobs.get("starfiniti-postgres");
  if (
    !postgres.relabel_configs.some(
      (rule) => rule.target_label === "__param_target",
    ) ||
    !postgres.relabel_configs.some(
      (rule) => rule.target_label === "__param_auth_module",
    ) ||
    !postgres.relabel_configs.some(
      (rule) => rule.action === "labeldrop" && rule.regex === "auth_module",
    )
  ) {
    fail("PostgreSQL target or auth-module minimization drifted");
  }
  const blackbox = jobs.get("starfiniti-edge-probes");
  if (
    blackbox.metrics_path !== "/probe" ||
    blackbox.params?.module?.[0] !== "http_2xx" ||
    !blackbox.relabel_configs.some(
      (rule) => rule.target_label === "__param_target",
    )
  ) {
    fail("blackbox multi-target boundary drifted");
  }
}

function validateComponentConfigs({
  alertmanager,
  blackbox,
  postgres,
  datasource,
  nodeUnit,
  backupNetworkScript,
  backupNetworkUnit,
  backupNetworkTimer,
  backupNetworkEnvExample,
}) {
  if (
    Object.keys(alertmanager ?? {}).some((key) =>
      ["templates", "inhibit_rules", "time_intervals"].includes(key),
    ) ||
    alertmanager.receivers?.length !== 1 ||
    Object.keys(alertmanager.receivers[0]).length !== 1 ||
    alertmanager.receivers[0].name !== "unconfigured"
  ) {
    fail("safe Alertmanager configuration can deliver or inhibit alerts");
  }
  const http = blackbox.modules?.http_2xx?.http;
  if (
    blackbox.modules?.http_2xx?.prober !== "http" ||
    blackbox.modules.http_2xx.timeout !== "10s" ||
    http?.method !== "GET" ||
    http?.follow_redirects !== false ||
    http?.fail_if_not_ssl !== true ||
    http?.tls_config?.insecure_skip_verify !== false ||
    http?.tls_config?.min_version !== "TLS12"
  ) {
    fail("blackbox probe safety drifted");
  }
  if (
    Object.keys(postgres ?? {}).length !== 1 ||
    Object.keys(postgres.auth_modules ?? {}).length !== 0
  ) {
    fail("safe PostgreSQL exporter config embeds an auth module");
  }
  const source = datasource.datasources?.[0];
  if (
    datasource.datasources?.length !== 1 ||
    source?.url !== "${STARFINITI_PROMETHEUS_URL}" ||
    source?.editable !== false ||
    source?.isDefault !== true ||
    source?.jsonData?.prometheusVersion !== "3.14.0"
  ) {
    fail("Grafana source-controlled Prometheus binding drifted");
  }
  const requiredUnitTokens = [
    "User=starfiniti-node-exporter",
    "Group=starfiniti-node-exporter",
    "--collector.disable-defaults",
    "--collector.textfile",
    "--collector.textfile.directory=/var/lib/node_exporter/textfile_collector",
    "NoNewPrivileges=yes",
    "ProtectSystem=strict",
    "ProtectHome=yes",
    "ProtectKernelTunables=yes",
    "ProtectKernelModules=yes",
    "ProtectControlGroups=yes",
    "MemoryDenyWriteExecute=yes",
    "CapabilityBoundingSet=",
    "AmbientCapabilities=",
    "ReadOnlyPaths=/var/lib/node_exporter/textfile_collector",
  ];
  if (
    requiredUnitTokens.some((token) => !nodeUnit.includes(token)) ||
    /(?:User=root|Group=root|--collector\.(?!disable-defaults|textfile))/u.test(
      nodeUnit,
    )
  ) {
    fail("native node exporter authority or collector set drifted");
  }

  const requiredCollectorTokens = [
    "set -Eeuo pipefail",
    "STARFINITI_BACKUP_GUEST_EGRESS_COUNTER_FILE",
    "STARFINITI_BACKUP_PHYSICAL_EGRESS_COUNTER_FILE",
    "^/sys/class/net/[A-Za-z0-9][A-Za-z0-9_.:-]{0,14}/statistics/rx_bytes$",
    "^/sys/class/net/[A-Za-z0-9][A-Za-z0-9_.:-]{0,14}/statistics/tx_bytes$",
    "starfiniti_backup_guest_egress_bytes_total",
    "starfiniti_backup_physical_uplink_egress_bytes_total",
    "starfiniti_backup_network_counter_capture_unixtime_seconds",
    'service="starfiniti-loyalty"',
    "chmod 0644",
    "mv -f --",
  ];
  if (
    requiredCollectorTokens.some(
      (token) => !backupNetworkScript.includes(token),
    ) ||
    /\b(?:curl|wget|ssh|scp|sftp|pvesh|qm|eval|source)\b/u.test(
      backupNetworkScript,
    ) ||
    /(?:interface|device|vm_id|vmid|path)="\$\{/u.test(backupNetworkScript)
  ) {
    fail("semantic backup network collector boundary drifted");
  }

  const requiredCollectorUnitTokens = [
    "Type=oneshot",
    "User=starfiniti-node-exporter",
    "Group=starfiniti-node-exporter",
    "EnvironmentFile=/etc/starfiniti/backup-network-counters.env",
    "ExecStart=/opt/starfiniti/monitoring/starfiniti-backup-network-counters",
    "NoNewPrivileges=yes",
    "IPAddressDeny=any",
    "ProtectSystem=strict",
    "ProtectHome=yes",
    "ProtectKernelTunables=yes",
    "ProtectKernelModules=yes",
    "ProtectControlGroups=yes",
    "MemoryDenyWriteExecute=yes",
    "RestrictAddressFamilies=AF_UNIX",
    "CapabilityBoundingSet=",
    "AmbientCapabilities=",
    "ReadOnlyPaths=/sys/class/net",
    "ReadWritePaths=/var/lib/node_exporter/textfile_collector",
    "TimeoutStartSec=10s",
  ];
  if (
    requiredCollectorUnitTokens.some(
      (token) => !backupNetworkUnit.includes(token),
    ) ||
    /(?:User=root|Group=root|PrivateNetwork=|NetworkNamespacePath=|JoinsNamespaceOf=)/u.test(
      backupNetworkUnit,
    )
  ) {
    fail("semantic backup network collector unit authority drifted");
  }

  for (const token of [
    "OnBootSec=30s",
    "OnUnitInactiveSec=30s",
    "AccuracySec=1s",
    "RandomizedDelaySec=0",
    "Persistent=true",
    "Unit=starfiniti-backup-network-counters.service",
  ]) {
    if (!backupNetworkTimer.includes(token)) {
      fail("semantic backup network collector cadence drifted");
    }
  }
  const counterEnvironmentEntries = backupNetworkEnvExample
    .trim()
    .split(/\r?\n/u);
  if (
    counterEnvironmentEntries.length !== 3 ||
    !counterEnvironmentEntries.includes(
      "STARFINITI_MONITORING_ENVIRONMENT=production",
    ) ||
    !counterEnvironmentEntries.includes(
      "STARFINITI_BACKUP_GUEST_EGRESS_COUNTER_FILE=/sys/class/net/GUEST_PATH/statistics/rx_bytes",
    ) ||
    !counterEnvironmentEntries.includes(
      "STARFINITI_BACKUP_PHYSICAL_EGRESS_COUNTER_FILE=/sys/class/net/REPLACE_UPLINK/statistics/tx_bytes",
    ) ||
    /(?:971|vmbr|eno|tap|loyalty-prod)/iu.test(backupNetworkEnvExample)
  ) {
    fail("semantic backup network collector example leaks topology or drifted");
  }
}

function validateBackupNetworkCollectorRuntime() {
  if (process.platform !== "linux") return;

  const fixtureDirectory = mkdtempSync(
    join(tmpdir(), "starfiniti-backup-network-"),
  );
  const script = join(root, paths.backupNetworkScript);
  const baseEnvironment = {
    ...process.env,
    STARFINITI_MONITORING_ENVIRONMENT: "test",
    STARFINITI_BACKUP_GUEST_EGRESS_COUNTER_FILE:
      "/sys/class/net/lo/statistics/rx_bytes",
    STARFINITI_BACKUP_PHYSICAL_EGRESS_COUNTER_FILE:
      "/sys/class/net/lo/statistics/tx_bytes",
    STARFINITI_BACKUP_NETWORK_METRICS_DIR: fixtureDirectory,
  };
  const execute = (args = [], environment = baseEnvironment) =>
    spawnSync("bash", [script, ...args], {
      encoding: "utf8",
      env: environment,
      timeout: 10_000,
    });

  try {
    const successful = execute();
    if (successful.status !== 0 || successful.error) {
      fail(
        `semantic backup network collector runtime failed: ${successful.stderr || successful.error?.message || "unknown error"}`,
      );
    }
    const outputPath = join(fixtureDirectory, "starfiniti-backup-network.prom");
    const output = readFileSync(outputPath, "utf8");
    const samples = output
      .split(/\r?\n/u)
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    if (
      samples.length !== 3 ||
      !samples.some((line) =>
        /^starfiniti_backup_guest_egress_bytes_total\{environment="test",service="starfiniti-loyalty"\} [0-9]{1,20}$/u.test(
          line,
        ),
      ) ||
      !samples.some((line) =>
        /^starfiniti_backup_physical_uplink_egress_bytes_total\{environment="test",service="starfiniti-loyalty"\} [0-9]{1,20}$/u.test(
          line,
        ),
      ) ||
      !samples.some((line) =>
        /^starfiniti_backup_network_counter_capture_unixtime_seconds\{environment="test",service="starfiniti-loyalty"\} [0-9]{10}$/u.test(
          line,
        ),
      ) ||
      /(?:\/sys\/class\/net|\blo\b)/u.test(output) ||
      (statSync(outputPath).mode & 0o777) !== 0o644
    ) {
      fail("semantic backup network collector runtime output drifted");
    }

    const argumentRejected = execute(["unexpected"]);
    if (argumentRejected.status !== 64) {
      fail("semantic backup network collector accepted an argument");
    }

    const wrongDirectionRejected = execute([], {
      ...baseEnvironment,
      STARFINITI_BACKUP_GUEST_EGRESS_COUNTER_FILE:
        "/sys/class/net/lo/statistics/tx_bytes",
    });
    if (wrongDirectionRejected.status !== 78) {
      fail("semantic backup network collector accepted a wrong-direction path");
    }
  } finally {
    rmSync(fixtureDirectory, { force: true, recursive: true });
  }
}

function validateExamples(exampleTexts) {
  const allowedLabels = new Set([
    "environment",
    "service",
    "component",
    "auth_module",
    "target_class",
  ]);
  for (const [name, raw] of Object.entries(exampleTexts)) {
    if (forbiddenText.test(raw) || !raw.includes(".example.invalid")) {
      fail(`${name} example contains a real target or credential`);
    }
    const groups = JSON.parse(raw);
    if (!Array.isArray(groups) || groups.length !== 1) {
      fail(`${name} example must contain one bounded target group`);
    }
    for (const key of Object.keys(groups[0].labels ?? {})) {
      if (!allowedLabels.has(key)) fail(`${name} example has forbidden label`);
    }
  }
}

function validateEnvironmentExample(raw) {
  const entries = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator <= 0) fail("environment example has an invalid entry");
      return [line.slice(0, separator), line.slice(separator + 1)];
    });
  const variables = new Map(entries);
  if (variables.size !== entries.length) {
    fail("environment example repeats a variable");
  }
  const expected = new Map([
    ["STARFINITI_MONITORING_BIND_ADDRESS", "127.0.0.1"],
    ["STARFINITI_PROMETHEUS_PORT", "9090"],
    ["STARFINITI_ALERTMANAGER_PORT", "9093"],
    ["STARFINITI_GRAFANA_ROOT_URL", "https://grafana.example.invalid"],
    [
      "STARFINITI_PROMETHEUS_TARGETS_DIR",
      "/etc/starfiniti/observability/targets",
    ],
    [
      "STARFINITI_ALERTMANAGER_CONFIG",
      "/etc/starfiniti/observability/alertmanager.yml",
    ],
    [
      "STARFINITI_GRAFANA_ADMIN_PASSWORD_FILE",
      "/etc/starfiniti/observability/grafana-admin-password",
    ],
    [
      "STARFINITI_POSTGRES_EXPORTER_CONFIG",
      "/etc/starfiniti/observability/postgres-exporter.yml",
    ],
  ]);
  exactSet(variables.keys(), new Set(expected.keys()), "environment example");
  for (const [name, value] of expected) {
    if (variables.get(name) !== value) {
      fail(`environment example ${name} drifted`);
    }
  }
  if (forbiddenText.test(raw)) {
    fail("environment example contains credential material");
  }
}

function validateLinuxCanary(claim, canaryRaw) {
  exactSet(
    Object.keys(claim ?? {}),
    new Set([
      "enabled",
      "linuxCanaryPath",
      "linuxCanarySha256",
      "linuxCanaryRunId",
      "linuxCanaryJobId",
      "linuxCanaryArtifactId",
      "linuxCanaryArtifactSha256",
    ]),
    "evidence claim",
  );
  if (
    claim.enabled !== false ||
    typeof claim.linuxCanaryPath !== "string" ||
    !linuxCanaryPathPattern.test(claim.linuxCanaryPath) ||
    claim.linuxCanaryPath !== acceptedLinuxCanary.path ||
    claim.linuxCanarySha256 !== acceptedLinuxCanary.reportSha256 ||
    claim.linuxCanaryRunId !== acceptedLinuxCanary.runId ||
    claim.linuxCanaryJobId !== acceptedLinuxCanary.jobId ||
    claim.linuxCanaryArtifactId !== acceptedLinuxCanary.artifactId ||
    claim.linuxCanaryArtifactSha256 !== acceptedLinuxCanary.artifactSha256
  ) {
    fail("Linux canary identity or provenance drifted");
  }
  if (digest(canaryRaw) !== claim.linuxCanarySha256) {
    fail("Linux canary report digest drifted");
  }

  let canary;
  try {
    canary = JSON.parse(canaryRaw);
  } catch {
    fail("Linux canary report is not valid JSON");
  }
  exactSet(
    Object.keys(canary ?? {}),
    new Set([
      "schema",
      "status",
      "candidateCommit",
      "platform",
      "componentVersions",
      "imageIndexes",
      "configChecks",
      "administrationLoopbackOnly",
      "exporterPortsUnpublished",
      "readOnlyRoots",
      "capabilitiesDropped",
      "noNewPrivileges",
      "separateControlAndEgressNetworks",
      "productionRoute",
      "realCredential",
      "rawTargetRetained",
      "teardown",
    ]),
    "Linux canary report",
  );
  if (
    canary.schema !== "starfiniti.observability-deployment-canary.v1" ||
    canary.status !== "passed" ||
    canary.candidateCommit !== acceptedLinuxCanary.candidateCommit
  ) {
    fail("Linux canary result identity drifted");
  }
  exactSet(
    Object.keys(canary.platform ?? {}),
    new Set(["os", "architecture"]),
    "Linux canary platform",
  );
  if (
    canary.platform.os !== "linux" ||
    canary.platform.architecture !== "amd64"
  ) {
    fail("Linux canary platform drifted");
  }

  const expectedVersions = {
    prometheus: knownComponents.prometheus.version,
    alertmanager: knownComponents.alertmanager.version,
    grafana: knownComponents.grafana.version,
    blackboxExporter: knownComponents["blackbox-exporter"].version,
    postgresExporter: knownComponents["postgres-exporter"].version,
  };
  exactSet(
    Object.keys(canary.componentVersions ?? {}),
    new Set(Object.keys(expectedVersions)),
    "Linux canary component versions",
  );
  for (const [id, version] of Object.entries(expectedVersions)) {
    if (canary.componentVersions[id] !== version) {
      fail(`Linux canary ${id} version drifted`);
    }
  }
  exactSet(
    Object.keys(canary.imageIndexes ?? {}),
    componentIds,
    "Linux canary image indexes",
  );
  for (const [id, component] of Object.entries(knownComponents)) {
    if (canary.imageIndexes[id] !== component.imageIndex) {
      fail(`Linux canary ${id} image index drifted`);
    }
  }
  exactSet(
    Object.keys(canary.configChecks ?? {}),
    new Set(["compose", "prometheus", "alertmanager"]),
    "Linux canary configuration checks",
  );
  if (
    Object.values(canary.configChecks).some((value) => value !== true) ||
    canary.administrationLoopbackOnly !== true ||
    canary.exporterPortsUnpublished !== true ||
    canary.readOnlyRoots !== true ||
    canary.capabilitiesDropped !== true ||
    canary.noNewPrivileges !== true ||
    canary.separateControlAndEgressNetworks !== true ||
    canary.productionRoute !== false ||
    canary.realCredential !== false ||
    canary.rawTargetRetained !== false ||
    canary.teardown !== true
  ) {
    fail("Linux canary hardening or false-authority result drifted");
  }
}

function validateEvidence(
  evidence,
  canaryRaw,
  raws,
  tasks,
  adr,
  backupNetworkAdr,
  runbook,
) {
  if (
    evidence?.schema !== "starfiniti.observability-deployment-evidence.v1" ||
    evidence.status !== "in_progress" ||
    evidence.production?.monitoringActivated !== false ||
    evidence.production?.receiverRoutingActivated !== false ||
    evidence.production?.nodeExporterInstalled !== false ||
    evidence.claim?.enabled !== false
  ) {
    fail("evidence identity or false production claim drifted");
  }
  validateLinuxCanary(evidence.claim, canaryRaw);
  const assets = uniqueById(evidence.assets, "evidence assets");
  exactSet(assets.keys(), new Set(Object.keys(raws)), "evidence assets");
  for (const [id, raw] of Object.entries(raws)) {
    const asset = assets.get(id);
    if (asset.path !== paths[id] || asset.sha256 !== digest(raw)) {
      fail(`${id} evidence path or digest drifted`);
    }
  }
  const checks = uniqueById(evidence.checks, "evidence checks");
  exactSet(checks.keys(), requiredChecks, "evidence checks");
  for (const [id, check] of checks) {
    if (
      !["passed", "pending", "failed"].includes(check.status) ||
      typeof check.evidence !== "string" ||
      check.evidence.length < 24
    ) {
      fail(`${id} evidence state is invalid`);
    }
    if (passedEvidenceChecks.has(id) !== (check.status === "passed")) {
      fail(`${id} verified versus pending status drifted`);
    }
  }
  const slice = tasks.tasks
    ?.find((task) => task.id === "M15-GA-HARDENING")
    ?.slices?.find((item) => item.id === "M15-S05-OPERATIONS-AND-INCIDENTS");
  for (const required of [
    "npm run observability:deployment:validate",
    "npm run observability:environment:validate -- --env <absolute-owner-file>",
    "npm run observability:deployment:run -- --out <new-bounded-json-file>",
  ]) {
    if (!slice?.verification?.includes(required)) {
      fail(`task graph is missing ${required}`);
    }
  }
  for (const required of [
    paths.evidence,
    acceptedLinuxCanary.path,
    paths.plan,
    paths.compose,
    paths.adr,
    paths.backupNetworkScript,
    paths.backupNetworkUnit,
    paths.backupNetworkTimer,
    paths.backupNetworkAdr,
  ]) {
    if (!slice.evidence?.includes(required)) {
      fail(`task graph is missing evidence ${required}`);
    }
  }
  if (
    !adr.includes("Status: Accepted") ||
    !adr.includes("production claim disabled") ||
    !backupNetworkAdr.includes("Status: Accepted") ||
    !backupNetworkAdr.includes("Cumulative totals are evidence, never rates") ||
    !backupNetworkAdr.includes("production activation remains false") ||
    !runbook.includes("Production activation remains disabled") ||
    !runbook.includes("observability:environment:validate") ||
    !runbook.includes("promtool") ||
    !runbook.includes("amtool")
  ) {
    fail("ADR or operator runbook boundary is incomplete");
  }
}

function validateDocument(input) {
  validatePlan(input.plan);
  validateCompose(input.compose, input.raws.compose);
  validatePrometheus(input.prometheus, input.raws.prometheus);
  validateComponentConfigs(input);
  validateExamples(input.exampleTexts);
  validateEnvironmentExample(input.raws.envExample);
  validateEvidence(
    input.evidence,
    input.canaryRaw,
    input.raws,
    input.tasks,
    input.adr,
    input.backupNetworkAdr,
    input.runbook,
  );
}

function load() {
  const rawIds = [
    "plan",
    "compose",
    "prometheus",
    "rules",
    "alertmanager",
    "blackbox",
    "postgres",
    "datasource",
    "dashboard",
    "nodeUnit",
    "backupNetworkScript",
    "backupNetworkUnit",
    "backupNetworkTimer",
    "backupNetworkEnvExample",
    "envExample",
  ];
  const raws = Object.fromEntries(
    rawIds.map((id) => [id, readText(paths[id])]),
  );
  const evidence = parseYaml(readText(paths.evidence));
  const canaryPath = evidence?.claim?.linuxCanaryPath;
  if (
    typeof canaryPath !== "string" ||
    !linuxCanaryPathPattern.test(canaryPath)
  ) {
    fail("Linux canary evidence path is unsafe");
  }
  return {
    raws,
    plan: parseYaml(raws.plan),
    compose: parseYaml(raws.compose),
    prometheus: parseYaml(raws.prometheus),
    alertmanager: parseYaml(raws.alertmanager),
    blackbox: parseYaml(raws.blackbox),
    postgres: parseYaml(raws.postgres),
    datasource: parseYaml(raws.datasource),
    nodeUnit: raws.nodeUnit,
    backupNetworkScript: raws.backupNetworkScript,
    backupNetworkUnit: raws.backupNetworkUnit,
    backupNetworkTimer: raws.backupNetworkTimer,
    backupNetworkEnvExample: raws.backupNetworkEnvExample,
    exampleTexts: {
      runtime: readText(paths.runtimeExample),
      host: readText(paths.hostExample),
      postgres: readText(paths.postgresExample),
      blackbox: readText(paths.blackboxExample),
    },
    evidence,
    canaryRaw: readText(canaryPath),
    tasks: parseYaml(readText(paths.tasks)),
    adr: readText(paths.adr),
    backupNetworkAdr: readText(paths.backupNetworkAdr),
    runbook: readText(paths.runbook),
  };
}

const input = load();
validateDocument(input);
validateBackupNetworkCollectorRuntime();

if (process.argv.includes("--self-test")) {
  const mutate = (callback, pattern) => {
    const candidate = structuredClone(input);
    callback(candidate);
    assert.throws(() => validateDocument(candidate), pattern);
  };
  mutate((candidate) => {
    candidate.plan.components[0].imageIndex = `sha256:${"0".repeat(64)}`;
  }, /provenance drifted/u);
  mutate((candidate) => {
    candidate.compose.services.prometheus.image = "prom/prometheus:latest";
  }, /image digest differs/u);
  mutate((candidate) => {
    candidate.compose.services.prometheus.privileged = true;
  }, /service keys|hardening/u);
  mutate((candidate) => {
    candidate.compose.services.grafana.ports = ["0.0.0.0:3000:3000"];
  }, /service keys|must not publish/u);
  mutate((candidate) => {
    const port = candidate.compose.services.prometheus.ports[0];
    candidate.raws.compose = candidate.raws.compose.replace(
      `- "${port}"`,
      `- ${port}`,
    );
  }, /quoted Compose syntax/u);
  mutate((candidate) => {
    candidate.compose.services["blackbox-exporter"].ports = ["9115:9115"];
  }, /service keys|must not publish/u);
  mutate((candidate) => {
    candidate.compose.services.prometheus.cap_drop = [];
  }, /hardening/u);
  mutate((candidate) => {
    candidate.compose.services.grafana.networks.push("monitoring-egress");
  }, /Grafana networks/u);
  mutate((candidate) => {
    candidate.compose.services.grafana.environment.GF_SERVER_ROOT_URL =
      "http://127.0.0.1:3000";
  }, /environment boundary|control-plane safety/u);
  mutate((candidate) => {
    candidate.compose.services.prometheus.volumes = [];
  }, /does not require operator path|mount boundary/u);
  mutate((candidate) => {
    candidate.compose.services.prometheus.volumes.push("/etc:/host:ro");
  }, /mount boundary/u);
  mutate((candidate) => {
    candidate.compose.services.prometheus.command.push(
      "--web.enable-lifecycle",
    );
  }, /command boundary|control-plane safety/u);
  mutate((candidate) => {
    candidate.compose.services.grafana.environment.GF_AUTH_BASIC_ENABLED =
      "true";
  }, /environment boundary/u);
  mutate((candidate) => {
    candidate.raws.prometheus += "\n# 10.0.0.1\n";
  }, /private topology/u);
  mutate((candidate) => {
    candidate.prometheus.scrape_configs[0].metric_relabel_configs[0].regex =
      "(?:prometheus_build_info|pg_exporter_build_info)";
  }, /build-info metric contract/u);
  mutate((candidate) => {
    delete candidate.prometheus.scrape_configs[1].relabel_configs;
  }, /identity minimization/u);
  mutate((candidate) => {
    candidate.prometheus.scrape_configs[2].metric_relabel_configs = [];
  }, /metric bounds/u);
  mutate((candidate) => {
    candidate.blackbox.modules.http_2xx.http.tls_config.insecure_skip_verify = true;
  }, /blackbox probe safety/u);
  mutate((candidate) => {
    candidate.blackbox.modules.http_2xx.http.follow_redirects = true;
  }, /blackbox probe safety/u);
  mutate((candidate) => {
    candidate.postgres.auth_modules.live = { password: "unsafe" };
  }, /embeds an auth module/u);
  mutate((candidate) => {
    candidate.alertmanager.receivers[0].webhook_configs = [
      { url: "https://receiver.example.invalid" },
    ];
  }, /deliver or inhibit/u);
  mutate((candidate) => {
    candidate.nodeUnit = candidate.nodeUnit.replace(
      "User=starfiniti-node-exporter",
      "User=root",
    );
  }, /node exporter authority/u);
  mutate((candidate) => {
    candidate.nodeUnit = candidate.nodeUnit.replace(
      " --collector.disable-defaults",
      "",
    );
  }, /node exporter authority/u);
  mutate((candidate) => {
    candidate.backupNetworkUnit = candidate.backupNetworkUnit.replace(
      "User=starfiniti-node-exporter",
      "User=root",
    );
  }, /collector unit authority/u);
  mutate((candidate) => {
    candidate.backupNetworkUnit = candidate.backupNetworkUnit.replace(
      "IPAddressDeny=any",
      "IPAddressDeny=none",
    );
  }, /collector unit authority/u);
  mutate((candidate) => {
    candidate.backupNetworkTimer = candidate.backupNetworkTimer.replace(
      "OnUnitInactiveSec=30s",
      "OnUnitInactiveSec=5m",
    );
  }, /collector cadence/u);
  mutate((candidate) => {
    candidate.backupNetworkScript += "\ncurl https://example.invalid\n";
  }, /collector boundary/u);
  mutate((candidate) => {
    candidate.backupNetworkEnvExample =
      candidate.backupNetworkEnvExample.replace("GUEST_PATH", "tap971i0");
  }, /leaks topology/u);
  mutate((candidate) => {
    candidate.plan.hostExporter.archiveSha256 = "0".repeat(64);
  }, /node exporter archiveSha256 provenance/u);
  mutate((candidate) => {
    candidate.plan.platform.productionActivationApproved = true;
  }, /false authority/u);
  mutate((candidate) => {
    candidate.evidence.status = "complete";
  }, /false production claim/u);
  mutate((candidate) => {
    candidate.exampleTexts.runtime = candidate.exampleTexts.runtime.replace(
      "runtime.example.invalid",
      "loyalty.starfiniti.com",
    );
  }, /real target/u);
  mutate((candidate) => {
    candidate.raws.envExample = candidate.raws.envExample.replace(
      "127.0.0.1",
      "0.0.0.0",
    );
  }, /environment example STARFINITI_MONITORING_BIND_ADDRESS drifted/u);
  mutate((candidate) => {
    candidate.datasource.datasources[0].jsonData.prometheusVersion = "3.5.0";
  }, /Prometheus binding drifted/u);
  mutate((candidate) => {
    candidate.evidence.checks.find(
      (check) => check.id === "production_activation",
    ).status = "passed";
  }, /verified versus pending status/u);
  mutate((candidate) => {
    candidate.evidence.assets[0].sha256 = "f".repeat(64);
  }, /evidence path or digest drifted/u);
  mutate((candidate) => {
    candidate.canaryRaw = candidate.canaryRaw.replace(
      '"teardown": true',
      '"teardown": false',
    );
  }, /report digest drifted/u);
  mutate((candidate) => {
    candidate.evidence.claim.linuxCanaryPath =
      "docs/plan/evidence/M15/runs/../../../../STATUS.md";
  }, /identity or provenance drifted/u);
  mutate((candidate) => {
    candidate.evidence.claim.linuxCanaryArtifactSha256 = "0".repeat(64);
  }, /identity or provenance drifted/u);
  mutate((candidate) => {
    candidate.evidence.claim.linuxCanaryRunId = 1;
  }, /identity or provenance drifted/u);
  mutate((candidate) => {
    const parsed = JSON.parse(candidate.canaryRaw);
    parsed.productionRoute = true;
    candidate.canaryRaw = `${JSON.stringify(parsed, null, 2)}\n`;
    candidate.evidence.claim.linuxCanarySha256 = digest(candidate.canaryRaw);
  }, /identity or provenance drifted/u);
}

console.log(
  `Validated ${componentIds.size} pinned observability services, one native textfile agent, one semantic backup-network collector with a Linux runtime fixture, ${requiredChecks.size} evidence checks, and 41 adversarial cases; ${passedEvidenceChecks.size} checks pass and ${requiredChecks.size - passedEvidenceChecks.size} remain external or runtime-gated.`,
);
