import http from "k6/http";
import crypto from "k6/crypto";
import encoding from "k6/encoding";
import execution from "k6/execution";
import { Counter, Rate, Trend } from "k6/metrics";

const runtime = JSON.parse(open("/run/starfiniti/runtime.json"));
const origin = open("/run/starfiniti/origin.txt").trim();
const credentials = {};
for (const scenario of runtime.scenarios) {
  if (!scenario.credentialFile) continue;
  credentials[scenario.credentialFile] = open(
    `/run/starfiniti/credentials/${scenario.credentialFile}`,
  ).trim();
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scenarioByAdapter = Object.fromEntries(
  runtime.scenarios.map((scenario) => [scenario.adapter, scenario]),
);
const metrics = Object.fromEntries(
  runtime.scenarios.map((scenario) => [
    scenario.id,
    {
      completed: new Counter(`sf_completed_${scenario.id}`),
      errors: new Rate(`sf_errors_${scenario.id}`),
      latency: new Trend(`sf_latency_${scenario.id}`, true),
      expectedStatus: new Counter(`sf_expected_status_${scenario.id}`),
      unexpectedStatus: new Counter(`sf_unexpected_status_${scenario.id}`),
      networkError: new Counter(`sf_network_error_${scenario.id}`),
      invalidResponse: new Counter(`sf_invalid_response_${scenario.id}`),
      responseTooLarge: new Counter(`sf_response_too_large_${scenario.id}`),
      responseBytes: new Counter(`sf_response_bytes_${scenario.id}`),
    },
  ]),
);

const executorByAdapter = {
  readiness: "dashboardReadiness",
  authenticated_get: "customerWalletRead",
  service_customer_upsert: "serviceCustomerIntake",
  woocommerce_order_upsert: "woocommerceOrderIntake",
};
const scenarios = {};
const thresholds = {};
for (const scenario of runtime.scenarios) {
  scenarios[scenario.id] = {
    executor: "constant-arrival-rate",
    exec: executorByAdapter[scenario.adapter],
    rate: scenario.arrivalRate,
    timeUnit: `${scenario.timeUnitSeconds}s`,
    duration: `${runtime.phase.durationSeconds}s`,
    preAllocatedVUs: scenario.concurrencyLimit,
    maxVUs: scenario.concurrencyLimit,
    gracefulStop: `${Math.ceil(scenario.timeoutMs / 1000) + 1}s`,
    tags: { workload_scenario: scenario.id },
  };
  thresholds[`iterations{scenario:${scenario.id}}`] = [
    `count==${scenario.expectedScheduled}`,
  ];
  thresholds[`dropped_iterations{scenario:${scenario.id}}`] = ["count==0"];
  thresholds[`sf_errors_${scenario.id}`] = [
    `rate<=${scenario.thresholds.maximumErrorRate}`,
  ];
  thresholds[`sf_latency_${scenario.id}`] = [
    `p(95)<=${scenario.thresholds.maximumP95Ms}`,
    `p(99)<=${scenario.thresholds.maximumP99Ms}`,
  ];
}

export const options = {
  scenarios,
  thresholds,
  systemTags: [
    "method",
    "status",
    "error_code",
    "expected_response",
    "scenario",
  ],
  userAgent: "starfiniti-capacity-crosscheck/1",
  maxRedirects: 0,
  noCookiesReset: true,
  throw: false,
  summaryTrendStats: ["count", "avg", "p(95)", "p(99)", "max"],
};

function stableHash(value) {
  return crypto.sha256(value, "hex");
}

function stableUuid(value) {
  const source = stableHash(value);
  return `${source.slice(0, 8)}-${source.slice(8, 12)}-4${source.slice(13, 16)}-a${source.slice(17, 20)}-${source.slice(20, 32)}`;
}

function numericSelector(value) {
  const source = stableHash(value).slice(0, 18);
  let result = String((parseInt(source[0], 16) % 9) + 1);
  for (const character of source.slice(1)) {
    result += String(parseInt(character, 16) % 10);
  }
  return result;
}

function sequenceFor(scenario) {
  return `${runtime.runSeed}:${runtime.phase.id}:${scenario.id}:${execution.scenario.iterationInTest}`;
}

function requestFor(scenario) {
  const unique = sequenceFor(scenario);
  const correlationId = stableUuid(`${unique}:correlation`);
  const stableKey = `capacity:${runtime.runSeed.slice(0, 16)}:${runtime.phase.id}:${scenario.id}:${execution.scenario.iterationInTest}`;
  const headers = { Accept: "application/json" };
  if (scenario.adapter === "readiness") return { headers };
  if (scenario.adapter === "authenticated_get") {
    headers.Cookie = credentials[scenario.credentialFile];
    return { headers };
  }
  if (scenario.adapter === "service_customer_upsert") {
    headers.Authorization = `Bearer ${credentials[scenario.credentialFile]}`;
    headers["Content-Type"] = "application/json";
    return {
      headers,
      expectedCorrelationId: correlationId,
      body: JSON.stringify({
        version: "1",
        externalCustomerId: stableKey,
        idempotencyKey: stableKey,
        correlationId,
      }),
    };
  }
  const credential = JSON.parse(credentials[scenario.credentialFile]);
  const deliveryId = stableKey;
  const externalCustomerId = numericSelector(unique);
  const now = new Date().toISOString();
  const body = JSON.stringify({
    version: "1",
    deliveryId,
    connectionId: credential.connectionId,
    sourceEventId: deliveryId,
    eventType: "commerce.order.upserted",
    sourceObjectId: externalCustomerId,
    sourceRevision: `capacity-${runtime.phase.id}-${execution.scenario.iterationInTest}`,
    occurredAt: now,
    deliveredAt: now,
    correlationId,
    causationId: null,
    payload: {
      kind: "order",
      orderId: externalCustomerId,
      status: "processing",
      currency: "EUR",
      currencyMinorUnitDigits: 2,
      market: "SI",
      customer: { kind: "registered", externalCustomerId },
      paymentKind: "money",
      lines: [
        {
          lineId: "1",
          productId: "1",
          variationId: null,
          quantity: "1",
          categoryIds: [],
          collectionIds: [],
          subtotal: "10.00",
          total: "10.00",
          refundedTotal: "0",
        },
      ],
      shippingTotal: "0",
      shippingRefundedTotal: "0",
      taxTotal: "0",
      taxRefundedTotal: "0",
      feeTotal: "0",
      feeRefundedTotal: "0",
      discountTotal: "0",
      refundedTotal: "0",
    },
  });
  const bodySha256 = stableHash(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = stableUuid(`${unique}:nonce`);
  const message = [
    "starfiniti-woocommerce-v1",
    scenario.path,
    credential.connectionId,
    deliveryId,
    timestamp,
    nonce,
    bodySha256,
  ].join("\n");
  const signer = crypto.createHMAC(
    "sha256",
    encoding.b64decode(credential.signingKey, "std"),
  );
  signer.update(message);
  return {
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "X-Starfiniti-Connection-Id": credential.connectionId,
      "X-Starfiniti-Delivery-Id": deliveryId,
      "X-Starfiniti-Timestamp": timestamp,
      "X-Starfiniti-Nonce": nonce,
      "X-Starfiniti-Key-Version": credential.keyVersion,
      "X-Starfiniti-Body-Sha256": bodySha256,
      "X-Starfiniti-Signature": signer.digest("hex"),
    },
    expectedCorrelationId: correlationId,
    body,
  };
}

function responseMatchesContract(scenario, response, request) {
  if (scenario.adapter === "readiness") return response.body === "ok\n";
  if (scenario.adapter === "authenticated_get") {
    return String(response.headers["Content-Type"] || "")
      .toLowerCase()
      .startsWith("text/html");
  }
  let parsed;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    return false;
  }
  if (scenario.adapter === "service_customer_upsert") {
    return (
      parsed.version === "1" &&
      uuidPattern.test(parsed.customerId) &&
      parsed.outcome === "created" &&
      parsed.correlationId === request.expectedCorrelationId
    );
  }
  return (
    uuidPattern.test(parsed.receipt_id) &&
    parsed.outcome === "accepted" &&
    uuidPattern.test(parsed.normalization?.canonical_event_id) &&
    parsed.normalization?.outcome === "created"
  );
}

