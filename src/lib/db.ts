/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Project, RawUpload, Course, Module, Phase, JoinResultRow, Employee, PhaseGap, ClientInternalMapping } from '../types';
import { workingDaysBetween } from '../utils/workingDays';

// Read URL and Anon Key directly from environment config
const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

export interface DBConfig {
  url: string;
  anonKey: string;
}

export function getDBConfig(): DBConfig {
  return {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
  };
}

// Credentials configuration (reads strictly from environment variables)
export function saveDBConfig(_url: string, _anonKey: string): void {
  // No-op: localStorage credential caching removed for security
}
export function clearDBConfig(): void {
  // No-op: localStorage credential caching removed for security
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  
  try {
    if (!supabaseInstance) {
      supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
    }
    return supabaseInstance;
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
    return null;
  }
}

let globalSession: any = null;
let globalCurrentUser: { id?: string; employeeId?: string; email?: string; role?: string; name?: string } | null = null;

export function setGlobalSession(session: any) {
  globalSession = session;
}

export function setGlobalCurrentUser(user: any) {
  globalCurrentUser = user;
}

export async function getCurrentUserId(): Promise<string> {
  // 1. Try global session first
  if (globalSession?.user?.id) {
    return globalSession.user.id;
  }

  // 2. Try active in-memory user context
  if (globalCurrentUser?.id || globalCurrentUser?.employeeId) {
    return (globalCurrentUser.id || globalCurrentUser.employeeId)!;
  }
  
  const sb = getSupabase();
  if (sb) {
    try {
      // 3. Try getSession
      const { data: sessionData, error: sessionErr } = await sb.auth.getSession();
      if (!sessionErr && sessionData?.session?.user?.id) {
        globalSession = sessionData.session;
        return sessionData.session.user.id;
      }
    } catch (e) {
      console.warn("getSession error:", e);
    }
    
    try {
      // 4. Try getUser
      const { data: userData, error: userErr } = await sb.auth.getUser();
      if (!userErr && userData?.user?.id) {
        return userData.user.id;
      }
    } catch (e) {
      console.warn("getUser error:", e);
    }
  }
  
  throw new Error("User session has expired or is invalid. Please log in again.");
}

// Supabase Admin client has been securely removed from the frontend
export function getSupabaseAdmin(): null {
  return null;
}

export function hasSupabaseCreds(): boolean {
  return !!(SUPABASE_URL.trim() && SUPABASE_ANON_KEY.trim());
}

export function hasSupabaseAdminCreds(): boolean {
  return false;
}

export function isUuid(str: string | null | undefined): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// ------------------------------------------------------------
// SECURE CONNECTION VERIFIER
// ------------------------------------------------------------
export async function checkSupabaseConnection(): Promise<{ success: boolean; error?: string }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { success: false, error: "Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are not configured." };
  }
  const client = getSupabase();
  if (!client) {
    return { success: false, error: "Failed to initialize Supabase client on frontend." };
  }
  try {
    const { error } = await client.from('global_holidays').select('date').limit(1);
    if (error && error.code !== 'PGRST116') {
      return { success: false, error: `Supabase database error: ${error.message} (Code: ${error.code})` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Supabase is unreachable (network/fetch failure)." };
  }
}

// ------------------------------------------------------------
// THROW-ONLY LOCAL SANDBOX MODE STUBS (Safety Guards)
// ------------------------------------------------------------
export function initLocalData(): void {}
export function getLocalEmployees(): never { throw new Error("Local Sandbox is disabled"); }
export function saveLocalEmployee(): never { throw new Error("Local Sandbox is disabled"); }
export function deleteLocalEmployee(): never { throw new Error("Local Sandbox is disabled"); }
export function getLocalProjects(): never { throw new Error("Local Sandbox is disabled"); }
export function saveLocalProject(): never { throw new Error("Local Sandbox is disabled"); }
export function getLocalUploads(): never { throw new Error("Local Sandbox is disabled"); }
export function getLocalCourses(): never { throw new Error("Local Sandbox is disabled"); }
export function getLocalModules(): never { throw new Error("Local Sandbox is disabled"); }
export function getLocalPhases(): never { throw new Error("Local Sandbox is disabled"); }
export function saveResultToLocal(): never { throw new Error("Local Sandbox is disabled"); }

export interface HolidayEntry {
  id?: string;
  date: string;
  label: string;
  project_id?: string | null;
  project_name?: string | null;
}

export interface GlobalHoliday {
  id?: string;
  date: string;
  label: string;
  created_by?: string;
  created_at?: string;
}

export interface ProjectHoliday {
  id?: string;
  project_id: string;
  project_name: string;
  date: string;
  label?: string;
  is_override?: boolean; // true = PM removed a global holiday for this project
  created_by?: string;
  created_at?: string;
}

export interface EffectiveHoliday {
  id?: string;
  date: string;
  label: string;
  type: 'global' | 'project' | 'overridden';
  is_override?: boolean;
  project_id?: string;
  project_name?: string;
}

export interface EmployeePmLink {
  id: string;
  employee_id: string;
  pm_id: string;
  created_at: string;
}

export interface ProjectLeadAssignment {
  id: string;
  project_id: string;
  lead_id: string;
  assigned_by?: string;
  created_at?: string;
}

// -------------------------------------------------------
// PROJECT LEAD ASSIGNMENT MANAGEMENT
// -------------------------------------------------------
export async function getProjectLeadAssignments(projectId?: string): Promise<ProjectLeadAssignment[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    let query = sb.from('project_lead_assignments').select('*');
    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    const { data, error } = await query;
    if (error) {
      console.warn("getProjectLeadAssignments warning:", error.message);
      return [];
    }
    return (data || []) as ProjectLeadAssignment[];
  } catch (err: any) {
    console.warn("getProjectLeadAssignments error:", err.message);
    return [];
  }
}

export async function assignLeadToProject(projectId: string, leadId: string, assignedBy?: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");
  const { error } = await sb.from('project_lead_assignments').upsert(
    { project_id: projectId, lead_id: leadId, assigned_by: assignedBy || null },
    { onConflict: 'project_id,lead_id' }
  );
  if (error) throw error;
  return true;
}

export async function removeLeadFromProject(projectId: string, leadId: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");
  const { error } = await sb.from('project_lead_assignments').delete().eq('project_id', projectId).eq('lead_id', leadId);
  if (error) throw error;
  return true;
}

export async function getAssignedProjectIdsForLead(leadId: string): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb.from('project_lead_assignments').select('project_id').eq('lead_id', leadId);
    if (error) {
      console.warn("getAssignedProjectIdsForLead warning:", error.message);
      return [];
    }
    return (data || []).map((row: any) => row.project_id);
  } catch (err: any) {
    console.warn("getAssignedProjectIdsForLead error:", err.message);
    return [];
  }
}

// -------------------------------------------------------
// GLOBAL & PROJECT-SCOPED HOLIDAYS MANAGEMENT
// -------------------------------------------------------
export async function getGlobalHolidays(): Promise<GlobalHoliday[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb.from('global_holidays').select('*').order('date', { ascending: true });
    if (error) {
      console.warn("getGlobalHolidays warning:", error.message);
      return [];
    }
    return (data || []) as GlobalHoliday[];
  } catch (err: any) {
    console.warn("getGlobalHolidays error:", err.message);
    return [];
  }
}

export async function toggleGlobalHoliday(date: string, label: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");

  try {
    const { data: existing } = await sb
      .from('global_holidays')
      .select('id')
      .eq('date', date)
      .maybeSingle();

    if (existing) {
      await sb.from('global_holidays').delete().eq('id', existing.id);
      return false;
    } else {
      const { error: insErr } = await sb.from('global_holidays').insert([{ date, label: label || 'Company Holiday' }]);
      if (insErr) {
        console.error("global_holidays insert error:", insErr.message);
        throw insErr;
      }
      return true;
    }
  } catch (err: any) {
    console.error("toggleGlobalHoliday error:", err.message);
    throw err;
  }
}

export async function deleteGlobalHoliday(date: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");
  await sb.from('global_holidays').delete().eq('date', date);
  return true;
}

export async function toggleHoliday(date: string, label: string): Promise<boolean> {
  return toggleGlobalHoliday(date, label);
}

export async function getProjectHolidays(projectId: string): Promise<ProjectHoliday[]> {
  const sb = getSupabase();
  if (!sb || !projectId) return [];
  try {
    const { data, error } = await sb.from('project_holidays').select('*').eq('project_id', projectId);
    if (error) return [];
    return (data || []) as ProjectHoliday[];
  } catch (err: any) {
    return [];
  }
}

