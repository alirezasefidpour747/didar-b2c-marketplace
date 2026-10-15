# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
ENV NODE_USE_ENV_PROXY=1
COPY --from=oven/bun:1.4.3 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY . .
RUN --mount=type=secret,id=cloud_ca \
    if [ -f /run/secrets/cloud_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/cloud_ca; fi; \
    bun install --frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1 MERCUR_DISABLE_TELEMETRY=true NODE_USE_ENV_PROXY=1
# Public API origin is baked into the native Mercur dashboards, not a secret.
ARG MERCUR_BACKEND_URL=http://localhost:9000
ENV MERCUR_BACKEND_URL=$MERCUR_BACKEND_URL
RUN --mount=type=secret,id=cloud_ca \
    if [ -f /run/secrets/cloud_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/cloud_ca; fi; \
    cd packages/api && bun run codegen
RUN bun run --cwd apps/admin build && bun run --cwd apps/vendor build
RUN bun run --cwd packages/api build
RUN bun run --cwd apps/storefront build
# Full workspace retained so native modules resolve and migration commands remain available.
# Run one API replica until deploying shared Redis workflow/event/locking providers.
FROM base AS api
ENV NODE_ENV=production
EXPOSE 9000
CMD ["sh","-c","cd packages/api/.medusa/server && node /app/packages/api/node_modules/@medusajs/cli/cli.js start"]
FROM base AS storefront
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
EXPOSE 3000
RUN cp -r apps/storefront/.next/static apps/storefront/.next/standalone/apps/storefront/.next/static && cp -r apps/storefront/public apps/storefront/.next/standalone/apps/storefront/public
CMD ["node","apps/storefront/.next/standalone/apps/storefront/server.js"]
