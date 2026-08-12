import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { updateSupabaseSession } from "./proxy";

describe("public loyalty routing", () => {
  it("serves hosted loyalty without Auth refresh and with bounded shared caching", async () => {
    const response = await updateSupabaseSession(
      new NextRequest(
        "https://loyalty.example.test/loyalty/a1000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000002?lang=sl-SI",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    expect(response.headers.get("location")).toBeNull();
  });
});
