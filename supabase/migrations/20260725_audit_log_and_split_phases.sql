-- ================================================================
-- BRAN VERSION 2.0 MIGRATION: AUDIT LOG & SPLIT PHASE SCHEMA
-- ================================================================

-- 1. AUDIT LOG TABLE & POLICIES
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  action_type TEXT NOT NULL,
  actor_id UUID,
  actor_email TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_label TEXT,
  old_value JSONB,
  new_value JSONB,
  details JSONB,
  project_id UUID
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_id ON public.audit_log(entity_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read audit_log" ON public.audit_log;
CREATE POLICY "Allow authenticated read audit_log" 
  ON public.audit_log FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert audit_log" ON public.audit_log;
CREATE POLICY "Allow authenticated insert audit_log" 
  ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access audit_log" ON public.audit_log;
CREATE POLICY "Allow all access audit_log" 
  ON public.audit_log FOR ALL USING (true) WITH CHECK (true);

-- 2. CLIENT & INTERNAL PHASES TABLES
CREATE TABLE IF NOT EXISTS public.client_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  phase_name TEXT NOT NULL,
  phase_type TEXT,
  phase_type_phase TEXT,
  client_date DATE,
  source_file_ref TEXT DEFAULT 'Manual Creation',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.internal_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  phase_name TEXT NOT NULL,
  phase_type TEXT,
  phase_type_phase TEXT,
  internal_start_date DATE,
  internal_end_date DATE,
  source_file_ref TEXT DEFAULT 'Manual Creation',
  assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'Pending',
  rejection_note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.client_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_phases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access client_phases" ON public.client_phases;
CREATE POLICY "Allow all access client_phases" ON public.client_phases FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access internal_phases" ON public.internal_phases;
CREATE POLICY "Allow all access internal_phases" ON public.internal_phases FOR ALL USING (true) WITH CHECK (true);

-- 3. MIGRATE LEGACY DATA & CREATE CONSOLIDATED VIEW
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'phases' 
      AND table_type = 'BASE TABLE'
  ) THEN
    -- Migrate client phase data
    INSERT INTO public.client_phases (module_id, phase_name, phase_type, phase_type_phase, client_date, source_file_ref)
    SELECT module_id, phase_name, phase_type, type_phase, client_date, COALESCE(source_file_ref, 'Legacy Migration')
    FROM public.phases
    WHERE client_date IS NOT NULL OR source_file = 'Client';

    -- Migrate internal phase data
    INSERT INTO public.internal_phases (module_id, phase_name, phase_type, phase_type_phase, internal_start_date, internal_end_date, source_file_ref, assigned_to, status, rejection_note)
    SELECT module_id, phase_name, phase_type, type_phase, internal_start_date, internal_end_date, COALESCE(source_file_ref, 'Legacy Migration'), assigned_to, COALESCE(status, 'Pending'), rejection_note
    FROM public.phases
    WHERE internal_start_date IS NOT NULL OR internal_end_date IS NOT NULL OR source_file = 'Internal' OR assigned_to IS NOT NULL;

    -- Drop legacy base table phases so it can be replaced by the view
    DROP TABLE public.phases CASCADE;
  END IF;
END $$;

CREATE OR REPLACE VIEW consolidated_phases_view AS
SELECT 
  COALESCE(c.id, i.id) AS id,
  COALESCE(c.module_id, i.module_id) AS module_id,
  COALESCE(c.phase_name, i.phase_name) AS phase_name,
  COALESCE(c.phase_type, i.phase_type) AS phase_type,
  COALESCE(c.phase_type_phase, i.phase_type_phase) AS phase_type_phase,
  c.client_date,
  i.internal_start_date,
  i.internal_end_date,
  COALESCE(c.source_file_ref, i.source_file_ref) AS source_file_ref,
  i.assigned_to,
  i.status,
  i.rejection_note,
  c.id AS client_phase_id,
  i.id AS internal_phase_id,
  c.metadata AS client_metadata,
  i.metadata AS internal_metadata,
  COALESCE(i.updated_at, c.updated_at) AS updated_at
FROM client_phases c
FULL OUTER JOIN internal_phases i 
  ON c.module_id = i.module_id 
 AND c.phase_name = i.phase_name
 AND COALESCE(c.phase_type, '') = COALESCE(i.phase_type, '');

DROP VIEW IF EXISTS phases;
CREATE OR REPLACE VIEW phases AS SELECT * FROM consolidated_phases_view;

