export const SUPPORT_DIAGNOSTICS_SCHEMA =
  "starfiniti.support-diagnostics.v1" as const;

type DiagnosticIssueInput = Readonly<{
  kind: string;
  state: string;
  errorCode: string | null;
  attemptCount: number;
  operationKind: string;
  observedAt: string;
  retryAllowed: boolean;
}>;

type DiagnosticConnectionInput = Readonly<{
  id: string;
  status: string;
  lastSeenAt: string | null;
  deliveriesReady: number;
  deliveriesFailed: number;
  effectsReady: number;
  effectsFailed: number;
  commandsReady: number;
  commandsFailed: number;
  issues: readonly DiagnosticIssueInput[];
}>;

export type SupportDiagnostics = Readonly<{
  schema: typeof SUPPORT_DIAGNOSTICS_SCHEMA;
  generatedAt: string;
  scope: Readonly<{
    organizationId: string;
    workspaceId: string | null;
    programmeGroupId: string | null;
  }>;
  privacy: Readonly<{
    aggregateOnly: true;
    omitted: readonly string[];
  }>;
  connections: readonly Readonly<{
    connectionId: string;
    status: string;
    lastSeenAt: string | null;
    queues: Readonly<{
      deliveries: Readonly<{ ready: number; failed: number }>;
      effects: Readonly<{ ready: number; failed: number }>;
      commands: Readonly<{ ready: number; failed: number }>;
    }>;
    issueSample: Readonly<{ returned: number; limit: number }>;
    issueGroups: readonly Readonly<{
      kind: string;
      state: string;
      operationKind: string;
      errorCode: string | null;
      count: number;
      maximumAttempts: number;
      latestObservedAt: string;
      retryAllowed: boolean;
    }>[];
  }>[];
}>;

const omitted = [
  "raw payloads",
  "commerce source identifiers",
  "customer identifiers",
  "connection display names",
  "actors and reasons",
  "signing keys and signing references",
] as const;

function nonNegativeInteger(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const diagnosticToken = /^[a-z][a-z0-9_.:-]{0,119}$/u;

function canonicalToken(value: string, fallback: string): string {
  return diagnosticToken.test(value) ? value : fallback;
}

export function buildSupportDiagnostics(
  input: Readonly<{
    generatedAt: string;
    organizationId: string;
    workspaceId: string | null;
    programmeGroupId: string | null;
    issueSampleLimit: number;
    connections: readonly DiagnosticConnectionInput[];
  }>,
): SupportDiagnostics {
  return {
    schema: SUPPORT_DIAGNOSTICS_SCHEMA,
    generatedAt: input.generatedAt,
    scope: {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      programmeGroupId: input.programmeGroupId,
    },
    privacy: { aggregateOnly: true, omitted },
    connections: [...input.connections]
      .sort((left, right) => compareText(left.id, right.id))
      .map((connection) => {
        const groups = new Map<
          string,
          SupportDiagnostics["connections"][number]["issueGroups"][number]
        >();
        for (const issue of connection.issues) {
          const kind = canonicalToken(issue.kind, "unknown");
          const state = canonicalToken(issue.state, "unknown");
          const operationKind = canonicalToken(
            issue.operationKind,
            "redacted_noncanonical_operation",
          );
          const errorCode =
            issue.errorCode === null
              ? null
              : canonicalToken(issue.errorCode, "redacted_noncanonical_code");
          const key = JSON.stringify([
            kind,
            state,
            operationKind,
            errorCode,
            issue.retryAllowed,
          ]);
          const current = groups.get(key);
          groups.set(key, {
            kind,
            state,
            operationKind,
            errorCode,
            count: (current?.count ?? 0) + 1,
            maximumAttempts: Math.max(
              current?.maximumAttempts ?? 0,
              nonNegativeInteger(issue.attemptCount),
            ),
            latestObservedAt:
              !current || issue.observedAt > current.latestObservedAt
                ? issue.observedAt
                : current.latestObservedAt,
            retryAllowed: issue.retryAllowed,
          });
        }
        return {
          connectionId: connection.id,
          status: canonicalToken(connection.status, "unknown"),
          lastSeenAt: connection.lastSeenAt,
          queues: {
            deliveries: {
              ready: nonNegativeInteger(connection.deliveriesReady),
              failed: nonNegativeInteger(connection.deliveriesFailed),
            },
            effects: {
              ready: nonNegativeInteger(connection.effectsReady),
              failed: nonNegativeInteger(connection.effectsFailed),
            },
            commands: {
              ready: nonNegativeInteger(connection.commandsReady),
              failed: nonNegativeInteger(connection.commandsFailed),
            },
          },
          issueSample: {
            returned: connection.issues.length,
            limit: nonNegativeInteger(input.issueSampleLimit),
          },
          issueGroups: [...groups.values()].sort(
            (left, right) =>
              compareText(left.kind, right.kind) ||
              compareText(left.operationKind, right.operationKind) ||
              compareText(left.state, right.state) ||
              compareText(left.errorCode ?? "", right.errorCode ?? ""),
          ),
        };
      }),
  };
}
