import { describe, expect, it } from "vitest";
import { resolveNotificationAuthoringAccess } from "./notification-access";

describe("notification authoring access", () => {
  it("allows authoring and lifecycle controls only to entitled managers", () => {
    expect(
      resolveNotificationAuthoringAccess(true, true, "self_hosted"),
    ).toEqual({
      authoringEnabled: true,
      lifecycleEnabled: true,
      notice: null,
      testDeliveryEnabled: true,
      testDeliveryNotice: null,
    });
  });

  it("keeps safe lifecycle controls while rollout authoring is disabled", () => {
    const access = resolveNotificationAuthoringAccess(
      true,
      false,
      "self_hosted",
    );
    expect(access.authoringEnabled).toBe(false);
    expect(access.lifecycleEnabled).toBe(true);
    expect(access.notice).toContain("rollout is disabled");
    expect(access.notice).toContain("disable or retirement");
  });

  it("does not grant lifecycle authority from entitlement alone", () => {
    const access = resolveNotificationAuthoringAccess(
      false,
      true,
      "self_hosted",
    );
    expect(access.authoringEnabled).toBe(false);
    expect(access.lifecycleEnabled).toBe(false);
    expect(access.notice).toContain("Owner or admin");
  });

  it("keeps managed template authoring but withholds the self-hosted SMTP test", () => {
    const access = resolveNotificationAuthoringAccess(true, true, "managed");
    expect(access.authoringEnabled).toBe(true);
    expect(access.lifecycleEnabled).toBe(true);
    expect(access.testDeliveryEnabled).toBe(false);
    expect(access.testDeliveryNotice).toContain("self-hosted mode");
  });
});
