# Supabase Database Verification

- Documentation reviewed: 2026-08-11
- CLI version: 2.113.0, pinned in `package.json` and `package-lock.json`
- PostgreSQL major: 17
- Primary references:
  - https://supabase.com/docs/guides/local-development/testing/overview
  - https://supabase.com/docs/guides/deployment/ci/testing
  - https://supabase.com/docs/guides/local-development/cli-workflows

## Complete local gate

```sh
npm run db:verify
```

This requires Docker or Podman. It starts only the Supabase PostgreSQL service, applies migrations and seed, performs a destructive local reset to replay the chain from scratch, and runs every SQL file in `supabase/tests` through pgTAP. It never links to or mutates a remote project.

Clean up local containers and their test volumes with:

```sh
npm run db:stop
```

## Current security baseline

`foundation_security_test.sql` proves that:

- application and private schemas exist;
- `PUBLIC`, `anon`, and `authenticated` cannot use the application schema before policies exist;
- `PUBLIC` cannot use the private schema;
- every application table in an exposed or candidate schema has RLS enabled;
- no application-owned security-definer function is placed in an exposed schema.

The last two checks are durable guards: they fail automatically when future migrations add an unsafe table or privileged function.

## CI

The `database` job in `.github/workflows/ci.yml` runs the same `npm run db:verify` command on an Ubuntu Docker runner and always removes containers/volumes afterward. GitHub Actions and the Supabase CLI are pinned; no project credentials are required.

## Local limitation

The current Windows workstation has no Docker, Podman, or WSL. Static config/test validation passes through `npm run db:validate`, but this is not equivalent to executing the database tests. Phase 0 remains in verification until a real Docker runner passes.
