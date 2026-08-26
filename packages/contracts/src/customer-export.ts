import { z } from "zod";

const timestamp = z.iso.datetime({ offset: true });
const exactInteger = z.string().regex(/^-?(?:0|[1-9][0-9]*)$/u);

const exportLedgerEntryV1 = z
  .object({
    id: z.uuid(),
    accountKind: z.enum([
      "pending",
      "available",
      "reserved",
      "spent",
      "expired",
      "reversed",
    ]),
    points: exactInteger,
    createdAt: timestamp,
  })
  .strict();

const exportLedgerTransactionV1 = z
  .object({
    id: z.uuid(),
    kind: z.enum([
      "award",
      "release",
      "reserve",
      "capture",
      "cancel",
      "expire",
      "refund_reversal",
      "manual_adjustment",
      "opening_balance",
    ]),
    effectiveAt: timestamp,
    createdAt: timestamp,
    entries: z.array(exportLedgerEntryV1),
  })
  .strict();

const exportWalletV1 = z
  .object({
    id: z.uuid(),
    status: z.enum(["active", "blocked", "closed"]),
    programmeGroup: z
      .object({ id: z.uuid(), name: z.string().min(1).max(200) })
      .strict(),
    createdAt: timestamp,
    updatedAt: timestamp,
    balances: z.array(
      z
        .object({
          kind: z.enum([
            "pending",
            "available",
            "reserved",
            "spent",
            "expired",
            "reversed",
          ]),
          points: exactInteger,
          updatedAt: timestamp,
        })
        .strict(),
    ),
    tierMemberships: z.array(
      z
        .object({
          tierCode: z.string().min(1).max(80),
          effectiveFrom: timestamp,
          effectiveUntil: timestamp.nullable(),
        })
        .strict(),
    ),
    reservations: z.array(
      z
        .object({
          id: z.uuid(),
          rewardCode: z.string().min(1).max(80),
          rewardName: z.string().min(1).max(200),
          costPoints: z.string().regex(/^[1-9][0-9]*$/u),
          state: z.enum([
            "requested",
            "reserved",
            "issued",
            "captured",
            "cancelled",
            "expired",
            "failed",
            "released",
          ]),
          expiresAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .strict(),
    ),
    ledger: z.array(exportLedgerTransactionV1),
  })
  .strict();

const exportAccountV1 = z
  .object({
    accountId: z.uuid(),
    linkedAt: timestamp,
    customer: z
      .object({
        id: z.uuid(),
        status: z.literal("active"),
        displayReference: z.string().min(1).max(200).nullable(),
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .strict(),
    store: z
      .object({
        connectionId: z.uuid(),
        externalStoreId: z.string().min(1).max(255),
        displayName: z.string().min(1).max(200),
        status: z.enum(["active", "disabled", "rotating"]),
        workspaceId: z.uuid(),
        workspaceName: z.string().min(1).max(200),
      })
      .strict(),
    identities: z.array(
      z
        .object({
          id: z.uuid(),
          kind: z.enum(["registered", "guest"]),
          externalCustomerId: z.string().min(1).max(255),
          connectionId: z.uuid(),
          storeName: z.string().min(1).max(200),
          verifiedAt: timestamp.nullable(),
          createdAt: timestamp,
        })
        .strict(),
    ),
    wallets: z.array(exportWalletV1),
  })
  .strict();

export const customerDataExportV1 = z
  .object({
    schemaVersion: z.literal("starfiniti.customer-data-export.v1"),
    exportId: z.uuid(),
    generatedAt: timestamp,
    authSubjectId: z.uuid(),
    authentication: z
      .object({ email: z.string().email().max(320).nullable() })
      .strict(),
    accounts: z.array(exportAccountV1),
  })
  .strict();

export type CustomerDataExportV1 = z.infer<typeof customerDataExportV1>;
