# Product Requirements

Starfiniti Loyalty is a multi-tenant loyalty system in which the central PostgreSQL ledger is authoritative and WooCommerce is a connector/execution channel.

## Current release slice

- Self-hosted open-source deployment on Proxmox
- Next.js merchant dashboard and hosted customer experiences
- WooCommerce order/refund/customer ingestion and storefront/plugin surfaces
- Guided owner/admin WooCommerce connection setup without browser or WordPress access to Supabase secret/service credentials
- English-only launch presentation across merchant, public, claim, authentication, member-account, reward-redemption, and WooCommerce surfaces. Legacy translation rows remain readable for migration compatibility but are not selectable or rendered.
- Password-reauthenticated customer portability through a direct, audited, one-use JSON download with no persisted export content
- Rosy Rewards v1 acceptance configuration: 100 points = EUR 1, 30-day pending release, 12-month rolling expiry, and Rose/Bloom/Icon tiers from EUR 0/150/500 at 5/6/7 points per EUR. EUR 1,000/8 points is reserved as an unpublished future concept.

Shopify is deferred. ADR-0004 records the approved legal value, award timing, returns, negative-balance, guest-identity, wallet-sharing, expiry, rounding, and tier policies. Programme versions must encode these policies explicitly rather than infer them from UI prototypes.
