import "server-only";

import { readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";

const STRIPE_API_ORIGIN = "https://api.stripe.com";
const STRIPE_API_VERSION = "2026-02-25.clover";
const STRIPE_KEY = /^(sk|rk)_(test|live)_[A-Za-z0-9_]{16,240}$/u;
const STRIPE_CUSTOMER = /^cus_[A-Za-z0-9]{8,120}$/u;
const STRIPE_PRICE = /^price_[A-Za-z0-9]{8,120}$/u;
const STRIPE_CHECKOUT_SESSION = /^cs_(test|live)_[A-Za-z0-9]{8,180}$/u;
const STRIPE_PORTAL_SESSION = /^bps_[A-Za-z0-9]{8,180}$/u;
const IDEMPOTENCY_KEY = /^[a-z0-9][a-z0-9:_-]{15,199}$/u;
const PUBLIC_OPERATION =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_RESPONSE_BYTES = 32_768;

export type StripeBillingSessionConfig = Readonly<{
  apiKey: string;
  baseUrl: string;
  liveMode: boolean;
  publicOrigin: string;
  timeoutMs: number;
}>;

export type StripeBillingRedirect = Readonly<{
  resourceId: string;
  url: string;
}>;

export class StripeBillingSessionError extends Error {
  constructor(
    readonly code:
      | "provider_config_unavailable"
      | "provider_request_invalid"
      | "provider_rejected"
      | "provider_ambiguous"
      | "provider_response_invalid",
  ) {
    super(code);
    this.name = "StripeBillingSessionError";
  }
}

export function readStripeBillingApiKey(
  path = process.env.LOYALTY_STRIPE_API_KEY_FILE,
): string {
  if (!path || !isAbsolute(path)) {
    throw new StripeBillingSessionError("provider_config_unavailable");
  }
  let key: string;
  try {
    const metadata = statSync(path);
    if (!metadata.isFile() || metadata.size < 25 || metadata.size > 256) {
      throw new Error("invalid key file");
    }
    key = readFileSync(path, "utf8").trim();
  } catch {
    throw new StripeBillingSessionError("provider_config_unavailable");
  }
  if (!STRIPE_KEY.test(key)) {
    throw new StripeBillingSessionError("provider_config_unavailable");
  }
  return key;
}

export function stripeBillingSessionConfig(input: {
  apiKey: string;
  liveMode: boolean;
  environment?: Readonly<Record<string, string | undefined>>;
}): StripeBillingSessionConfig {
  if (!STRIPE_KEY.test(input.apiKey)) {
    throw new StripeBillingSessionError("provider_config_unavailable");
  }
  const keyMode = input.apiKey.includes("_live_");
  if (keyMode !== input.liveMode) {
    throw new StripeBillingSessionError("provider_config_unavailable");
  }
  const environment = input.environment ?? process.env;
  const publicOrigin = exactHttpsOrigin(environment.DASHBOARD_PUBLIC_ORIGIN);
  if (!publicOrigin) {
    throw new StripeBillingSessionError("provider_config_unavailable");
  }
  const testMode = environment.LOYALTY_STRIPE_TEST_MODE === "true";
  const configuredBase = environment.LOYALTY_STRIPE_BASE_URL?.trim();
  let baseUrl = STRIPE_API_ORIGIN;
  if (configuredBase) {
    if (!testMode || !isLoopbackHttpOrigin(configuredBase)) {
      throw new StripeBillingSessionError("provider_config_unavailable");
    }
    baseUrl = new URL(configuredBase).origin;
  }
  const timeoutMs = Number(environment.LOYALTY_STRIPE_TIMEOUT_MS ?? "10000");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 15_000) {
    throw new StripeBillingSessionError("provider_config_unavailable");
  }
  return {
    apiKey: input.apiKey,
    baseUrl,
    liveMode: input.liveMode,
    publicOrigin,
    timeoutMs,
  };
}

