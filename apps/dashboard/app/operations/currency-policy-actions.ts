"use server";

import {
  configureProgrammeCurrencyPolicyCommandV1,
  configureProgrammeCurrencyPolicyResultV1,
} from "@starfiniti/contracts";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrencyPolicyActionState = Readonly<{
  kind: "idle" | "success" | "error";
  message: string;
}>;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function boundedInteger(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]{0,8})$/u.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function configureProgrammeCurrencyPolicy(
  _previousState: CurrencyPolicyActionState,
  formData: FormData,
): Promise<CurrencyPolicyActionState> {
  if (formData.get("confirmation") !== "configure") {
    return {
      kind: "error",
      message: "Review and confirm the currency policy.",
    };
  }
  const operationId = String(formData.get("operationId") ?? "");
  if (!UUID_V4.test(operationId)) {
    return {
      kind: "error",
      message: "The policy operation is invalid. Refresh and retry.",
    };
  }
  const sourceMinorUnitDigits = boundedInteger(
    formData.get("sourceMinorUnitDigits"),
  );
  const maxRateAgeSeconds = boundedInteger(formData.get("maxRateAgeSeconds"));
  const expectedRevision = boundedInteger(formData.get("expectedRevision"));
  const command = configureProgrammeCurrencyPolicyCommandV1.safeParse({
    version: "1",
    programmeVersionId: formData.get("programmeVersionId"),
    sourceCurrencyCode: formData.get("sourceCurrencyCode"),
    sourceMinorUnitDigits,
    providerKey: formData.get("providerKey"),
    maxRateAgeSeconds,
    state: formData.get("state"),
    expectedRevision,
    idempotencyKey: `currency-policy:configure:${operationId}`,
    correlationId: crypto.randomUUID(),
  });
  if (!command.success) {
    return {
      kind: "error",
      message:
        "Enter an uppercase three-letter source currency, 0–6 decimal places, an approved provider key, and a rate age between 60 and 604800 seconds.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("loyalty")
    .rpc("configure_programme_currency_policy_v1", {
      target_programme_version_public_id: command.data.programmeVersionId,
      target_source_currency_code: command.data.sourceCurrencyCode,
      target_source_minor_unit_digits: command.data.sourceMinorUnitDigits,
      target_provider_key: command.data.providerKey,
      target_max_rate_age_seconds: command.data.maxRateAgeSeconds,
      target_state: command.data.state,
      target_expected_revision: command.data.expectedRevision,
      target_idempotency_key: command.data.idempotencyKey,
      target_correlation_id: command.data.correlationId,
    });
  if (error) {
    return {
      kind: "error",
      message:
        error.code === "42501"
          ? "A live owner/admin, published V2 programme, and ecosystem capability are required."
          : error.code === "23514"
            ? "This currency policy changed concurrently. Refresh before retrying."
            : "The exact currency policy could not be saved safely.",
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<
    string,
    unknown
  > | null;
  const result = configureProgrammeCurrencyPolicyResultV1.safeParse(
    row
      ? {
          resourceId: row.policy_version_public_id,
          outcome: row.outcome,
          revision: row.revision,
          state: row.state,
        }
      : null,
  );
  if (!result.success) {
    return {
      kind: "error",
      message: "The saved currency policy response could not be verified.",
    };
  }
  revalidatePath("/operations");
  return {
    kind: "success",
    message:
      result.data.outcome === "duplicate"
        ? `This exact currency policy is already revision ${result.data.revision}.`
        : `Currency policy revision ${result.data.revision} saved with immutable audit evidence.`,
  };
}
