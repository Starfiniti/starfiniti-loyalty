# ADR-0003: Defer Shopify implementation

- Status: Accepted
- Date: 2026-08-11

## Context

The product owner asked to finish the self-hosted loyalty hub with Next.js and WooCommerce and to skip Shopify for now.

## Decision

Exclude Shopify applications, dependencies, API research, tests, and deployment artifacts from the active dependency graph. Preserve platform-neutral connector and domain boundaries so Shopify can be added later without becoming the source of truth.

## Alternatives

- Build both connectors concurrently: increases scope and delays the first useful WooCommerce release.
- Remove Shopify permanently: would contradict the master plan and is not authorized.

## Effects and rollback

No stored data or security boundary changes. Reactivation requires a new scoped task and review of current Shopify primary documentation.
