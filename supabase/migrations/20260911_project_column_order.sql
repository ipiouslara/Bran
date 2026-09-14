-- ================================================================
-- MIGRATION: Project Custom Column Order & In-Memory Engine Support
-- Safe & Idempotent: Can be executed multiple times without errors
-- ================================================================

-- 1. Add column_order JSONB to public.projects
-- Stores custom ordered lists of phase column names, e.g.:
-- { "internal": ["Phase 1", "Phase 2"], "client": ["Milestone A", "Milestone B"] }
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS column_order JSONB DEFAULT '{"internal": [], "client": []}'::jsonb;

-- 2. Add description comment for database documentation
COMMENT ON COLUMN public.projects.column_order IS 
'Stores custom persisted column order for internal and client phases ({ "internal": string[], "client": string[] })';

-- 3. Create index on column_order for fast JSONB access if needed
CREATE INDEX IF NOT EXISTS idx_projects_column_order ON public.projects USING GIN (column_order);

-- 4. Note on phase_gaps table deprecation:
-- BRAN now calculates working-day gaps dynamically in-memory using public holidays.
-- Static records in public.phase_gaps are no longer read or written during cascading.
-- (Existing table is retained for historical audit, but you can safely truncate or drop it if desired).

-- 5. Verification query: run this to confirm column existence
SELECT id, name, column_order 
FROM public.projects 
LIMIT 5;
