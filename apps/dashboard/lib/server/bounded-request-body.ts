export type BoundedRequestBodyFailure =
  "body_too_large" | "invalid_content_length";

export class BoundedRequestBodyError extends Error {
  readonly code: BoundedRequestBodyFailure;

  constructor(code: BoundedRequestBodyFailure) {
    super(code);
    this.name = "BoundedRequestBodyError";
    this.code = code;
  }
}

export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("maxBytes must be a non-negative safe integer");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/u.test(declaredLength)) {
      throw new BoundedRequestBodyError("invalid_content_length");
    }
    if (BigInt(declaredLength) > BigInt(maxBytes)) {
      throw new BoundedRequestBodyError("body_too_large");
    }
  }

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maxBytes - totalBytes) {
        try {
          await reader.cancel("body_too_large");
        } catch {
          // The limit decision is authoritative even if transport cancellation fails.
        }
        throw new BoundedRequestBodyError("body_too_large");
      }
      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