export async function getEffectiveHolidays(projectId?: string): Promise<EffectiveHoliday[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const globalList = await getGlobalHolidays();
  if (!projectId) {
    return globalList.map(g => ({
      date: g.date,
      label: g.label || 'Company Holiday',
      type: 'global'
    }));
  }

  const projectList = await getProjectHolidays(projectId);
  const effectiveMap = new Map<string, EffectiveHoliday>();

  // 1. Baseline: all company global holidays
  globalList.forEach(g => {
    effectiveMap.set(g.date, {
      date: g.date,
      label: g.label || 'Company Holiday',
      type: 'global'
    });
  });

  // 2. Project overrides & additions
  projectList.forEach(p => {
    if (p.is_override) {
      effectiveMap.set(p.date, {
        id: p.id,
        date: p.date,
        label: p.label || 'Global Holiday (Removed)',
        type: 'overridden',
        is_override: true,
        project_id: p.project_id,
        project_name: p.project_name
      });
    } else {
      effectiveMap.set(p.date, {
        id: p.id,
        date: p.date,
        label: p.label || 'Project Holiday',
        type: 'project',
        is_override: false,
        project_id: p.project_id,
        project_name: p.project_name
      });
    }
  });

  return Array.from(effectiveMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Backward compatibility helper
export async function getHolidays(projectId?: string): Promise<HolidayEntry[]> {
  const effective = await getEffectiveHolidays(projectId);
  return effective
    .filter(e => e.type !== 'overridden')
    .map(e => ({
      id: e.id,
      date: e.date,
      label: e.label,
      project_id: e.project_id,
      project_name: e.project_name
    }));
}

export async function getEffectiveHolidayDates(projectId?: string): Promise<string[]> {
  const effective = await getEffectiveHolidays(projectId);
  return effective.filter(e => e.type !== 'overridden').map(e => e.date);
}

export async function addProjectHoliday(
  projectId: string, 
  projectName: string, 
  date: string, 
  label: string
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");
  
  const payload: any = { 
    project_id: projectId, 
    project_name: projectName || 'Project', 
    date, 
    label: label || 'Project Holiday', 
    is_override: false 
  };

  const { data: existing, error: selErr } = await sb
    .from('project_holidays')
    .select('id')
    .eq('project_id', projectId)
    .eq('date', date)
    .maybeSingle();

  if (selErr) {
    console.error("Project Holiday RLS Error on select:", selErr.message, (selErr as any).details);
  }

  if (existing) {
    const { error: updErr } = await sb
      .from('project_holidays')
      .update({ label: label || 'Project Holiday', is_override: false })
      .eq('id', existing.id);
    if (updErr) {
      console.error("Project Holiday RLS Error on update:", updErr.message, (updErr as any).details);
      throw updErr;
    }
    return true;
  } else {
    const { error: insErr } = await sb.from('project_holidays').insert([payload]);
    if (insErr) {
      console.error("Project Holiday RLS Error on insert:", insErr.message, (insErr as any).details);
      throw insErr;
    }
    return true;
  }
}

export async function overrideGlobalHoliday(
  projectId: string, 
  projectName: string, 
  date: string, 
  label?: string
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");
  
  const payload: any = { 
    project_id: projectId, 
    project_name: projectName || 'Project', 
    date, 
    label: label || 'Removed for this project', 
    is_override: true 
  };

  const { data: existing, error: selErr } = await sb
    .from('project_holidays')
    .select('id')
    .eq('project_id', projectId)
    .eq('date', date)
    .maybeSingle();

  if (selErr) {
    console.error("Project Holiday RLS Error on override select:", selErr.message, (selErr as any).details);
  }

  if (existing) {
    const { error: updErr } = await sb
      .from('project_holidays')
      .update({ label: label || 'Removed for this project', is_override: true })
      .eq('id', existing.id);
    if (updErr) {
      console.error("Project Holiday RLS Error on override update:", updErr.message, (updErr as any).details);
      throw updErr;
    }
    return true;
  } else {
    const { error: insErr } = await sb.from('project_holidays').insert([payload]);
    if (insErr) {
      console.error("Project Holiday RLS Error on override insert:", insErr.message, (insErr as any).details);
      throw insErr;
    }
    return true;
  }
}

export async function restoreGlobalHoliday(projectId: string, date: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");
  const { error } = await sb.from('project_holidays').delete().eq('project_id', projectId).eq('date', date);
  if (error) {
    console.warn("restoreGlobalHoliday delete warning:", error.message);
  }
  return true;
}

export async function removeProjectHoliday(projectId: string, date: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");
  const { error } = await sb.from('project_holidays').delete().eq('project_id', projectId).eq('date', date);
  if (error) {
    console.warn("removeProjectHoliday delete warning:", error.message);
    await sb.from('holidays').delete().eq('date', date);
  }
  return true;
}

// -------------------------------------------------------
export async function ensureEmployeeProfileExists(userId: string, userObj?: any): Promise<string | null> {
  if (!userId || !isUuid(userId)) return null;
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data: existing } = await sb.from('employees').select('id').eq('id', userId).maybeSingle();
    if (existing) return userId;

    // Provision default employee record for auth user if missing
    const empId = userObj?.employeeId || `EMP-${userId.slice(0, 6).toUpperCase()}`;
    const empName = userObj?.name || userObj?.email?.split('@')[0] || 'User Profile';
    const empDesignation = userObj?.designation || 'Project Manager';
    const empEmail = userObj?.email || `${userId.slice(0, 8)}@mediant.com`;
    const empRole = userObj?.role || 'Project Manager';

    const { error: insErr } = await sb.from('employees').upsert({
      id: userId,
      employee_id: empId,
      name: empName,
      designation: empDesignation,
      email: empEmail,
      role: empRole
    });

    if (insErr) {
      console.warn("Failed auto-provisioning employee profile:", insErr.message);
      return null;
    }
    return userId;
  } catch (err) {
    console.error("ensureEmployeeProfileExists error:", err);
    return null;
  }
}

// EMPLOYEES CRUD API (Supabase-Only)
// -------------------------------------------------------
export async function getEmployees(): Promise<Employee[]> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");
  
  const { data, error } = await sb.from('employees').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  
  return (data || []).map(e => ({
    id: e.id,
    employeeId: e.employee_id,
    name: e.name,
    designation: e.designation,
    email: e.email,
    role: e.role
  }));
}

import { UserRole } from '../types';

export async function saveEmployee(
  employee: Omit<Employee, 'id'> & { id?: string; email?: string; role?: UserRole },
  registeringPmId?: string
): Promise<Employee & { password?: string; linkedOnly?: boolean }> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");

  if (employee.id) {
    // Get old employee value for auditing
    const { data: oldEmp } = await sb.from('employees').select('*').eq('id', employee.id).maybeSingle();

    const { error } = await sb.from('employees').upsert({
      id: employee.id,
      employee_id: employee.employeeId.trim(),
      name: employee.name.trim(),
      designation: employee.designation,
      email: employee.email,
      role: employee.role || 'Employee'
    });
    if (error) throw error;
    
    if (oldEmp) {
      await writeAuditLog({
        actionType: 'employee_edit',
        entityType: 'employee',
        entityId: employee.id,
        entityLabel: employee.name.trim(),
        oldValue: oldEmp,
        newValue: {
          employee_id: employee.employeeId.trim(),
          name: employee.name.trim(),
          designation: employee.designation,
          email: employee.email,
          role: employee.role || 'Employee'
        }
      });
    }
    
    return {
      id: employee.id,
      employeeId: employee.employeeId,
      name: employee.name,
      designation: employee.designation,
      email: employee.email,
      role: employee.role || 'Employee'
    };
  }

  // Try calling the secure Edge Function first
  const email = employee.email?.trim() || `${employee.employeeId.trim().toLowerCase()}@mediantlabs.com`;
  const role = employee.role || 'Employee';
  const tempPassword = `Temp${Math.random().toString(36).substring(2, 10)}!`;

  try {
    const { data, error } = await sb.functions.invoke('create-employee-user', {
      body: {
        employeeId: employee.employeeId.trim(),
        name: employee.name.trim(),
        designation: employee.designation,
        email: email,
        password: tempPassword,
        role: role,
        registeringPmId: registeringPmId || null
      }
    });

    if (!error && data && data.user) {
      await writeAuditLog({
        actionType: 'employee_create',
        entityType: 'employee',
        entityId: data.user.id,
        entityLabel: employee.name.trim(),
        oldValue: null,
        newValue: {
          employee_id: employee.employeeId.trim(),
          name: employee.name.trim(),
          designation: employee.designation,
          email: email,
          role: role
        }
      });

      return {
        id: data.user.id,
        employeeId: employee.employeeId.trim(),
        name: employee.name.trim(),
        designation: employee.designation,
        email: email,
        role: role,
        password: tempPassword,
        linkedOnly: data.linkedOnly
      };
    }
    console.warn("Edge function invocation failed or returned error, falling back to direct database insertion:", error || data?.error);
  } catch (edgeErr) {
    console.warn("Failed to reach Edge Function, falling back to direct database insertion:", edgeErr);
  }

  // Fallback: Generate a random UUID and insert directly into public.employees table
  const fallbackId = crypto.randomUUID();
  const { error: dbError } = await sb.from('employees').insert({
    id: fallbackId,
    employee_id: employee.employeeId.trim(),
    name: employee.name.trim(),
    designation: employee.designation,
    email: email,
    role: role
  });

  if (dbError) {
    throw new Error(`Fallback employee registration failed: ${dbError.message}`);
  }

  // Link employee to registering PM if applicable
  let linkedOnly = false;
  if (role === 'Employee' && registeringPmId) {
    const { error: linkError } = await sb.from('employee_pm_links').insert({
      employee_id: fallbackId,
      pm_id: registeringPmId
    });
    if (!linkError) {
      linkedOnly = true;
    }
  }

  await writeAuditLog({
    actionType: 'employee_create',
    entityType: 'employee',
    entityId: fallbackId,
    entityLabel: employee.name.trim(),
    oldValue: null,
    newValue: {
      employee_id: employee.employeeId.trim(),
      name: employee.name.trim(),
      designation: employee.designation,
      email: email,
      role: role
    }
  });

  return {
    id: fallbackId,
    employeeId: employee.employeeId.trim(),
    name: employee.name.trim(),
    designation: employee.designation,
    email: email,
    role: role,
    password: tempPassword,
    linkedOnly: linkedOnly
  };
}

export async function cleanupOrphanedEmployees(): Promise<{ deletedAuthCount: number; deletedDbCount: number }> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");
  
  const { data, error } = await sb.functions.invoke('cleanup-orphaned-employees');
  if (error) throw error;
  
  return data || { deletedAuthCount: 0, deletedDbCount: 0 };
}

export async function deleteEmployee(id: string): Promise<void> {
  if (!isUuid(id)) return;
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");
  
  // Get old employee details before deleting
  const { data: oldEmp } = await sb.from('employees').select('*').eq('id', id).maybeSingle();

  const { error } = await sb.from('employees').delete().eq('id', id);
  if (error) throw error;

  if (oldEmp) {
    await writeAuditLog({
      actionType: 'employee_delete',
      entityType: 'employee',
      entityId: id,
      entityLabel: oldEmp.name,
      oldValue: oldEmp,
      newValue: null
    });
  }
}

// -------------------------------------------------------
// PROJECT MEMBER ASSIGNMENT API (Supabase-Only)
// -------------------------------------------------------
export async function getProjectEmployees(projectId: string): Promise<Employee[]> {
  if (!isUuid(projectId)) return [];
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");

  const { data, error } = await sb
    .from('employee_project_links')
    .select('employee_id, employees(*)')
    .eq('project_id', projectId);

  if (error) throw error;

  return (data || []).map((d: any) => {
    const e = d.employees;
    return {
      id: e.id,
      employeeId: e.employee_id,
      name: e.name,
      designation: e.designation,
      email: e.email,
      role: e.role
    };
  });
}

export async function assignEmployeeToProject(projectId: string, employeeId: string): Promise<void> {
  if (!isUuid(projectId) || !isUuid(employeeId)) return;
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");

  const { error } = await sb.from('employee_project_links').insert({
    project_id: projectId,
    employee_id: employeeId
  });
  if (error && error.code !== '23505') throw error;
}

export async function removeEmployeeFromProject(projectId: string, employeeId: string): Promise<void> {
  if (!isUuid(projectId) || !isUuid(employeeId)) return;
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");

  const { error } = await sb.from('employee_project_links').delete()
    .eq('project_id', projectId)
    .eq('employee_id', employeeId);
  if (error) throw error;
}

export async function getAllProjectEmployeeLinks(): Promise<{ employee_id: string; project_id: string }[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from('employee_project_links').select('employee_id, project_id');
  if (error) throw error;
  return data || [];
}

// -------------------------------------------------------
// PHASE ACTIONS (Supabase-Only)
// -------------------------------------------------------
export async function assignPhase(phaseId: string, employeeId: string | null): Promise<void> {
  if (!isUuid(phaseId) || (employeeId && !isUuid(employeeId))) return;
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");
  
  const actorId = await getCurrentUserId();

  try {
    const { error } = await sb.rpc('assign_phase_transactional', {
      p_phase_id: phaseId,
      p_employee_id: employeeId,
      actor_id: actorId
    });
    if (error) throw error;
  } catch (err: any) {
    const { error: updErr } = await sb
      .from('internal_phases')
      .update({ assigned_to: employeeId })
      .eq('id', phaseId);
    if (updErr) throw updErr;
  }
}

export async function updatePhaseStatus(
  phaseId: string, 
  status: string, 
  rejectionNote?: string | null
): Promise<void> {
  if (!isUuid(phaseId)) return;
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");

  const actorId = await getCurrentUserId();

  try {
    const { error } = await sb.rpc('update_phase_status_transactional', {
      p_phase_id: phaseId,
      p_status: status,
      p_rejection_note: rejectionNote || null,
      actor_id: actorId
    });
    if (error) throw error;
  } catch (err: any) {
    const { error: updErr } = await sb
      .from('internal_phases')
      .update({ status: status, rejection_note: rejectionNote || null })
      .eq('id', phaseId);
    if (updErr) throw updErr;
  }
}

