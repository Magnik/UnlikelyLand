# Deploying UnlikelyLand on a Hostinger VPS (Docker Manager)

This matches the **VPS → Docker Manager → Compose → URL** screen. Images are
built for you by GitHub Actions and pushed to GHCR, so the VPS only pulls and
runs them — no building on the server.

## One-time prep on GitHub

1. **Merge the code to `main`.** The `Publish Docker images` workflow then builds
   and pushes two images to GHCR:
   - `ghcr.io/magnik/unlikelyland-api:latest`
   - `ghcr.io/magnik/unlikelyland-web:latest`
   Watch it under the repo's **Actions** tab; first run takes a few minutes.

2. **Make the two packages public** (so the VPS can pull without a login):
   GitHub → your profile/org → **Packages** → `unlikelyland-api` → *Package
   settings* → **Change visibility → Public**. Repeat for `unlikelyland-web`.
   *(Alternative: keep them private and `docker login ghcr.io` on the VPS with a
   Personal Access Token that has `read:packages`.)*

## Deploy via the Compose URL (the screen in your screenshot)

1. **URL** — paste:
   ```
   https://raw.githubusercontent.com/Magnik/UnlikelyLand/main/docker-compose.hostinger.yml
   ```
2. **Project name** — e.g. `unlikelyland`.
3. **Environment variables** — set at least these (see `deploy/hostinger.env.example`):
   | Variable | Value |
   |---|---|
   | `POSTGRES_PASSWORD` | a strong password |
   | `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `ADMIN_PASSWORD` | your admin login password |
   | `DOMAIN` | a hostname pointing at this VPS (your `*.hstgr.cloud` host works, or a custom domain) |
4. **Deploy.** The API container automatically runs database migrations and seeds
   the world (regions, items, achievements, AI settings, admin account) on first
   boot. Caddy provisions HTTPS for `DOMAIN` (first load can take ~30s).

Open `https://DOMAIN`, register a player, or log in as the admin
(`ADMIN_USERNAME` / `ADMIN_PASSWORD`) to reach `/admin`.

> If the deploy form does not let you set env vars, use the **Terminal** path below.

## Alternative: deploy from the VPS Terminal (most control)

```bash
git clone https://github.com/Magnik/UnlikelyLand.git && cd UnlikelyLand
cp deploy/hostinger.env.example .env && nano .env     # fill in the secrets + DOMAIN
docker compose -f docker-compose.hostinger.yml --env-file .env up -d
docker compose -f docker-compose.hostinger.yml logs -f api   # watch migrate + seed
```

This pulls the same prebuilt GHCR images. To instead build on the VPS from source
(heavier; needs ~2 GB RAM), use the repo's `docker-compose.yml` +
`docker-compose.prod.yml` as described in [DEPLOYMENT.md](DEPLOYMENT.md).

## Updating later

Push to `main` → Actions rebuilds `:latest` → on the VPS:

```bash
docker compose -f docker-compose.hostinger.yml pull
docker compose -f docker-compose.hostinger.yml up -d
```

(`pull_policy: always` means a redeploy from the Hostinger UI also fetches the
newest images.)

## Notes

- **AI is off by default** on the VPS (`AI_ENABLED=false`) so encounters are
  instant seeded content. Enable it from `/admin` once you have an Ollama
  endpoint reachable from the VPS, or set `AI_ENABLED=true` + `OLLAMA_BASE_URL`.
- Postgres/Redis are internal only; just Caddy is exposed (80/443).
- Backups: `scripts/backup-postgres.sh` (see [DEPLOYMENT.md](DEPLOYMENT.md)).
