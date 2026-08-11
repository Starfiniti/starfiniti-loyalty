# Deployment

Use a dedicated Linux VM on Proxmox for pinned official Supabase Docker Compose and separate application containers. Copy `.env.example` files to secret-managed deployment locations; never commit populated files. Public services require trusted TLS, restricted firewall rules, health checks, off-host backups, and a tested rollback.

See `infrastructure/environments/proxmox/README.md`.
