import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  adaptMigrationSourceV1,
  migrationAdapterRegistryV1,
  resolveMigrationAdapterV1,
  type MigrationAdapterSha256V1,
} from "./migration-adapter-registry-v1";

const encoder = new TextEncoder();
const bytes = (value: string): Uint8Array => encoder.encode(value);
const hash = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
const sha256: MigrationAdapterSha256V1 = {
  bytes: hash,
  text: hash,
};
const fixtureContractHash = (name: string): string =>
  hash(
    readFileSync(
      new URL(`../test-fixtures/migration/${name}`, import.meta.url),
      "utf8",
    ).replace(/\r\n/gu, "\n"),
  );

const defaultContext = {
  schemaVersion: "1",
  exportId: "source-export-1",
  exportedAt: "2026-08-26T06:00:00Z",
  programmeGroupId: "11111111-1111-4111-8111-111111111111",
  programmeVersionId: "22222222-2222-4222-8222-222222222222",
  expiryPolicy: {
    mode: "apply_default",
    expiresAt: "2027-08-26T06:00:00Z",
  },
} as const;

describe("migration adapter registry V1", () => {
  it("covers every canonical source once with exact support evidence", () => {
    expect(
      migrationAdapterRegistryV1.entries.map(
        ({ sourceSystem }) => sourceSystem,
      ),
    ).toEqual([
      "generic_csv",
      "wployalty",
      "yith_points_and_rewards",
      "woorewards",
    ]);
    expect(
      migrationAdapterRegistryV1.entries.map(
        ({ supportStatus }) => supportStatus,
      ),
    ).toEqual(["supported", "supported", "fixture_required", "supported"]);

    const expectedFixtures = new Map([
      ["generic_csv_v1", fixtureContractHash("generic-v1.csv")],
      ["wployalty_csv_v1", fixtureContractHash("wployalty-v1.csv")],
      ["woorewards_json_v1", fixtureContractHash("woorewards-v1.json")],
    ]);
    for (const entry of migrationAdapterRegistryV1.entries) {
      if (entry.adapterId !== null) {
        expect(entry.referenceFixtureSha256).toBe(
          expectedFixtures.get(entry.adapterId),
        );
      }
    }
  });

  it("selects only an exact supported adapter ID and version", () => {
    const request = {
      schemaVersion: "1",
      sourceSystem: "wployalty",
      requestedAdapterId: "wployalty_csv_v1",
      requestedAdapterVersion: "1",
    };
    const first = resolveMigrationAdapterV1(request);
    expect(first).toEqual(resolveMigrationAdapterV1(request));
    expect(first).toEqual({
      schemaVersion: "1",
      registryVersion: "1",
      sourceSystem: "wployalty",
      status: "selected",
      adapterId: "wployalty_csv_v1",
      adapterVersion: "1",
      refusalReason: null,
    });
  });

  it("refuses unavailable, mismatched, and changed-version requests without echoing selectors", () => {
    const cases = [
      {
        request: {
          schemaVersion: "1",
          sourceSystem: "yith_points_and_rewards",
          requestedAdapterId: "yith_guessed_csv_v1",
          requestedAdapterVersion: "1",
        },
        reason: "source_fixture_required",
      },
      {
        request: {
          schemaVersion: "1",
          sourceSystem: "wployalty",
          requestedAdapterId: "wployalty_guessed_csv_v1",
          requestedAdapterVersion: "1",
        },
        reason: "adapter_id_mismatch",
      },
      {
        request: {
          schemaVersion: "1",
          sourceSystem: "wployalty",
          requestedAdapterId: "wployalty_csv_v1",
          requestedAdapterVersion: "2",
        },
        reason: "adapter_version_mismatch",
      },
    ] as const;

    for (const { request, reason } of cases) {
      const result = resolveMigrationAdapterV1(request);
      expect(result).toMatchObject({
        status: "refused",
        adapterId: null,
        adapterVersion: null,
        refusalReason: reason,
      });
      expect(JSON.stringify(result)).not.toContain(request.requestedAdapterId);
    }
  });

  it("uses fixture fingerprints as drift evidence rather than a merchant-file allowlist", () => {
    const entry = migrationAdapterRegistryV1.entries.find(
      ({ adapterId }) => adapterId === "wployalty_csv_v1",
    );
    const differentValidExport = bytes(
      "email,points\nnew-member@example.test,73\n",
    );

    expect(hash(differentValidExport)).not.toBe(entry?.referenceFixtureSha256);
    expect(
      adaptMigrationSourceV1(
        {
          schemaVersion: "1",
          sourceSystem: "wployalty",
          requestedAdapterId: "wployalty_csv_v1",
          requestedAdapterVersion: "1",
        },
        differentValidExport,
        defaultContext,
        sha256,
      ).adapterResult?.status,
    ).toBe("valid");
    expect(
      resolveMigrationAdapterV1({
        schemaVersion: "1",
        sourceSystem: "wployalty",
        requestedAdapterId: "wployalty_csv_v1",
        requestedAdapterVersion: "1",
      }).status,
    ).toBe("selected");
  });

  it("rejects byte, actor, tenant, and value side channels at selection", () => {
    expect(() =>
      resolveMigrationAdapterV1({
        schemaVersion: "1",
        sourceSystem: "wployalty",
        requestedAdapterId: "wployalty_csv_v1",
        requestedAdapterVersion: "1",
        sourceBytes: "email,points",
        actorUserId: crypto.randomUUID(),
        organizationId: crypto.randomUUID(),
        points: "999999",
      }),
    ).toThrow();
  });

  it("refuses YITH before hashing, decoding, or validating migration context", () => {
    let hashCalled = false;
    const execution = adaptMigrationSourceV1(
      {
        schemaVersion: "1",
        sourceSystem: "yith_points_and_rewards",
        requestedAdapterId: "yith_guessed_csv_v1",
        requestedAdapterVersion: "1",
      },
      bytes("untrusted,unknown\n=FORMULA,999999\n"),
      { actorUserId: crypto.randomUUID(), points: "999999" },
      {
        bytes: () => {
          hashCalled = true;
          throw new Error("unavailable sources must not be hashed");
        },
        text: () => {
          hashCalled = true;
          throw new Error("unavailable sources must not be hashed");
        },
      },
    );

    expect(hashCalled).toBe(false);
    expect(execution.selection.refusalReason).toBe("source_fixture_required");
    expect(execution.adapterResult).toBeNull();
    expect(JSON.stringify(execution)).not.toContain("FORMULA");
  });
});
