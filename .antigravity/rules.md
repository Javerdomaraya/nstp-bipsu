# BIPSU NSTP Architecture Guardrails & Engineering Standards

## 1. Zero Frontend Mock Data & No Client-Side Persistence for Domain Entities
- **Zero Mock Data**: Never fallback to demo accounts, seed arrays, or in-memory fixtures when an API call fails. Render explicit error states, empty states, or retry actions.
- **No Domain State in Web Storage**: Never use `localStorage` or `sessionStorage` to persist domain entities (students, accounts, modules, assessments, submissions, attendance, grades, announcements, qualifying exams, or component allocation states).
- **Allowed Local Storage**: Strictly limited to ephemeral client-side UI preferences (e.g. `nstp-theme` and user-scoped notification badge read IDs `nstp-notice-read-${userId}`).

## 2. Express -> Prisma -> Neon PostgreSQL Architecture
- **Authoritative Flow**: All data reads and writes must strictly flow through:
  `Frontend (TanStack Query) -> Express API -> Prisma ORM -> Neon PostgreSQL (DATABASE_URL)`.
- **Frontend Consumption**: All domain reads and mutations on the frontend must use dedicated TanStack Query hooks defined in `frontend/src/hooks/index.ts`.
- **Real-Time Synchronisation**: When data changes on the backend, emit collection change events via Socket.io (`nstp-socket-sync`). The frontend shell listens to socket events and invalidates TanStack Query caches automatically.

## 3. Granular RESTful Single-Record Mutations Over Batch Overwrites
- **Single-Record Mutations**: Inline updates, row edits, reassignments, and deletions must execute granular HTTP operations:
  - `POST /nstp/...` for resource creation
  - `PATCH /nstp/.../:id` for partial updates (e.g., component placement, status changes)
  - `DELETE /nstp/.../:id` for resource removal
- **Prohibit Bulk Overwrites**: Do not use bulk array overwrite endpoints (e.g. `/nstp/admin/*/batch`) for single-item updates, as they induce race conditions and split-brain state.

## 4. Production-Grade Prisma Migrations
- **Migration Tracking**: Every database schema alteration in `backend/prisma/schema.prisma` must have a corresponding, reviewed SQL migration file in `backend/prisma/migrations/`.
- **Zero Drift**: `prisma migrate status` must always report that the database schema is up to date and in sync with migrations before deploying.
- **Idempotency**: Seed scripts and database operations must be idempotent (`upsert` operations with unique constraints).

## 5. Server-Authoritative Role-Based Access Control (RBAC)
- All authorization decisions (ADMIN, COORDINATOR, INSTRUCTOR/FACILITATOR, STUDENT) are derived on the server via JWT / session authentication.
- Coordinator and Instructor queries must enforce scope filtering at the database/service layer (`requireAssignedSection`, `requireCoordinatorScope`) and never rely on client-side filtering of global admin snapshots.