function executeScenario(scenario) {
  const request = requestFor(scenario);
  const startedAt = Date.now();
  const response = http.request(
    scenario.method,
    `${origin}${scenario.path}`,
    request.body || null,
    {
      headers: request.headers,
      redirects: 0,
      timeout: `${scenario.timeoutMs}ms`,
      responseType: "text",
      tags: { workload_scenario: scenario.id },
    },
  );
  const scenarioMetrics = metrics[scenario.id];
  const encodedBody = response.body
    ? encoding.b64encode(response.body, "std")
    : "";
  const bodyBytes = encodedBody
    ? (encodedBody.length * 3) / 4 -
      (encodedBody.endsWith("==") ? 2 : encodedBody.endsWith("=") ? 1 : 0)
    : 0;
  const networkError = response.status === 0 || Boolean(response.error_code);
  const expectedStatus = scenario.expectedStatuses.includes(response.status);
  const responseTooLarge = bodyBytes > scenario.maximumResponseBytes;
  const validContract =
    expectedStatus &&
    !networkError &&
    !responseTooLarge &&
    responseMatchesContract(scenario, response, request);
  const failed = !validContract;
  scenarioMetrics.completed.add(1);
  scenarioMetrics.errors.add(failed);
  scenarioMetrics.latency.add(Date.now() - startedAt);
  scenarioMetrics.responseBytes.add(bodyBytes);
  if (networkError) scenarioMetrics.networkError.add(1);
  else if (expectedStatus) scenarioMetrics.expectedStatus.add(1);
  else scenarioMetrics.unexpectedStatus.add(1);
  if (!networkError && expectedStatus && responseTooLarge) {
    scenarioMetrics.responseTooLarge.add(1);
  } else if (expectedStatus && !networkError && !validContract) {
    scenarioMetrics.invalidResponse.add(1);
  }
}

