import { describe, expect, it } from "vitest";
import {
  BoundedRequestBodyError,
  readBoundedRequestBody,
} from "./bounded-request-body";

function streamedRequest(
  chunks: readonly Uint8Array[],
  options: Readonly<{
    contentLength?: string;
    holdOpen?: boolean;
    onCancel?: () => void;
  }> = {},
): Request {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      if (chunk) {
        index += 1;
        controller.enqueue(chunk);
      } else if (!options.holdOpen) {
        controller.close();
      }
    },
    cancel() {
      options.onCancel?.();
    },
  });
  const headers = new Headers();
  if (options.contentLength !== undefined) {
    headers.set("content-length", options.contentLength);
  }
  return new Request("https://loyalty.example.test/events", {
    body,
    headers,
    method: "POST",
    duplex: "half",
  } as RequestInit);
}

describe("bounded request body", () => {
  it("accepts an exact-limit streamed body without a declared length", async () => {
    const body = await readBoundedRequestBody(
      streamedRequest([new Uint8Array([1, 2]), new Uint8Array([3, 4])]),
      4,
    );
    expect([...body]).toEqual([1, 2, 3, 4]);
  });

  it("rejects a declared oversized body before reading it", async () => {
    let cancelled = false;
    await expect(
      readBoundedRequestBody(
        streamedRequest([new Uint8Array([1])], {
          contentLength: "5",
          onCancel: () => {
            cancelled = true;
          },
        }),
        4,
      ),
    ).rejects.toMatchObject({
      code: "body_too_large",
    });
    expect(cancelled).toBe(false);
  });

  it("cancels omitted-length multi-chunk bodies at the first overflow", async () => {
    let cancelled = false;
    await expect(
      readBoundedRequestBody(
        streamedRequest([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])], {
          holdOpen: true,
          onCancel: () => {
            cancelled = true;
          },
        }),
        4,
      ),
    ).rejects.toMatchObject({
      code: "body_too_large",
    });
    expect(cancelled).toBe(true);
  });

  it("cancels a single oversized streamed chunk", async () => {
    let cancelled = false;
    await expect(
      readBoundedRequestBody(
        streamedRequest([new Uint8Array(5)], {
          holdOpen: true,
          onCancel: () => {
            cancelled = true;
          },
        }),
        4,
      ),
    ).rejects.toBeInstanceOf(BoundedRequestBodyError);
    expect(cancelled).toBe(true);
  });

  it("accepts an empty body and rejects malformed declared lengths", async () => {
    await expect(
      readBoundedRequestBody(
        new Request("https://loyalty.example.test/events", { method: "POST" }),
        4,
      ),
    ).resolves.toEqual(new Uint8Array());
    await expect(
      readBoundedRequestBody(
        streamedRequest([], { contentLength: "invalid" }),
        4,
      ),
    ).rejects.toMatchObject({
      code: "invalid_content_length",
    });
  });
});
