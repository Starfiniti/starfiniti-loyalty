FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN npm ci

FROM dependencies AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@starfiniti/dashboard

FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --spider --quiet http://127.0.0.1:3000/api/healthz || exit 1
CMD ["node", "apps/dashboard/server.js"]

