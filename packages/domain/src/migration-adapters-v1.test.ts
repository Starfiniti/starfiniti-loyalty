import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  adaptGenericMigrationCsvV1,
  adaptWooRewardsJsonV1,
  adaptWPLoyaltyCsvV1,
  genericMigrationCsvHeaderV1,
  migrationAdapterIssuesCsvV1,
  type MigrationAdapterSha256V1,
} from "./migration-adapters-v1";

const encoder = new TextEncoder();
const bytes = (value: string): Uint8Array => encoder.encode(value);
const fixture = (name: string): Uint8Array =>
  new Uint8Array(
    readFileSync(
      new URL(`../test-fixtures/migration/${name}`, import.meta.url),
    ),
  );
const hash = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
const sha256: MigrationAdapterSha256V1 = {
  bytes: hash,
  text: hash,
};

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

const exactContext = {
  ...defaultContext,
  expiryPolicy: { mode: "preserve_exact" },
} as const;

describe("migration source adapters V1", () => {
  it("translates the exact generic CSV shape with grouped lots deterministically", () => {
    const source = fixture("generic-v1.csv");
    const first = adaptGenericMigrationCsvV1(source, exactContext, sha256);
    const second = adaptGenericMigrationCsvV1(source, exactContext, sha256);

    expect(first).toEqual(second);
    expect(first.status).toBe("valid");
    expect(first.sourceExportSha256).toBe(hash(source));
    expect(first.physicalRowCount).toBe(3);
    expect(first.rowCount).toBe(2);
    expect(first.document?.source.system).toBe("generic_csv");
    expect(first.document?.rows.map(({ sourceRowId }) => sourceRowId)).toEqual([
      "row-a",
      "row-b",
    ]);
    expect(first.document?.rows[0]?.balance).toEqual({
      availablePoints: "100",
      pendingPoints: "40",
      lots: [
        {
          sourceLotId: "available-a",
          bucket: "available",
          points: "100",
          availableAt: "2026-08-26T06:00:00Z",
          expiresAt: "2027-08-26T06:00:00Z",
        },
        {
          sourceLotId: "pending-a",
          bucket: "pending",
          points: "40",
          availableAt: "2026-08-27T06:00:00Z",
          expiresAt: "2027-08-27T06:00:00Z",
        },
      ],
    });
    expect(first.document?.rows[0]?.tier?.sourceTierCode).toBe("icon");
    expect(first.document?.rows[0]?.referral?.sourceReferralId).toBe("ref-a");
    expect(first.canonicalDocumentSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("rejects generic header drift, conflicting rows, duplicate lots, and unreconciled totals", () => {
    const header = genericMigrationCsvHeaderV1.join(",");
    const unknownHeader = adaptGenericMigrationCsvV1(
      bytes(`${header},unexpected\n`),
      exactContext,
      sha256,
    );
    expect(unknownHeader.status).toBe("invalid");
    expect(unknownHeader.issues).toEqual([
      { rowNumber: 1, code: "unsupported_header", field: "header" },
    ]);

    const row =
      "row-a,email,ada@example.test,100,0,lot-a,available,100,2026-08-26T06:00:00Z,2027-08-26T06:00:00Z,,,,";
    const conflict =
      "row-a,email,ada@example.test,101,0,lot-b,available,101,2026-08-26T06:00:00Z,2027-08-26T06:00:00Z,,,,";
    const conflicting = adaptGenericMigrationCsvV1(
      bytes(`${header}\n${row}\n${conflict}\n`),
      exactContext,
      sha256,
    );
    expect(conflicting.issues).toContainEqual({
      rowNumber: 3,
      code: "conflicting_source_row",
      field: "source_row_id",
    });

    const duplicateLot = adaptGenericMigrationCsvV1(
      bytes(`${header}\n${row}\n${row}\n`),
      exactContext,
      sha256,
    );
    expect(duplicateLot.issues).toContainEqual({
      rowNumber: 3,
      code: "duplicate_lot",
      field: "source_lot_id",
    });

    const unreconciled = adaptGenericMigrationCsvV1(
      bytes(
        `${header}\nrow-a,email,ada@example.test,100,0,lot-a,available,99,2026-08-26T06:00:00Z,2027-08-26T06:00:00Z,,,,\n`,
      ),
      exactContext,
      sha256,
    );
    expect(unreconciled.issues).toEqual([
      { rowNumber: 1, code: "invalid_document", field: "file" },
    ]);
  });

  it("translates only the two published WPLoyalty CSV headers", () => {
    const source = fixture("wployalty-v1.csv");
    const result = adaptWPLoyaltyCsvV1(source, defaultContext, sha256);

    expect(result.status).toBe("valid");
    expect(result.physicalRowCount).toBe(2);
    expect(result.document?.source.system).toBe("wployalty");
    expect(result.document?.rows).toMatchObject([
      {
        sourceRowId: "row-2",
        identity: { kind: "email", value: "ada@example.test" },
        balance: { availablePoints: "190", pendingPoints: "0", lots: [] },
        referral: { sourceReferralId: "ada-ref", state: "active" },
      },
      {
        sourceRowId: "row-3",
        identity: { kind: "email", value: "grace@example.test" },
        balance: { availablePoints: "224", pendingPoints: "0", lots: [] },
        referral: null,
      },
    ]);

    const twoColumns = adaptWPLoyaltyCsvV1(
      bytes("email,points\nada@example.test,190\n"),
      defaultContext,
      sha256,
    );
    expect(twoColumns.status).toBe("valid");

    const zeroBalanceWithUnsupportedExactExpiry = adaptWPLoyaltyCsvV1(
      bytes("email,points\nada@example.test,0\n"),
      exactContext,
      sha256,
    );
    expect(zeroBalanceWithUnsupportedExactExpiry.issues).toEqual([
      { rowNumber: 1, code: "invalid_document", field: "file" },
    ]);

    for (const changedHeader of [
      "points,email",
      "Email,points",
      "email,points,name",
    ]) {
      expect(
        adaptWPLoyaltyCsvV1(
          bytes(`${changedHeader}\n190,ada@example.test\n`),
          defaultContext,
          sha256,
        ).issues[0],
      ).toEqual({
        rowNumber: 1,
        code: "unsupported_header",
        field: "header",
      });
    }
  });

  it("accepts an optional UTF-8 BOM but rejects ambiguous encodings and line endings", () => {
    const plain = bytes("email,points\nada@example.test,190\n");
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...plain]);
    expect(adaptWPLoyaltyCsvV1(withBom, defaultContext, sha256).status).toBe(
      "valid",
    );

    expect(
      adaptWPLoyaltyCsvV1(
        new Uint8Array([0xff, 0xfe, 0x65, 0x00]),
        defaultContext,
        sha256,
      ).issues[0]?.code,
    ).toBe("invalid_utf8");
    expect(
      adaptWPLoyaltyCsvV1(
        bytes("email,points\rada@example.test,190\r"),
        defaultContext,
        sha256,
      ).issues[0]?.code,
    ).toBe("invalid_line_ending");
  });

  it("rejects formulas and duplicate email identities without echoing source values", () => {
    const result = adaptWPLoyaltyCsvV1(
      bytes(
        "email,points,referral_code\n=HYPERLINK(https://bad.test),+10,@ref\ndupe@example.test,10,\ndupe@example.test,20,\n",
      ),
      defaultContext,
      sha256,
    );
    const errorCsv = migrationAdapterIssuesCsvV1(result);

    expect(result.status).toBe("invalid");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { rowNumber: 2, code: "formula_like_value", field: "email" },
        { rowNumber: 2, code: "formula_like_value", field: "points" },
        {
          rowNumber: 2,
          code: "formula_like_value",
          field: "referral_code",
        },
        {
          rowNumber: 3,
          code: "duplicate_source_identity",
          field: "email",
        },
        {
          rowNumber: 4,
          code: "duplicate_source_identity",
          field: "email",
        },
      ]),
    );
    expect(errorCsv).not.toContain("HYPERLINK");
    expect(errorCsv).not.toContain("dupe@example.test");
    expect(errorCsv).not.toMatch(/(?:^|,)[=+@-]/mu);
  });

  it("does not use evidence digests as row or identity equality authority", () => {
    const constantDigest: MigrationAdapterSha256V1 = {
      bytes: () => "a".repeat(64),
      text: () => "a".repeat(64),
    };
    const header = genericMigrationCsvHeaderV1.join(",");
    const conflicting = adaptGenericMigrationCsvV1(
      bytes(
        `${header}\nrow-a,email,ada@example.test,10,0,,,,,,,,,\nrow-a,email,grace@example.test,20,0,,,,,,,,,\n`,
      ),
      defaultContext,
      constantDigest,
    );
    expect(conflicting.issues).toContainEqual({
      rowNumber: 3,
      code: "conflicting_source_row",
      field: "source_row_id",
    });

    const duplicateIdentity = adaptWPLoyaltyCsvV1(
      bytes("email,points\nmember@example.test,10\nmember@example.test,20\n"),
      defaultContext,
      constantDigest,
    );
    expect(duplicateIdentity.issues).toEqual(
      expect.arrayContaining([
        {
          rowNumber: 2,
          code: "duplicate_source_identity",
          field: "email",
        },
        {
          rowNumber: 3,
          code: "duplicate_source_identity",
          field: "email",
        },
      ]),
    );
  });

  it("translates the exact published WooRewards JSON string shape", () => {
    const source = fixture("woorewards-v1.json");
    const result = adaptWooRewardsJsonV1(source, defaultContext, sha256);

    expect(result.status).toBe("valid");
    expect(result.sourceExportSha256).toBe(hash(source));
    expect(result.document?.source.system).toBe("woorewards");
    expect(
      result.document?.rows.map(({ balance }) => balance.availablePoints),
    ).toEqual(["190", "224"]);
    expect(adaptWooRewardsJsonV1(source, defaultContext, sha256)).toEqual(
      result,
    );

    const unsupportedExactExpiry = adaptWooRewardsJsonV1(
      bytes('[{"email":"ada@example.test","points":"0"}]'),
      exactContext,
      sha256,
    );
    expect(unsupportedExactExpiry.issues).toEqual([
      { rowNumber: 1, code: "invalid_document", field: "file" },
    ]);
  });

  it("fails WooRewards duplicate, extra, missing, numeric, nested, and trailing shapes closed", () => {
    const cases: Array<[string, string]> = [
      [
        '[{"email":"ada@example.test","email":"other@example.test","points":"10"}]',
        "duplicate_property",
      ],
      [
        '[{"email":"ada@example.test","points":"10","name":"Ada"}]',
        "unsupported_property",
      ],
      ['[{"email":"ada@example.test"}]', "unsupported_property"],
      ['[{"email":"ada@example.test","points":10}]', "invalid_json"],
      [
        '[{"email":"ada@example.test","points":{"value":"10"}}]',
        "invalid_json",
      ],
      ['[{"email":"ada@example.test","points":"10"},]', "invalid_json"],
    ];
    for (const [source, expectedCode] of cases) {
      const result = adaptWooRewardsJsonV1(
        bytes(source),
        defaultContext,
        sha256,
      );
      expect(result.status).toBe("invalid");
      expect(result.issues.map(({ code }) => code)).toContain(expectedCode);
      expect(JSON.stringify(result)).not.toContain("ada@example.test");
    }
  });

  it("bounds file, row, integer, issue, and error-export amplification", () => {
    let oversizedHashCalled = false;
    const oversized = adaptWPLoyaltyCsvV1(
      new Uint8Array(5 * 1024 * 1024 + 1),
      defaultContext,
      {
        bytes: () => {
          oversizedHashCalled = true;
          throw new Error("oversized payload must not be hashed");
        },
        text: hash,
      },
    );
    expect(oversizedHashCalled).toBe(false);
    expect(oversized.sourceExportSha256).toBeNull();
    expect(oversized.issues).toEqual([
      { rowNumber: 1, code: "file_too_large", field: "file" },
    ]);

    const overflow = adaptWPLoyaltyCsvV1(
      bytes("email,points\nada@example.test,9223372036854775808\n"),
      defaultContext,
      sha256,
    );
    expect(overflow.issues[0]?.code).toBe("invalid_points");

    const tooManyRows = Array.from(
      { length: 501 },
      (_, index) => `member-${index}@example.test,1`,
    ).join("\n");
    expect(
      adaptWPLoyaltyCsvV1(
        bytes(`email,points\n${tooManyRows}\n`),
        defaultContext,
        sha256,
      ).issues[0],
    ).toEqual({ rowNumber: 502, code: "too_many_rows", field: "row" });

    const invalidRows = Array.from(
      { length: 150 },
      (_, index) => `bad-${index},not-an-integer`,
    ).join("\n");
    const manyIssues = adaptWPLoyaltyCsvV1(
      bytes(`email,points\n${invalidRows}\n`),
      defaultContext,
      sha256,
    );
    const errorCsv = migrationAdapterIssuesCsvV1(manyIssues);
    expect(manyIssues.issueCount).toBe(300);
    expect(manyIssues.issues).toHaveLength(100);
    expect(manyIssues.truncatedIssueCount).toBe(200);
    expect(errorCsv.trimEnd().split("\r\n")).toHaveLength(101);
    expect(errorCsv).not.toContain("bad-149");
  });

  it("rejects invalid adapter context and never accepts a caller value side channel", () => {
    expect(() =>
      adaptWPLoyaltyCsvV1(
        bytes("email,points\nada@example.test,10\n"),
        { ...defaultContext, organizationId: "forged" },
        sha256,
      ),
    ).toThrow();
    expect(() =>
      adaptWooRewardsJsonV1(
        bytes('[{"email":"ada@example.test","points":"10"}]'),
        { ...defaultContext, actorUserId: crypto.randomUUID() },
        sha256,
      ),
    ).toThrow();
  });
});
