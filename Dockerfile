# syntax=docker/dockerfile:1
# Multi-stage build for the Next.js standalone server. Matches the backend
# repo's image conventions (node:20-alpine, USER node) while adding the build
# stage Next needs. The runtime image carries only .next/standalone (server.js
# + pruned node_modules), .next/static, and public — no dev dependencies.

# --- build stage ------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# next.config.ts sets output:"standalone", so this produces .next/standalone.
RUN npm run build

# --- runtime stage ----------------------------------------------------------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# The standalone server binds to HOSTNAME; default is localhost, which is
# unreachable from outside the container.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

EXPOSE 3000
USER node
# node (not npm) as PID 1 so SIGTERM reaches the server directly — same fast
# termination the backend services rely on.
CMD ["node", "server.js"]
