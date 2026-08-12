import "server-only";
import { isRuntimeReady, type RuntimeReadinessRow } from "../readiness";
import { getDatabase } from "./database";
import { getWooCommerceSigningPoolReferences } from "./signing-material";

export async function runtimeIsReady(): Promise<boolean> {
  const sql = getDatabase();
  const rows = await sql<RuntimeReadinessRow[]>`
    select
      pg_catalog.coalesce(
        pg_catalog.has_function_privilege(
          current_user,
          pg_catalog.to_regprocedure(
            'loyalty_private.accept_commerce_delivery(bigint,bigint,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,text,text,text,jsonb)'
          ),
          'EXECUTE'
        ),
        false
      )
      and pg_catalog.coalesce(
        pg_catalog.has_function_privilege(
          current_user,
          pg_catalog.to_regprocedure(
            'loyalty_private.provision_woocommerce_connection(uuid,uuid,uuid,text,text,text,text,uuid)'
          ),
          'EXECUTE'
        ),
        false
      ) as database_ready
  `;
  return isRuntimeReady(rows, getWooCommerceSigningPoolReferences().length);
}
