import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
const passedRepositoryChecks = new Set([
  "official_provenance",
  "image_digest_binding",
  "compose_isolation",
  "operator_secret_separation",
  "prometheus_discovery_minimization",
  "component_configuration",
  "grafana_locked_provisioning",
  "native_textfile_exporter",
  "validator_selftest",
]);
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
    plan.platform?.minimumComposeVersion !== "2.36.0" ||
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
    grafana: new Set([...commonKeys, "environment", "ports"]),
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
    grafana:
      "${STARFINITI_MONITORING_BIND_ADDRESS:-127.0.0.1}:${STARFINITI_GRAFANA_PORT:-3000}:3000",
  };
  for (const id of ["prometheus", "alertmanager", "grafana"]) {
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
  for (const id of ["blackbox-exporter", "postgres-exporter"]) {
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
  if (
    JSON.stringify(services.grafana.networks) !==
    JSON.stringify({
      "monitoring-control": { interface_name: "eth0", gw_priority: 1 },
      "monitoring-egress": { interface_name: "eth1", gw_priority: 0 },
    })
  ) {
    fail("Grafana network route boundary drifted");
  }
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
    ["STARFINITI_GRAFANA_PORT", "3000"],
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

function validateEvidence(evidence, raws, tasks, adr, runbook) {
  if (
    evidence?.schema !== "starfiniti.observability-deployment-evidence.v1" ||
    evidence.status !== "in_progress" ||
    evidence.production?.monitoringActivated !== false ||
    evidence.production?.receiverRoutingActivated !== false ||
    evidence.production?.nodeExporterInstalled !== false ||
    evidence.claim?.enabled !== false ||
    evidence.claim?.linuxCanaryPath !== null ||
    evidence.claim?.linuxCanarySha256 !== null
  ) {
    fail("evidence identity or false production claim drifted");
  }
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
    if (passedRepositoryChecks.has(id) !== (check.status === "passed")) {
      fail(`${id} repository versus external status drifted`);
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
    paths.plan,
    paths.compose,
    paths.adr,
  ]) {
    if (!slice.evidence?.includes(required)) {
      fail(`task graph is missing evidence ${required}`);
    }
  }
  if (
    !adr.includes("Status: Accepted") ||
    !adr.includes("production claim disabled") ||
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
    input.raws,
    input.tasks,
    input.adr,
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
    "envExample",
  ];
  const raws = Object.fromEntries(
    rawIds.map((id) => [id, readText(paths[id])]),
  );
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
    exampleTexts: {
      runtime: readText(paths.runtimeExample),
      host: readText(paths.hostExample),
      postgres: readText(paths.postgresExample),
      blackbox: readText(paths.blackboxExample),
    },
    evidence: parseYaml(readText(paths.evidence)),
    tasks: parseYaml(readText(paths.tasks)),
    adr: readText(paths.adr),
    runbook: readText(paths.runbook),
  };
}

const input = load();
validateDocument(input);

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
  }, /loopback-defaulted/u);
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
    candidate.compose.services.grafana.networks[
      "monitoring-control"
    ].gw_priority = 0;
  }, /Grafana network route boundary/u);
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
  }, /repository versus external status/u);
  mutate((candidate) => {
    candidate.evidence.assets[0].sha256 = "f".repeat(64);
  }, /evidence path or digest drifted/u);
}

console.log(
  `Validated ${componentIds.size} pinned observability services, one native textfile agent, ${requiredChecks.size} evidence checks, and 30 adversarial cases; ${passedRepositoryChecks.size} checks pass and ${requiredChecks.size - passedRepositoryChecks.size} remain external or runtime-gated.`,
);
