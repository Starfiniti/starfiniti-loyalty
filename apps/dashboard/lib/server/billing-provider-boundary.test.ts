import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runManagedBillingOperation } from "./billing-provider-boundary";

describe("managed billing provider boundary", () => {
  it("returns before provider construction in self-hosted mode", async () => {
    const createProvider = vi.fn(() => ({ request: vi.fn() }));
    const execute = vi.fn(async () => "unexpected");

    await expect(
      runManagedBillingOperation({
        deploymentMode: "self_hosted",
        createProvider,
        execute,
      }),
    ).resolves.toEqual({
      kind: "self_hosted",
      reason: "billing_not_applicable",
    });
    expect(createProvider).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("constructs one provider only after managed mode is authoritative", async () => {
    const provider = { name: "sandbox" };
    const createProvider = vi.fn(() => provider);
    const execute = vi.fn(async (received: typeof provider) => received.name);

    await expect(
      runManagedBillingOperation({
        deploymentMode: "managed",
        createProvider,
        execute,
      }),
    ).resolves.toEqual({ kind: "managed", value: "sandbox" });
    expect(createProvider).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(provider);
  });
});