-- 4. PROCEDURES & CLEANUP
CREATE OR REPLACE FUNCTION public.cleanup_audit_logs()
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.audit_log WHERE created_at < NOW() - INTERVAL '5 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.build_phase_label(p_phase_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_label TEXT;
BEGIN
  SELECT pr.name || ' → ' || c.name || ' → ' || m.name || ' → ' || COALESCE(ip.phase_name, cp.phase_name, 'Phase')
  INTO v_label
  FROM modules m
  JOIN courses c ON m.course_id = c.id
  JOIN projects pr ON c.project_id = pr.id
  LEFT JOIN internal_phases ip ON ip.module_id = m.id AND (ip.id = p_phase_id)
  LEFT JOIN client_phases cp ON cp.module_id = m.id AND (cp.id = p_phase_id)
  WHERE ip.id IS NOT NULL OR cp.id IS NOT NULL;
  
  RETURN COALESCE(v_label, 'Unknown Phase');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_phase_status_transactional(
  p_phase_id UUID,
  p_status TEXT,
  p_rejection_note TEXT,
  actor_id UUID
) RETURNS VOID AS $$
DECLARE
  v_old_status TEXT;
  v_label TEXT;
BEGIN
  SELECT status INTO v_old_status FROM public.internal_phases WHERE id = p_phase_id;
  v_label := public.build_phase_label(p_phase_id);

  UPDATE public.internal_phases
  SET status = p_status,
      rejection_note = CASE WHEN p_rejection_note IS NOT NULL THEN p_rejection_note ELSE rejection_note END,
      updated_at = NOW()
  WHERE id = p_phase_id;

  INSERT INTO public.audit_log (
    actor_id, action_type, entity_type, entity_id, entity_label,
    old_value, new_value
  ) VALUES (
    actor_id,
    'status_change',
    'phase',
    p_phase_id,
    v_label,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_status)
  );

  PERFORM public.cleanup_audit_logs();
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Status update transactional audit log failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.assign_phase_transactional(
  p_phase_id UUID,
  p_employee_id UUID,
  actor_id UUID
) RETURNS VOID AS $$
DECLARE
  v_old_assignee UUID;
  v_old_name TEXT;
  v_new_name TEXT;
  v_label TEXT;
BEGIN
  SELECT assigned_to INTO v_old_assignee FROM public.internal_phases WHERE id = p_phase_id;
  v_label := public.build_phase_label(p_phase_id);

  UPDATE public.internal_phases
  SET assigned_to = p_employee_id,
      updated_at = NOW()
  WHERE id = p_phase_id;

  IF v_old_assignee IS NOT NULL THEN
    SELECT name INTO v_old_name FROM public.employees WHERE id = v_old_assignee;
  END IF;
  IF p_employee_id IS NOT NULL THEN
    SELECT name INTO v_new_name FROM public.employees WHERE id = p_employee_id;
  END IF;

  INSERT INTO public.audit_log (
    actor_id, action_type, entity_type, entity_id, entity_label,
    old_value, new_value
  ) VALUES (
    actor_id,
    'assignment',
    'phase',
    p_phase_id,
    v_label,
    jsonb_build_object('assignee_id', v_old_assignee, 'name', COALESCE(v_old_name, 'Unassigned')),
    jsonb_build_object('assignee_id', p_employee_id, 'name', COALESCE(v_new_name, 'Unassigned'))
  );

  PERFORM public.cleanup_audit_logs();
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Assignment transactional audit log failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_client_date_transactional(
  p_phase_id UUID,
  p_client_date DATE,
  actor_id UUID
) RETURNS VOID AS $$
DECLARE
  v_old_client_date DATE;
  v_label TEXT;
BEGIN
  SELECT client_date INTO v_old_client_date FROM public.client_phases WHERE id = p_phase_id;
  v_label := public.build_phase_label(p_phase_id);

  UPDATE public.client_phases
  SET client_date = p_client_date,
      updated_at = NOW()
  WHERE id = p_phase_id;

  INSERT INTO public.audit_log (
    actor_id, action_type, entity_type, entity_id, entity_label,
    old_value, new_value
  ) VALUES (
    actor_id,
    'date_edit',
    'phase',
    p_phase_id,
    v_label,
    jsonb_build_object('clientDate', v_old_client_date),
    jsonb_build_object('clientDate', p_client_date)
  );

  PERFORM public.cleanup_audit_logs();
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Client date transactional audit log failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
