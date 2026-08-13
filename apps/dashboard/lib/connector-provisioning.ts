import {
  wooCommerceConnectionPackageV1,
  type WooCommerceConnectionPackageV1,
} from "@starfiniti/contracts";

export function wooCommerceEventEndpoint(publicOrigin: string): string {
  let origin: URL;
  try {
    origin = new URL(publicOrigin);
  } catch {
    throw new Error("dashboard_public_origin_invalid");
  }
  if (
    origin.protocol !== "https:" ||
    origin.username !== "" ||
    origin.password !== "" ||
    origin.origin !== publicOrigin
  ) {
    throw new Error("dashboard_public_origin_invalid");
  }
  return `${origin.origin}/api/v1/integrations/woocommerce/events`;
}

export function serializeWooCommerceConnectionPackage(
  value: WooCommerceConnectionPackageV1,
): string {
  return JSON.stringify(wooCommerceConnectionPackageV1.parse(value));
}
