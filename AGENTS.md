# Repository Guidelines

## Project Structure & Module Organization
- Root: operational docs (`README.md`, `SYNC_SETUP.md`, `DEPLOYMENT.md`), data files, and `scripts/`.
- Backend: `server/` (Express + TypeScript)
  - Source: `server/src/**` (routes in `src/routes`, DB in `src/db`)
  - Env: `server/.env` (copy from `.env.example`)
- Frontend: `client/` (React + Vite + TypeScript)
  - Source: `client/src/**` (pages, components, api, utils, styles)
- Database: `database/001_initial_schema.sql` for bootstrapping schema.
- Sync utilities: `scripts/` Python + shell helpers for LCR data ingestion.

## Build, Test, and Development Commands
- Backend dev: `cd server && npm run dev` — start API with TS watch on `:3001`.
- Backend build/start: `cd server && npm run build && npm start` — compile then run.
- Frontend dev: `cd client && npm run dev` — Vite dev server on `:3000`.
- Frontend build/preview: `cd client && npm run build && npm run preview`.
- Type check only: `cd server && tsc --noEmit`; `cd client && tsc --noEmit`.
- Apply schema: `psql -d ward_callings -f database/001_initial_schema.sql`.
- Sync data: `./scripts/run_sync.sh` (see `SYNC_SETUP.md`).

## Coding Style & Naming Conventions
- TypeScript with 2‑space indentation; semicolons required.
- React components/pages: PascalCase files (e.g., `OrgChart.tsx`).
- Utilities/API modules: camelCase or kebab-case files (e.g., `client.ts`, `calling-changes.ts`).
- Keep functions small; prefer pure helpers in `utils/`.
- Do not commit secrets; use `server/.env` (ignored by Git).

## Testing Guidelines
- No formal suite yet; prefer adding unit tests alongside code.
- Suggested names: `*.test.ts` under `server/src/**` and `client/src/**`.
- Aim for coverage of route handlers, data mappers, and UI logic.
- Run type checks (`tsc --noEmit`) and manual flows before PRs.

## Commit & Pull Request Guidelines
- Commits: imperative, concise subject; scope prefix optional (e.g., `server: add tasks route`).
- Include rationale in body when relevant; group related changes.
- PRs: clear description, screenshots for UI, steps to validate, linked issues, and any schema or script changes highlighted.

## Security & Configuration Tips
- Keep `DATABASE_URL` and cookies out of VCS; rotate when compromised.
- Prefer parameterized queries via `pg`; avoid building SQL strings.
- Document breaking changes to schema or scripts in PR description.
