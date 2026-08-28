-- Complete RLS coverage for tenant-bearing private coordination tables. These
-- tables remain reachable only through reviewed SECURITY DEFINER functions;
-- enabling RLS ensures a future direct grant still fails closed without a
-- matching policy. The loyalty_owner functions continue to use owner bypass.

alter table loyalty_private.referral_link_requests
  enable row level security;
alter table loyalty_private.referral_risk_evidence
  enable row level security;
alter table loyalty_private.woocommerce_customer_snapshot_deliveries
  enable row level security;

revoke all on
  loyalty_private.referral_link_requests,
  loyalty_private.referral_risk_evidence,
  loyalty_private.woocommerce_customer_snapshot_deliveries
from public, anon, authenticated, loyalty_runtime, loyalty_worker;

comment on table loyalty_private.referral_link_requests is
  'Private idempotency evidence for Auth-derived referral-link creation; RLS is enabled with no direct-role policy.';
comment on table loyalty_private.referral_risk_evidence is
  'Short-lived referral abuse fingerprints; RLS is enabled with no direct-role policy.';
comment on table loyalty_private.woocommerce_customer_snapshot_deliveries is
  'Private monotonic WooCommerce snapshot delivery state; RLS is enabled with no direct-role policy.';
