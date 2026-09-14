-- ============================================================================
-- BRAN: COMPLETE & FULLY OPTIMIZED LMS & CONSOLIDATED PHASES VIEW MIGRATION
-- Safe & idempotent: can be rerun multiple times without errors
-- ============================================================================

-- STEP 1: Add LMS feature flag to projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS has_lms_track BOOLEAN DEFAULT FALSE;

-- STEP 2: Add metadata column to courses table
ALTER TABLE public.courses 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- STEP 3: Update client_phases table (Allow course-level phases)
ALTER TABLE public.client_phases
  ALTER COLUMN module_id DROP NOT NULL;

ALTER TABLE public.client_phases
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS entity_level VARCHAR(20) DEFAULT 'module';

-- Update entity_level check constraint
ALTER TABLE public.client_phases
  DROP CONSTRAINT IF EXISTS client_phases_entity_level_check;

ALTER TABLE public.client_phases
  ADD CONSTRAINT client_phases_entity_level_check CHECK (entity_level IN ('module', 'course'));

-- Ensure client_phases row belongs to either a module OR a course
ALTER TABLE public.client_phases
  DROP CONSTRAINT IF EXISTS client_phases_owner_check;

ALTER TABLE public.client_phases
  ADD CONSTRAINT client_phases_owner_check 
  CHECK (
    (entity_level = 'module' AND module_id IS NOT NULL) OR
    (entity_level = 'course' AND course_id IS NOT NULL)
  );

-- Indexes for client_phases
CREATE INDEX IF NOT EXISTS idx_client_phases_course_id ON public.client_phases(course_id);
CREATE INDEX IF NOT EXISTS idx_client_phases_entity_level ON public.client_phases(entity_level);


-- STEP 4: Update internal_phases table (Allow course-level phases)
ALTER TABLE public.internal_phases
  ALTER COLUMN module_id DROP NOT NULL;

ALTER TABLE public.internal_phases
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS entity_level VARCHAR(20) DEFAULT 'module';

-- Update entity_level check constraint
ALTER TABLE public.internal_phases
  DROP CONSTRAINT IF EXISTS internal_phases_entity_level_check;

ALTER TABLE public.internal_phases
  ADD CONSTRAINT internal_phases_entity_level_check CHECK (entity_level IN ('module', 'course'));

-- Ensure internal_phases row belongs to either a module OR a course
ALTER TABLE public.internal_phases
  DROP CONSTRAINT IF EXISTS internal_phases_owner_check;

ALTER TABLE public.internal_phases
  ADD CONSTRAINT internal_phases_owner_check 
  CHECK (
    (entity_level = 'module' AND module_id IS NOT NULL) OR
    (entity_level = 'course' AND course_id IS NOT NULL)
  );

-- Indexes for internal_phases
CREATE INDEX IF NOT EXISTS idx_internal_phases_course_id ON public.internal_phases(course_id);
CREATE INDEX IF NOT EXISTS idx_internal_phases_entity_level ON public.internal_phases(entity_level);


-- STEP 5: Recreate consolidated_phases_view and backward-compatible phases view
DROP VIEW IF EXISTS public.phases CASCADE;
DROP VIEW IF EXISTS public.consolidated_phases_view CASCADE;

CREATE OR REPLACE VIEW public.consolidated_phases_view AS
SELECT 
  COALESCE(c.id, i.id) AS id,
  COALESCE(c.module_id, i.module_id) AS module_id,
  COALESCE(c.course_id, i.course_id) AS course_id,
  COALESCE(c.entity_level, i.entity_level, 'module') AS entity_level,
  COALESCE(c.phase_name, i.phase_name) AS phase_name,
  COALESCE(c.phase_type, i.phase_type) AS phase_type,
  COALESCE(c.phase_type_phase, i.phase_type_phase) AS phase_type_phase,
  c.client_date,
  i.internal_start_date,
  i.internal_end_date,
  COALESCE(c.source_file_ref, i.source_file_ref) AS source_file_ref,
  COALESCE(
    CASE 
      WHEN c.id IS NOT NULL AND i.id IS NOT NULL THEN 'Both'
      WHEN c.id IS NOT NULL THEN 'Client'
      WHEN i.id IS NOT NULL THEN 'Internal'
      ELSE 'Internal'
    END,
    'Internal'
  ) AS source_file,
  i.assigned_to,
  i.status,
  i.rejection_note,
  c.id AS client_phase_id,
  i.id AS internal_phase_id,
  -- Unified metadata plus individual client/internal metadata
  COALESCE(i.metadata, c.metadata, '{}'::jsonb) AS metadata,
  c.metadata AS client_metadata,
  i.metadata AS internal_metadata,
  COALESCE(i.updated_at, c.updated_at) AS updated_at
FROM public.client_phases c
FULL OUTER JOIN public.internal_phases i 
  ON (
    -- Module-level phase matching
    (
      COALESCE(c.entity_level, 'module') = 'module' 
      AND COALESCE(i.entity_level, 'module') = 'module' 
      AND c.module_id = i.module_id 
      AND c.phase_name = i.phase_name
    )
    OR
    -- Course-level phase matching (LMS track)
    (
      c.entity_level = 'course' 
      AND i.entity_level = 'course' 
      AND c.course_id = i.course_id 
      AND c.phase_name = i.phase_name
    )
  )
  AND COALESCE(c.phase_type, '') = COALESCE(i.phase_type, '');

-- STEP 6: Recreate alias view 'phases'
CREATE OR REPLACE VIEW public.phases AS 
SELECT * FROM public.consolidated_phases_view;

-- STEP 7: Ensure view permissions
GRANT SELECT ON public.consolidated_phases_view TO authenticated, anon;
GRANT SELECT ON public.phases TO authenticated, anon;
