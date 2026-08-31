# ADR-0110: Isolated Authentik 2026.8 runtime rehearsal

- Status: accepted for repository and exact-head CI evidence; not an upgrade approval
- Date: 2026-08-31
- Owners: identity, security, operations
- Related: ADR-0053, ADR-0054, ADR-0069, ADR-0108, ADR-0109; R-029, R-044, R-048, R-051, R-057

## Context

ADR-0109 proves that the exact Authentik 2026.8.0 source and OpenAPI candidate
still describes all twenty-seven administration operations sent by the Loyalty
federation client. It deliberately does not prove that the candidate containers
boot, run their migrations and blueprints, accept those requests, publish the
downstream OpenID configuration, or drive the SCIM behavior on which M13 relies.
The live broker is still 2026.5.6 and cannot be used as a disposable test target.

The remaining safe question is narrower than a production upgrade: can the exact
reviewed Linux/amd64 candidate execute the repository-owned OIDC and SAML
reconciler and Authentik's outbound SCIM client against synthetic fixtures? The
answer must not need an enterprise IdP, expose a host port, attach the Docker
socket, accept a mutable tag, inherit production routes or credentials, or turn
synthetic evidence into an M13 production-canary pass.

Current official Authentik guidance says the bootstrap variables are consumed by
the worker on first start, Docker Compose is suitable for test and small setups,
the 2026.8 Compose topology uses PostgreSQL without the former Redis dependency,
and the SCIM provider uses a backchannel worker with service-provider discovery,
pagination, PATCH support, and static bearer authentication. Current Supabase
guidance retains `/auth/v1/callback`; a successful identity-provider login still
does not replace live PostgreSQL membership, RLS, and session checks.

## Options considered

### Expose a disposable Authentik port to the host

This is operationally familiar and makes browser/API probes simple. It adds an
unnecessary ingress surface, depends on host firewall and Docker NAT behavior,
and weakens the proof that no protocol target outside the rehearsal is reachable.

### Replay the API through an in-memory fake

The existing unit suite already proves request ordering, ambiguity handling,
bounded responses, idempotent names, and fail-closed errors with a fake API. A
second fake would be fast but would not exercise candidate migrations,
serializers, blueprints, provider discovery, worker tasks, or SCIM HTTP behavior.

### Run a read-only operator inside one internal Docker network

Pull exact reviewed manifests before isolation. Then create one internal-only
network containing disposable PostgreSQL, Authentik server and worker, an
RFC-focused SCIM sink, and short-lived read-only Node operator containers. The
operator bundle imports the production `AuthentikFederationAdmin`; no duplicate
reconciler is permitted. Nothing publishes a port and no container sees a Docker
socket or a production route. This is the chosen option.

## Decision

Adopt the exact plan at
`infrastructure/testing/authentik-2026-8-runtime/plan.yaml` and run it in the
existing Security `recovery-transport` job. The job remains one of the four fixed
Security jobs rather than creating a separately permissioned workflow.

The plan pins:

- Authentik 2026.8.0 Linux/amd64 manifest
  `sha256:21000cebe8e51eca0620034096586d675cedec8925ac750f7f8966d86eeb0da0`;
- exact Linux/amd64 PostgreSQL 16 and Node 24.20.0 manifests;
- one internal Docker network, zero published ports, zero Docker-socket mounts,
  an explicitly disabled embedded outpost, and synthetic credentials and
  identities only;
- fourteen deterministic scenarios covering image identity, health, disabled
  OIDC and SAML reconciliation, idempotent secret rotation, downstream OIDC
  invariants and discovery, SCIM authentication, service-provider discovery,
  pagination, user/group provisioning, membership, removal, deactivation,
  report minimization, and teardown.

The runtime may inject its internal HTTP origin directly into an in-memory
configuration because no TLS endpoint exists inside the isolated network. This
is a test-harness exception only. The production configuration reader continues
to require exact HTTPS origins and the strict
`https://<supabase-origin>/auth/v1/callback` value.

The SCIM sink implements only the reviewed RFC 7643/7644 surface needed by the
candidate client. It enforces a timing-safe synthetic bearer, bounded bodies,
filter and pagination parsing, PATCH member paths, and a separately authenticated
minimized inspection endpoint. It is neither a Loyalty SCIM server nor a model
of database authorization. Authentik's default outbound `externalId`, downstream
`hashed_user_id`, and transport behavior are observed, while existing pgTAP,
two-session, stale-session, and RLS tests remain the authority for Starfiniti
membership and tenant isolation.

The runner executes only when every critical source matches the checked-out Git
commit. It pulls and verifies manifests before creating the internal network,
uses no arbitrary plan command, bounds processes, memory, CPU, response and
report sizes, removes containers and the network on success or failure, and
publishes only the minimized `starfiniti.authentik-2026-8-runtime-report.v1`
artifact. The root `npm run check` executes only the network-free validator and
bundle self-test; Docker execution is reserved for Linux CI or an explicitly
controlled clean Linux host.

The first runtime executions also established two candidate-specific
convergence requirements. First-start built-in flows and managed mappings can
appear after API authentication becomes available, so the operator waits a
bounded 180 seconds for their exact identities. Authentik 2026.8's OAuth source
serializer also revalidates the three provider endpoint fields on otherwise
partial enablement and secret-rotation updates. The production client therefore
replays only the existing `openidconnect` source's bounded HTTPS authorization,
token, and profile URLs with those mutations. It does not echo any read-back
secret or accept a different provider type, insecure scheme, embedded
credential, control character, or oversized URL.

Authentik's `User.uid` is not the database UUID: the 2026.8 model derives it as
the lowercase SHA-256 hexadecimal digest of the user ID and instance-specific
identifier. The rehearsal therefore validates the exact 64-character digest
shape used by the configured `hashed_user_id` OIDC subject and default SCIM
`externalId`, while continuing to validate group primary keys as UUIDs. The
digest is an opaque correlation identifier; it is never decoded or treated as
tenant authority.

## Evidence and gates

Run:

```text
npm run continuous-improvement:authentik-2026-8:runtime:validate
npm run continuous-improvement:authentik-2026-8:runtime:run -- --out dist/authentik-2026-8-runtime/ci.json
```

The runtime report passes only when all fourteen scenarios pass, the two
federation resources have four total flow bindings, the SCIM sink observes a
rejected bearer and at least twelve candidate operations, all reviewed image
digests match, and teardown is complete. CI uploads the report for thirty days
even when enforcement fails; raw Authentik/SCIM responses and logs are not
artifacts.

This evidence can close only the disposable candidate-runtime sub-question in
M13/M15/M16. It does not pass any of M13-S06's 51 production-canary checks, raise
the product score, approve a merge or release, validate current private
configuration or outposts, prove a real enterprise IdP, recover Authentik state,
prove rollback, or authorize a deployment. Those gates remain separately
pending.

## Rollback and failure consequences

Remove the workflow run and its additive scripts, plan, sink, and ADR. No schema,
identity, tenant, provider, production configuration, or loyalty value needs to
be reversed. If the candidate fails, retain the minimized failed check result in
CI, keep production on 2026.5.6, and either repair the harness when the failure is
proved harness-specific or reject/supersede the candidate through a new ADR.
Never weaken a deterministic failure or replace it with the source-contract
result.
