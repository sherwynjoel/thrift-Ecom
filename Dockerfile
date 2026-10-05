# syntax=docker/dockerfile:1.7
# Production image for the store. Built on the server by deploy/deploy.sh (never on the dev laptop) and by CI.

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- dependencies (postinstall runs `prisma generate`, so the schema comes first)
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---- build
FROM base AS builder
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_GA_ID=""
ARG NEXT_PUBLIC_META_PIXEL_ID=""
ARG S3_PUBLIC_BASE_URL=""
ARG APP_VERSION=dev
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_GA_ID=${NEXT_PUBLIC_GA_ID} \
    NEXT_PUBLIC_META_PIXEL_ID=${NEXT_PUBLIC_META_PIXEL_ID} \
    S3_PUBLIC_BASE_URL=${S3_PUBLIC_BASE_URL} \
    APP_VERSION=${APP_VERSION} \
    NEXT_OUTPUT=standalone \
    NODE_OPTIONS=--max-old-space-size=1536
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN test -n "${NEXT_PUBLIC_SITE_URL}" || (echo "NEXT_PUBLIC_SITE_URL build arg is required" >&2; exit 1)
# Lint runs in CI; the type check still runs here.
RUN npx next build --no-lint

# ---- tools used by the entrypoint and deploy/seed-admin.sh (versions pinned to package-lock, see tests/unit/deploy-kit.test.ts)
FROM base AS tools
ARG PRISMA_VERSION=6.19.3
ARG BCRYPTJS_VERSION=3.0.3
WORKDIR /opt/tools
RUN npm init -y >/dev/null \
 && npm install --no-audit --no-fund --omit=dev "prisma@${PRISMA_VERSION}" "bcryptjs@${BCRYPTJS_VERSION}" \
 && npm cache clean --force

# ---- runtime
FROM base AS runner
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=${APP_VERSION} \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=tools /opt/tools /opt/tools
COPY deploy/create-admin.mjs /opt/tools/create-admin.mjs
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/content ./content
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Belt and braces: make sure the generated Prisma client and its musl engine are present next to server.js.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p /app/storage/uploads /app/.next/cache && chown -R nextjs:nodejs /app/storage /app/.next/cache
USER nextjs
EXPOSE 3000
VOLUME ["/app/storage/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
