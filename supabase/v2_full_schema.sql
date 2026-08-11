-- ================================================================
-- BRAN VERSION 2.0 - COMPLETE DATABASE SCHEMA & INITIALIZATION SCRIPT
-- ================================================================
-- Target Database: Supabase / PostgreSQL 14+
-- Description: Full DDL script to initialize a brand new database for
-- BRAN v2.0 including all core tables, separated phase architecture,
-- baseline snapshot tracking, indexes, views, and RLS security rules.
-- ================================================================

-- ----------------------------------------------------------------
-- 0. EXTENSIONS & SETUP
-- ----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trigger function to update updated_at timestamps automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------
-- 1. PROJECTS TABLE
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID, -- References employees(id) or auth.users(id)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- 2. EMPLOYEES TABLE (Directory, Roles & User Accounts)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT UNIQUE NOT NULL, -- e.g. "EMP001"
  name TEXT NOT NULL,
  designation TEXT DEFAULT 'Team Member',
  email TEXT UNIQUE,
  role TEXT DEFAULT 'Employee', -- 'Admin', 'Project Manager', 'Lead', 'Employee'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraint for projects.owner_id now that employees exists
ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_owner;
ALTER TABLE projects ADD CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES employees(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------
-- 3. COURSES TABLE
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_course_per_project UNIQUE(project_id, code)
);

CREATE INDEX IF NOT EXISTS idx_courses_project ON courses(project_id);

-- ----------------------------------------------------------------
-- 4. MODULES TABLE
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  language TEXT DEFAULT 'English',
  metadata JSONB DEFAULT '{}'::jsonb, -- Custom dynamic columns
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_module_per_course UNIQUE(course_id, code, language)
);

CREATE INDEX IF NOT EXISTS idx_modules_course ON modules(course_id);

-- ----------------------------------------------------------------
-- 5. CLIENT PHASES TABLE (Client contractual deadlines)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_phases (
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

CREATE INDEX IF NOT EXISTS idx_client_phases_module_id ON client_phases(module_id);
CREATE INDEX IF NOT EXISTS idx_client_phases_lookup ON client_phases(module_id, phase_name, phase_type);

-- ----------------------------------------------------------------
-- 6. INTERNAL PHASES TABLE (Internal production schedules & assignments)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  phase_name TEXT NOT NULL,
  phase_type TEXT,
  phase_type_phase TEXT,
  internal_start_date DATE,
  internal_end_date DATE,
  source_file_ref TEXT DEFAULT 'Manual Creation',
  assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'Pending', -- 'Pending', 'Completed'
  rejection_note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_phases_module_id ON internal_phases(module_id);
CREATE INDEX IF NOT EXISTS idx_internal_phases_lookup ON internal_phases(module_id, phase_name, phase_type);
CREATE INDEX IF NOT EXISTS idx_internal_phases_assigned ON internal_phases(assigned_to);

-- ----------------------------------------------------------------
-- 7. CONSOLIDATED PHASES VIEW (Unified Client + Internal grid)
-- ----------------------------------------------------------------
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

-- Alias view 'phases' for full backward compatibility
DROP TABLE IF EXISTS phases CASCADE;
CREATE OR REPLACE VIEW phases AS SELECT * FROM consolidated_phases_view;


-- ----------------------------------------------------------------
-- 8. BASELINE SCHEDULE SNAPSHOTS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version_name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_baseline_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id UUID NOT NULL REFERENCES schedule_baselines(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  phase_name TEXT NOT NULL,
  phase_type TEXT,
  baseline_client_date DATE,
  baseline_internal_start_date DATE,
  baseline_internal_end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseline_items_lookup ON schedule_baseline_items(baseline_id, module_id, phase_name);

-- ----------------------------------------------------------------
-- 9. HOLIDAYS & CALENDARS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS global_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  label TEXT NOT NULL DEFAULT 'Company Holiday',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  label TEXT NOT NULL DEFAULT 'Project Holiday',
  type TEXT DEFAULT 'holiday', -- 'holiday' or 'workday'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_holiday_per_project UNIQUE(project_id, date)
);

-- ----------------------------------------------------------------
-- 10. RELATIONSHIPS & ASSIGNMENT MAPPINGS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_lead_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_lead_assignment UNIQUE(project_id, lead_id)
);

CREATE TABLE IF NOT EXISTS employee_project_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_emp_project_link UNIQUE(employee_id, project_id)
);

CREATE TABLE IF NOT EXISTS employee_pm_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  pm_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_emp_pm_link UNIQUE(employee_id, pm_id)
);

-- ----------------------------------------------------------------
-- 11. NOTIFICATIONS & IN-APP ALERTS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  phase_id UUID,
  module_id UUID,
  event_id TEXT,
  type TEXT NOT NULL, -- 'new_assignment', 'due_soon', 'overdue', 'date_changed'
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, is_read);

-- ----------------------------------------------------------------
-- 12. ACTIVITY LOGS & AUDIT TRAIL
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  action_type TEXT NOT NULL, -- e.g. 'phase_assign', 'date_update', 'module_create'
  entity_type TEXT NOT NULL, -- 'phase', 'module', 'project', 'employee'
  entity_id TEXT NOT NULL,
  entity_label TEXT,
  old_value JSONB,
  new_value JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_time ON activity_logs(timestamp DESC);

CREATE TABLE IF NOT EXISTS audit_log (
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

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_id ON audit_log(entity_id);

-- ----------------------------------------------------------------
-- 13. RAW UPLOADS ARCHIVE LOG
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'client' or 'internal'
  row_count INT DEFAULT 0,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- 14. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------
-- Enable RLS across all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_baseline_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_lead_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_project_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_pm_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_uploads ENABLE ROW LEVEL SECURITY;

-- Grant Full Permissive Policies for Authenticated & Anon API Client Access
-- (Adjust to strict role checks if restricted multi-tenant client login is added)

DO $$ 
DECLARE 
  tbl TEXT;
BEGIN
  FOR tbl IN 
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Allow All Access %I" ON %I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "Allow All Access %I" ON %I FOR ALL USING (true) WITH CHECK (true);', tbl, tbl);
  END LOOP;
END $$;
