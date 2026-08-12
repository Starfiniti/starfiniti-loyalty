import { describe, expect, it } from "vitest";
import { customerDataExportV1 } from "./customer-export";

const timestamp = "2026-08-12T18:30:00+00:00";

function fixture() {
  return {
    schemaVersion: "starfiniti.customer-data-export.v1",
    exportId: "a1000000-0000-4000-8000-000000000001",
    generatedAt: timestamp,
    authSubjectId: "a1000000-0000-4000-8000-000000000002",
    authentication: { email: "member@example.test" },
    accounts: [
      {
        accountId: "a1000000-0000-4000-8000-000000000003",
        linkedAt: timestamp,
        customer: {
          id: "a1000000-0000-4000-8000-000000000004",
          status: "active",
          displayReference: "Member 42",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        store: {
          connectionId: "a1000000-0000-4000-8000-000000000005",
          externalStoreId: "store-42",
          displayName: "Rosy Store",
          status: "active",
          workspaceId: "a1000000-0000-4000-8000-000000000006",
          workspaceName: "Rosy Store",
        },
        identities: [
          {
            id: "a1000000-0000-4000-8000-000000000007",
            kind: "registered",
            externalCustomerId: "42",
            connectionId: "a1000000-0000-4000-8000-000000000005",
            storeName: "Rosy Store",
            verifiedAt: timestamp,
            createdAt: timestamp,
          },
        ],
        wallets: [
          {
            id: "a1000000-0000-4000-8000-000000000008",
            status: "active",
            programmeGroup: {
              id: "a1000000-0000-4000-8000-000000000009",
              name: "Rosy Rewards",
            },
            createdAt: timestamp,
            updatedAt: timestamp,
            balances: [
              {
                kind: "available",
                points: "9007199254740993",
                updatedAt: timestamp,
              },
            ],
            tierMemberships: [
              {
                tierCode: "rose",
                effectiveFrom: timestamp,
                effectiveUntil: null,
              },
            ],
            reservations: [],
            ledger: [
              {
                id: "a1000000-0000-4000-8000-000000000010",
                kind: "award",
                effectiveAt: timestamp,
                createdAt: timestamp,
                entries: [
                  {
                    id: "a1000000-0000-4000-8000-000000000011",
                    accountKind: "pending",
                    points: "9007199254740993",
                    createdAt: timestamp,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("customer data export contract", () => {
  it("accepts exact text-form points and subject-owned channel identity", () => {
    expect(customerDataExportV1.safeParse(fixture()).success).toBe(true);
  });

  it("rejects internal authority and evidence fields", () => {
    expect(
      customerDataExportV1.safeParse({
        ...fixture(),
        signingMaterial: "secret",
      }).success,
    ).toBe(false);
    expect(
      customerDataExportV1.safeParse({
        ...fixture(),
        accounts: fixture().accounts.map((account) => ({
          ...account,
          wallets: account.wallets.map((wallet) => ({
            ...wallet,
            ledger: wallet.ledger.map((transaction) => ({
              ...transaction,
              actorId: "private-worker",
            })),
          })),
        })),
      }).success,
    ).toBe(false);
  });

  it("rejects unsafe point coercion and unknown lifecycle states", () => {
    const candidate = fixture();
    candidate.accounts[0]!.wallets[0]!.balances[0]!.points = "1.5";
    candidate.accounts[0]!.store.status = "compromised";
    expect(customerDataExportV1.safeParse(candidate).success).toBe(false);
  });
});
