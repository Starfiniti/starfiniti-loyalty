# Domain Glossary

- **Organization:** security and billing tenant.
- **Workspace:** operational scope for a store or approved store group.
- **Programme group:** explicit boundary within which a loyalty currency and wallets may be shared.
- **Programme version:** immutable published rules used to explain historical effects.
- **Customer identity:** a channel-specific identifier linked through an explicit identity policy; never email alone.
- **Wallet:** balance projection for one customer and programme group.
- **Ledger transaction:** immutable business operation containing one or more balanced state entries.
- **Ledger account:** wallet-state or programme-control account that receives signed double-entry quantities.
- **Ledger entry:** immutable signed points quantity; all entries in a transaction sum to zero.
- **Reservation:** temporary hold of available value before commerce-side redemption is captured.
- **Commerce event:** versioned canonical fact normalized from an external channel event.
- **Delivery:** one signed, retryable connector message persisted before normalization.
- **Business effect:** unique application of a canonical event to ledger, tier, identity, or audit state.
- **Support grant:** approved, scoped, expiring authority for a support actor to access one tenant.
