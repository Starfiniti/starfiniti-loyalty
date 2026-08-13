# Competitive Capability Matrix

Reviewed: 2026-08-13

This matrix compares released Starfiniti `v0.1.10` evidence—not planned UI—with current official product documentation. Competitor availability varies by plan and commerce platform; a check here means the vendor documents the capability, not that implementations are equivalent.

Official sources:

- [Smile pricing and features](https://smile.io/pricing?eco_tools=CRM_REPORTING_DASHBOARD)
- [LoyaltyLion feature table](https://loyaltylion.com/pricing/features-table)
- [Yotpo Loyalty product](https://support.yotpo.com/docs/loyalty-product) and [campaign overview](https://support.yotpo.com/docs/loyalty-campaigns-overview)

| Capability                                                   | Smile                                 | LoyaltyLion                          | Yotpo                                | Starfiniti `v0.1.10`                                         | Gap owner            |
| ------------------------------------------------------------ | ------------------------------------- | ------------------------------------ | ------------------------------------ | ------------------------------------------------------------ | -------------------- |
| Immutable value ledger, tenant RLS, exact replay safety      | Not evidenced in public feature page  | Not evidenced in public feature page | Not evidenced in public feature page | Strong released differentiator                               | Maintain all modules |
| Purchase earning and refunds                                 | Documented                            | Documented                           | Documented                           | Released for one tier-rate model                             | M01, M03             |
| Account, birthday, review, referral, custom activity earning | Documented                            | Documented                           | Documented                           | Missing                                                      | M03, M06             |
| Conditions, exclusions, multipliers, bonuses, caps           | Documented                            | Documented                           | Documented                           | Partial                                                      | M03                  |
| Fixed/percentage/free-shipping/free-product rewards          | Documented                            | Documented                           | Documented                           | First three released; free product missing                   | M04                  |
| Reward restrictions, quantity, exclusive/manual perks        | Partial                               | Documented                           | Documented                           | Missing                                                      | M04                  |
| VIP qualification, benefits, grace, progression              | Documented                            | Documented                           | Documented                           | Basic spend tiers/grace only                                 | M05                  |
| Referrals and fraud controls                                 | Documented                            | Documented                           | Documented                           | Missing                                                      | M06                  |
| Segments and campaigns                                       | Bonus events                          | Segmentation and rules               | Targeted campaigns                   | Missing                                                      | M07                  |
| Email/events/marketing automation                            | Integrations                          | Automated email, onsite, Klaviyo     | Communications/integrations          | Expiry schedule only; no delivery provider                   | M08                  |
| Hosted loyalty page/panel and store placements               | Documented                            | Documented                           | Documented                           | Basic hosted/member page and bounded Woo account/cart markup | M09                  |
| Analytics, ROI, CLV, cohorts, campaign/referral results      | Reports/ROI/CLV                       | Retention/ROI/referral/CLV/RFM       | Analytics                            | Basic operational and programme aggregates                   | M10                  |
| Multi-store/brand and currency                               | Enterprise/multi-program              | Cross-store rewards                  | Multiple stores/currencies           | Isolation foundation only                                    | M11                  |
| API, webhooks, service accounts, client contracts            | API documented                        | API/headless                         | APIs/integrations                    | Signed connector routes; merchant API is not GA              | M11                  |
| Competitor migration tooling                                 | Migration documented                  | Migration documented                 | Migration services documented        | Missing                                                      | M12                  |
| Enterprise roles, agency admin, tenant SSO/SCIM              | Enterprise features                   | Enterprise features                  | Enterprise features                  | Workforce SSO foundation; tenant federation/SCIM missing     | M13                  |
| Managed billing and usage entitlements                       | Vendor-managed SaaS                   | Vendor-managed SaaS                  | Vendor-managed SaaS                  | Missing by design in self-hosted release                     | M02, M14             |
| Open-source self-hosting without remote licence enforcement  | No                                    | No                                   | No                                   | Required differentiator                                      | M02, M14             |
| Real WooCommerce outage/recovery proof                       | Platform-specific evidence not public | Shopify-oriented                     | Shopify-oriented                     | Runtime matrix passes; real store not connected              | M01, M15             |

## Evidence-based conclusion

Starfiniti is not yet feature-complete against the major loyalty suites. Its strongest released advantages are immutable accounting, explicit tenant isolation, recoverable asynchronous WooCommerce processing, and open self-hosting. Its largest product gaps are non-purchase earning, reward breadth, advanced VIP, referrals, campaigns, communications, storefront merchandising, decision-grade analytics, migration, enterprise tenant administration, and managed commercial operations. M01–M15 close these gaps without weakening the existing trust boundaries.