export class StripeBillingSessionClient {
  constructor(
    private readonly config: StripeBillingSessionConfig,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async createCustomer(input: {
    operationId: string;
    idempotencyKey: string;
  }): Promise<{ customerId: string }> {
    if (
      !PUBLIC_OPERATION.test(input.operationId) ||
      !IDEMPOTENCY_KEY.test(input.idempotencyKey)
    ) {
      throw new StripeBillingSessionError("provider_request_invalid");
    }
    const response = await this.post(
      "/v1/customers",
      new URLSearchParams({
        "metadata[starfiniti_billing_operation]": input.operationId,
      }),
      input.idempotencyKey,
    );
    if (!isRecord(response) || !STRIPE_CUSTOMER.test(string(response.id))) {
      throw new StripeBillingSessionError("provider_response_invalid");
    }
    return { customerId: string(response.id) };
  }

  async createCheckout(input: {
    customerId: string;
    priceId: string;
    operationId: string;
    idempotencyKey: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<StripeBillingRedirect> {
    if (
      !STRIPE_CUSTOMER.test(input.customerId) ||
      !STRIPE_PRICE.test(input.priceId) ||
      !PUBLIC_OPERATION.test(input.operationId) ||
      !IDEMPOTENCY_KEY.test(input.idempotencyKey) ||
      !isCanonicalBillingUrl(input.successUrl, this.config.publicOrigin) ||
      !isCanonicalBillingUrl(input.cancelUrl, this.config.publicOrigin)
    ) {
      throw new StripeBillingSessionError("provider_request_invalid");
    }
    const response = await this.post(
      "/v1/checkout/sessions",
      new URLSearchParams({
        mode: "subscription",
        customer: input.customerId,
        "line_items[0][price]": input.priceId,
        "line_items[0][quantity]": "1",
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.operationId,
        "subscription_data[metadata][starfiniti_billing_operation]":
          input.operationId,
      }),
      input.idempotencyKey,
    );
    return redirect(response, "checkout");
  }

  async createPortal(input: {
    customerId: string;
    idempotencyKey: string;
    returnUrl: string;
  }): Promise<StripeBillingRedirect> {
    if (
      !STRIPE_CUSTOMER.test(input.customerId) ||
      !IDEMPOTENCY_KEY.test(input.idempotencyKey) ||
      !isCanonicalBillingUrl(input.returnUrl, this.config.publicOrigin)
    ) {
      throw new StripeBillingSessionError("provider_request_invalid");
    }
    const response = await this.post(
      "/v1/billing_portal/sessions",
      new URLSearchParams({
        customer: input.customerId,
        return_url: input.returnUrl,
      }),
      input.idempotencyKey,
    );
    return redirect(response, "portal");
  }

  private async post(
    path: string,
    body: URLSearchParams,
    idempotencyKey: string,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImplementation(
        `${this.config.baseUrl}${path}`,
        {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            "content-type": "application/x-www-form-urlencoded",
            "idempotency-key": idempotencyKey,
            "stripe-version": STRIPE_API_VERSION,
          },
          body,
        },
      );
    } catch {
      throw new StripeBillingSessionError("provider_ambiguous");
    } finally {
      clearTimeout(timeout);
    }
    const payload = await boundedJson(response);
    if (!response.ok) {
      throw new StripeBillingSessionError(
        response.status === 409 ||
          response.status === 429 ||
          response.status >= 500
          ? "provider_ambiguous"
          : "provider_rejected",
      );
    }
    return payload;
  }
}

async function boundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new StripeBillingSessionError("provider_response_invalid");
  }
  if (!response.body) {
    throw new StripeBillingSessionError("provider_response_invalid");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw new StripeBillingSessionError("provider_response_invalid");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new StripeBillingSessionError("provider_response_invalid");
  }
}

function redirect(
  value: unknown,
  kind: "checkout" | "portal",
): StripeBillingRedirect {
  if (!isRecord(value)) {
    throw new StripeBillingSessionError("provider_response_invalid");
  }
  const resourceId = string(value.id);
  const url = string(value.url);
  const resourceValid =
    kind === "checkout"
      ? STRIPE_CHECKOUT_SESSION.test(resourceId)
      : STRIPE_PORTAL_SESSION.test(resourceId);
  if (!resourceValid || !isStripeRedirect(url, kind)) {
    throw new StripeBillingSessionError("provider_response_invalid");
  }
  return { resourceId, url };
}

function isStripeRedirect(value: string, kind: "checkout" | "portal"): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    return kind === "checkout"
      ? url.origin === "https://checkout.stripe.com" &&
          url.pathname.startsWith("/c/pay/")
      : url.origin === "https://billing.stripe.com" &&
          url.pathname.startsWith("/p/session/");
  } catch {
    return false;
  }
}

function isCanonicalBillingUrl(value: string, publicOrigin: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === publicOrigin &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname === "/billing" &&
      url.search.length <= 160
    );
  } catch {
    return false;
  }
}

function exactHttpsOrigin(value: string | undefined): string | undefined {
  if (!value || value !== value.trim() || value !== value.toLowerCase()) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.origin !== value ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function isLoopbackHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "[::1]") &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
