# NSTP Management System

NSTP Management System is a full-stack web application for managing NSTP users, students, modules, assessments, grades, reports, enrollment flows, announcements, and administrative workflows.

The repository is organized as a production-friendly monorepo while keeping the backend and frontend as independent apps.

## Tech Stack

- Frontend: Vite, React, TypeScript, Tailwind CSS
- Backend: Node.js, Express
- Database: PostgreSQL
- ORM: Prisma
- Package manager: npm

## Project Structure

```text
NSTP-Final-main/
|-- backend/
|   |-- prisma/
|   |   |-- schema.prisma
|   |   `-- migrations/
|   |-- src/
|   |   |-- cache/
|   |   |-- config/
|   |   |-- data/
|   |   |-- db/
|   |   |-- middleware/
|   |   |-- modules/
|   |   |-- routes/
|   |   |-- utils/
|   |   |-- app.js
|   |   `-- server.js
|   |-- .env.example
|   |-- package.json
|   `-- README.md
|
|-- frontend/
|   |-- public/
|   |-- src/
|   |   |-- assets/
|   |   |-- components/
|   |   |-- data/
|   |   |-- features/
|   |   |-- hooks/
|   |   |-- pages/
|   |   |-- services/
|   |   |-- styles/
|   |   |-- types/
|   |   |-- utils/
|   |   |-- App.tsx
|   |   `-- main.tsx
|   |-- package.json
|   `-- README.md
|
|-- package.json
|-- README.md
`-- .gitignore
```

## Environment Variables

Backend environment file: `backend/.env`

```env
PORT=5000
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/nstp_db"
JWT_SECRET=replace-with-a-secure-secret
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

Frontend environment file: `frontend/.env`

```env
# Development: /api (Vite proxies it to http://localhost:5000)
VITE_API_BASE_URL=/api
# Vercel production (required): https://api.example.edu/api
```

Do not commit real `.env` files.

## Deployment configuration

Vercel serves the frontend only. Set `VITE_API_BASE_URL` in the Vercel Production
environment to the public HTTPS backend URL ending in `/api`; the frontend fails at
startup with a clear message if it is missing or invalid. Do not use the Vite proxy
in production. Configure the backend `CORS_ORIGIN` with a comma-separated list of
exact approved frontend origins, for example `https://app.example.edu` (no wildcard).

For Docker Compose, the public frontend and API share an origin: Nginx proxies
`/api` and `/socket.io` to the internal backend. Before starting the application,
run the separate migration command:

```bash
docker compose --profile maintenance run --rm migrate
docker compose --profile maintenance run --rm seed
docker compose up -d
```

Root commands are intentionally separated: `npm run build` only builds artifacts;
`npm run migrate:deploy`, `npm run migrate:status`, `npm run migrate:recover`, and
`npm run seed` are explicit database maintenance operations.

See `backend/MIGRATION_OPERATIONS.md` before restoring PostgreSQL foreign keys or
handling a failed migration. It requires a verified backup and an orphan-data
report before applying the foreign-key migration.

## Backend Setup

```bash
cd backend
npm install
npx prisma generate
npm run dev
```

For a fresh database migration:

```bash
cd backend
npx prisma migrate dev --name init
```

Useful Prisma commands:

```bash
cd backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Build the frontend:

```bash
cd frontend
npm run build
```

## Development Commands

From the repository root:

```bash
npm run backend:dev
npm run frontend:dev
npm run frontend:build
npm run prisma:migrate
npm run prisma:studio
```

## Local URLs

- Backend health: `http://localhost:PORT/health`
- Backend DB test: `http://localhost:PORT/api/db-test`
- Frontend dev server: usually `http://localhost:5173`

Your backend port comes from `backend/.env`.


admin@bipsu.edu.ph
coordinator.cwts@bipsu.edu.ph
coordinator.mts@bipsu.edu.ph
instructor.cwts@bipsu.edu.ph
student.cwts@bipsu.edu.ph