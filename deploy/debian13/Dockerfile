# Deployment-only wrapper. Application files come from the requested git archive.
FROM node:24.19.0-bookworm-slim AS base
COPY --from=oven/bun:1.4.3 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 MERCUR_DISABLE_TELEMETRY=true NODE_OPTIONS=--max-old-space-size=3072
COPY . .
RUN --mount=type=secret,id=cloud_ca \
    if [ -f /run/secrets/cloud_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/cloud_ca; fi; \
    bun install --frozen-lockfile
ARG MERCUR_BACKEND_URL=http://localhost:19000
ENV MERCUR_BACKEND_URL=$MERCUR_BACKEND_URL
RUN cd packages/api && bun run codegen
RUN node scripts/build-panels.mjs
RUN bun run --cwd packages/api build
RUN bun run --cwd apps/storefront build

FROM base AS api
ENV NODE_ENV=production NODE_OPTIONS=--max-old-space-size=1536
EXPOSE 9000
CMD ["sh", "-c", "cd packages/api/.medusa/server && exec node /app/packages/api/node_modules/@medusajs/cli/cli.js start --host 0.0.0.0 --port 9000"]

FROM node:24.19.0-bookworm-slim AS storefront
WORKDIR /app
COPY --from=base /app/apps/storefront/.next/standalone ./
COPY --from=base /app/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=base /app/apps/storefront/public ./apps/storefront/public
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=512
EXPOSE 3000
CMD ["node", "apps/storefront/server.js"]
