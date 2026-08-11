<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# BRAN V2

A React + TypeScript + Vite application for project scheduling, uploads, mapping, dashboards, and employee workflows. The app is backed by Supabase and uses a modular UI split across the components folder.

## Current project status

- Build verification: passing with `npm run build`
- Type-check verification: passing with `npm run lint`
- Runtime dependency: Supabase credentials and a valid browser session are required for most workflows

## Key structure

- [src/App.tsx](src/App.tsx): top-level app shell and navigation state
- [src/lib/db.ts](src/lib/db.ts): Supabase client initialization and shared database helpers
- [src/components](src/components): feature modules such as uploads, mapping, dashboards, planning, and employee views
- [supabase](supabase): database checks, migrations, and edge-function scaffolding

## Run locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create or update [.env.local](.env.local) with:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
3. Validate environment setup:
   `npm run check:env`
4. Optional database connectivity check:
   `npm run check:db`
5. Start the app:
   `npm run dev`

## Useful commands

- `npm run build`
- `npm run lint`
- `npm run check:env`
- `npm run check:db`

For a deeper handoff summary, see [CASE_PREP.md](CASE_PREP.md).