FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN npm ci

FROM dependencies AS builder
COPY . .
RUN npm run build --workspace=@starfiniti/worker

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache --upgrade libcrypto3=3.5.8-r0 libssl3=3.5.8-r0 \
  && rm -rf /usr/local/lib/node_modules /opt/yarn-v1.22.22 \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "process.kill(1, 0)" || exit 1
CMD ["node", "apps/worker/dist/index.mjs"]
