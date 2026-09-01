export type NotificationAuthoringAccess = Readonly<{
  authoringEnabled: boolean;
  lifecycleEnabled: boolean;
  notice: string | null;
  testDeliveryEnabled: boolean;
  testDeliveryNotice: string | null;
}>;

export function resolveNotificationAuthoringAccess(
  canManage: boolean,
  entitlementEnabled: boolean,
  deploymentMode: "managed" | "self_hosted",
): NotificationAuthoringAccess {
  if (!canManage) {
    return {
      authoringEnabled: false,
      lifecycleEnabled: false,
      notice: "Owner or admin access is required to manage notifications.",
      testDeliveryEnabled: false,
      testDeliveryNotice: null,
    };
  }
  if (!entitlementEnabled) {
    return {
      authoringEnabled: false,
      lifecycleEnabled: true,
      notice:
        "Notification rollout is disabled. Existing templates, delivery evidence, and safe endpoint disable or retirement actions remain available.",
      testDeliveryEnabled: false,
      testDeliveryNotice: null,
    };
  }
  return {
    authoringEnabled: true,
    lifecycleEnabled: true,
    notice: null,
    testDeliveryEnabled: deploymentMode === "self_hosted",
    testDeliveryNotice:
      deploymentMode === "managed"
        ? "SMTP test delivery is available only in self-hosted mode."
        : null,
  };
}
