export type RuntimeReadinessRow = Readonly<{
  database_ready: boolean | null;
}>;

export function isRuntimeReady(
  rows: readonly RuntimeReadinessRow[],
  signingPoolSize: number,
): boolean {
  return (
    rows.length === 1 && rows[0]?.database_ready === true && signingPoolSize > 0
  );
}
