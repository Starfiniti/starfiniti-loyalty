import "server-only";
import {
  customerDataExportV1,
  type CustomerDataExportV1,
} from "@starfiniti/contracts";
import { getDatabase } from "./database";

export const CUSTOMER_EXPORT_COOKIE = "starfiniti_customer_export";

type AuthorizationRow = {
  authorization_token: string;
  expires_at: string;
};

type ExportRow = {
  export_id: string;
  generated_at: string;
  payload: unknown;
};

export async function issueCustomerDataExportAuthorization(
  authUserId: string,
  sessionId: string,
): Promise<AuthorizationRow> {
  const sql = getDatabase();
  const rows = await sql<AuthorizationRow[]>`
    select authorization_token, expires_at
    from loyalty_private.issue_customer_data_export_authorization(
      ${authUserId}::uuid,
      ${sessionId}::uuid
    )
  `;
  const authorization = rows[0];
  if (!authorization)
    throw new Error("customer_export_authorization_unavailable");
  return authorization;
}

export async function consumeCustomerDataExport(
  authorizationToken: string,
  authUserId: string,
  sessionId: string,
  email: string | null,
): Promise<CustomerDataExportV1> {
  const sql = getDatabase();
  return sql.begin(async (transaction) => {
    const rows = await transaction<ExportRow[]>`
      select export_id, generated_at, payload
      from loyalty_private.consume_customer_data_export(
        ${authorizationToken},
        ${authUserId}::uuid,
        ${sessionId}::uuid
      )
    `;
    const result = rows[0];
    if (!result || !result.payload || typeof result.payload !== "object") {
      throw new Error("customer_export_unavailable");
    }
    return customerDataExportV1.parse({
      ...result.payload,
      authentication: { email },
    });
  });
}
