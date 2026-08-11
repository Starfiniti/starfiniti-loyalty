# ADR-0001: TypeScript modular monolith with npm workspaces

- Status: Accepted
- Date: 2026-08-11

## Context

The workspace starts from a design prototype with no application code. The platform requires transactional coherence around tenancy, events, wallets, and rewards. npm 11 is available locally; the configured pnpm shim is broken.

## Decision

Use a TypeScript-first modular monolith in npm workspaces. Keep pure domain/contracts/database boundaries separate and expose them to the Next.js dashboard and later API/worker entry points. Use npm lockfiles as the reproducible package contract.

## Alternatives

- pnpm/Turborepo: good monorepo ergonomics, but the local shim is broken and adds no Phase 0 correctness.
- Independent repositories/microservices: increases versioning and operational failure modes before scale evidence exists.

## Effects

Shared transactions and contracts reduce ledger drift. Package boundaries remain extractable. npm may install more duplicate packages than pnpm, which is acceptable initially.

## Migration and rollback

Workspaces can later move to pnpm without changing package boundaries. Rollback is deletion of root workspace metadata; no data is affected.
