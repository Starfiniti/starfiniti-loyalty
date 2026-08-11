-- Starfiniti-owned objects are kept out of public until their grants and RLS
-- policies have executable isolation tests.
create schema if not exists loyalty;
create schema if not exists loyalty_private;

revoke all on schema loyalty from public, anon, authenticated;
revoke all on schema loyalty_private from public, anon, authenticated;

comment on schema loyalty is
  'Starfiniti Loyalty application schema; expose only through explicit Data API configuration, grants, and RLS.';
comment on schema loyalty_private is
  'Unexposed schema for privileged functions and internal database objects.';
