# M15 Evidence — GA Hardening

M15-S01 is active. `capacity.yaml` separates repository readiness from an approved production-like measured run and exact value reconciliation. No supported capacity is claimed while that manifest is in progress.

M15-S02 is active. `fault-injection.yaml` separates the disposable-only controller from the two approved production-like runs and independent WAL, queue, ledger, WooCommerce, checkout, and no-loss reconciliation. No production fault is authorized by repository readiness.

M15-S03 is active. `security.yaml` separates immutable repository workflow/plan controls from fresh exact-head CodeQL/image/SBOM/DAST evidence, tagged-release verification, approved non-destructive production review, independent penetration testing/retest, R-032 resolution, finding reconciliation, and owner approval. Repository readiness authorizes no production scan or mutation.

Later slices record clean-room recovery/RPO/RTO, observability and incident exercises, 30-day reconciliation, claims, and final approval here.
