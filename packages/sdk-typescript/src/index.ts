import { createHmac, timingSafeEqual } from "node:crypto";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOKEN = /^sflt_v1_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/u;
const SAFE_KEY = /^[A-Za-z0-9._:-]{1,255}$/u;
const ACTIVITY_CODE = /^[a-z][a-z0-9_-]{0,79}$/u;
const EVENT_TYPES = new Set([
  "loyalty.points.earned",
  "loyalty.points.released",
  "loyalty.points.expiring",
  "loyalty.reward.changed",
  "loyalty.tier.changed",
  "loyalty.referral.changed",
  "loyalty.campaign.effect",
  "loyalty.connector.health",
  "loyalty.billing.changed",
]);
const MAX_RESPONSE_BYTES = 32 * 1024;
const MAX_WEBHOOK_BYTES = 20 * 1024;

export type ServiceCustomerUpsertV1 = Readonly<{
  version: "1";
  externalCustomerId: string;
  idempotencyKey: string;
  correlationId: string;
}>;

export type ServiceActivitySourceV1 =
  | "account_created"
  | "birthday"
  | "verified_product_review"
  | "custom_activity";

export type ServiceActivityV1 = Readonly<{
  version: "1";
  externalCustomerId: string;
  eventId: string;
  occurredAt: string;
  source: ServiceActivitySourceV1;
  activityCode: string;
  productId: string | null;
  categoryIds: readonly string[];
  idempotencyKey: string;
  correlationId: string;
}>;

export type ServiceCustomerResultV1 = Readonly<{
  version: "1";
  customerId: string;
  outcome: "created" | "existing" | "duplicate";
  correlationId: string;
}>;

export type ServiceActivityResultV1 = Readonly<{
  version: "1";
  receiptId: string;
  outcome: "accepted" | "duplicate";
  canonicalEventId: string;
  canonicalOutcome: "created" | "duplicate";
  correlationId: string;
}>;

export type StarfinitiClientOptions = Readonly<{
  baseUrl: string;
  credential: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  allowInsecureLocalhost?: boolean;
}>;

export class StarfinitiApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds: number | null,
  ) {
    super(`Starfiniti API request failed with ${code} (${status})`);
    this.name = "StarfinitiApiError";
  }
}

export class StarfinitiClient {
  readonly #baseUrl: URL;
  readonly #credential: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(options: StarfinitiClientOptions) {
    const baseUrl = new URL(options.baseUrl);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(
      baseUrl.hostname,
    );
    if (
      baseUrl.username !== "" ||
      baseUrl.password !== "" ||
      baseUrl.search !== "" ||
      baseUrl.hash !== "" ||
      (baseUrl.protocol !== "https:" &&
        !(options.allowInsecureLocalhost === true && local))
    ) {
      throw new TypeError(
        "baseUrl must be an HTTPS origin without credentials",
      );
    }
    if (!TOKEN.test(options.credential)) {
      throw new TypeError("credential is not a Starfiniti service token");
    }
    const timeoutMs = options.timeoutMs ?? 15_000;
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1_000 ||
      timeoutMs > 30_000
    ) {
      throw new RangeError("timeoutMs must be between 1000 and 30000");
    }
    baseUrl.pathname = baseUrl.pathname.replace(/\/+$/u, "");
    this.#baseUrl = baseUrl;
    this.#credential = options.credential;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = timeoutMs;
  }

  async upsertCustomer(
    command: ServiceCustomerUpsertV1,
  ): Promise<ServiceCustomerResultV1> {
    assertCustomerCommand(command);
    return parseCustomerResult(
      await this.#post("api/v1/service/customers", command),
    );
  }

  async submitActivity(
    command: ServiceActivityV1,
  ): Promise<ServiceActivityResultV1> {
    assertActivityCommand(command);
    return parseActivityResult(
      await this.#post("api/v1/service/activities", command),
    );
  }

  async #post(path: string, body: object): Promise<unknown> {
    const url = new URL(this.#baseUrl);
    url.pathname = `${this.#baseUrl.pathname}/${path}`.replace(/\/{2,}/gu, "/");
    const response = await this.#fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(this.#timeoutMs),
      headers: {
        authorization: `Bearer ${this.#credential}`,
        "content-type": "application/json; charset=utf-8",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const raw = await readBoundedBody(response, MAX_RESPONSE_BYTES);
    let decoded: unknown;
    try {
      decoded = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      throw new StarfinitiApiError(response.status, "invalid_response", null);
    }
    if (!response.ok) {
      throw new StarfinitiApiError(
        response.status,
        problemCode(decoded),
        retryAfter(response.headers.get("retry-after")),
      );
    }
    return decoded;
  }
}