export async function updateClientPhaseStatus(
  phaseId: string,
  status: string
): Promise<void> {
  if (!isUuid(phaseId)) return;
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");

  // First try updating status column directly
  const { error: directErr } = await sb
    .from('client_phases')
    .update({ status })
    .eq('id', phaseId);

  if (directErr) {
    // If status column is missing in schema, store in metadata object safely
    const { data: existing } = await sb
      .from('client_phases')
      .select('metadata')
      .eq('id', phaseId)
      .single();

    const currentMeta = existing?.metadata || {};
    const updatedMeta = { ...currentMeta, status };

    const { error: metaErr } = await sb
      .from('client_phases')
      .update({ metadata: updatedMeta })
      .eq('id', phaseId);

    if (metaErr) throw directErr;
  }
}

export async function runAutoOverdueCheck(phases: Phase[]): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  let changed = false;

  for (const phase of phases) {
    if (
      phase.status === 'Pending' &&
      phase.internalEndDate &&
      phase.internalEndDate < todayStr
    ) {
      const { error } = await sb
        .from('internal_phases')
        .update({ status: 'Overdue' })
        .eq('id', phase.id);

      if (!error) {
        changed = true;

        if (phase.assignedTo) {
          const { data: moduleData } = await sb
            .from('modules')
            .select('name')
            .eq('id', phase.moduleId)
            .maybeSingle();
          const moduleName = (moduleData as any)?.name || 'Unknown Module';

          const { data: existingNotifs } = await sb
            .from('notifications')
            .select('id')
            .eq('phase_id', phase.id)
            .eq('type', 'overdue')
            .limit(1);

          if (!existingNotifs || existingNotifs.length === 0) {
            const message = `${phase.phaseName} on ${moduleName} is now overdue.`;
            await insertNotification(phase.assignedTo, phase.id, 'overdue', message);
          }
        }
      }
    }
  }

  return changed;
}

