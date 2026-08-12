# Data Classification

| Class        | Examples                                                                                                                | Storage/transit                                                                            | Access and handling                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Restricted   | Database/Auth/Woo/signing secrets, private signing keys, privacy peppers, backup keys, session tokens, coupon plaintext | Secret manager or isolated encrypted restricted store; TLS; never general application rows | Named runtime only; never browser, WordPress diagnostics, logs, repository, analytics, exports, or support bundle |
| Confidential | Customer/channel IDs, contact data, order/refund associations, wallet history, raw webhook bodies, privacy exports      | Encrypted disks/backups; TLS; field minimization; raw bodies short-lived                   | Tenant/subject and purpose scoped; masked support; audited export                                                 |
| Internal     | Programme/theme drafts, fraud/risk signals, audit metadata, queue diagnostics, operational topology                     | Authenticated internal systems                                                             | Role scoped; no public cache; redact before support sharing                                                       |
| Public       | Published programme/theme copy, public documentation, intentionally public reward descriptions                          | Public systems/CDN                                                                         | Integrity/version controls; no hidden customer/tenant data                                                        |

## Handling rules

- Classification follows the most sensitive field in a combined artifact.
- The downloadable support diagnostic is allowlisted Internal data: public tenant/connection scope, queue aggregates, watermarks, and canonical codes only. Any noncanonical diagnostic text is redacted, and adding a Confidential or Restricted field changes the classification and is forbidden without a separate approved export design.
- IDs may remain Confidential even without names because linkage can re-identify a subject.
- Hashes of low-entropy secrets/identifiers remain sensitive; use keyed hashes where guessing is realistic.
- Customer-erasure subject fingerprints use a private per-connection 256-bit pepper stored separately from immutable tombstones; neither table has browser, runtime, worker-enumeration, export, or support grants.
- Restricted values use independent environment credentials and rotation. They never use `NEXT_PUBLIC_` names.
- Logs are Internal only after structured allowlist redaction; otherwise they inherit source classification.
- Temporary files, CI artifacts, crash dumps, and backups follow the same controls as the source.
- Production data is not copied to development. Test fixtures are synthetic.
