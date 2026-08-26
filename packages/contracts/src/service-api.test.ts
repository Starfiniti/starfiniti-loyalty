import { describe, expect, it } from "vitest";
import {
  createServiceAccountCommandV1,
  issueServiceCredentialToken,
  parseServiceBearerAuthorization,
  serviceActivityCommandV1,
  serviceCustomerUpsertCommandV1,
} from "./service-api";

const credentialId = "10000000-0000-4000-8000-000000000001";

describe("service API contracts", () => {
  it("issues and parses one high-entropy opaque credential", () => {
    const issued = issueServiceCredentialToken(
      credentialId,
      Uint8Array.from({ length: 32 }, (_, index) => index),
    );
    expect(issued.token).toMatch(/^sflt_v1_[0-9a-f]{32}_[\w-]{43}$/u);
    expect(issued.token).not.toContain(credentialId);
    expect(issued.tokenSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(parseServiceBearerAuthorization(`Bearer ${issued.token}`)).toEqual({
      credentialId,
      tokenSha256: issued.tokenSha256,
      hint: issued.hint,
    });
    expect(parseServiceBearerAuthorization(issued.token)).toBeNull();
    expect(parseServiceBearerAuthorization("Bearer malformed")).toBeNull();
    expect(() =>
      issueServiceCredentialToken(credentialId, new Uint8Array(31)),
    ).toThrow("32 bytes");
  });

  it("keeps tenant and actor authority out of management and customer commands", () => {
    const create = createServiceAccountCommandV1.parse({
      version: "1",
      workspaceId: "20000000-0000-4000-8000-000000000001",
      programmeId: "30000000-0000-4000-8000-000000000001",
      displayName: "ERP production",
      scopes: ["customers:write", "activities:write"],
      requestsPerMinute: 120,
      idempotencyKey: "service-account:create:one",
      correlationId: "40000000-0000-4000-8000-000000000001",
    });
    expect(create).not.toHaveProperty("organizationId");
    expect(create).not.toHaveProperty("actorId");
    expect(create).not.toHaveProperty("connectionId");

    expect(() =>
      serviceCustomerUpsertCommandV1.parse({
        version: "1",
        externalCustomerId: "crm-customer-42",
        idempotencyKey: "customer:42",
        correlationId: "40000000-0000-4000-8000-000000000001",
        organizationId: "50000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
  });

  it("requires canonical verified-review activity selectors", () => {
    const base = {
      version: "1",
      externalCustomerId: "crm-customer-42",
      eventId: "review-42",
      occurredAt: "2026-08-26T09:00:00+02:00",
      source: "verified_product_review",
      activityCode: "verified_product_review",
      productId: "product-42",
      categoryIds: ["category-7"],
      idempotencyKey: "activity:review-42",
      correlationId: "40000000-0000-4000-8000-000000000001",
    } as const;
    expect(serviceActivityCommandV1.parse(base).productId).toBe("product-42");
    expect(() =>
      serviceActivityCommandV1.parse({ ...base, productId: null }),
    ).toThrow();
    expect(() =>
      serviceActivityCommandV1.parse({
        ...base,
        source: "birthday",
        activityCode: "birthday",
      }),
    ).toThrow();
  });

  it("rejects duplicate scopes and unsafe external identities", () => {
    expect(() =>
      createServiceAccountCommandV1.parse({
        version: "1",
        workspaceId: "20000000-0000-4000-8000-000000000001",
        programmeId: "30000000-0000-4000-8000-000000000001",
        displayName: "ERP",
        scopes: ["customers:write", "customers:write"],
        requestsPerMinute: 120,
        idempotencyKey: "service-account:create:one",
        correlationId: "40000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
    expect(() =>
      serviceCustomerUpsertCommandV1.parse({
        version: "1",
        externalCustomerId: "unsafe\nidentity",
        idempotencyKey: "customer:unsafe",
        correlationId: "40000000-0000-4000-8000-000000000001",
      }),
    ).toThrow();
  });
});
