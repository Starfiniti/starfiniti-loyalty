import "server-only";
import postgres, { type Sql } from "postgres";

let database: Sql | undefined;

export function getDatabase(): Sql {
  if (database) return database;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("database_unavailable");

  database = postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 5,
    prepare: true,
    onnotice: () => undefined,
  });
  return database;
}
