import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SmtpNotificationDispatchAuthorizationV1 } from "@starfiniti/contracts";
import { SMTPServer } from "smtp-server";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifySmtpDeliveryError,
  createSmtpDeliveryRuntime,
  readSmtpDeliveryConfig,
  renderNotificationEmail,
  sendAuthorizedNotification,
  type SmtpDeliveryRuntime,
} from "./notification-delivery.ts";

const event = {
  schemaVersion: "1",
  eventId: "10000000-0000-4000-8000-000000000001",
  organizationId: "20000000-0000-4000-8000-000000000001",
  programmeGroupId: "30000000-0000-4000-8000-000000000001",
  locale: "en",
  occurredAt: "2026-08-24T08:00:00Z",
  eventType: "loyalty.points.released",
  purpose: "loyalty_transactional",
  subject: {
    kind: "customer",
    customerId: "40000000-0000-4000-8000-000000000001",
  },
  payload: { points: "25", availableBalance: "125" },
} as const;

const openServers: SMTPServer[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    openServers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SMTP notification delivery", () => {
  it("stays disabled by default and reads an authenticated secret from an absolute file", () => {
    expect(readSmtpDeliveryConfig({})).toBeNull();
    const directory = mkdtempSync(join(tmpdir(), "loyalty-smtp-"));
    temporaryDirectories.push(directory);
    const passwordFile = join(directory, "password");
    writeFileSync(passwordFile, "secret-value\n", { mode: 0o600 });

    expect(
      readSmtpDeliveryConfig({
        LOYALTY_SMTP_ENABLED: "true",
        LOYALTY_SMTP_HOST: "smtp.example.test",
        LOYALTY_SMTP_PORT: "465",
        LOYALTY_SMTP_SECURITY: "tls",
        LOYALTY_SMTP_FROM_ADDRESS: "loyalty@example.test",
        LOYALTY_SMTP_USERNAME: "mailer",
        LOYALTY_SMTP_PASSWORD_FILE: passwordFile,
      }),
    ).toMatchObject({
      host: "smtp.example.test",
      port: 465,
      security: "tls",
      fromAddress: "loyalty@example.test",
      username: "mailer",
      password: "secret-value",
      messageIdDomain: "example.test",
    });
  });

  it.each([
    [{ LOYALTY_SMTP_ENABLED: "true" }, "smtp_config_invalid_host"],
    [
      {
        LOYALTY_SMTP_ENABLED: "true",
        LOYALTY_SMTP_HOST: "smtp.example.test",
        LOYALTY_SMTP_PORT: "0",
        LOYALTY_SMTP_FROM_ADDRESS: "loyalty@example.test",
      },
      "smtp_config_invalid_port",
    ],
    [
      {
        LOYALTY_SMTP_ENABLED: "true",
        LOYALTY_SMTP_HOST: "smtp.example.test",
        LOYALTY_SMTP_SECURITY: "opportunistic",
        LOYALTY_SMTP_FROM_ADDRESS: "loyalty@example.test",
      },
      "smtp_config_invalid_security",
    ],
    [
      {
        LOYALTY_SMTP_ENABLED: "true",
        LOYALTY_SMTP_HOST: "smtp.example.test",
        LOYALTY_SMTP_FROM_ADDRESS: "loyalty@example.test",
        LOYALTY_SMTP_USERNAME: "mailer",
      },
      "smtp_config_incomplete_authentication",
    ],
  ] as const)("rejects invalid SMTP configuration", (environment, error) => {
    expect(() => readSmtpDeliveryConfig(environment)).toThrow(error);
  });

  it("renders only declared tokens and rejects headers or unknown placeholders", () => {
    expect(
      renderNotificationEmail(
        event,
        "Your {{points}} points are ready",
        "Balance: {{availableBalance}}",
        "<p>Balance: {{availableBalance}}</p>",
      ),
    ).toEqual({
      subject: "Your 25 points are ready",
      text: "Balance: 125",
      html: "<p>Balance: 125</p>",
    });
    expect(() =>
      renderNotificationEmail(
        event,
        "Hello\nBcc: bad@example.test",
        "ok",
        "ok",
      ),
    ).toThrow("smtp_subject_invalid");
    expect(() =>
      renderNotificationEmail(event, "{{customerEmail}}", "ok", "ok"),
    ).toThrow("smtp_template_token_invalid");
  });

  it.each([
    [
      { responseCode: 450, code: "EENVELOPE", command: "RCPT TO" },
      "retryable",
      "smtp_temporary_rejection",
    ],
    [
      { responseCode: 535, code: "EAUTH", command: "AUTH" },
      "dead_letter",
      "smtp_authentication_failed",
    ],
    [{ code: "EDNS", command: "CONN" }, "retryable", "smtp_dns_unavailable"],
    [{ code: "ETIMEDOUT", command: "CONN" }, "retryable", "smtp_timeout"],
    [
      { code: "ETIMEDOUT", command: "DATA" },
      "manual_review",
      "smtp_outcome_ambiguous",
    ],
    [
      { code: "EENVELOPE", command: "MAIL FROM" },
      "dead_letter",
      "smtp_envelope_invalid",
    ],
    [new Error("unknown"), "manual_review", "smtp_outcome_ambiguous"],
  ] as const)(
    "classifies provider outcomes conservatively",
    (failure, outcome, code) => {
      expect(classifySmtpDeliveryError(failure)).toMatchObject({
        outcome,
        errorCode: code,
      });
    },
  );

  it("delivers once to a real local SMTP sink with a deterministic message id", async () => {
    const messages: string[] = [];
    const server = new SMTPServer({
      authOptional: true,
      disabledCommands: ["AUTH", "STARTTLS"],
      hideSTARTTLS: true,
      onData(stream, _session, callback) {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          messages.push(Buffer.concat(chunks).toString("utf8"));
          callback(null, "250 accepted");
        });
      },
    });
    openServers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.server.address() as AddressInfo).port;
    const runtime = createSmtpDeliveryRuntime({
      host: "127.0.0.1",
      port,
      security: "plaintext",
      fromAddress: "loyalty@example.test",
      username: null,
      password: null,
      messageIdDomain: "example.test",
    });
    const authorization = authorizedDispatch();

    await expect(
      sendAuthorizedNotification(runtime, authorization),
    ).resolves.toBe(250);
    runtime.transporter.close();

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(
      `Message-ID: <${event.eventId}@example.test>`,
    );
    expect(messages[0]).toContain("To: member@example.test");
    expect(messages[0]).toContain("Subject: Your 25 points are ready");
    expect(messages[0]).not.toContain("secret-value");
  });

  it("fails closed before SMTP when template evidence does not match", async () => {
    let sends = 0;
    const runtime: SmtpDeliveryRuntime = {
      config: {
        host: "smtp.example.test",
        port: 587,
        security: "starttls",
        fromAddress: "loyalty@example.test",
        username: null,
        password: null,
        messageIdDomain: "example.test",
      },
      transporter: {
        async sendMail() {
          sends += 1;
          throw new Error("must not send");
        },
        close() {},
      },
    };
    const authorization = {
      ...authorizedDispatch(),
      templateSha256: "0".repeat(64),
    };

    await expect(
      sendAuthorizedNotification(runtime, authorization),
    ).rejects.toThrow("smtp_template_hash_mismatch");
    expect(sends).toBe(0);
  });
});

function authorizedDispatch(): Extract<
  SmtpNotificationDispatchAuthorizationV1,
  { outcome: "authorized" }
> {
  const template = {
    templateCode: "points_released",
    templateVersion: 1,
    subjectTemplate: "Your {{points}} points are ready",
    textTemplate: "Balance: {{availableBalance}}",
    htmlTemplate: "<p>Balance: {{availableBalance}}</p>",
  } as const;
  const templateSha256 = createHash("sha256")
    .update(
      [
        template.templateCode,
        template.templateVersion,
        event.eventType,
        template.subjectTemplate,
        template.textTemplate,
        template.htmlTemplate,
      ].join("|"),
      "utf8",
    )
    .digest("hex");
  return {
    schemaVersion: "1",
    deliveryId: "50000000-0000-4000-8000-000000000001",
    outcome: "authorized",
    attempt: 1,
    recipientEmail: "member@example.test",
    templateSha256,
    ...template,
    event,
  };
}
