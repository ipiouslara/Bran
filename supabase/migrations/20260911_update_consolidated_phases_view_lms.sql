-- Migration: Update consolidated_phases_view to include course_id and entity_level for LMS track

-- Step 1: Drop dependent views
DROP VIEW IF EXISTS public.phases CASCADE;
DROP VIEW IF EXISTS public.consolidated_phases_view CASCADE;

-- Step 2: Recreate consolidated_phases_view with course_id and entity_level support
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
  c.metadata AS client_metadata,
  i.metadata AS internal_metadata,
  COALESCE(i.updated_at, c.updated_at) AS updated_at
FROM public.client_phases c
FULL OUTER JOIN public.internal_phases i 
  ON (
    -- Match module-level phases
    (
      COALESCE(c.entity_level, 'module') = 'module' 
      AND COALESCE(i.entity_level, 'module') = 'module' 
      AND c.module_id = i.module_id 
      AND c.phase_name = i.phase_name
    )
    OR
    -- Match course-level phases (LMS track)
    (
      c.entity_level = 'course' 
      AND i.entity_level = 'course' 
      AND c.course_id = i.course_id 
      AND c.phase_name = i.phase_name
    )
  )
  AND COALESCE(c.phase_type, '') = COALESCE(i.phase_type, '');

-- Step 3: Recreate backward-compatibility alias view
CREATE OR REPLACE VIEW public.phases AS 
SELECT * FROM public.consolidated_phases_view;
