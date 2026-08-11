# Backup and Restore

Production readiness requires encrypted Postgres backups or WAL/PITR meeting RPO 5 minutes, configuration/secret escrow, off-host immutable retention, and scheduled restore drills proving RTO 60 minutes. VM snapshots alone are not an authoritative database backup. No production claim is allowed until a clean restore is verified and recorded.
