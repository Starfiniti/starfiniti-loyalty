# Threat Model

Initial critical threats are cross-tenant reads/writes, forged tenant IDs, leaked secret keys, webhook forgery/replay, coupon theft, concurrent double-spend, plugin supply-chain compromise, personal data in logs/exports, support impersonation, and failed backups. Each requires executable controls before its feature can pass a release gate.