export function dashboardReadiness() {
  executeScenario(scenarioByAdapter.readiness);
}

export function customerWalletRead() {
  executeScenario(scenarioByAdapter.authenticated_get);
}

export function serviceCustomerIntake() {
  executeScenario(scenarioByAdapter.service_customer_upsert);
}

export function woocommerceOrderIntake() {
  executeScenario(scenarioByAdapter.woocommerce_order_upsert);
}

function metricValues(data, name) {
  return data.metrics[name]?.values || {};
}

export function handleSummary(data) {
  const scenarios = runtime.scenarios.map((scenario) => {
    const iterations = metricValues(
      data,
      `iterations{scenario:${scenario.id}}`,
    );
    const dropped = metricValues(
      data,
      `dropped_iterations{scenario:${scenario.id}}`,
    );
    const errors = metricValues(data, `sf_errors_${scenario.id}`);
    const latency = metricValues(data, `sf_latency_${scenario.id}`);
    return {
      scenarioId: scenario.id,
      iterations: iterations.count || 0,
      droppedIterations: dropped.count || 0,
      completed: metricValues(data, `sf_completed_${scenario.id}`).count || 0,
      errorCount: errors.passes || 0,
      errorRate: errors.rate || 0,
      expectedStatusCount:
        metricValues(data, `sf_expected_status_${scenario.id}`).count || 0,
      unexpectedStatusCount:
        metricValues(data, `sf_unexpected_status_${scenario.id}`).count || 0,
      networkErrorCount:
        metricValues(data, `sf_network_error_${scenario.id}`).count || 0,
      invalidResponseCount:
        metricValues(data, `sf_invalid_response_${scenario.id}`).count || 0,
      responseTooLargeCount:
        metricValues(data, `sf_response_too_large_${scenario.id}`).count || 0,
      responseBytes:
        metricValues(data, `sf_response_bytes_${scenario.id}`).count || 0,
      latencyMs: {
        p95: latency["p(95)"] || 0,
        p99: latency["p(99)"] || 0,
        maximum: latency.max || 0,
      },
    };
  });
  return {
    "/out/summary.json": JSON.stringify({
      schema: "starfiniti.k6-phase-summary.v1",
      phaseId: runtime.phase.id,
      durationMs: data.state.testRunDurationMs,
      vusMax: metricValues(data, "vus_max").max || 0,
      scenarios,
    }),
  };
}
