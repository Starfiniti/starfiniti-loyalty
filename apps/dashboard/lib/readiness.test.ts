import { describe, expect, it } from "vitest";
import { isRuntimeReady } from "./readiness";

describe("runtime readiness", () => {
  it("requires the exact database privilege result and signing material", () => {
    expect(isRuntimeReady([{ database_ready: true }], 1)).toBe(true);
    expect(isRuntimeReady([{ database_ready: true }], 0)).toBe(false);
    expect(isRuntimeReady([{ database_ready: false }], 20)).toBe(false);
    expect(isRuntimeReady([{ database_ready: null }], 20)).toBe(false);
    expect(isRuntimeReady([], 20)).toBe(false);
    expect(
      isRuntimeReady([{ database_ready: true }, { database_ready: true }], 20),
    ).toBe(false);
  });
});