export async function claimProjectOwnership(projectId: string, pmId: string): Promise<void> {
  if (!isUuid(projectId) || !isUuid(pmId)) return;
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");
  
  const { data: oldProj } = await sb.from('projects').select('*').eq('id', projectId).maybeSingle();

  const { error } = await sb.from('projects')
    .update({ owner_id: pmId })
    .eq('id', projectId);
  if (error) throw error;

  if (oldProj) {
    let oldPmName = 'Unassigned';
    let newPmName = 'Unassigned';
    if (oldProj.owner_id) {
      const { data: oldPm } = await sb.from('employees').select('name').eq('id', oldProj.owner_id).maybeSingle();
      if (oldPm) oldPmName = oldPm.name;
    }
    if (pmId) {
      const { data: newPm } = await sb.from('employees').select('name').eq('id', pmId).maybeSingle();
      if (newPm) newPmName = newPm.name;
    }

    await writeAuditLog({
      actionType: 'ownership_reassign',
      entityType: 'project',
      entityId: projectId,
      entityLabel: oldProj.name,
      oldValue: { owner_id: oldProj.owner_id, name: oldPmName },
      newValue: { owner_id: pmId, name: newPmName }
    });
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  if (!isUuid(projectId)) return;
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");

  const { data: oldProj } = await sb.from('projects').select('*').eq('id', projectId).maybeSingle();
  
  const { error } = await sb.from('projects').delete().eq('id', projectId);
  if (error) throw error;

  if (oldProj) {
    await writeAuditLog({
      actionType: 'project_delete',
      entityType: 'project',
      entityId: projectId,
      entityLabel: oldProj.name,
      oldValue: oldProj,
      newValue: null
    });
  }
}

export async function deleteModules(moduleIds: string[]): Promise<void> {
  if (!moduleIds || moduleIds.length === 0) return;
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase client is not initialized.");

  const validIds = moduleIds.filter(id => isUuid(id));
  if (validIds.length === 0) return;

  const { data: oldMods } = await sb
    .from('modules')
    .select('id, name, code, language, course_id')
    .in('id', validIds);

  const { error } = await sb
    .from('modules')
    .delete()
    .in('id', validIds);

  if (error) throw error;

  if (oldMods && oldMods.length > 0) {
    for (const mod of oldMods) {
      await writeAuditLog({
        actionType: 'module_delete',
        entityType: 'module',
        entityId: mod.id,
        entityLabel: `${mod.code} - ${mod.name}`,
        oldValue: mod,
        newValue: null
      });
    }
  }
}

export async function createModule(
  courseId: string,
  code: string,
  name: string,
  language?: string,
  internalPhaseNames?: string[],
  clientPhaseNames?: string[]
): Promise<{ success: boolean; moduleId?: string; error?: string }> {
  if (!isUuid(courseId)) {
    return { success: false, error: 'Invalid course ID.' };
  }
  const sb = getSupabase();
  if (!sb) {
    return { success: false, error: 'Supabase client is not initialized.' };
  }

  const normCode = code.trim();
  const normName = name.trim();
  const normLang = language && language.trim() ? language.trim() : 'English';

  if (!normCode || !normName) {
    return { success: false, error: 'Module code and module name are required.' };
  }

  try {
    // Check if module already exists under this course with same code and language
    const { data: existing } = await sb
      .from('modules')
      .select('id')
      .eq('course_id', courseId)
      .eq('code', normCode)
      .eq('language', normLang)
      .maybeSingle();

    if (existing) {
      return { success: false, error: `Module "${normCode}" with language "${normLang}" already exists in this course.` };
    }

    // Insert module
    const { data: newMod, error: modErr } = await sb
      .from('modules')
      .insert({
        course_id: courseId,
        code: normCode,
        name: normName,
        language: normLang
      })
      .select('id')
      .single();

    if (modErr || !newMod) {
      throw new Error(modErr?.message || 'Failed to insert module record.');
    }

    const moduleId = newMod.id;

    const finalInternalNames = internalPhaseNames && internalPhaseNames.length > 0
      ? internalPhaseNames
      : [];

    const finalClientNames = clientPhaseNames && clientPhaseNames.length > 0
      ? clientPhaseNames
      : [];

    const internalToInsert = finalInternalNames.map(phName => ({
      module_id: moduleId,
      phase_name: phName,
      source_file_ref: 'Manual Creation',
      status: 'Pending'
    }));

    const clientToInsert = finalClientNames.map(phName => ({
      module_id: moduleId,
      phase_name: phName,
      source_file_ref: 'Manual Creation'
    }));

    if (internalToInsert.length > 0) {
      const { error: phErr } = await sb.from('internal_phases').insert(internalToInsert);
      if (phErr) {
        console.warn('Warning adding default internal phases for new module:', phErr.message);
      }
    }

    if (clientToInsert.length > 0) {
      const { error: phErr } = await sb.from('client_phases').insert(clientToInsert);
      if (phErr) {
        console.warn('Warning adding default client phases for new module:', phErr.message);
      }
    }

    await writeAuditLog({
      actionType: 'module_create',
      entityType: 'module',
      entityId: moduleId,
      entityLabel: `${normCode} - ${normName}`,
      oldValue: null,
      newValue: { course_id: courseId, code: normCode, name: normName, language: normLang }
    });

    return { success: true, moduleId };
  } catch (err: any) {
    console.error('createModule error:', err);
    return { success: false, error: err.message || 'Failed to create module.' };
  }
}

export function getModuleMatchKey(courseCode: string, moduleCode: string, language?: string): string {
  return `${(courseCode || '').trim().toLowerCase()}||${(moduleCode || '').trim().toLowerCase()}||${(language || '').trim().toLowerCase()}`;
}

export interface ExistingProjectData {
  courses: { id: string; code: string; name: string }[];
  modules: { id: string; course_id: string; code: string; name: string; language: string | null }[];
  phases: {
    id: string;
    module_id: string;
    phase_name: string;
    type_phase: string | null;
    client_date: string | null;
    internal_start_date: string | null;
    internal_end_date: string | null;
    source_file: string | null;
  }[];
}

export async function fetchExistingProjectData(projectId: string): Promise<ExistingProjectData> {
  if (!isUuid(projectId)) return { courses: [], modules: [], phases: [] };
  
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase client not initialized');

  const { data: courses, error: errC } = await sb.from('courses')
    .select('id, code, name')
    .eq('project_id', projectId);
  if (errC) throw errC;

  if (!courses || courses.length === 0) {
    return { courses: [], modules: [], phases: [] };
  }

  const courseIds = courses.map(c => c.id);

  const { data: modules, error: errM } = await sb.from('modules')
    .select('id, course_id, code, name, language, metadata')
    .in('course_id', courseIds);
  if (errM) throw errM;

  if (!modules || modules.length === 0) {
    return { courses, modules: [], phases: [] };
  }

  const moduleIds = modules.map(m => m.id);

  let phases: any[] = [];
  // Try querying consolidated_phases_view first, fallback to phases table
  const { data: viewPhases, error: errView } = await sb.from('consolidated_phases_view')
    .select('*')
    .in('module_id', moduleIds);

  if (!errView && viewPhases) {
    phases = viewPhases;
  } else {
    const { data: legacyPhases, error: errPh } = await sb.from('consolidated_phases_view')
      .select('id, module_id, phase_name, phase_type, phase_type_phase, client_date, internal_start_date, internal_end_date, source_file, metadata')
      .in('module_id', moduleIds);
    if (errPh) throw errPh;
    phases = legacyPhases || [];
  }


  return {
    courses: courses || [],
    modules: modules || [],
    phases: (phases || []).map(p => ({
      id: p.id,
      module_id: p.module_id,
      phase_name: p.phase_name,
      phase_type: p.phase_type || null,
      type_phase: p.phase_type_phase || p.type_phase || null,
      client_date: p.client_date,
      internal_start_date: p.internal_start_date,
      internal_end_date: p.internal_end_date,
      source_file: p.source_file || null,
      metadata: p.metadata || {}
    }))
  };
}

export async function saveResultToSupabase(
  projectId: string,
  clientFile: string,
  internalFile: string,
  rows: JoinResultRow[],
  confirmedKeys: string[] = [],
  ownerId?: string
): Promise<{ success: boolean; error?: string; unchangedCount?: number; savedCount?: number; skippedCount?: number; projectId?: string }> {
  const sb = getSupabase();
  if (!sb) return { success: false, error: 'Supabase client is not configured' };

  try {
    let targetProjectId = projectId;
    let existsInDb = false;
    
    if (isUuid(projectId)) {
      const { data: existingProj, error: checkErr } = await sb.from('projects')
        .select('id')
        .eq('id', projectId)
        .maybeSingle();
      if (!checkErr && existingProj) {
        existsInDb = true;
      }
    }

    if (!existsInDb) {
      throw new Error("Target project does not exist in database");
    }

    // Insert log
    const uploadLogs: any[] = [];
    if (clientFile) uploadLogs.push({ filename: clientFile, file_type: 'client', row_count: rows.length });
    if (internalFile) uploadLogs.push({ filename: internalFile, file_type: 'internal', row_count: rows.length });

    if (uploadLogs.length > 0) {
      const { error: err1 } = await sb.from('raw_uploads').insert(uploadLogs);
      if (err1) {
        console.warn('raw_uploads logging warning (non-fatal):', err1.message);
      }
    }

    let unchangedCount = 0;
    let savedCount = 0;
    let skippedCount = 0;

    const effectiveHolidayDates = await getEffectiveHolidayDates(targetProjectId);

    // Helper to calculate and insert gaps
    const insertPhaseGaps = async (inserted: any[], modId: string, lang: string | null) => {
      const internalPhases = inserted.filter(
        p => p.source_file === 'Internal' && p.internal_start_date && p.internal_end_date
      );
      if (internalPhases.length < 2) return;

      // Sort chronologically by internal_start_date
      internalPhases.sort((a, b) => {
        const da = new Date(a.internal_start_date).getTime();
        const db = new Date(b.internal_start_date).getTime();
        return da - db;
      });

      // Delete existing gaps for this module & language to prevent duplicates/stale gaps
      await sb
        .from('phase_gaps')
        .delete()
        .eq('module_id', modId)
        .eq('language', lang || null);

      const gapsToAdd: any[] = [];
      for (let i = 0; i < internalPhases.length - 1; i++) {
        const earlier = internalPhases[i];
        const later = internalPhases[i + 1];
        const rawDays = workingDaysBetween(earlier.internal_end_date, later.internal_start_date, effectiveHolidayDates);
        const gapDays = Math.max(0, rawDays > 0 ? rawDays - 1 : 0);
        gapsToAdd.push({
          module_id: modId,
          language: lang || null,
          earlier_phase_id: earlier.id,
          later_phase_id: later.id,
          working_days_gap: gapDays
        });
      }

      if (gapsToAdd.length > 0) {
        const { error: gapErr } = await sb.from('phase_gaps').insert(gapsToAdd);
        if (gapErr) {
          console.warn("phase_gaps primary insert warning:", gapErr.message);
          try {
            const fallbackGaps = gapsToAdd.map(({ working_days_gap, ...rest }) => ({ ...rest, gap_working_days: working_days_gap }));
            await sb.from('phase_gaps').insert(fallbackGaps);
          } catch (e: any) {
            console.warn("phase_gaps fallback warning:", e?.message);
          }
        }
      }
    };

    for (const row of rows) {
      const cCode = row.courseCode || 'TEMP_CRS';
      const cName = row.courseName || `Course ${cCode}`;

      let courseId = '';
      const { data: existingCourse } = await sb.from('courses')
        .select('id')
        .eq('project_id', targetProjectId)
        .eq('code', cCode)
        .maybeSingle();

      if (existingCourse) {
        courseId = existingCourse.id;
      } else {
        const { data: newCourse, error: errC } = await sb.from('courses')
          .insert({ project_id: targetProjectId, code: cCode, name: cName })
          .select('id')
          .single();
        if (errC) throw errC;
        courseId = newCourse.id;
      }

      const mCode = row.moduleCode || 'TEMP_MOD';
      const mName = row.moduleName || `Module ${mCode}`;
      const rowLang = (row.language || '').trim().toLowerCase();
      
      let moduleId = '';
      const { data: existingModule } = await sb.from('modules')
        .select('id, name, language')
        .eq('course_id', courseId)
        .eq('code', mCode)
        .maybeSingle();

      let isExisting = false;
      if (existingModule) {
        const dbLang = (existingModule.language || '').trim().toLowerCase();
        if (dbLang === rowLang) {
          moduleId = existingModule.id;
          isExisting = true;
        }
      }

      const matchKey = getModuleMatchKey(cCode, mCode, row.language);

      if (isExisting) {
        const { data: storedPhases, error: errSph } = await sb.from('consolidated_phases_view')
          .select('phase_name, client_date, internal_start_date, internal_end_date')
          .eq('module_id', moduleId);

        if (errSph) throw errSph;

        let datesDiffer = false;
        for (const uPh of row.phases) {
          const phName = uPh.phaseName;
          const sPh = (storedPhases || []).find(ph => ph.phase_name === phName);

          const upClient = uPh.clientDate || null;
          const upStart = uPh.internalStartDate || null;
          const upEnd = uPh.internalEndDate || null;

          const stClient = sPh?.client_date || null;
          const stStart = sPh?.internal_start_date || null;
          const stEnd = sPh?.internal_end_date || null;

          if (clientFile && upClient !== stClient) {
            datesDiffer = true;
            break;
          }
          if (internalFile) {
            if (upStart !== stStart || upEnd !== stEnd) {
              datesDiffer = true;
              break;
            }
          }
        }

        if (!datesDiffer) {
          unchangedCount++;
          continue;
        }

        if (confirmedKeys.length > 0 && !confirmedKeys.includes(matchKey)) {
          skippedCount++;
          continue;
        }

        const modMeta = row.moduleMetadata || (row as any).rawRow?.moduleMetadata || {};
        const clientModMeta = row.clientCustomMetadata || (row as any).rawRow?.clientCustomMetadata || {};
        const internalModMeta = row.internalCustomMetadata || (row as any).rawRow?.internalCustomMetadata || {};

        const modPayload: Record<string, any> = {};
        if (modMeta && Object.keys(modMeta).length > 0) modPayload.metadata = modMeta;
        if (clientModMeta && Object.keys(clientModMeta).length > 0) modPayload.client_custom_metadata = clientModMeta;
        if (internalModMeta && Object.keys(internalModMeta).length > 0) modPayload.internal_custom_metadata = internalModMeta;

        if (Object.keys(modPayload).length > 0) {
          await sb.from('modules').update(modPayload).eq('id', moduleId);
        }

        // Delete existing phase entries for uploaded names from client_phases and internal_phases as appropriate
        const uploadedNames = row.phases.map(p => p.phaseName).filter(Boolean);
        if (uploadedNames.length > 0) {
          if (clientFile && !internalFile) {
            await sb.from('client_phases').delete().eq('module_id', moduleId).in('phase_name', uploadedNames);
          } else if (internalFile && !clientFile) {
            await sb.from('internal_phases').delete().eq('module_id', moduleId).in('phase_name', uploadedNames);
          } else {
            if (clientFile) await sb.from('client_phases').delete().eq('module_id', moduleId).in('phase_name', uploadedNames);
            if (internalFile) await sb.from('internal_phases').delete().eq('module_id', moduleId).in('phase_name', uploadedNames);
          }
        }

        const clientToAdd: any[] = [];
        const internalToAdd: any[] = [];

        const isClientOnly = Boolean(clientFile && !internalFile);
        const isInternalOnly = Boolean(internalFile && !clientFile);

        row.phases.forEach((ph, pIdx) => {
          if (!ph.phaseName) return;
          const seq = ph.phaseSequence || (pIdx + 1);
          const phMeta = ph.metadata || (ph as any).rawRow?.metadata || (ph as any).phaseMetadata || {};
          const phOrigin = (ph as any).origin;
          const phSource = (ph as any).sourceFile || (ph as any).source_file;

          const hasClientDate = ph.clientDate !== null && ph.clientDate !== undefined && ph.clientDate !== '';
          const hasInternalDate = (ph.internalStartDate !== null && ph.internalStartDate !== undefined && ph.internalStartDate !== '') ||
                                  (ph.internalEndDate !== null && ph.internalEndDate !== undefined && ph.internalEndDate !== '') ||
                                  ((ph as any).start_date !== null && (ph as any).start_date !== undefined && (ph as any).start_date !== '');

          let shouldClient = false;
          if (phOrigin === 'delivery_sheet' || phSource === 'Client') {
            shouldClient = true;
          } else if (hasClientDate) {
            shouldClient = true;
          } else if (isClientOnly) {
            shouldClient = true;
          }

          let shouldInternal = false;
          if (phOrigin === 'development_sheet' || phSource === 'Internal') {
            shouldInternal = true;
          } else if (hasInternalDate) {
            shouldInternal = true;
          } else if (isInternalOnly) {
            shouldInternal = true;
          }

          if (shouldClient) {
            clientToAdd.push({
              module_id: moduleId,
              phase_name: ph.phaseName,
              phase_type: ph.phaseType || null,
              phase_type_phase: ph.phaseTypePhase || null,
              phase_sequence: seq,
              client_date: ph.clientDate || null,
              source_file_ref: (ph as any).sourceFileRef || clientFile || '',
              status: (ph as any).status || 'Pending',
              metadata: phMeta
            });
          }
          if (shouldInternal) {
            internalToAdd.push({
              module_id: moduleId,
              phase_name: ph.phaseName,
              phase_type: ph.phaseType || null,
              phase_type_phase: ph.phaseTypePhase || null,
              phase_sequence: seq,
              internal_start_date: ph.internalStartDate || (ph as any).start_date || null,
              internal_end_date: ph.internalEndDate || (ph as any).end_date || null,
              source_file_ref: (ph as any).sourceFileRef || internalFile || '',
              status: 'Pending',
              metadata: phMeta
            });
          }
        });

        if (clientToAdd.length > 0) {
          const { error: errCPh } = await sb.from('client_phases').insert(clientToAdd);
          if (errCPh) throw errCPh;
        }
        if (internalToAdd.length > 0) {
          const { data: insertedInternal, error: errIPh } = await sb.from('internal_phases').insert(internalToAdd).select('*');
          if (errIPh) throw errIPh;
          if (insertedInternal) {
            await insertPhaseGaps(insertedInternal.map(p => ({ ...p, source_file: 'Internal' })), moduleId, row.language || null);
          }
        }
        savedCount++;

      } else {
        const modMeta = row.moduleMetadata || (row as any).rawRow?.moduleMetadata || {};
        const clientModMeta = row.clientCustomMetadata || (row as any).rawRow?.clientCustomMetadata || {};
        const internalModMeta = row.internalCustomMetadata || (row as any).rawRow?.internalCustomMetadata || {};

        const { data: newModule, error: errM } = await sb.from('modules')
          .insert({
            course_id: courseId,
            code: mCode,
            name: mName,
            language: row.language || null,
            metadata: modMeta,
            client_custom_metadata: Object.keys(clientModMeta).length > 0 ? clientModMeta : null,
            internal_custom_metadata: Object.keys(internalModMeta).length > 0 ? internalModMeta : null
          })
          .select('id')
          .single();
        if (errM) throw errM;
        moduleId = newModule.id;

        const clientToAdd: any[] = [];
        const internalToAdd: any[] = [];

        const isClientOnly = Boolean(clientFile && !internalFile);
        const isInternalOnly = Boolean(internalFile && !clientFile);

        row.phases.forEach((ph, pIdx) => {
          const seq = ph.phaseSequence || (pIdx + 1);
          const phMeta = ph.metadata || (ph as any).rawRow?.metadata || (ph as any).phaseMetadata || {};
          const phOrigin = (ph as any).origin;
          const phSource = (ph as any).sourceFile || (ph as any).source_file;

          const hasClientDate = ph.clientDate !== null && ph.clientDate !== undefined && ph.clientDate !== '';
          const hasInternalDate = (ph.internalStartDate !== null && ph.internalStartDate !== undefined && ph.internalStartDate !== '') ||
                                  (ph.internalEndDate !== null && ph.internalEndDate !== undefined && ph.internalEndDate !== '') ||
                                  ((ph as any).start_date !== null && (ph as any).start_date !== undefined && (ph as any).start_date !== '');

          let shouldClient = false;
          if (phOrigin === 'delivery_sheet' || phSource === 'Client') {
            shouldClient = true;
          } else if (hasClientDate) {
            shouldClient = true;
          } else if (isClientOnly) {
            shouldClient = true;
          }

          let shouldInternal = false;
          if (phOrigin === 'development_sheet' || phSource === 'Internal') {
            shouldInternal = true;
          } else if (hasInternalDate) {
            shouldInternal = true;
          } else if (isInternalOnly) {
            shouldInternal = true;
          }

          if (shouldClient) {
            clientToAdd.push({
              module_id: moduleId,
              phase_name: ph.phaseName,
              phase_type: ph.phaseType || null,
              phase_type_phase: ph.phaseTypePhase || null,
              phase_sequence: seq,
              client_date: ph.clientDate || null,
              source_file_ref: (ph as any).sourceFileRef || clientFile || '',
              status: (ph as any).status || 'Pending',
              metadata: phMeta
            });
          }
          if (shouldInternal) {
            internalToAdd.push({
              module_id: moduleId,
              phase_name: ph.phaseName,
              phase_type: ph.phaseType || null,
              phase_type_phase: ph.phaseTypePhase || null,
              phase_sequence: seq,
              internal_start_date: ph.internalStartDate || (ph as any).start_date || null,
              internal_end_date: ph.internalEndDate || (ph as any).end_date || null,
              source_file_ref: (ph as any).sourceFileRef || internalFile || '',
              status: 'Pending',
              metadata: phMeta
            });
          }
        });

        if (clientToAdd.length > 0) {
          const { error: errCPh } = await sb.from('client_phases').insert(clientToAdd);
          if (errCPh) throw errCPh;
        }
        if (internalToAdd.length > 0) {
          const { data: insertedInternal, error: errIPh } = await sb.from('internal_phases').insert(internalToAdd).select('*');
          if (errIPh) throw errIPh;
          if (insertedInternal) {
            await insertPhaseGaps(insertedInternal.map(p => ({ ...p, source_file: 'Internal' })), moduleId, row.language || null);
          }
        }
        savedCount++;
      }
    }

    // Fetch project name for label
    let projName = "Unknown Project";
    const { data: pData } = await sb.from('projects').select('name').eq('id', targetProjectId).maybeSingle();
    if (pData) projName = pData.name;

    await writeAuditLog({
      actionType: 'upload',
      entityType: 'project',
      entityId: targetProjectId,
      entityLabel: `${projName} (${clientFile} / ${internalFile})`,
      oldValue: null,
      newValue: {
        filename_client: clientFile,
        filename_internal: internalFile,
        created_count: savedCount,
        updated_count: unchangedCount,
        skipped_count: skippedCount
      }
    });

    return { success: true, unchangedCount, savedCount, skippedCount, projectId: targetProjectId };
  } catch (err: any) {
    console.error("Supabase persistent store error:", err);
    return { success: false, error: err.message || JSON.stringify(err) };
  }
}

// Fetch all dashboard data scoped strictly via Row Level Security (RLS)
export async function fetchAllDashboardData(
  currentUser?: { email: string; role: string; id?: string; name?: string } | null
): Promise<{
  projects: Project[];
  courses: Course[];
  modules: Module[];
  phases: Phase[];
}> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase client not initialized');

  let allowedProjectIds: string[] | null = null;

  // Pull scoped Project IDs based on PM or Employee linkage rules
  if (currentUser && currentUser.role === 'Project Manager' && currentUser.id) {
    const { data: pmProjs } = await sb
      .from('projects')
      .select('id')
      .eq('owner_id', currentUser.id);
    allowedProjectIds = (pmProjs || []).map(p => p.id);
  } else if (currentUser && (currentUser.role === 'Employee' || currentUser.role === 'Lead') && currentUser.id) {
    // 1. Get projects linked to employee in employee_project_links
    const { data: projectLinks } = await sb
      .from('employee_project_links')
      .select('project_id')
      .eq('employee_id', currentUser.id);
    
    let linkedProjIds: string[] = (projectLinks || []).map(l => l.project_id);

    // 2. Get projects where employee is assigned to a phase
    let assignedPhases: any[] | null = null;
    const { data: vPhases } = await sb
      .from('consolidated_phases_view')
      .select('module_id')
      .eq('assigned_to', currentUser.id);
    if (vPhases) {
      assignedPhases = vPhases;
    } else {
      const { data: legacyPhases } = await sb
        .from('internal_phases')
        .select('module_id')
        .eq('assigned_to', currentUser.id);
      assignedPhases = legacyPhases;
    }
    
    let assignedProjIds: string[] = [];
    if (assignedPhases && assignedPhases.length > 0) {
      const moduleIds = assignedPhases.map(ph => ph.module_id);
      const { data: modulesData } = await sb
        .from('modules')
        .select('course_id')
        .in('id', moduleIds);
      
      if (modulesData && modulesData.length > 0) {
        const courseIds = modulesData.map(m => m.course_id);
        const { data: coursesData } = await sb
          .from('courses')
          .select('project_id')
          .in('id', courseIds);
        
        if (coursesData && coursesData.length > 0) {
          assignedProjIds = coursesData.map(c => c.project_id);
        }
      }
    }

    allowedProjectIds = Array.from(new Set([...linkedProjIds, ...assignedProjIds]));
  }

  let pQuery = sb.from('projects').select('*');
  if (allowedProjectIds !== null) {
    pQuery = pQuery.in('id', allowedProjectIds);
  }
  
  const [pRes, cRes, mRes, phRes] = await Promise.all([
    pQuery.order('created_at', { ascending: false }),
    sb.from('courses').select('id, project_id, code, name').order('code', { ascending: true }),
    sb.from('modules').select('id, course_id, code, name, language, metadata').order('code', { ascending: true }),
    sb.from('consolidated_phases_view').select('id, module_id, phase_name, phase_type, phase_type_phase, client_date, internal_start_date, internal_end_date, source_file_ref, source_file, assigned_to, status, rejection_note, metadata')
      .then(res => res.error ? sb.from('internal_phases').select('id, module_id, phase_name, phase_type, phase_type_phase, client_date, internal_start_date, internal_end_date, source_file_ref, source_file, assigned_to, status, rejection_note, metadata') : res)
  ]);

  if (pRes.error) throw pRes.error;
  if (cRes.error) throw cRes.error;
  if (mRes.error) throw mRes.error;
  if (phRes.error) throw phRes.error;

  const projects: Project[] = (pRes.data || []).map(p => ({
    id: p.id,
    name: p.name,
    createdAt: p.created_at,
    ownerId: p.owner_id
  }));

  const projectIds = new Set(projects.map(p => p.id));

  const courses: Course[] = (cRes.data || [])
    .filter(c => projectIds.has(c.project_id))
    .map(c => ({
      id: c.id,
      projectId: c.project_id,
      code: c.code,
      name: c.name
    }));

  const courseIds = new Set(courses.map(c => c.id));

  const modules: Module[] = (mRes.data || [])
    .filter(m => courseIds.has(m.course_id))
    .map(m => ({
      id: m.id,
      courseId: m.course_id,
      code: m.code,
      name: m.name,
      language: m.language || undefined,
      metadata: m.metadata || {}
    }));

  const moduleIds = new Set(modules.map(m => m.id));

  const phases: Phase[] = (phRes.data || [])
    .filter(ph => moduleIds.has(ph.module_id))
    .map(ph => ({
      id: ph.id,
      moduleId: ph.module_id,
      phaseName: ph.phase_name,
      phaseType: ph.phase_type,
      phaseTypePhase: ph.phase_type_phase || (ph as any).type_phase || null,
      clientDate: ph.client_date,
      internalStartDate: ph.internal_start_date,
      internalEndDate: ph.internal_end_date,
      sourceFileRef: ph.source_file_ref,
      sourceFile: ph.source_file,
      assignedTo: ph.assigned_to || null,
      status: ph.status || ph.metadata?.status || null,
      rejectionNote: ph.rejection_note || null,
      metadata: ph.metadata || {}
    }));

  return { projects, courses, modules, phases };
}

