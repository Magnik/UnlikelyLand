# UnlikelyLand — Deployment (Hostinger VPS with Docker)

Target: a Docker-capable Linux VPS. Only the Caddy reverse proxy is exposed publicly (ports 80/443); Postgres, Redis, the API, and the web app stay on the internal Docker network.

## 0. Prerequisites on the VPS

- Docker Engine + the Docker Compose plugin.
- A domain's A/AAAA record pointing at the VPS IP (Caddy needs this to issue TLS certs).
- Ports 80 and 443 open in the firewall.

```bash
# Quick Docker install (Debian/Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # re-login afterwards
```

## 1. Get the code + configure

```bash
git clone <your-repo-url> unlikelyland && cd unlikelyland
cp .env.example .env
```

Edit `.env` and set, at minimum:

| Variable | Notes |
|---|---|
| `DOMAIN` | your public hostname, e.g. `play.example.com` |
| `ACME_EMAIL` | for Let's Encrypt notifications |
| `POSTGRES_PASSWORD` | strong, unique |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `ADMIN_PASSWORD` | strong; the seeded admin login |
| `AI_ENABLED` / `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | see "AI provider" below |

`DATABASE_URL` is assembled automatically inside Compose from `POSTGRES_*` (host = `postgres`); you don't set it for the containerised path.

## 2. Launch (production)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

This builds the API and web images, starts Postgres + Redis, and brings up Caddy with automatic HTTPS for `DOMAIN`. The **API container automatically runs `prisma migrate deploy` and seeds the world** (region sets, items, achievements, AI settings, admin account) on startup. First boot takes a minute while Caddy provisions a certificate.

Visit `https://DOMAIN`. Log in as the admin (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) to reach `/admin`.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api   # watch logs
docker compose ps                                                              # status
```

## 3. Database migrations

- **Containerised:** applied automatically on every API start (`prisma migrate deploy`). Idempotent.
- **Creating a new migration during development:** `npm run prisma:migrate -w @unlikelyland/api` generates SQL under `apps/api/prisma/migrations/`. Commit it; the next deploy applies it.
- **Manual apply on the server:** `docker compose exec api npx prisma migrate deploy`.

## 4. Backups (Postgres)

```bash
# one-off
set -a && . ./.env && set +a && ./scripts/backup-postgres.sh    # → ./backups/unlikelyland-<ts>.sql.gz, keeps last 14

# automated daily at 03:30 via cron
30 3 * * *  cd /path/to/unlikelyland && set -a && . ./.env && set +a && ./scripts/backup-postgres.sh >> backups/backup.log 2>&1
```

Restore (overwrites current data — back up first):

```bash
set -a && . ./.env && set +a && ./scripts/restore-postgres.sh backups/unlikelyland-YYYYMMDD-HHMMSS.sql.gz
```

The data itself also lives in the named volume `pgdata`; snapshot it at the VPS/volume level too if your host supports it. **Test a restore periodically** — an untested backup is a rumour.

## 5. AI provider (swappable)

The gateway calls any Ollama-compatible `/api/chat`. Three deployment options, all driven by `OLLAMA_BASE_URL` (changeable at runtime from `/admin`):

1. **Local laptop Ollama (dev / early prod):** point the VPS at a tunnel, or run the API locally. From a container to a *host* Ollama, `http://host.docker.internal:11434` works (Compose wires `extra_hosts`).
2. **Ollama on the VPS:** add an `ollama` service or run it on the host and set `OLLAMA_BASE_URL=http://host.docker.internal:11434` (or the service name). Needs RAM for the model.
3. **Hosted API later:** implement a second provider behind `AiProvider` and select it — no game-logic changes.

If AI is disabled, offline, or producing invalid/unsafe output, the server uses seeded fallback content. The game stays fully playable. Toggle AI / force fallback from `/admin`.

## 6. Exposing the API to the PWA and the future Android app

- **Browser / PWA:** the browser only ever calls **same-origin `/api/*`**, which the Next.js server proxies to the API container. No CORS, no API URL in the client bundle. Nothing extra to expose.
- **Android (Capacitor) later:** the native shell loads from a different origin, so it must call the API directly over HTTPS (`https://DOMAIN/api/...`). Add that app origin to `CORS_ORIGINS` in `.env` (the API already honours it). See [ANDROID.md](ANDROID.md).

## 7. Production hardening checklist

- [x] HTTPS via Caddy (auto-renew).
- [x] Postgres/Redis not published publicly (internal network only).
- [x] Secrets in `.env`, never committed (`.gitignore` covers `.env`).
- [x] Admin routes role-gated.
- [ ] Strong, unique `POSTGRES_PASSWORD` / `JWT_SECRET` / `ADMIN_PASSWORD` (you set these).
- [ ] Host firewall: allow only 22/80/443 (`ufw allow OpenSSH; ufw allow 80,443/tcp; ufw enable`).
- [ ] Disable password SSH / use keys; keep the OS patched.
- [ ] `docker compose pull` base images periodically; rebuild app images on dependency updates.
- [ ] Log rotation (Docker `json-file` with `max-size`/`max-file`, or journald).
- [ ] Off-box backup copies; periodic restore test.
- [ ] Monitoring/alerts (later) — start with `docker compose ps` + healthchecks.

## 8. Updating a running deployment

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# migrations apply automatically on API start; verify:
docker compose logs -f api
```
