import { X509Certificate } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  isPublicFederationAddress,
  validateOrganizationFederationConfiguration,
  type FederationValidationRuntime,
} from "./federation-validation";

const configurationSha256 = "a".repeat(64);
const validationTime = new Date("2026-08-26T13:00:00.000Z");
const certificate =
  "MIIDFTCCAf2gAwIBAgIUP5qSDebfmF0sYq65t5TVN0fUcDAwDQYJKoZIhvcNAQELBQAwGjEYMBYGA1UEAwwPZmVkZXJhdGlvbi50ZXN0MB4XDTI2MDgyNjEyNDkwNloXDTM2MDgyMzEyNDkwNlowGjEYMBYGA1UEAwwPZmVkZXJhdGlvbi50ZXN0MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyVw4kukjD2/8MH5lte0mTKOhzOHG5hYZRC7Lk9o1zyWmcMaHr+5g5F6XvpYJeXBqONoYpDpcqqElImb/JFj1T+wKx2HYtG9B1CZVdDjgb1pCeagu9sgFu9eVWondYOtmrOPYFORJ4ypYUwPZIHSEoS3zNEV/KpEZ0tX9BGEUpaU78szhf2XYXiJEapXz+omQuWU23FxpaQCS4HZw+Z49kZWLjgkWhRIt+3XNe0Lpl+xeOW6pspsga0agmNzs7gb0lHNten3yKyPoj45s8Q1MZovqGOAzxEmnJVSefX6oiOhNkB5ow3f/58JRVPIxEnEHgFI+ycnkWj9GoAsLC3DNYQIDAQABo1MwUTAdBgNVHQ4EFgQUsTCzgdVCYHS8sTsPhnWGDZ6n7i4wHwYDVR0jBBgwFoAUsTCzgdVCYHS8sTsPhnWGDZ6n7i4wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAb6yEVHIVt2gZDqwZPWopVeUBFePW+vyyauBkpTbPMJC+9KmWTRN3z6RQ7DwvsrRGV87Y/yWbWJeXMP6zynxW4bwaSy5CFBamhy3XrHzHG6qHRlDOq5dxKRIW8zgjzGk8tLlM3Vgen9opMbX8yWhfbjwArq45woVToXdzwvBoK1QHQgI9DRseyY2gdPkD8zcfmHSSRfVQbpV8eEnoqifXl0QC4sUREDcTHaNvF0K+84WhUIC6VpeCznIQ5odlDcLKD5Isl65mTq8imnkyLtdduSp3wwkeLhzzglGyi2IVHMXCOcjS/d3JB6CvMNUyHlOKetA24eiPpurNdrSOLW0qxA==";
const oidcSigningJwk = new X509Certificate(
  Buffer.from(certificate, "base64"),
).publicKey.export({ format: "jwk" });

const oidcConfiguration = {
  protocol: "oidc",
  discoveryUrl:
    "https://idp.vendor.com/tenant/.well-known/openid-configuration",
  clientId: "loyalty-client",
} as const;

