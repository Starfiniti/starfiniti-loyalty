# Product Requirements

Starfiniti Loyalty is a multi-tenant loyalty system in which the central PostgreSQL ledger is authoritative and WooCommerce is a connector/execution channel.

## Current release slice

- Self-hosted open-source deployment on Proxmox
- Next.js merchant dashboard and hosted customer experiences
- WooCommerce order/refund/customer ingestion and storefront/plugin surfaces
- Rosy Rewards acceptance configuration: 100 points = EUR 1, 12-month expiry, spend tiers at EUR 150/500/1,000, earn rates 5/6/7 points per EUR

Shopify is deferred. Product decisions about legal value, award timing, returns, negative balances, guest identity, and shared wallets remain Phase 1 gates and must not be inferred from the prototype.