export type WebhookHeadersV1 = Readonly<{
  "webhook-id": string;
  "webhook-timestamp": string;
  "webhook-signature": string;
}>;

export type VerifiedWebhookV1 = Readonly<{
  id: string;
  timestamp: number;
  event: Readonly<Record<string, unknown>>;
}>;

export type WebhookReplayStore = Readonly<{
  claim(id: string, expiresAt: Date): Promise<boolean>;
}>;

export function verifyWebhookV1(
  input: Readonly<{
    rawBody: string | Uint8Array;
    headers: WebhookHeadersV1;
    secret: string;
    toleranceSeconds?: number;
    now?: Date;
  }>,
): VerifiedWebhookV1 {
  const body =
    typeof input.rawBody === "string"
      ? Buffer.from(input.rawBody, "utf8")
      : Buffer.from(input.rawBody);
  if (body.byteLength === 0 || body.byteLength > MAX_WEBHOOK_BYTES) {
    throw new WebhookVerificationError("invalid_body");
  }
  const id = input.headers["webhook-id"];
  if (!UUID.test(id)) throw new WebhookVerificationError("invalid_id");
  const timestampText = input.headers["webhook-timestamp"];
  if (!/^[0-9]{10}$/u.test(timestampText)) {
    throw new WebhookVerificationError("invalid_timestamp");
  }
  const timestamp = Number(timestampText);
  const tolerance = input.toleranceSeconds ?? 300;
  if (!Number.isInteger(tolerance) || tolerance < 1 || tolerance > 900) {
    throw new RangeError("toleranceSeconds must be between 1 and 900");
  }
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    throw new WebhookVerificationError("timestamp_outside_tolerance");
  }
  const secret = parseWebhookSecret(input.secret);
  const signed = Buffer.concat([
    Buffer.from(`${id}.${timestampText}.`, "utf8"),
    body,
  ]);
  const expected = createHmac("sha256", secret).update(signed).digest();
  const matches = input.headers["webhook-signature"]
    .split(" ")
    .filter(Boolean)
    .some((candidate) => {
      const match = /^v1,([A-Za-z0-9+/]+={0,2})$/u.exec(candidate);
      if (!match) return false;
      const supplied = Buffer.from(match[1]!, "base64");
      return (
        supplied.byteLength === expected.byteLength &&
        timingSafeEqual(supplied, expected)
      );
    });
  if (!matches) throw new WebhookVerificationError("invalid_signature");
  let event: unknown;
  try {
    event = JSON.parse(body.toString("utf8"));
  } catch {
    throw new WebhookVerificationError("invalid_json");
  }
  if (!isRecord(event) || event.schemaVersion !== "1" || event.eventId !== id) {
    throw new WebhookVerificationError("invalid_event");
  }
  if (
    typeof event.eventType !== "string" ||
    !EVENT_TYPES.has(event.eventType)
  ) {
    throw new WebhookVerificationError("invalid_event");
  }
  return { id, timestamp, event };
}

export async function verifyAndClaimWebhookV1(
  input: Readonly<{
    rawBody: string | Uint8Array;
    headers: WebhookHeadersV1;
    secret: string;
    replayStore: WebhookReplayStore;
    toleranceSeconds?: number;
    now?: Date;
  }>,
): Promise<VerifiedWebhookV1> {
  const verified = verifyWebhookV1(input);
  const tolerance = input.toleranceSeconds ?? 300;
  const claimed = await input.replayStore.claim(
    verified.id,
    new Date((verified.timestamp + tolerance) * 1000),
  );
  if (!claimed) throw new WebhookVerificationError("duplicate_webhook");
  return verified;
}

