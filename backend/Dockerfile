# Backend image.
#
# BUILD CONTEXT IS THE REPOSITORY ROOT, not backend/.
# This repository is an npm workspaces monorepo ("workspaces": ["backend",
# "frontend"] in the root package.json) and there is exactly one lockfile:
# /package-lock.json. A backend-only build context cannot see it, which is why
# this image previously ran `npm install` and resolved dependency versions afresh
# on every build -- the image could therefore drift from the versions CI tested.
#
# docker-compose.yml sets `context: .` and `dockerfile: backend/Dockerfile` for
# every service built from this file. Building it with `docker build ./backend`
# will fail on the COPY below; that failure is intentional and preferable to
# silently reverting to unpinned installs.

FROM node:20-alpine AS builder
WORKDIR /app
# openssl is needed at generate time, not just at run time: Prisma's platform
# detection reads the OpenSSL version to choose an engine, and schema.prisma sets
# no explicit binaryTargets. Installing it here makes the builder detect the same
# platform the runtime stage provides (linux-musl-openssl-3.0.x) instead of
# falling back to a default that may not match.
RUN apk add --no-cache openssl

# Manifests and the lockfile first, so the dependency layer is cached
# independently of source changes.
COPY package.json package-lock.json ./
# Both workspace manifests are required: `npm ci` reconciles the entire lockfile
# tree, so it must be able to read every workspace declared by the root
# package.json even though only backend is installed.
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

# npm ci installs exactly what the lockfile pins and fails if package.json and
# the lockfile disagree. Never replace this with `npm install`.
RUN npm ci --workspace backend --include-workspace-root --include=dev

# The Prisma schema must be present before generate runs, and generate must run
# after the schema is copied so the client matches this revision's schema.
COPY backend/prisma ./backend/prisma
RUN npm run prisma:generate --workspace backend

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl

# BOTH dependency trees are required. npm hoists most packages to the workspace
# root, but package-lock.json pins 34 entries under backend/node_modules/ --
# including @prisma/client, prisma, and dotenv. Copying only /app/node_modules
# produces a runtime MODULE_NOT_FOUND on `require('@prisma/client')`.
#
# The generated Prisma client is written next to the resolved @prisma/client
# package, i.e. into /app/backend/node_modules/.prisma/client, so that tree
# carries the generate output as well.
#
# If the lockfile is ever regenerated and the hoisting layout changes, verify
# both COPY lines still reflect it (npm ls --workspace backend --all).
COPY --from=builder /app/node_modules ./node_modules
COPY backend ./backend
COPY --from=builder /app/backend/node_modules ./backend/node_modules

WORKDIR /app/backend
EXPOSE 5000
# No migration hook here on purpose. Schema changes are applied only by the
# gated `npm run migrate:deploy` path, run deliberately by an operator.
CMD ["node", "src/server.js"]
