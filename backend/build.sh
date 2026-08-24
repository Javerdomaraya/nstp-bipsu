#!/usr/bin/env bash
set -euo pipefail

# Build entrypoint for hosting platforms that run a build command from backend/.
#
# IMPORTANT: the migration step below must stay routed through
# `npm run migrate:deploy`. That npm script is the ONLY approved production
# migration path -- it runs the referential-integrity gate and the read-only
# production preflight first, and verifies the physical schema afterwards. Every
# stage fails closed:
#
#     report:orphans && preflight:production && prisma migrate deploy && verify:schema
#
# A bare `npx prisma migrate deploy` here would apply schema changes and the
# coordinator scope backfill without any gate having run. Do not reintroduce
# one. `set -e` ensures a blocking gate aborts this script before any DDL.
#
# verify:schema runs after the DDL and cannot prevent it. It is there because
# `prisma migrate status` reports a migration as applied even when its DDL is
# absent from the database, so a deployment could otherwise be reported as
# successful while the foreign keys that enforce coordinator scope are missing.
#
# Note for operators: running migrations from a build step is not the preferred
# workflow, because a build may execute in a different environment (or on more
# than one instance) than the release it produces. The documented procedure in
# MIGRATION_OPERATIONS.md is an explicit, operator-initiated migration against a
# verified backup. Keep this script gated for platforms that cannot do that.

echo "=== Installing dependencies ==="
npm install

echo "=== Generating Prisma client ==="
npx prisma generate

echo "=== Running gated database migrations ==="
echo "    (orphan report -> production preflight -> prisma migrate deploy -> schema verification)"
npm run migrate:deploy

echo "=== Build complete ==="
