import { parseServiceBearerAuthorization } from "@starfiniti/contracts";

export type ServiceApiCredential = NonNullable<
  ReturnType<typeof parseServiceBearerAuthorization>
>;

export function serviceApiCredential(
  request: Request,
): ServiceApiCredential | null {
  return parseServiceBearerAuthorization(request.headers.get("authorization"));
}

export function serviceApiRateHeaders(input: {
  limit: number;
  remaining: number;
  resetAt: string;
}): Headers {
  const resetSeconds = Math.max(
    0,
    Math.ceil((Date.parse(input.resetAt) - Date.now()) / 1000),
  );
  return new Headers({
    "RateLimit-Policy": `"service-api";q=${input.limit};w=60`,
    RateLimit: `"service-api";r=${input.remaining};t=${resetSeconds}`,
  });
}

export function serviceApiProblem(error: unknown): Response {
  const code = databaseErrorCode(error);
  const message = databaseErrorMessage(error);
  if (code === "28000") {
    return invalidServiceApiCredentialProblem();
  }
  if (code === "42501") return problem(403, "insufficient_scope");
  if (code === "P0001" && message === "service account rate limit exceeded") {
    return problem(429, "rate_limited", { "Retry-After": "60" });
  }
  if (code === "P0002" && message === "service customer not found") {
    return problem(404, "customer_not_found");
  }
  if (code === "23514" || code === "23505") {
    return problem(409, "idempotency_conflict");
  }
  if (code === "22023") return problem(422, "invalid_command");
  return problem(503, "service_unavailable");
}

export function invalidServiceApiCredentialProblem(): Response {
  return problem(401, "invalid_credential", {
    "Cache-Control": "no-store",
    "WWW-Authenticate": 'Bearer realm="starfiniti-service-api"',
  });
}

export function problem(
  status: number,
  code: string,
  headers?: HeadersInit,
): Response {
  return Response.json(
    { error: { code } },
    headers === undefined ? { status } : { status, headers },
  );
}

function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function databaseErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return undefined;
  }
  return typeof error.message === "string" ? error.message : undefined;
}
