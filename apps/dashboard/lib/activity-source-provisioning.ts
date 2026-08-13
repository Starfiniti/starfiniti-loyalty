import {
  merchantActivitySourcePackageV1,
  type MerchantActivitySourcePackageV1,
} from "@starfiniti/contracts";

export function merchantActivityEventEndpoint(publicOrigin: string): string {
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
  return `${origin.origin}/api/v1/activities/events`;
}

export function serializeMerchantActivitySourcePackage(
  value: MerchantActivitySourcePackageV1,
): string {
  return JSON.stringify(merchantActivitySourcePackageV1.parse(value));
}
