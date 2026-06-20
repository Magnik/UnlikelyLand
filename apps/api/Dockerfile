# ── Build stage ──────────────────────────────────────────────────────────────
# Builds the shared contracts package + the API, generating the Prisma client.
FROM node:20-slim AS builder
WORKDIR /app

# Prisma needs OpenSSL for its query engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Install all workspace dependencies (lockfile-faithful).
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

# Copy sources and build contracts → api (api build runs `prisma generate`).
COPY . .
RUN npm run build -w @unlikelyland/contracts \
 && npm run build -w @unlikelyland/api

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production

# Bring over the installed dependencies and built artifacts. node_modules
# carries the Prisma CLI + ts-node used by the entrypoint for migrate + seed.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# tsconfig files are required at runtime: `prisma db seed` runs ts-node prisma/seed.ts,
# which needs apps/api/tsconfig.json (and the base it extends). Without these the
# seed step of the CMD chain fails and the container never starts the server.
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=builder /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply migrations, (idempotently) seed the world, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/main.js"]