// ------------------------------------------------------------
// SECURE SQL SETUP SCRIPT (With Strict Database RLS Policies)
// ------------------------------------------------------------
export const SQL_SETUP_SCRIPT = `-- ==========================================
-- MEDIANT LABS: SECURED BRAN DATABASE SCHEMAS
-- ==========================================

-- 1. Employees Directory Profiles
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY,
  employee_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  designation TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'Employee' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Projects Inventory
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Course Tracks
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Module Objects
CREATE TABLE IF NOT EXISTS public.modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  language TEXT,
  metadata JSONB,
  client_custom_metadata JSONB,
  internal_custom_metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.modules ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE public.modules ADD COLUMN IF NOT EXISTS client_custom_metadata JSONB;
ALTER TABLE public.modules ADD COLUMN IF NOT EXISTS internal_custom_metadata JSONB;

-- 5. Employee to PM Many-to-Many Linking Table
CREATE TABLE IF NOT EXISTS public.employee_pm_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  pm_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(employee_id, pm_id)
);

-- 5. Internal Development Phases & Tasks
CREATE TABLE IF NOT EXISTS public.internal_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID REFERENCES public.modules(id) ON DELETE CASCADE NOT NULL,
  phase_name TEXT NOT NULL,
  phase_type TEXT,
  type_phase TEXT,
  phase_type_phase TEXT,
  client_date DATE,
  internal_start_date DATE,
  internal_end_date DATE,
  source_file_ref TEXT,
  source_file TEXT DEFAULT 'Internal',
  assigned_to UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'Pending',
  rejection_note TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Holidays Log
CREATE TABLE IF NOT EXISTS public.holidays (
  date DATE PRIMARY KEY,
  label TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Raw Spreadsheet Upload Log
CREATE TABLE IF NOT EXISTS public.raw_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- SECURITY DEFINER FUNCTION TO PREVENT POLICY RECURSION
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT SECURITY DEFINER AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.employees WHERE id = auth.uid();
  RETURN user_role;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.employee_has_assigned_phase_in_project(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.phases ph
    JOIN public.modules m ON m.id = ph.module_id
    JOIN public.courses c ON c.id = m.course_id
    WHERE c.project_id = p_project_id AND ph.assigned_to = p_user_id
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STRICT ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_pm_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_uploads ENABLE ROW LEVEL SECURITY;

-- --- A. EMPLOYEES POLICIES ---
CREATE POLICY "Allow_ALL_employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);

-- --- B. PROJECTS POLICIES ---
CREATE POLICY "Allow_ALL_projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);

-- --- C. COURSES POLICIES ---
CREATE POLICY "Allow_ALL_courses" ON public.courses FOR ALL USING (true) WITH CHECK (true);

-- --- D. MODULES POLICIES ---
CREATE POLICY "Allow_ALL_modules" ON public.modules FOR ALL USING (true) WITH CHECK (true);

-- --- E. EMPLOYEE PM LINKS POLICIES ---
CREATE POLICY "Allow_ALL_employee_pm_links" ON public.employee_pm_links FOR ALL USING (true) WITH CHECK (true);

-- --- F. PHASES POLICIES ---
CREATE POLICY "Allow_ALL_phases" ON public.phases FOR ALL USING (true) WITH CHECK (true);

-- --- G. HOLIDAYS POLICIES ---
CREATE POLICY "Allow_ALL_holidays" ON public.holidays FOR ALL USING (true) WITH CHECK (true);

-- --- H. UPLOADS POLICIES ---
CREATE POLICY "Allow_ALL_raw_uploads" ON public.raw_uploads FOR ALL USING (true) WITH CHECK (true);

-- --- I. PROJECT MEMBER LINKS ---
CREATE TABLE IF NOT EXISTS public.employee_project_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(employee_id, project_id)
);

ALTER TABLE public.employee_project_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public SELECT on employee_project_links" ON public.employee_project_links
  FOR SELECT USING (true);

CREATE POLICY "PM/Lead full access on own project links" ON public.employee_project_links
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = employee_project_links.project_id AND projects.owner_id = auth.uid())
    OR public.get_my_role() = 'Lead'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = employee_project_links.project_id AND projects.owner_id = auth.uid())
    OR public.get_my_role() = 'Lead'
  );

CREATE POLICY "Admin full access on employee_project_links" ON public.employee_project_links
  FOR ALL TO authenticated
  USING (public.get_my_role() = 'Admin')
  WITH CHECK (public.get_my_role() = 'Admin');

-- --- J. NOTIFICATIONS ---
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  phase_id UUID,
  module_id UUID,
  event_id UUID,
  type TEXT NOT NULL CHECK (type IN ('new_assignment', 'due_soon', 'overdue', 'date_changed')),
  message TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (recipient_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (recipient_id = auth.uid());

CREATE POLICY "Authenticated users can insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

-- --- J2. PHASE GAPS ---
CREATE TABLE IF NOT EXISTS public.phase_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  earlier_phase_id UUID,
  later_phase_id UUID,
  working_days_gap INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.phase_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow_ALL_phase_gaps" ON public.phase_gaps FOR ALL USING (true) WITH CHECK (true);

-- --- K. AUDIT LOGS ---
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  action_type TEXT CHECK (action_type IN ('upload', 'date_edit', 'status_change', 'assignment', 'phase_cascade', 'project_create', 'project_rename', 'project_delete', 'employee_create', 'employee_edit', 'employee_delete', 'ownership_reassign')) NOT NULL,
  entity_type TEXT CHECK (entity_type IN ('project', 'course', 'module', 'phase', 'employee')) NOT NULL,
  entity_id UUID NOT NULL,
  entity_label TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_id ON public.audit_log(entity_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see all logs" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE employees.id = auth.uid()
      AND employees.role = 'Admin'
    )
  );

CREATE POLICY "PMs see their own project logs" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE employees.id = auth.uid()
      AND employees.role = 'Project Manager'
    )
    AND (
      entity_id IN (
        SELECT id FROM public.projects WHERE owner_id = auth.uid()
        UNION
        SELECT c.id FROM public.courses c JOIN public.projects pr ON c.project_id = pr.id WHERE pr.owner_id = auth.uid()
        UNION
        SELECT m.id FROM public.modules m JOIN public.courses c ON m.course_id = c.id JOIN public.projects pr ON c.project_id = pr.id WHERE pr.owner_id = auth.uid()
        UNION
        SELECT p.id FROM public.phases p JOIN public.modules m ON p.module_id = m.id JOIN public.courses c ON m.course_id = c.id JOIN public.projects pr ON c.project_id = pr.id WHERE pr.owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Authenticated users can insert logs" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.cleanup_audit_logs()
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.audit_log WHERE created_at < now() - interval '5 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.build_phase_label(p_phase_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_label TEXT;
BEGIN
  SELECT pr.name || ' → ' || c.name || ' → ' || m.name || ' → ' || p.phase_name
  INTO v_label
  FROM public.phases p
  JOIN public.modules m ON p.module_id = m.id
  JOIN public.courses c ON m.course_id = c.id
  JOIN public.projects pr ON c.project_id = pr.id
  WHERE p.id = p_phase_id;
  
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
  SELECT status INTO v_old_status FROM public.phases WHERE id = p_phase_id;
  v_label := public.build_phase_label(p_phase_id);

  UPDATE public.phases
  SET status = p_status,
      rejection_note = CASE WHEN p_rejection_note IS NOT NULL THEN p_rejection_note ELSE rejection_note END
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
  SELECT assigned_to INTO v_old_assignee FROM public.phases WHERE id = p_phase_id;
  v_label := public.build_phase_label(p_phase_id);

  UPDATE public.phases
  SET assigned_to = p_employee_id
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
  SELECT client_date INTO v_old_client_date FROM public.phases WHERE id = p_phase_id;
  v_label := public.build_phase_label(p_phase_id);

  UPDATE public.phases
  SET client_date = p_client_date
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
`;

