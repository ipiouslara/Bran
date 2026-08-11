# Case preparation summary

## What this project does

BRAN V2 is a React + TypeScript + Vite workspace for project planning, uploads, workbook mapping, and employee-facing scheduling workflows. Most user-facing behavior depends on Supabase-backed data.

## Verified baseline

- Build succeeds with `npm run build`
- Type check succeeds with `npm run lint`
- The frontend initializes a Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

## Important files

- [src/App.tsx](src/App.tsx): main view and navigation routing
- [src/lib/db.ts](src/lib/db.ts): database connectivity and auth helpers
- [src/components](src/components): feature modules for dashboards, uploads, mapping, and project management
- [supabase](supabase): environment checks, migrations, and edge functions

## Recommended next steps for a new case

1. Review the current auth/session flow before changing user roles or permissions.
2. Confirm Supabase environment variables are present in the runtime environment.
3. Reproduce the target issue in browser or through the relevant component before editing code.
4. Prefer small, targeted changes that align with the existing module structure.

## Quick commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run lint`
- `npm run check:env`
- `npm run check:db`