export class WebhookVerificationError extends Error {
  constructor(readonly code: string) {
    super(`Starfiniti webhook verification failed with ${code}`);
    this.name = "WebhookVerificationError";
  }
}

async function readBoundedBody(
  response: Response,
  limit: number,
): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new StarfinitiApiError(response.status, "response_too_large", null);
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function assertCustomerCommand(command: ServiceCustomerUpsertV1): void {
  if (
    command.version !== "1" ||
    !safeReference(command.externalCustomerId) ||
    !SAFE_KEY.test(command.idempotencyKey) ||
    !UUID.test(command.correlationId)
  ) {
    throw new TypeError("invalid ServiceCustomerUpsertV1 command");
  }
}

function assertActivityCommand(command: ServiceActivityV1): void {
  const canonical =
    command.source === "custom_activity" ? null : command.source;
  const occurredAt = Date.parse(command.occurredAt);
  if (
    command.version !== "1" ||
    !safeReference(command.externalCustomerId) ||
    !SAFE_KEY.test(command.eventId) ||
    !Number.isFinite(occurredAt) ||
    ![
      "account_created",
      "birthday",
      "verified_product_review",
      "custom_activity",
    ].includes(command.source) ||
    !ACTIVITY_CODE.test(command.activityCode) ||
    (canonical !== null && command.activityCode !== canonical) ||
    !Array.isArray(command.categoryIds) ||
    command.categoryIds.length > 100 ||
    command.categoryIds.some((item) => !safeReference(item)) ||
    (command.source === "verified_product_review" &&
      !safeReference(command.productId)) ||
    (command.source !== "verified_product_review" &&
      (command.productId !== null || command.categoryIds.length > 0)) ||
    !SAFE_KEY.test(command.idempotencyKey) ||
    !UUID.test(command.correlationId)
  ) {
    throw new TypeError("invalid ServiceActivityV1 command");
  }
}

function parseCustomerResult(value: unknown): ServiceCustomerResultV1 {
  if (
    !isRecord(value) ||
    value.version !== "1" ||
    !UUID.test(String(value.customerId)) ||
    !["created", "existing", "duplicate"].includes(String(value.outcome)) ||
    !UUID.test(String(value.correlationId))
  ) {
    throw new StarfinitiApiError(200, "invalid_response", null);
  }
  return value as ServiceCustomerResultV1;
}

function parseActivityResult(value: unknown): ServiceActivityResultV1 {
  if (
    !isRecord(value) ||
    value.version !== "1" ||
    !UUID.test(String(value.receiptId)) ||
    !["accepted", "duplicate"].includes(String(value.outcome)) ||
    !UUID.test(String(value.canonicalEventId)) ||
    !["created", "duplicate"].includes(String(value.canonicalOutcome)) ||
    !UUID.test(String(value.correlationId))
  ) {
    throw new StarfinitiApiError(200, "invalid_response", null);
  }
  return value as ServiceActivityResultV1;
}

function safeReference(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length >= 1 &&
    value.length <= 200 &&
    !/[\u0000-\u001F\u007F]/u.test(value)
  );
}

function parseWebhookSecret(secret: string): Buffer {
  if (!secret.startsWith("whsec_")) {
    throw new WebhookVerificationError("invalid_secret");
  }
  const encoded = secret.slice(6);
  if (!/^[A-Za-z0-9+/]{43}=$/u.test(encoded)) {
    throw new WebhookVerificationError("invalid_secret");
  }
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.byteLength !== 32 || decoded.toString("base64") !== encoded) {
    throw new WebhookVerificationError("invalid_secret");
  }
  return decoded;
}

function problemCode(value: unknown): string {
  if (
    isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    /^[a-z][a-z0-9_]{0,79}$/u.test(value.error.code)
  ) {
    return value.error.code;
  }
  return "request_failed";
}

function retryAfter(value: string | null): number | null {
  if (value === null || !/^[0-9]{1,5}$/u.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= 86_400 ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
