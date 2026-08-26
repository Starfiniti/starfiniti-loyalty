# Agency support and organization recovery

This runbook covers the disabled-first M13-S05 repository candidate. Do not
enable it for a production tenant until the M13-S06 canary is approved and its
evidence is retained.

## Bilateral agency canary

1. Select a consenting client organization and the Starfiniti agency
   organization. Confirm both have separate live owners and local recovery.
2. The client owner creates an invitation in **Team & access** and transfers the
   one-time capability through an approved secret channel. Never paste it into
   tickets, chat history, URLs, logs, or evidence.
3. A live owner of the agency organization accepts it. Reconcile one active
   relationship and one immutable event from both portfolio perspectives.
4. Confirm neither organization gained a membership in the other and no
   customer, wallet, programme, ledger, connector, or SCIM record changed.
5. Revoke a disposable relationship from each perspective and prove dependent
   support access fails on the next request.

## Read-only support canary

1. From the agency organization, request only the scopes needed for the stated
   incident and use the shortest duration. The maximum is four hours.
2. A separate client owner reviews requester, reason, exact scopes, and expiry,
   then narrows/approves or rejects. Never approve your own request.
3. Open the support workspace once. Reconcile the minimized fields to the exact
   scopes and verify one tenant-visible use event with no PII, balance, secret,
   raw ledger, or customer record.
4. Revoke the grant and terminate the Auth session. Each must deny the next
   support read even if a previously issued JWT has not expired.
5. For suspected misuse, revoke the grant first, then the relationship and
   agency membership as applicable. Preserve request/grant/use history for the
   tenant; never delete or edit it.

## AAL2 recovery and export

1. Confirm the operator is the retained organization owner, has a live
   Supabase Auth session, and has just completed a second factor so the signed
   session is `aal2`.
2. Enter an incident-specific reason and start a 30-minute recovery session.
3. Prepare the administration export. Verify resource and credential counts,
   `ledger.netAmount`, `ledger.balanced`, and `immutableEvidenceRetained` before
   downloading the JSON. Store it only in the approved incident/evidence area.
4. End or revoke the Auth session after recovery. A stale browser token must
   not authorize the next elevated use.

## Offboarding and deletion

- Offboarding is immediate and terminal for new organization operation. It
  revokes commerce connections, service credentials, federation, SCIM,
  support, notification endpoints, schedules, and all but the initiating
  recovery-owner path. Verify each supported inventory count reaches zero and
  every retired webhook contains only the fixed `retired.invalid` destination
  tombstone, no current/previous hint, no previous fingerprint/overlap, and a
  current fingerprint different from the live credential.
- Deletion is not a first response. Export first, close/offboard, open a fresh
  AAL2 recovery session, request deletion, and retain the seven-day cooling
  case. A live owner can cancel during cooling.
- Completion requires explicit production-owner approval and a disposable
  rehearsal before any real tenant. Reconcile pseudonymization, zero live
  memberships, unchanged ledger row counts/net zero, and retained immutable
  audit/value evidence.

## Rollback and failure handling

- Disable the server-side feature/tenant rollout, revoke outstanding support
  grants and agency relationships, and preserve all evidence. Historical value
  and tenant review remain available.
- An ambiguous external or browser outcome is not success. Refresh the
  database-authoritative workspace and use the original operation ID only for
  an exact retry; never create a changed retry under the same ID.
- If the live-session bridge fails, support and recovery fail closed. Restore
  Auth/database health before retrying; do not grant Loyalty roles direct
  access to `auth.sessions`.
- Page the identity/security owner for cross-tenant visibility, unexpected
  active credentials after offboarding, missing use evidence, or any ledger or
  immutable-history difference. These are release-stopping incidents.
