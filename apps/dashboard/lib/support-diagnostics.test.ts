import { describe, expect, it } from "vitest";
import {
  buildSupportDiagnostics,
  SUPPORT_DIAGNOSTICS_SCHEMA,
} from "./support-diagnostics";

const baseConnection = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "active",
  lastSeenAt: "2026-08-12T12:00:00.000Z",
  deliveriesReady: 2,
  deliveriesFailed: 1,
  effectsReady: 3,
  effectsFailed: 2,
  commandsReady: 4,
  commandsFailed: 0,
  issues: [
    {
      kind: "effect",
      id: "private-item-one",
      state: "dead_letter",
      errorCode: "wallet_lock_timeout",
      attemptCount: 3,
      operationKind: "award_order",
      observedAt: "2026-08-12T11:00:00.000Z",
      retryAllowed: true,
    },
    {
      kind: "effect",
      id: "private-item-two",
      state: "dead_letter",
      errorCode: "wallet_lock_timeout",
      attemptCount: 5,
      operationKind: "award_order",
      observedAt: "2026-08-12T11:30:00.000Z",
      retryAllowed: true,
    },
  ],
  displayName: "Secret merchant store name",
  rawPayload: { email: "customer@example.test" },
  signingKeyReference: "vault/private/signing-key",
};

function build() {
  return buildSupportDiagnostics({
    generatedAt: "2026-08-12T12:30:00.000Z",
    organizationId: "22222222-2222-4222-8222-222222222222",
    workspaceId: "33333333-3333-4333-8333-333333333333",
    programmeGroupId: "44444444-4444-4444-8444-444444444444",
    issueSampleLimit: 25,
    connections: [baseConnection],
  });
}

describe("support diagnostics", () => {
  it("emits a versioned tenant-scoped aggregate", () => {
    const result = build();
    expect(result.schema).toBe(SUPPORT_DIAGNOSTICS_SCHEMA);
    expect(result.scope.workspaceId).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
    expect(result.connections[0]?.queues).toEqual({
      deliveries: { ready: 2, failed: 1 },
      effects: { ready: 3, failed: 2 },
      commands: { ready: 4, failed: 0 },
    });
    expect(result.connections[0]?.issueSample).toEqual({
      returned: 2,
      limit: 25,
    });
  });

  it("aggregates issue evidence without exporting item identities", () => {
    expect(build().connections[0]?.issueGroups).toEqual([
      {
        kind: "effect",
        state: "dead_letter",
        operationKind: "award_order",
        errorCode: "wallet_lock_timeout",
        count: 2,
        maximumAttempts: 5,
        latestObservedAt: "2026-08-12T11:30:00.000Z",
        retryAllowed: true,
      },
    ]);
  });

  it("omits payload, customer, store-name, item-id, and signing evidence", () => {
    const serialized = JSON.stringify(build());
    for (const forbidden of [
      "customer@example.test",
      "private-item-one",
      "private-item-two",
      "Secret merchant store name",
      "vault/private/signing-key",
      "rawPayload",
      "signingKeyReference",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("normalizes impossible queue counters instead of exporting corrupt values", () => {
    const result = buildSupportDiagnostics({
      generatedAt: "2026-08-12T12:30:00.000Z",
      organizationId: "org",
      workspaceId: null,
      programmeGroupId: null,
      issueSampleLimit: 25,
      connections: [
        {
          ...baseConnection,
          deliveriesReady: -1,
          effectsReady: Number.POSITIVE_INFINITY,
          commandsReady: 1.5,
        },
      ],
    });
    expect(result.connections[0]?.queues).toMatchObject({
      deliveries: { ready: 0 },
      effects: { ready: 0 },
      commands: { ready: 0 },
    });
  });

  it("redacts noncanonical diagnostic strings that could contain private data", () => {
    const result = buildSupportDiagnostics({
      generatedAt: "2026-08-12T12:30:00.000Z",
      organizationId: "org",
      workspaceId: null,
      programmeGroupId: null,
      issueSampleLimit: 25,
      connections: [
        {
          ...baseConnection,
          issues: [
            {
              ...baseConnection.issues[0]!,
              errorCode: "customer@example.test failed",
              operationKind: "award for private order #123",
            },
          ],
        },
      ],
    });
    expect(result.connections[0]?.issueGroups[0]).toMatchObject({
      errorCode: "redacted_noncanonical_code",
      operationKind: "redacted_noncanonical_operation",
    });
    expect(JSON.stringify(result)).not.toContain("customer@example.test");
    expect(JSON.stringify(result)).not.toContain("private order");
  });
});