import { Notification } from '../types';

export async function getNotifications(recipientId: string): Promise<Notification[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('notifications')
      .select('*')
      .eq('recipient_id', recipientId)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn("Notification query warning:", error.message);
      return [];
    }
    return (data || []).map(n => ({
      id: n.id,
      recipientId: n.recipient_id,
      phaseId: n.phase_id || null,
      moduleId: n.module_id || n.metadata?.module_id || null,
      eventId: n.event_id || null,
      type: n.type,
      message: n.message,
      metadata: n.metadata || null,
      isRead: n.is_read,
      createdAt: n.created_at
    }));
  } catch (err) {
    console.error("Error fetching notifications:", err);
    return [];
  }
}

export interface CascadeNotificationPayload {
  eventId?: string;
  actorId?: string;
  projectId?: string;
  projectName?: string;
  editedPhaseId?: string;
  phaseName?: string;
  fieldEdited?: string;
  originalDate?: string;
  newTargetDate?: string;
  shiftedBusinessDays?: number;
  affectedPhases?: Array<{
    phase_id?: string;
    phase_name?: string;
    old_end?: string;
    new_end?: string;
    assigned_to?: string;
  }>;
}

export async function dispatchCascadeNotification(payload: CascadeNotificationPayload): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  try {
    const formattedPayload = {
      event_id: payload.eventId,
      actor_id: payload.actorId,
      project_id: payload.projectId,
      project_name: payload.projectName,
      edited_phase_id: payload.editedPhaseId,
      phase_name: payload.phaseName,
      field_edited: payload.fieldEdited,
      original_date: payload.originalDate,
      new_target_date: payload.newTargetDate,
      shifted_business_days: payload.shiftedBusinessDays,
      affected_phases: payload.affectedPhases
    };

    if (payload.editedPhaseId && payload.newTargetDate) {
      await notifyDateChanged(payload.editedPhaseId, payload.newTargetDate);
    }
  } catch (err) {
    console.error("Error dispatching cascade notification:", err);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(recipientId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', recipientId);
  if (error) throw error;
}

export async function insertNotification(
  recipientId: string,
  phaseId: string | null,
  type: 'new_assignment' | 'due_soon' | 'overdue' | 'date_changed',
  message: string
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from('notifications')
    .insert({
      recipient_id: recipientId,
      phase_id: phaseId,
      type,
      message,
      is_read: false
    });
  if (error) throw error;
}

export async function purgeOldNotifications(recipientId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { error } = await sb
    .from('notifications')
    .delete()
    .eq('recipient_id', recipientId)
    .lt('created_at', cutoff.toISOString());
  if (error) throw error;
}

export async function getInternalPhasesForModule(moduleId: string): Promise<Phase[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('internal_phases')
    .select('*')
    .eq('module_id', moduleId);
  if (error) throw error;
  return (data || []).map(ph => ({
    id: ph.id,
    moduleId: ph.module_id,
    phaseName: ph.phase_name,
    phaseType: ph.phase_type,
    phaseTypePhase: ph.phase_type_phase,
    clientDate: null,
    internalStartDate: ph.internal_start_date,
    internalEndDate: ph.internal_end_date,
    sourceFileRef: ph.source_file_ref,
    sourceFile: 'Internal',
    assignedTo: ph.assigned_to || null,
    status: ph.status || null,
    rejectionNote: ph.rejection_note || null,
    metadata: ph.metadata || {}
  }));
}

export async function getClientPhasesForModule(moduleId: string): Promise<Phase[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('client_phases')
    .select('*')
    .eq('module_id', moduleId);
  if (error) throw error;
  return (data || []).map(ph => ({
    id: ph.id,
    moduleId: ph.module_id,
    phaseName: ph.phase_name,
    phaseType: ph.phase_type,
    phaseTypePhase: ph.phase_type_phase,
    clientDate: ph.client_date,
    internalStartDate: null,
    internalEndDate: null,
    sourceFileRef: ph.source_file_ref,
    sourceFile: 'Client',
    assignedTo: null,
    status: ph.status || ph.metadata?.status || undefined,
    rejectionNote: null,
    metadata: ph.metadata || {}
  }));
}

export async function notifyNewAssignment(phaseId: string, employeeId: string | null): Promise<void> {
  if (!employeeId) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data, error } = await sb.from('internal_phases')
      .select('phase_name, internal_end_date, modules(name)')
      .eq('id', phaseId)
      .single();
    if (error || !data) return;
    const phaseName = data.phase_name;
    const moduleName = (data.modules as any)?.name || 'Unknown Module';
    const endDate = data.internal_end_date ? data.internal_end_date : 'no due date';
    const message = `You've been assigned to ${phaseName} on ${moduleName}, due ${endDate}.`;
    await insertNotification(employeeId, phaseId, 'new_assignment', message);
  } catch (err) {
    console.error("Error creating new assignment notification:", err);
  }
}

export async function notifyDateChanged(phaseId: string, newEndDate: string | null): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data, error } = await sb.from('internal_phases')
      .select('phase_name, assigned_to, modules(name)')
      .eq('id', phaseId)
      .single();
    if (error || !data || !data.assigned_to) return;
    const phaseName = data.phase_name;
    const moduleName = (data.modules as any)?.name || 'Unknown Module';
    const endDateText = newEndDate ? newEndDate : 'no due date';
    const message = `${phaseName} on ${moduleName} has been rescheduled to ${endDateText}.`;
    await insertNotification(data.assigned_to, phaseId, 'date_changed', message);
  } catch (err) {
    console.error("Error creating date changed notification:", err);
  }
}

export async function getPhaseLabel(phaseId: string): Promise<string> {
  const sb = getSupabase();
  if (!sb || !phaseId) return `Phase ${phaseId}`;
  try {
    const { data: vData } = await sb
      .from('consolidated_phases_view')
      .select('phase_name, modules(name, code, courses(name, code, projects(name, code)))')
      .eq('id', phaseId)
      .maybeSingle();

    if (vData) {
      const projCode = (vData.modules as any)?.courses?.projects?.code || (vData.modules as any)?.courses?.projects?.name || 'Project';
      const modName = (vData.modules as any)?.name || (vData.modules as any)?.code || 'Module';
      return `${projCode} > ${modName} > ${vData.phase_name}`;
    }

    const { data: cData } = await sb
      .from('client_phases')
      .select('phase_name, modules(name, code, courses(name, code, projects(name, code)))')
      .eq('id', phaseId)
      .maybeSingle();

    if (cData) {
      const projCode = (cData.modules as any)?.courses?.projects?.code || (cData.modules as any)?.courses?.projects?.name || 'Project';
      const modName = (cData.modules as any)?.name || (cData.modules as any)?.code || 'Module';
      return `${projCode} > ${modName} > ${cData.phase_name}`;
    }

    const { data: iData } = await sb
      .from('internal_phases')
      .select('phase_name, modules(name, code, courses(name, code, projects(name, code)))')
      .eq('id', phaseId)
      .maybeSingle();

    if (iData) {
      const projCode = (iData.modules as any)?.courses?.projects?.code || (iData.modules as any)?.courses?.projects?.name || 'Project';
      const modName = (iData.modules as any)?.name || (iData.modules as any)?.code || 'Module';
      return `${projCode} > ${modName} > ${iData.phase_name}`;
    }
  } catch (e) {
    console.error("Failed to get phase label:", e);
  }
  return `Phase ${phaseId}`;
}

