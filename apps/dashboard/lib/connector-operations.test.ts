import { describe, expect, it } from "vitest";
import {
  canRetryConnectorEffect,
  connectorHealth,
  connectorIssueLabel,
} from "./connector-operations";

describe("connector operation presentation", () => {
  it("limits replay authority to operational mutation roles", () => {
    expect(canRetryConnectorEffect("owner")).toBe(true);
    expect(canRetryConnectorEffect("admin")).toBe(true);
    expect(canRetryConnectorEffect("operator")).toBe(true);
    expect(canRetryConnectorEffect("analyst")).toBe(false);
    expect(canRetryConnectorEffect("auditor")).toBe(false);
  });

  it("prioritizes failure and disabled health states", () => {
    const now = Date.parse("2026-08-12T10:00:00Z");
    expect(
      connectorHealth(
        { status: "active", lastSeenAt: "2026-08-12T09:59:00Z", failedCount: 1 },
        now,
      ),
    ).toBe("attention");
    expect(
      connectorHealth(
        { status: "disabled", lastSeenAt: null, failedCount: 2 },
        now,
      ),
    ).toBe("disabled");
  });

  it("marks missing or old heartbeats stale", () => {
    const now = Date.parse("2026-08-12T10:00:00Z");
    expect(
      connectorHealth({ status: "active", lastSeenAt: null, failedCount: 0 }, now),
    ).toBe("stale");
    expect(
      connectorHealth(
        { status: "active", lastSeenAt: "2026-08-12T09:40:00Z", failedCount: 0 },
        now,
      ),
    ).toBe("stale");
  });

  it("uses safe operator-facing labels", () => {
    expect(connectorIssueLabel("delivery")).toBe("Delivery normalization");
    expect(connectorIssueLabel("effect")).toBe("Loyalty effect");
    expect(connectorIssueLabel("command")).toBe("WooCommerce command");
  });
});
