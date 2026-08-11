-- ================================================================
-- MIGRATION: Employee Links, Client-Internal Mappings & Phase Gaps
-- ================================================================

-- 1. EMPLOYEE PROJECT LINKS TABLE
CREATE TABLE IF NOT EXISTS employee_project_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_emp_project_link UNIQUE(employee_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_proj_links_emp ON employee_project_links(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_proj_links_proj ON employee_project_links(project_id);

-- 2. EMPLOYEE PM LINKS TABLE
CREATE TABLE IF NOT EXISTS employee_pm_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  pm_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_emp_pm_link UNIQUE(employee_id, pm_id)
);

-- 3. CLIENT INTERNAL MAPPINGS TABLE
CREATE TABLE IF NOT EXISTS client_internal_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_phase_name TEXT NOT NULL,
  anchor_internal_phase_name TEXT NOT NULL,
  anchor_point TEXT NOT NULL DEFAULT 'End', -- 'Start' or 'End'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_mapping_per_project_client_phase UNIQUE(project_id, client_phase_name)
);

CREATE INDEX IF NOT EXISTS idx_client_internal_mappings_proj ON client_internal_mappings(project_id);

-- 4. PHASE GAPS TABLE
CREATE TABLE IF NOT EXISTS phase_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  earlier_phase_id TEXT NOT NULL,
  later_phase_id TEXT NOT NULL,
  working_days_gap INT NOT NULL DEFAULT 0,
  gap_type TEXT DEFAULT 'internal_to_internal', -- 'internal_to_internal' or 'client_to_internal'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_gap_pair_per_project UNIQUE(project_id, earlier_phase_id, later_phase_id)
);

CREATE INDEX IF NOT EXISTS idx_phase_gaps_proj ON phase_gaps(project_id);
CREATE INDEX IF NOT EXISTS idx_phase_gaps_earlier ON phase_gaps(earlier_phase_id);
CREATE INDEX IF NOT EXISTS idx_phase_gaps_later ON phase_gaps(later_phase_id);

-- Enable RLS across all new/linked tables
ALTER TABLE employee_project_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_pm_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_internal_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_gaps ENABLE ROW LEVEL SECURITY;

-- Permissive RLS Policies matching existing setup
DROP POLICY IF EXISTS "Allow All Access employee_project_links" ON employee_project_links;
CREATE POLICY "Allow All Access employee_project_links" ON employee_project_links FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow All Access employee_pm_links" ON employee_pm_links;
CREATE POLICY "Allow All Access employee_pm_links" ON employee_pm_links FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow All Access client_internal_mappings" ON client_internal_mappings;
CREATE POLICY "Allow All Access client_internal_mappings" ON client_internal_mappings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow All Access phase_gaps" ON phase_gaps;
CREATE POLICY "Allow All Access phase_gaps" ON phase_gaps FOR ALL USING (true) WITH CHECK (true);
