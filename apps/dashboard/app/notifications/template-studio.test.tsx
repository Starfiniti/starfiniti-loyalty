import type { MerchantNotificationEmailTemplateV1 } from "@starfiniti/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { NotificationTemplateStudio } from "./template-studio";

const template: MerchantNotificationEmailTemplateV1 = {
  schemaVersion: "1",
  templateId: "e1000000-0000-4000-8000-000000000200",
  templateCode: "points_released",
  eventType: "loyalty.points.released",
  locale: "en",
  source: "system",
  templateVersion: 1,
  templateSha256: "a".repeat(64),
  subjectTemplate: "{{points}} points are ready",
  textTemplate: "Balance: {{availableBalance}} points.",
  htmlTemplate: "<p>Balance: {{availableBalance}} points.</p>",
  allowedTokens: ["points", "availableBalance"],
  publishedAt: "2026-08-25T09:00:00Z",
};

function render(
  deploymentMode: "managed" | "self_hosted",
  entitlementEnabled: boolean,
) {
  return renderToStaticMarkup(
    <NotificationTemplateStudio
      canManage
      deploymentMode={deploymentMode}
      entitlementEnabled={entitlementEnabled}
      publishOperationId="e1000000-0000-4000-8000-000000000201"
      templates={[template]}
      testOperationId="e1000000-0000-4000-8000-000000000202"
      workspaceId="e1000000-0000-4000-8000-000000000110"
    />,
  );
}

describe("notification template studio presentation", () => {
  it("renders disabled rollout as read-only without hiding existing content", () => {
    const html = render("self_hosted", false);
    expect(html.match(/disabled=""/gu)).toHaveLength(4);
    expect(html).toContain("Notification rollout is disabled");
    expect(html).toContain("100 points are ready");
  });

  it("keeps managed publication editable but disables self-hosted SMTP test", () => {
    const html = render("managed", true);
    expect(html.match(/disabled=""/gu)).toHaveLength(1);
    expect(html).toContain(
      "SMTP test delivery is available only in self-hosted mode",
    );
  });
});
