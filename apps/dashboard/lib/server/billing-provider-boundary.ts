import "server-only";

import type { DeploymentMode } from "@starfiniti/contracts";

export type ManagedBillingOperationResult<T> =
  | Readonly<{ kind: "self_hosted"; reason: "billing_not_applicable" }>
  | Readonly<{ kind: "managed"; value: T }>;

export async function runManagedBillingOperation<TProvider, TResult>(input: {
  deploymentMode: DeploymentMode;
  createProvider: () => TProvider;
  execute: (provider: TProvider) => Promise<TResult>;
}): Promise<ManagedBillingOperationResult<TResult>> {
  if (input.deploymentMode === "self_hosted") {
    return { kind: "self_hosted", reason: "billing_not_applicable" };
  }

  const provider = input.createProvider();
  return { kind: "managed", value: await input.execute(provider) };
}
