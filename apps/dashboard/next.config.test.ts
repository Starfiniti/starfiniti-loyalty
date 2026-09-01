import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("dashboard image runtime", () => {
  it("serves controlled static images without the native optimizer", () => {
    expect(nextConfig.images).toEqual({ unoptimized: true });
    expect(nextConfig.output).toBe("standalone");
  });
});