describe("tenant federation discovery and metadata validation", () => {
  it("returns minimized OIDC evidence from pinned bounded documents", async () => {
    const requests: Array<{ url: string; address: string }> = [];
    const lookupCalls: string[] = [];
    const runtime = oidcRuntime({ requests, lookupCalls });

    const evidence = await validateOrganizationFederationConfiguration(
      oidcConfiguration,
      configurationSha256,
      runtime,
    );

    expect(evidence).toMatchObject({
      schemaVersion: "1",
      protocol: "oidc",
      configurationSha256,
      issuer: "https://idp.vendor.com/tenant",
      authorizationEndpoint: "https://idp.vendor.com/oauth2/authorize",
      tokenEndpoint: "https://idp.vendor.com/oauth2/token",
      jwksUri: "https://keys.vendor-cdn.com/jwks",
      ssoEndpoint: null,
      validatedAt: validationTime.toISOString(),
    });
    expect(evidence.documentSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(evidence.signingFingerprints).toEqual([
      "94bffd6113dd5918a74e889ec2387a0dd51ec227451d051d808894ea58c6ce65",
    ]);
    expect(requests).toEqual([
      {
        url: oidcConfiguration.discoveryUrl,
        address: "8.8.4.4",
      },
      { url: "https://keys.vendor-cdn.com/jwks", address: "8.8.4.4" },
    ]);
    expect(
      lookupCalls.filter((host) => host === "idp.vendor.com"),
    ).toHaveLength(1);
  });

  it("rejects a private answer when another DNS answer is public", async () => {
    const runtime = oidcRuntime({
      addresses: [
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
    });
    await expect(
      validateOrganizationFederationConfiguration(
        oidcConfiguration,
        configurationSha256,
        runtime,
      ),
    ).rejects.toMatchObject({ code: "federation_url_forbidden" });
  });

  it.each([
    ["https://127.0.0.1/.well-known/openid-configuration"],
    ["https://localhost/.well-known/openid-configuration"],
    ["https://idp.internal/.well-known/openid-configuration"],
    ["https://user:password@idp.vendor.com/.well-known/openid-configuration"],
    ["https://idp.vendor.com:8443/.well-known/openid-configuration"],
    ["https://idp.vendor.com/.well-known/openid-configuration#fragment"],
  ])("rejects forbidden federation URL %s", async (discoveryUrl) => {
    await expect(
      validateOrganizationFederationConfiguration(
        { ...oidcConfiguration, discoveryUrl },
        configurationSha256,
        oidcRuntime(),
      ),
    ).rejects.toMatchObject({ code: "federation_url_forbidden" });
  });

  it("rejects redirects before reading a replacement location", async () => {
    const runtime = oidcRuntime({
      override: (url) =>
        url.includes("openid-configuration")
          ? documentResponse("", "application/json", { status: 302 })
          : null,
    });
    await expect(
      validateOrganizationFederationConfiguration(
        oidcConfiguration,
        configurationSha256,
        runtime,
      ),
    ).rejects.toMatchObject({ code: "federation_document_redirect" });
  });

  it("rejects declared length and encoded response ambiguity", async () => {
    const oversized = oidcRuntime({
      override: (url) =>
        url.includes("openid-configuration")
          ? documentResponse("{}", "application/json", {
              declaredLength: String(256 * 1024 + 1),
            })
          : null,
    });
    await expect(
      validateOrganizationFederationConfiguration(
        oidcConfiguration,
        configurationSha256,
        oversized,
      ),
    ).rejects.toMatchObject({ code: "federation_document_too_large" });

    const encoded = oidcRuntime({
      override: (url) =>
        url.includes("openid-configuration")
          ? documentResponse("{}", "application/json", {
              contentEncoding: "gzip",
            })
          : null,
    });
    await expect(
      validateOrganizationFederationConfiguration(
        oidcConfiguration,
        configurationSha256,
        encoded,
      ),
    ).rejects.toMatchObject({ code: "federation_content_type_invalid" });
  });

  it("rejects an issuer that does not own the configured discovery path", async () => {
    const runtime = oidcRuntime({
      override: (url) =>
        url.includes("openid-configuration")
          ? documentResponse(
              JSON.stringify({
                ...oidcDocument(),
                issuer: "https://other.vendor.com/tenant",
              }),
              "application/json",
            )
          : null,
    });
    await expect(
      validateOrganizationFederationConfiguration(
        oidcConfiguration,
        configurationSha256,
        runtime,
      ),
    ).rejects.toMatchObject({ code: "federation_oidc_issuer_mismatch" });
  });

  it("uses exact OIDC issuer continuity instead of URL normalization", async () => {
    const runtime = oidcRuntime({
      override: (url) =>
        url.includes("openid-configuration")
          ? documentResponse(
              JSON.stringify({
                ...oidcDocument(),
                issuer: "https://IDP.vendor.com/tenant",
              }),
              "application/json",
            )
          : null,
    });
    await expect(
      validateOrganizationFederationConfiguration(
        oidcConfiguration,
        configurationSha256,
        runtime,
      ),
    ).rejects.toMatchObject({ code: "federation_oidc_issuer_mismatch" });
  });

  it("rejects unsupported code flow and private JWK material", async () => {
    const unsupported = oidcRuntime({
      override: (url) =>
        url.includes("openid-configuration")
          ? documentResponse(
              JSON.stringify({
                ...oidcDocument(),
                response_types_supported: ["id_token"],
              }),
              "application/json",
            )
          : null,
    });
    await expect(
      validateOrganizationFederationConfiguration(
        oidcConfiguration,
        configurationSha256,
        unsupported,
      ),
    ).rejects.toMatchObject({ code: "federation_oidc_unsupported" });

    const privateJwk = oidcRuntime({
      override: (url) =>
        url.endsWith("/jwks")
          ? documentResponse(
              JSON.stringify({
                keys: [{ kty: "RSA", e: "AQAB", n: "sXch", d: "secret" }],
              }),
              "application/jwk-set+json",
            )
          : null,
    });
    await expect(
      validateOrganizationFederationConfiguration(
        oidcConfiguration,
        configurationSha256,
        privateJwk,
      ),
    ).rejects.toMatchObject({ code: "federation_signing_key_invalid" });
  });

  it("returns one exact SAML entity, endpoint, and current signing certificate", async () => {
    const requests: Array<{ url: string; address: string }> = [];
    const runtime = samlRuntime({ requests });
    const evidence = await validateOrganizationFederationConfiguration(
      {
        protocol: "saml",
        metadataUrl: "https://metadata.vendor.com/idp.xml",
        expectedEntityId: "urn:vendor:tenant:idp",
      },
      configurationSha256,
      runtime,
    );

    expect(evidence).toMatchObject({
      protocol: "saml",
      issuer: "urn:vendor:tenant:idp",
      authorizationEndpoint: null,
      tokenEndpoint: null,
      jwksUri: null,
      ssoEndpoint: "https://login.vendor.com/sso/post?tenant=a&mode=sso",
      validatedAt: validationTime.toISOString(),
    });
    expect(evidence.signingFingerprints).toEqual([
      "814278eb3083ce33c8e00301d00709b1eecc82dcd5e04cb4901d7a68e598aff5",
    ]);
    expect(requests).toEqual([
      {
        url: "https://metadata.vendor.com/idp.xml",
        address: "8.8.4.4",
      },
    ]);
  });

  it.each([
    [
      "a DOCTYPE declaration",
      `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${samlDocument()}`,
      "federation_document_invalid",
    ],
    [
      "a mismatched entity",
      samlDocument().replace("urn:vendor:tenant:idp", "urn:other:idp"),
      "federation_saml_entity_mismatch",
    ],
    [
      "missing signing evidence",
      samlDocument().replace(
        /<md:KeyDescriptor[\s\S]*<\/md:KeyDescriptor>/u,
        "",
      ),
      "federation_signing_key_invalid",
    ],
  ])("rejects SAML metadata with %s", async (_case, xml, code) => {
    await expect(
      validateOrganizationFederationConfiguration(
        {
          protocol: "saml",
          metadataUrl: "https://metadata.vendor.com/idp.xml",
          expectedEntityId: "urn:vendor:tenant:idp",
        },
        configurationSha256,
        samlRuntime({ xml }),
      ),
    ).rejects.toMatchObject({ code });
  });

  it("rejects a signing certificate outside the validation instant", async () => {
    const runtime = samlRuntime({ now: new Date("2040-01-01T00:00:00Z") });
    await expect(
      validateOrganizationFederationConfiguration(
        {
          protocol: "saml",
          metadataUrl: "https://metadata.vendor.com/idp.xml",
          expectedEntityId: "urn:vendor:tenant:idp",
        },
        configurationSha256,
        runtime,
      ),
    ).rejects.toMatchObject({ code: "federation_certificate_expired" });
  });

  it.each([
    ["8.8.8.8", true],
    ["2606:4700:4700::1111", true],
    ["127.0.0.1", false],
    ["10.0.0.1", false],
    ["100.64.0.1", false],
    ["169.254.169.254", false],
    ["192.168.1.1", false],
    ["192.0.2.1", false],
    ["198.18.0.1", false],
    ["198.51.100.1", false],
    ["203.0.113.1", false],
    ["::1", false],
    ["fc00::1", false],
    ["fe80::1", false],
    ["2001:db8::1", false],
  ])("classifies address %s as public=%s", (address, expected) => {
    expect(isPublicFederationAddress(address)).toBe(expected);
  });
});

type RuntimeOptions = Readonly<{
  addresses?: Array<{ address: string; family: number }>;
  lookupCalls?: string[];
  requests?: Array<{ url: string; address: string }>;
  override?: (url: string) => ReturnType<typeof documentResponse> | null;
}>;

function oidcRuntime(
  options: RuntimeOptions = {},
): FederationValidationRuntime {
  const addresses = options.addresses ?? [{ address: "8.8.4.4", family: 4 }];
  return {
    now: () => validationTime,
    lookup: async (hostname) => {
      options.lookupCalls?.push(hostname);
      return addresses;
    },
    request: async ({ url, pinnedAddress }) => {
      options.requests?.push({
        url: url.href,
        address: pinnedAddress.address,
      });
      const overridden = options.override?.(url.href);
      if (overridden) return overridden;
      if (url.href.includes("openid-configuration")) {
        return documentResponse(
          JSON.stringify(oidcDocument()),
          "application/json; charset=utf-8",
        );
      }
      if (url.href === "https://keys.vendor-cdn.com/jwks") {
        return documentResponse(
          JSON.stringify({
            keys: [{ ...oidcSigningJwk, use: "sig" }],
          }),
          "application/jwk-set+json",
        );
      }
      throw new Error("unexpected test URL");
    },
  };
}

function oidcDocument(): Record<string, unknown> {
  return {
    issuer: "https://idp.vendor.com/tenant",
    authorization_endpoint: "https://idp.vendor.com/oauth2/authorize",
    token_endpoint: "https://idp.vendor.com/oauth2/token",
    jwks_uri: "https://keys.vendor-cdn.com/jwks",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic"],
    scopes_supported: ["openid", "email", "profile"],
  };
}

type SamlRuntimeOptions = Readonly<{
  xml?: string;
  now?: Date;
  requests?: Array<{ url: string; address: string }>;
}>;

function samlRuntime(
  options: SamlRuntimeOptions = {},
): FederationValidationRuntime {
  return {
    now: () => options.now ?? validationTime,
    lookup: async () => [{ address: "8.8.4.4", family: 4 }],
    request: async ({ url, pinnedAddress }) => {
      options.requests?.push({
        url: url.href,
        address: pinnedAddress.address,
      });
      return documentResponse(
        options.xml ?? samlDocument(),
        "application/samlmetadata+xml",
      );
    },
  };
}

function samlDocument(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="urn:vendor:tenant:idp">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certificate}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://login.vendor.com/sso/redirect" />
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://login.vendor.com/sso/post?tenant=a&amp;mode=sso" />
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;
}

function documentResponse(
  bodyValue: string,
  contentType: string,
  overrides: Partial<{
    status: number;
    contentEncoding: string | null;
    declaredLength: string | null;
  }> = {},
) {
  const body = Buffer.from(bodyValue, "utf8");
  return {
    status: overrides.status ?? 200,
    contentType,
    contentEncoding: overrides.contentEncoding ?? null,
    declaredLength: overrides.declaredLength ?? String(body.length),
    body,
  };
}