export async function writeAuditLog({
  actionType,
  entityType,
  entityId,
  entityLabel,
  oldValue = null,
  newValue = null,
  createdAt = null
}: {
  actionType: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  oldValue?: any;
  newValue?: any;
  createdAt?: string | null;
}): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  try {
    const actorId = await getCurrentUserId();
    if (!actorId) return;

    const logEntry: any = {
      actor_id: actorId,
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId,
      entity_label: entityLabel,
      old_value: oldValue,
      new_value: newValue
    };

    if (createdAt) {
      logEntry.created_at = createdAt;
    }

    const { error } = await sb.from('audit_log').insert(logEntry);
    if (error) {
      console.error("Failed to write audit log:", error);
    }

    // Call 5-day retention cleanup
    const { error: cleanupErr } = await sb.rpc('cleanup_audit_logs');
    if (cleanupErr) {
      // Fallback direct delete if RPC fails
      await sb.from('audit_log').delete().lt('created_at', new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString());
    }
  } catch (err) {
    console.error("Error in writeAuditLog helper:", err);
  }
}

// -------------------------------------------------------
// EMPLOYEE CAPACITY & RESOURCE ALLOCATION API
// -------------------------------------------------------

export interface EmployeeCapacityPhase {
  id: string;
  phaseName: string;
  projectName: string;
  courseCodeName: string;
  moduleCodeName: string;
  assignedTo: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  workingDaysInWindow: number;
}

export interface EmployeeCapacitySummary {
  employeeId: string;
  employeeName: string;
  employeeDesignation: string;
  employeeEmail: string;
  employeeRole: string;
  allocatedWorkingDays: number;
  availableWorkingDays: number;
  capacityPercentage: number;
  statusCategory: 'green' | 'yellow' | 'red';
  overlappingPhaseCount: number;
  assignedPhases: EmployeeCapacityPhase[];
}

export async function getEmployeeCapacityData(
  startDateStr: string,
  endDateStr: string
): Promise<EmployeeCapacitySummary[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const holidayList = await getHolidays();
  const holidayDates = holidayList.map(h => h.date);

  const employees = await getEmployees();

  const totalBusinessDays = workingDaysBetween(startDateStr, endDateStr, holidayDates);
  const availableDays = totalBusinessDays > 0 ? totalBusinessDays : 1;

  const { data: phasesData, error } = await sb
    .from('internal_phases')
    .select('*, modules(name, code, courses(name, code, projects(name)))')
    .not('assigned_to', 'is', null);

  if (error) {
    console.error("Error fetching capacity phases:", error);
    throw error;
  }

  const employeeMap: Record<string, EmployeeCapacityPhase[]> = {};
  employees.forEach(emp => {
    employeeMap[emp.id] = [];
  });

  (phasesData || []).forEach(ph => {
    if (!ph.assigned_to) return;
    if (ph.status === 'Completed') return;

    const pStart = ph.internal_start_date || ph.client_date;
    const pEnd = ph.internal_end_date || ph.client_date || pStart;

    if (!pStart && !pEnd) return;

    const phaseStart = pStart || pEnd;
    const phaseEnd = pEnd || pStart;

    const windowStart = startDateStr;
    const windowEnd = endDateStr;

    if (phaseEnd < windowStart || phaseStart > windowEnd) {
      return;
    }

    const overlapStart = phaseStart < windowStart ? windowStart : phaseStart;
    const overlapEnd = phaseEnd > windowEnd ? windowEnd : phaseEnd;

    const daysInWindow = Math.max(1, workingDaysBetween(overlapStart, overlapEnd, holidayDates));

    const projName = (ph.modules as any)?.courses?.projects?.name || 'Unmapped Project';
    const courseCodeName = `${(ph.modules as any)?.courses?.code || ''} - ${(ph.modules as any)?.courses?.name || ''}`;
    const moduleCodeName = `${(ph.modules as any)?.code || ''} - ${(ph.modules as any)?.name || ''}`;

    const capPhase: EmployeeCapacityPhase = {
      id: ph.id,
      phaseName: ph.phase_name,
      projectName: projName,
      courseCodeName,
      moduleCodeName,
      assignedTo: ph.assigned_to,
      startDate: phaseStart,
      endDate: phaseEnd,
      status: ph.status || 'Pending',
      workingDaysInWindow: daysInWindow
    };

    if (employeeMap[ph.assigned_to]) {
      employeeMap[ph.assigned_to].push(capPhase);
    }
  });

  return employees.map(emp => {
    const assigned = employeeMap[emp.id] || [];
    const totalAllocatedDays = assigned.reduce((sum, p) => sum + p.workingDaysInWindow, 0);
    const capacityPct = Math.round((totalAllocatedDays / availableDays) * 100);

    let statusCategory: 'green' | 'yellow' | 'red' = 'green';
    if (capacityPct > 100) {
      statusCategory = 'red';
    } else if (capacityPct >= 81) {
      statusCategory = 'yellow';
    }

    let overlappingCount = 0;
    for (let i = 0; i < assigned.length; i++) {
      for (let j = i + 1; j < assigned.length; j++) {
        const p1 = assigned[i];
        const p2 = assigned[j];
        if (p1.startDate && p1.endDate && p2.startDate && p2.endDate) {
          if (p1.startDate <= p2.endDate && p1.endDate >= p2.startDate) {
            overlappingCount++;
          }
        }
      }
    }

    return {
      employeeId: emp.id,
      employeeName: emp.name,
      employeeDesignation: emp.designation,
      employeeEmail: emp.email || '',
      employeeRole: emp.role || 'Employee',
      allocatedWorkingDays: totalAllocatedDays,
      availableWorkingDays: availableDays,
      capacityPercentage: capacityPct,
      statusCategory,
      overlappingPhaseCount: overlappingCount,
      assignedPhases: assigned
    };
  });
}

export async function recalculateAllPhaseGaps(): Promise<{ success: boolean; updatedCount: number }> {
  const sb = getSupabase();
  if (!sb) return { success: false, updatedCount: 0 };

  try {
    const { data: allPhases, error: pErr } = await sb
      .from('internal_phases')
      .select('id, module_id, phase_name, internal_start_date, internal_end_date, modules(project_id)')
      .order('internal_start_date', { ascending: true });

    if (pErr || !allPhases || allPhases.length === 0) return { success: true, updatedCount: 0 };

    const moduleMap = new Map<string, any[]>();
    allPhases.forEach(p => {
      if (p.internal_start_date && p.internal_end_date) {
        const list = moduleMap.get(p.module_id) || [];
        list.push(p);
        moduleMap.set(p.module_id, list);
      }
    });

    let updatedCount = 0;
    for (const [modId, modPhases] of moduleMap.entries()) {
      const projId = (modPhases[0]?.modules as any)?.project_id;
      const effectiveHolidays = await getEffectiveHolidayDates(projId);

      modPhases.sort((a, b) => new Date(a.internal_start_date).getTime() - new Date(b.internal_start_date).getTime());

      await sb.from('phase_gaps').delete().eq('module_id', modId);

      const newGaps: any[] = [];
      for (let i = 0; i < modPhases.length - 1; i++) {
        const earlier = modPhases[i];
        const later = modPhases[i + 1];
        const rawStepCount = workingDaysBetween(earlier.internal_end_date, later.internal_start_date, effectiveHolidays);
        const gapDays = Math.max(0, rawStepCount > 0 ? rawStepCount - 1 : 0);

        newGaps.push({
          module_id: modId,
          language: 'English',
          earlier_phase_id: earlier.id,
          later_phase_id: later.id,
          working_days_gap: gapDays
        });
      }

      if (newGaps.length > 0) {
        const { error: gapErr } = await sb.from('phase_gaps').insert(newGaps);
        if (gapErr) {
          try {
            const fallbackGaps = newGaps.map(({ working_days_gap, ...rest }) => ({ ...rest, gap_working_days: working_days_gap }));
            await sb.from('phase_gaps').insert(fallbackGaps);
          } catch {}
        }
        updatedCount += newGaps.length;
      }
    }
    return { success: true, updatedCount };
  } catch (err: any) {
    console.error("recalculateAllPhaseGaps error:", err.message);
    return { success: false, updatedCount: 0 };
  }
}

export interface AtRiskPhaseItem {
  phaseId: string;
  phaseName: string;
  projectName: string;
  moduleName: string;
  assignedToName?: string;
  targetDate: string;
  daysDelayed: number;
  downstreamImpactCount: number;
  isInternal: boolean;
}

export interface ProjectPortfolioItem {
  id: string;
  name: string;
  pmName: string;
  progressPct: number;
  nextMilestoneName: string;
  nextMilestoneDate: string;
  health: 'Green' | 'Yellow' | 'Red';
  totalPhasesCount: number;
  completedPhasesCount: number;
}

export interface ExecutiveMetrics {
  activeProjectsCount: number;
  onTrackProjectsCount: number;
  delayedProjectsCount: number;
  highRiskOverdueCount: number;
  deliverablesDueCount: number;
  blackoutWindowCount: number;
  atRiskPhases: AtRiskPhaseItem[];
  portfolio: ProjectPortfolioItem[];
}

export async function fetchExecutiveMetrics(
  currentUser: { email?: string; role?: string; id?: string; employeeId?: string; name?: string } | null,
  timeHorizon: 'week' | 'month' | '30days' = 'month'
): Promise<ExecutiveMetrics> {

  const sb = getSupabase();
  if (!sb) {
    return {
      activeProjectsCount: 0,
      onTrackProjectsCount: 0,
      delayedProjectsCount: 0,
      highRiskOverdueCount: 0,
      deliverablesDueCount: 0,
      blackoutWindowCount: 0,
      atRiskPhases: [],
      portfolio: []
    };
  }

  const formattedUser = (currentUser && currentUser.email && currentUser.role)
    ? { email: currentUser.email, role: currentUser.role, id: currentUser.id, name: currentUser.name }
    : null;


  const res = await fetchAllDashboardData(formattedUser);
  const { projects, courses, modules, phases } = res;


  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Calculate window end date based on timeHorizon
  const windowEndDate = new Date(today);
  if (timeHorizon === 'week') {
    windowEndDate.setDate(today.getDate() + 7);
  } else if (timeHorizon === 'month') {
    windowEndDate.setDate(today.getDate() + 30);
  } else {
    windowEndDate.setDate(today.getDate() + 30);
  }
  const windowEndStr = windowEndDate.toISOString().split('T')[0];

  // 1. Fetch holidays within blackout window (next 14 days)
  const blackoutEnd = new Date(today);
  blackoutEnd.setDate(today.getDate() + 14);
  const blackoutEndStr = blackoutEnd.toISOString().split('T')[0];

  const globalHolidays = await getHolidays();
  const blackoutWindowCount = globalHolidays.filter(h => h.date >= todayStr && h.date <= blackoutEndStr).length;

  // Map courses & modules for quick lookup
  const courseMap = new Map(courses.map(c => [c.id, c]));
  const moduleMap = new Map(modules.map(m => [m.id, m]));
  const projectMap = new Map(projects.map(p => [p.id, p]));

  // Employees lookup
  const employees = await getEmployees();
  const empMap = new Map(employees.map(e => [e.id, e.name]));

  // Group phases by module
  const modulePhasesMap = new Map<string, Phase[]>();
  phases.forEach(p => {
    const list = modulePhasesMap.get(p.moduleId) || [];
    list.push(p);
    modulePhasesMap.set(p.moduleId, list);
  });

  // Calculate At-Risk phases & metrics
  let highRiskOverdueCount = 0;
  let deliverablesDueCount = 0;
  const atRiskPhases: AtRiskPhaseItem[] = [];

  phases.forEach(p => {
    const targetDate = p.internalEndDate || p.clientDate || p.internalStartDate;
    if (!targetDate) return;

    const mod = moduleMap.get(p.moduleId);
    const course = mod ? courseMap.get(mod.courseId) : undefined;
    const project = course ? projectMap.get(course.projectId) : undefined;

    const isOverdue = p.status !== 'Completed' && targetDate < todayStr;
    const isDueInWindow = targetDate >= todayStr && targetDate <= windowEndStr;

    if (isOverdue) {
      highRiskOverdueCount++;

      // Compute days delayed
      const diffMs = today.getTime() - new Date(targetDate).getTime();
      const daysDelayed = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

      // Count downstream sibling phases in module
      const sibs = modulePhasesMap.get(p.moduleId) || [];
      const downstreamImpactCount = sibs.filter(s => s.id !== p.id && s.status !== 'Completed').length;

      atRiskPhases.push({
        phaseId: p.id,
        phaseName: p.phaseName,
        projectName: project?.name || 'General Project',
        moduleName: mod
          ? (mod.code && mod.code.trim().toLowerCase() !== mod.name.trim().toLowerCase()
              ? `${mod.code} - ${mod.name}`
              : mod.name)
          : 'Module',
        assignedToName: p.assignedTo ? empMap.get(p.assignedTo) || 'Assigned Lead' : 'Unassigned',
        targetDate,
        daysDelayed,
        downstreamImpactCount,
        isInternal: !!p.internalEndDate
      });
    }

    if (isDueInWindow && p.status !== 'Completed') {
      deliverablesDueCount++;
    }
  });

  // Build Portfolio items
  let delayedProjectsCount = 0;
  let onTrackProjectsCount = 0;

  const portfolio: ProjectPortfolioItem[] = projects.map(proj => {
    const projCourses = courses.filter(c => c.projectId === proj.id);
    const projCourseIds = new Set(projCourses.map(c => c.id));
    const projModules = modules.filter(m => projCourseIds.has(m.courseId));
    const projModuleIds = new Set(projModules.map(m => m.id));
    const projPhases = phases.filter(p => projModuleIds.has(p.moduleId));

    const totalPhasesCount = projPhases.length;
    const completedPhasesCount = projPhases.filter(p => p.status === 'Completed').length;
    const overdueCount = projPhases.filter(p => p.status !== 'Completed' && ((p.internalEndDate && p.internalEndDate < todayStr) || (p.clientDate && p.clientDate < todayStr))).length;

    const progressPct = totalPhasesCount > 0 ? Math.round((completedPhasesCount / totalPhasesCount) * 100) : 100;

    let health: 'Green' | 'Yellow' | 'Red' = 'Green';
    if (overdueCount > 2) {
      health = 'Red';
      delayedProjectsCount++;
    } else if (overdueCount > 0 || progressPct < 50) {
      health = 'Yellow';
      delayedProjectsCount++;
    } else {
      onTrackProjectsCount++;
    }

    // Find next key milestone
    const upcomingPhases = projPhases
      .filter(p => p.status !== 'Completed' && (p.internalEndDate || p.clientDate))
      .sort((a, b) => {
        const dA = a.internalEndDate || a.clientDate || '9999';
        const dB = b.internalEndDate || b.clientDate || '9999';
        return dA.localeCompare(dB);
      });

    const nextPh = upcomingPhases[0];
    const nextMilestoneName = nextPh ? `${nextPh.phaseName} (${nextPh.phaseType || 'Stage'})` : 'All Completed';
    const nextMilestoneDate = nextPh ? (nextPh.internalEndDate || nextPh.clientDate || todayStr) : todayStr;

    return {
      id: proj.id,
      name: proj.name,
      pmName: proj.ownerId ? empMap.get(proj.ownerId) || 'Project Manager' : 'Operations Lead',
      progressPct,
      nextMilestoneName,
      nextMilestoneDate,
      health,
      totalPhasesCount,
      completedPhasesCount
    };
  });

  return {
    activeProjectsCount: projects.length,
    onTrackProjectsCount,
    delayedProjectsCount,
    highRiskOverdueCount,
    deliverablesDueCount,
    blackoutWindowCount,
    atRiskPhases: atRiskPhases.slice(0, 10), // Top 10 at-risk items
    portfolio
  };
}

export async function quickShiftPhaseDate(
  phaseId: string,
  daysToAdd: number = 3
): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { success: false, error: 'Database client uninitialized' };

  try {
    // 1. Fetch current phase dates
    const { data: vPhase, error: vErr } = await sb
      .from('consolidated_phases_view')
      .select('*')
      .eq('id', phaseId)
      .maybeSingle();

    if (vErr || !vPhase) {
      return { success: false, error: 'Phase record not found.' };
    }

    // Shift internal_end_date or client_date
    if (vPhase.internal_end_date) {
      const d = new Date(vPhase.internal_end_date);
      d.setDate(d.getDate() + daysToAdd);
      const newDateStr = d.toISOString().split('T')[0];

      await sb
        .from('internal_phases')
        .update({ internal_end_date: newDateStr })
        .eq('id', vPhase.internal_phase_id || phaseId);
    } else if (vPhase.client_date) {
      const d = new Date(vPhase.client_date);
      d.setDate(d.getDate() + daysToAdd);
      const newDateStr = d.toISOString().split('T')[0];

      await sb
        .from('client_phases')
        .update({ client_date: newDateStr })
        .eq('id', vPhase.client_phase_id || phaseId);
    }

    return { success: true };
  } catch (err: any) {
    console.error("quickShiftPhaseDate error:", err);
    return { success: false, error: err.message };
  }
}



export async function getPhaseGaps(projectId: string): Promise<PhaseGap[]> {
  const sb = getSupabase();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from('phase_gaps')
      .select('*')
      .eq('project_id', projectId);

    if (error) {
      console.warn("phase_gaps query warning:", error.message);
      return [];
    }

    return (data || []).map(g => ({
      id: g.id,
      projectId: g.project_id,
      earlierPhaseId: g.earlier_phase_id,
      laterPhaseId: g.later_phase_id,
      workingDaysGap: g.working_days_gap || 0,
      createdAt: g.created_at,
      updatedAt: g.updated_at
    }));
  } catch (err) {
    console.error("Error fetching phase_gaps:", err);
    return [];
  }
}

export async function upsertPhaseGap(gap: PhaseGap): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const payload = {
      project_id: gap.projectId,
      earlier_phase_id: gap.earlierPhaseId,
      later_phase_id: gap.laterPhaseId,
      working_days_gap: gap.workingDaysGap,
      updated_at: new Date().toISOString()
    };

    const { error } = await sb
      .from('phase_gaps')
      .upsert(payload, { onConflict: 'project_id,earlier_phase_id,later_phase_id' });

    if (error) {
      console.warn("upsertPhaseGap warning:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Error upserting phase_gap:", err);
    return false;
  }
}

export async function updateCoursePhaseSequence(
  courseId: string | null | undefined,
  orderedPhaseNames: string[],
  table: 'internal_phases' | 'client_phases' = 'internal_phases',
  projectId?: string,
  moduleIdsFilter?: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const sb = getSupabase();
    if (!sb) return { success: false, error: 'Database unavailable' };

    let moduleIds: string[] = moduleIdsFilter || [];
    if (moduleIds.length === 0) {
      if (courseId) {
        const { data: modData } = await sb.from('modules').select('id').eq('course_id', courseId);
        if (modData) moduleIds = modData.map(m => m.id);
      } else if (projectId) {
        const { data: crsData } = await sb.from('courses').select('id').eq('project_id', projectId);
        if (crsData && crsData.length > 0) {
          const cIds = crsData.map(c => c.id);
          const { data: modData } = await sb.from('modules').select('id').in('course_id', cIds);
          if (modData) moduleIds = modData.map(m => m.id);
        }
      }
    }

    if (moduleIds.length === 0) return { success: true };

    for (let idx = 0; idx < orderedPhaseNames.length; idx++) {
      const pName = orderedPhaseNames[idx];
      await sb
        .from(table)
        .update({ phase_sequence: idx + 1 })
        .in('module_id', moduleIds)
        .eq('phase_name', pName);
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function checkProjectHolidaysExist(projectId: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return true;

  try {
    const [globalRes, projRes] = await Promise.all([
      sb.from('global_holidays').select('date', { count: 'exact', head: true }),
      sb.from('project_holidays').select('id', { count: 'exact', head: true }).eq('project_id', projectId)
    ]);

    const globalCount = globalRes.count || 0;
    const projectCount = projRes.count || 0;

    return (globalCount + projectCount) > 0;
  } catch (err) {
    console.error("Error checking holidays:", err);
    return true;
  }
}

export async function checkHolidaysConfigured(projectId: string): Promise<{ globalCount: number; projectCount: number; isConfigured: boolean }> {
  const sb = getSupabase();
  if (!sb) return { globalCount: 1, projectCount: 1, isConfigured: true }; // fallback if no client

  try {
    const [globalRes, projRes] = await Promise.all([
      sb.from('global_holidays').select('date', { count: 'exact', head: true }),
      sb.from('project_holidays').select('id', { count: 'exact', head: true }).eq('project_id', projectId)
    ]);

    const globalCount = globalRes.count || 0;
    const projectCount = projRes.count || 0;
    const isConfigured = globalCount > 0 && projectCount > 0;

    return { globalCount, projectCount, isConfigured };
  } catch (err) {
    console.error("Error checking holidays status:", err);
    return { globalCount: 0, projectCount: 0, isConfigured: false };
  }
}

export async function getClientInternalMappings(projectId: string): Promise<ClientInternalMapping[]> {
  const sb = getSupabase();
  if (!sb || !projectId) return [];

  try {
    const { data, error } = await sb
      .from('client_internal_mappings')
      .select('*')
      .eq('project_id', projectId);

    if (error) {
      console.warn("Failed to fetch client_internal_mappings:", error.message);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      projectId: row.project_id,
      clientPhaseName: row.client_phase_name,
      anchorInternalPhaseName: row.anchor_internal_phase_name,
      anchorPoint: row.anchor_point as 'Start' | 'End',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  } catch (err) {
    console.error("Error in getClientInternalMappings:", err);
    return [];
  }
}

export async function saveClientInternalMappings(
  projectId: string,
  mappings: { clientPhaseName: string; anchorInternalPhaseName: string; anchorPoint: 'Start' | 'End' }[]
): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb || !projectId || mappings.length === 0) return { success: true };

  try {
    const rows = mappings.map(m => ({
      project_id: projectId,
      client_phase_name: m.clientPhaseName,
      anchor_internal_phase_name: m.anchorInternalPhaseName,
      anchor_point: m.anchorPoint
    }));

    const { error } = await sb
      .from('client_internal_mappings')
      .upsert(rows, { onConflict: 'project_id,client_phase_name' });

    if (error) {
      console.error("Error saving client_internal_mappings:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}



export async function savePhaseGaps(
  projectId: string,
  gaps: PhaseGap[]
): Promise<{ success: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb || !projectId || gaps.length === 0) return { success: true };

  try {
    const rows = gaps.map(g => ({
      project_id: projectId,
      earlier_phase_id: g.earlierPhaseId,
      later_phase_id: g.laterPhaseId,
      working_days_gap: g.workingDaysGap,
      gap_type: g.gapType || 'internal_to_internal'
    }));

    const { error } = await sb
      .from('phase_gaps')
      .upsert(rows, { onConflict: 'project_id,earlier_phase_id,later_phase_id' });

    if (error) {
      console.error("Error saving phase_gaps:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}





