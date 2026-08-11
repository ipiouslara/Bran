/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Clock, 
  ChevronRight, 
  ChevronDown, 
  Search,
  Download,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  X
} from 'lucide-react';
import { getSupabase, getEmployees } from '../lib/db';
import { Employee } from '../types';
import { formatDateLocal } from '../utils/workingDays';
import { formatDateDDMMYYYY } from '../utils/dateFormatter';

interface AuditLogEntry {
  id: string;
  actor_id: string;
  action_type: 'upload' | 'date_edit' | 'status_change' | 'assignment' | 'phase_cascade' | 'project_create' | 'project_rename' | 'project_delete' | 'employee_create' | 'employee_edit' | 'employee_delete' | 'ownership_reassign';
  entity_type: 'project' | 'course' | 'module' | 'phase' | 'employee';
  entity_id: string;
  entity_label: string;
  old_value: any;
  new_value: any;
  created_at: string;
  actor_name?: string;
  actor_role?: string;
  target_hierarchy?: string;
  ip_address?: string;
}

interface ActivityLogProps {
  theme: 'dark' | 'light';
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
  refreshTrigger?: number;
}

export default function ActivityLog({ theme, currentUser, refreshTrigger }: ActivityLogProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [phaseMap, setPhaseMap] = useState<Record<string, { projectCode: string; moduleName: string; phaseName: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Filters state
  const [activePreset, setActivePreset] = useState<'today' | '3days' | '5days' | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterActor, setFilterActor] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Expandable row state
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [highlightEventId] = useState<string | null>(() => {
    return sessionStorage.getItem('highlight_audit_event_id');
  });

  useEffect(() => {
    return () => {
      sessionStorage.removeItem('highlight_audit_event_id');
    };
  }, []);

  const applyDatePreset = (preset: 'today' | '3days' | '5days' | 'all') => {
    setActivePreset(preset);
    const now = new Date();
    const todayStr = formatDateLocal(now);

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === '3days') {
      const target = new Date(now);
      target.setDate(target.getDate() - 3);
      setStartDate(formatDateLocal(target));
      setEndDate(todayStr);
    } else if (preset === '5days') {
      const target = new Date(now);
      target.setDate(target.getDate() - 5);
      setStartDate(formatDateLocal(target));
      setEndDate(todayStr);
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  const loadLogsAndActors = async () => {
    setLoading(true);
    setError(null);
    const sb = getSupabase();
    if (!sb) {
      setError("Supabase client not initialized.");
      setLoading(false);
      return;
    }

    try {
      const emps = await getEmployees();
      setEmployees(emps);

      // Fetch projects, courses, modules, client_phases, internal_phases, and consolidated_phases_view
      const [projRes, crsRes, modRes, cRes, iRes, vRes] = await Promise.all([
        sb.from('projects').select('id, name, code'),
        sb.from('courses').select('id, project_id, name, code'),
        sb.from('modules').select('id, course_id, name, code'),
        sb.from('client_phases').select('id, module_id, phase_name'),
        sb.from('internal_phases').select('id, module_id, phase_name'),
        sb.from('consolidated_phases_view').select('id, module_id, phase_name')
      ]);

      const projectMap: Record<string, string> = {};
      (projRes.data || []).forEach((p: any) => {
        if (p?.id) projectMap[p.id] = p.code || p.name || 'PROJECT';
      });

      const courseProjectMap: Record<string, string> = {};
      (crsRes.data || []).forEach((c: any) => {
        if (c?.id) courseProjectMap[c.id] = projectMap[c.project_id] || c.code || c.name || '';
      });

      const moduleInfoMap: Record<string, { projectCode: string; moduleName: string }> = {};
      (modRes.data || []).forEach((m: any) => {
        if (m?.id) {
          const pCode = courseProjectMap[m.course_id] || '';
          const mName = m.name || m.code || '';
          moduleInfoMap[m.id] = { projectCode: pCode, moduleName: mName };
        }
      });

      const newPhaseMap: Record<string, { projectCode: string; moduleName: string; phaseName: string }> = {};

      const mapPhases = (items: any[]) => {
        (items || []).forEach((p: any) => {
          if (!p || !p.id) return;
          const modInfo = moduleInfoMap[p.module_id] || { projectCode: '', moduleName: '' };
          newPhaseMap[p.id] = {
            projectCode: modInfo.projectCode,
            moduleName: modInfo.moduleName,
            phaseName: p.phase_name || ''
          };
        });
      };

      mapPhases(vRes.data || []);
      mapPhases(cRes.data || []);
      mapPhases(iRes.data || []);
      setPhaseMap(newPhaseMap);

      let query = sb
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false });

      const { data: rawLogs, error: logErr } = await query;
      if (logErr) {
        if (logErr.message?.includes('audit_log') || logErr.code === 'PGRST204') {
          setError("The 'public.audit_log' table is not created in Supabase yet. Please execute the migration script in your Supabase SQL Editor.");
          setLogs([]);
          return;
        }
        throw logErr;
      }

      const resolveHierarchy = (log: any): string => {
        const entityId = log.entity_id;
        
        // 1. Check phaseMap lookup directly by entity_id
        if (entityId && newPhaseMap[entityId]) {
          const info = newPhaseMap[entityId];
          const parts = [info.projectCode, info.moduleName, info.phaseName].filter(Boolean);
          if (parts.length > 0) return parts.join(' > ');
        }

        const raw = log.entity_label || '';
        
        // 2. Check if raw label contains a UUID string like "Phase 662c3f1c-c7e2-42ff-8d61-2283c576053a"
        const uuidMatch = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch && newPhaseMap[uuidMatch[0]]) {
          const info = newPhaseMap[uuidMatch[0]];
          const parts = [info.projectCode, info.moduleName, info.phaseName].filter(Boolean);
          if (parts.length > 0) return parts.join(' > ');
        }

        // 3. Check if old_value or new_value has phaseName
        const altName = log.old_value?.phaseName || log.new_value?.phaseName;
        if (altName && typeof altName === 'string' && altName.trim()) {
          const parts = altName.split(/\s+[\/→|-]\s+/).map((p: string) => p.trim()).filter(Boolean);
          if (parts.length > 1) return parts.join(' > ');
          return altName;
        }

        if (!raw) return 'System';

        // 4. Split by standard separators
        const parts = raw.split(/\s+[\/→|-]\s+/).map((p: string) => p.trim()).filter(Boolean);
        if (parts.length > 1) {
          return parts.join(' > ');
        }

        return raw;
      };

      const mappedLogs: AuditLogEntry[] = (rawLogs || []).map(log => {
        const emp = emps.find(e => e.id === log.actor_id);
        return {
          ...log,
          actor_name: emp ? emp.name : (log.actor_name || 'System Admin'),
          actor_role: emp ? (emp.role || 'Admin') : 'Admin',
          target_hierarchy: resolveHierarchy(log)
        };
      });

      setLogs(mappedLogs);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load activity logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogsAndActors();
  }, [refreshTrigger, refreshCounter]);

  // Handle Action Badges
  const getActionBadgeInfo = (actionType: string) => {
    switch (actionType) {
      case 'upload':
      case 'project_create':
      case 'employee_create':
        return {
          label: actionType === 'upload' ? 'Ingestion Upload' : actionType === 'project_create' ? 'Project Create' : 'Register Employee',
          color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
        };
      case 'date_edit':
      case 'phase_cascade':
      case 'status_change':
      case 'assignment':
      case 'ownership_reassign':
      case 'employee_edit':
      case 'project_rename':
        return {
          label: actionType === 'date_edit' ? 'Timeline Shift' : actionType === 'phase_cascade' ? 'Cascade Shift' : actionType === 'status_change' ? 'Status Update' : actionType === 'assignment' ? 'Resource Assign' : actionType === 'ownership_reassign' ? 'Owner Reassign' : 'Update',
          color: 'bg-[#2484C6]/15 text-[#2484C6] border border-[#2484C6]/30'
        };
      case 'project_delete':
      case 'employee_delete':
        return {
          label: actionType === 'project_delete' ? 'Delete Project' : 'Delete Employee',
          color: 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
        };
      default:
        return {
          label: actionType.replace(/_/g, ' ').toUpperCase(),
          color: 'bg-neutral-800 text-neutral-300 border border-neutral-700'
        };
    }
  };

  const getRoleBadgeColor = (role?: string) => {
    switch ((role || '').toLowerCase()) {
      case 'admin':
      case 'system admin':
        return 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30';
      case 'project manager':
      case 'manager':
      case 'pm':
        return 'bg-purple-500/15 text-purple-400 border border-purple-500/30';
      case 'lead':
        return 'bg-sky-500/15 text-sky-400 border border-sky-500/30';
      default:
        return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    }
  };

  // Grouping and Filtering logic
  const filteredAndGroupedLogs = useMemo(() => {
    let temp = logs;

    if (filterCategory !== 'all') {
      if (filterCategory === 'ingestion') {
        temp = temp.filter(l => l.action_type === 'upload');
      } else if (filterCategory === 'timeline_shift') {
        temp = temp.filter(l => ['date_edit', 'phase_cascade', 'status_change'].includes(l.action_type));
      } else if (filterCategory === 'user_management') {
        temp = temp.filter(l => ['employee_create', 'employee_edit', 'employee_delete', 'ownership_reassign', 'assignment'].includes(l.action_type));
      } else if (filterCategory === 'project_governance') {
        temp = temp.filter(l => ['project_create', 'project_rename', 'project_delete'].includes(l.action_type));
      }
    }

    if (filterActor !== 'all') {
      temp = temp.filter(l => l.actor_id === filterActor);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      temp = temp.filter(l =>
        (l.target_hierarchy || '').toLowerCase().includes(q) ||
        (l.entity_label || '').toLowerCase().includes(q) ||
        (l.actor_name || '').toLowerCase().includes(q) ||
        (l.actor_role || '').toLowerCase().includes(q) ||
        (l.action_type || '').toLowerCase().includes(q) ||
        (l.created_at || '').toLowerCase().includes(q) ||
        (l.actor_id || '').toLowerCase().includes(q)
      );
    }

    if (startDate) {
      const startLimit = new Date(startDate).getTime();
      temp = temp.filter(l => new Date(l.created_at).getTime() >= startLimit);
    }
    if (endDate) {
      const endLimit = new Date(endDate).getTime() + 86399999;
      temp = temp.filter(l => new Date(l.created_at).getTime() <= endLimit);
    }

    const resolveDynamicHierarchy = (log: any): string => {
      const entityId = log.entity_id;
      if (entityId && phaseMap[entityId]) {
        const info = phaseMap[entityId];
        const parts = [info.projectCode, info.moduleName, info.phaseName].filter(Boolean);
        if (parts.length > 0) return parts.join(' > ');
      }
      const raw = log.entity_label || '';
      const uuidMatch = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (uuidMatch && phaseMap[uuidMatch[0]]) {
        const info = phaseMap[uuidMatch[0]];
        const parts = [info.projectCode, info.moduleName, info.phaseName].filter(Boolean);
        if (parts.length > 0) return parts.join(' > ');
      }
      const altName = log.old_value?.phaseName || log.new_value?.phaseName;
      if (altName && typeof altName === 'string' && altName.trim()) {
        const parts = altName.split(/\s+[\/→|-]\s+/).map((p: string) => p.trim()).filter(Boolean);
        if (parts.length > 1) return parts.join(' > ');
        return altName;
      }
      return log.target_hierarchy || raw || 'System';
    };

    // Group cascade events sharing same actor_id within a 60s time window
    const cascadeGroups: {
      trigger: AuditLogEntry | null;
      cascades: AuditLogEntry[];
      timestamp: string;
      actor_name: string;
      actor_id: string;
    }[] = [];
    const list: (AuditLogEntry & { isGroupTrigger?: boolean; cascadesCount?: number; groupKey?: string; cascadedPhases?: AuditLogEntry[] })[] = [];

    temp.forEach(log => {
      if (log.action_type === 'phase_cascade' || log.action_type === 'date_edit') {
        const logTime = new Date(log.created_at).getTime();
        let existingGroup = cascadeGroups.find(g =>
          g.actor_id === log.actor_id &&
          Math.abs(new Date(g.timestamp).getTime() - logTime) < 60000
        );

        if (!existingGroup) {
          existingGroup = {
            trigger: null,
            cascades: [],
            timestamp: log.created_at,
            actor_name: log.actor_name || 'System Admin',
            actor_id: log.actor_id
          };
          cascadeGroups.push(existingGroup);
        }

        if (log.action_type === 'date_edit') {
          existingGroup.trigger = log;
        } else {
          existingGroup.cascades.push(log);
        }
      } else {
        list.push(log);
      }
    });

    cascadeGroups.forEach((group, idx) => {
      const mainLog = group.trigger || group.cascades[0];
      const sideCascades = group.trigger ? group.cascades : group.cascades.slice(1);

      if (mainLog) {
        list.push({
          ...mainLog,
          action_type: group.trigger ? 'date_edit' : 'phase_cascade',
          entity_label: mainLog.entity_label || `${sideCascades.length + 1} phases shifted`,
          isGroupTrigger: sideCascades.length > 0,
          cascadesCount: sideCascades.length,
          groupKey: `cascade-group-${idx}-${mainLog.id}`,
          target_hierarchy: resolveDynamicHierarchy(mainLog),
          cascadedPhases: sideCascades.map(sc => ({
            ...sc,
            target_hierarchy: resolveDynamicHierarchy(sc)
          }))
        });
      }
    });

    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [logs, filterCategory, filterActor, searchQuery, startDate, endDate, phaseMap]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExportLogs = () => {
    if (filteredAndGroupedLogs.length === 0) return;
    const headers = [
      'Timestamp',
      'User Name',
      'Role',
      'Action Category',
      'Target Hierarchy',
      'Changes / Delta',
      'Shift Offset'
    ];

    const rows = filteredAndGroupedLogs.map(l => {
      const ts = new Date(l.created_at).toLocaleString();
      const userName = l.actor_name || 'System Admin';
      const role = l.actor_role || 'Admin';
      const badge = getActionBadgeInfo(l.action_type);
      const actionCategory = badge.label;
      const targetHierarchy = l.target_hierarchy || l.entity_label || 'System';

      let changesText = '';
      if (l.old_value !== null || l.new_value !== null) {
        const oldS = typeof l.old_value === 'object' ? JSON.stringify(l.old_value) : String(l.old_value || '');
        const newS = typeof l.new_value === 'object' ? JSON.stringify(l.new_value) : String(l.new_value || '');
        changesText = `${oldS} -> ${newS}`;
      } else {
        changesText = l.entity_label || 'System Action';
      }

      const offsetText = l.isGroupTrigger ? `${l.cascadesCount || 0} Cascaded Shifts` : 'Direct Action';

      return [
        `"${ts}"`,
        `"${userName.replace(/"/g, '""')}"`,
        `"${role.replace(/"/g, '""')}"`,
        `"${actionCategory.replace(/"/g, '""')}"`,
        `"${targetHierarchy.replace(/"/g, '""')}"`,
        `"${changesText.replace(/"/g, '""')}"`,
        `"${offsetText.replace(/"/g, '""')}"`
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `audit_log_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const extractDateString = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val;
      return val;
    }
    if (typeof val === 'object') {
      const d = val.clientDate || val.client || val.internalStartDate || val.start || val.internalEndDate || val.end;
      if (d && typeof d === 'string') return d;
    }
    return '';
  };

  const formatDateCell = (val: any): string => {
    const dateStr = extractDateString(val);
    if (!dateStr) return '-';
    return formatDateDDMMYYYY(dateStr);
  };

  const renderValueCell = (val: any) => {
    if (val === null || val === undefined) return <span className="text-neutral-500 italic">-</span>;
    if (typeof val === 'object') {
      const parts: string[] = [];
      if (val.clientDate || val.client) {
        parts.push(`Client: ${formatDateDDMMYYYY(val.clientDate || val.client)}`);
      }
      if (val.start || val.internalStartDate || val.end || val.internalEndDate) {
        const s = formatDateDDMMYYYY(val.start || val.internalStartDate);
        const e = formatDateDDMMYYYY(val.end || val.internalEndDate);
        parts.push(`Internal: ${s} to ${e}`);
      }

      if (parts.length > 0) {
        return (
          <span className="font-mono text-neutral-200 bg-neutral-900/90 px-2 py-0.5 rounded border border-neutral-800 text-[10px]">
            {parts.join(' | ')}
          </span>
        );
      }

      return (
        <pre className="text-[10px] leading-relaxed max-w-xs overflow-x-auto p-1.5 rounded-md border border-neutral-800 bg-neutral-950 text-neutral-300 font-mono">
          {JSON.stringify(val, null, 2)}
        </pre>
      );
    }
    return <span className="font-mono text-neutral-300">{String(val)}</span>;
  };

  const renderFormattedChanges = (log: AuditLogEntry) => {
    const oldVal = log.old_value;
    const newVal = log.new_value;

    if (oldVal === null && newVal === null) {
      return <span className="text-[var(--text-muted)] text-xs font-medium">{log.entity_label || 'System Action'}</span>;
    }

    const oldStr = formatDateCell(oldVal);
    const newStr = formatDateCell(newVal);

    if (oldStr !== '-' && newStr !== '-') {
      return (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-mono text-[var(--text-muted)] bg-[var(--input-bg)] px-2 py-0.5 rounded border border-[var(--border-subtle)] text-[11px]">
            {oldStr}
          </span>
          <span className="text-[var(--text-muted)] font-bold">➔</span>
          <span className="font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 text-[11px] font-semibold">
            {newStr}
          </span>
        </div>
      );
    }

    return renderValueCell(newVal || oldVal || log.entity_label);
  };

  const renderTargetBreadcrumb = (hierarchyStr?: string) => {
    if (!hierarchyStr) return <span className="text-[var(--text-muted)] italic">System</span>;
    const parts = hierarchyStr.split(/\s*>\s*/).map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return <span className="text-[var(--text-main)] font-semibold">{hierarchyStr}</span>;

    return (
      <div className="flex items-center gap-1.5 text-xs flex-wrap">
        {parts.map((p, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <span className="text-[var(--text-muted)] opacity-60 text-[10px]">›</span>}
            <span className={idx === 0 ? "font-bold text-[#2484C6]" : idx === parts.length - 1 ? "font-semibold text-[var(--text-main)]" : "text-[var(--text-muted)]"}>
              {p}
            </span>
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <div id="audit-log-page" className="-mt-6 space-y-6 animate-fade-up bg-[var(--bg-page)] text-[var(--text-main)] transition-colors duration-150">
      {/* ── 1. Minimalist Title & Filters Header Bar (Matching Overview Page) ── */}
      <div className="h-[52px] flex items-center justify-between border-b border-[var(--border-subtle)] px-0 gap-4">
        {/* Left Section: Title + Date Range Presets + Category Dropdown + Search */}
        <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
          <h1 className={`text-2xl font-black tracking-tight shrink-0 ${theme === 'light' ? 'bg-gradient-to-r from-[#1DAA58] to-[#2484C6] bg-clip-text text-transparent' : 'text-white'}`}>Audit Log</h1>

          {/* Quick Date Range Pills */}
          <div className="flex items-center gap-1 bg-[var(--input-bg)] p-1 rounded-lg border border-[var(--border-subtle)] shrink-0 relative">
            {(['today', '3days', '5days', 'all'] as const).map((p) => {
              const isActive = activePreset === p;
              return (
                <button
                  key={p}
                  onClick={() => applyDatePreset(p)}
                  className={`relative px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    isActive
                      ? 'text-[var(--text-main)] font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activity-preset-active-pill"
                      className="absolute inset-0 rounded-md bg-[var(--bg-card)] shadow-xs border border-[var(--border-subtle)]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">
                    {p === 'today' ? 'Today' : p === '3days' ? 'Last 3 Days' : p === '5days' ? 'Last 5 Days' : 'All Days'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Action Category Selector Dropdown */}
          <div className="relative shrink-0">
            <select
              aria-label="Filter by Action Category"
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg bg-[var(--input-bg)] border border-[var(--border-subtle)] text-[var(--text-main)] focus:ring-1 focus:ring-[#2484C6] focus:outline-hidden cursor-pointer font-semibold"
            >
              <option value="all">All Actions</option>
              <option value="ingestion">Ingestion Uploads</option>
              <option value="timeline_shift">Timeline Shifts</option>
              <option value="user_management">User Management</option>
              <option value="project_governance">Project Governance</option>
            </select>
          </div>

          {/* Compact Search Bar */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search user, role, project code (e.g. CUS26E)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:ring-1 focus:ring-[#1DAA58] transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Section: Export Logs & Refresh Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportLogs}
            disabled={filteredAndGroupedLogs.length === 0}
            className="px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40 text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            title="Export filtered logs to CSV"
          >
            <Download className="w-3.5 h-3.5 text-[#2484C6]" />
            <span>Export Logs</span>
          </button>

          <button
            onClick={() => setRefreshCounter(prev => prev + 1)}
            className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold shadow-xs"
            title="Reload audit records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ── 2. Audit Records Table Container ── */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-xl overflow-hidden">
        {!loading && filteredAndGroupedLogs.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)] border border-dashed rounded-xl border-[var(--border-subtle)] m-6">
            <ShieldCheck className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-50" />
            <p className="text-xs font-semibold text-[var(--text-muted)]">No audit trail records match the chosen search or filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[var(--input-bg)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-wider font-semibold text-[10px]">
                  <th className="p-3.5 w-44">USER NAME</th>
                  <th className="p-3.5 w-32">ROLE</th>
                  <th className="p-3.5 w-36">ACTION CATEGORY</th>
                  <th className="p-3.5 w-56">TARGET ENTITY</th>
                  <th className="p-3.5">DESCRIPTION / CHANGES</th>
                  <th className="p-3.5 w-44 text-right">TIMESTAMP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredAndGroupedLogs.map((log) => {
                  const badge = getActionBadgeInfo(log.action_type);
                  const roleBadgeColor = getRoleBadgeColor(log.actor_role);
                  const isExpanded = log.groupKey ? expandedGroups[log.groupKey] : false;
                  const isHighlighted = log.id === highlightEventId;

                  return (
                    <React.Fragment key={log.id}>
                      <tr className={`transition-colors ${
                        isHighlighted
                          ? 'bg-amber-500/15 border-amber-500/40'
                          : 'hover:bg-[var(--bg-card-hover)]'
                      }`}>
                        {/* 1. USER NAME - Plain text, NO avatar icons/symbols */}
                        <td className="p-3.5 font-bold text-[var(--text-main)] whitespace-nowrap text-xs">
                          {log.actor_name || 'System Admin'}
                        </td>

                        {/* 2. ROLE - Dedicated Role Badge Column */}
                        <td className="p-3.5 whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${roleBadgeColor}`}>
                            {log.actor_role || 'Admin'}
                          </span>
                        </td>

                        {/* 3. ACTION CATEGORY */}
                        <td className="p-3.5 whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${badge.color}`}>
                            {badge.label}
                          </span>
                        </td>

                        {/* 4. TARGET ENTITY - Breadcrumb Hierarchy */}
                        <td className="p-3.5 font-medium">
                          {renderTargetBreadcrumb(log.target_hierarchy)}
                        </td>

                        {/* 5. DESCRIPTION / CHANGES */}
                        <td className="p-3.5">
                          <div className="space-y-1">
                            {renderFormattedChanges(log)}

                            {log.isGroupTrigger && (
                              <button
                                onClick={() => log.groupKey && toggleGroup(log.groupKey)}
                                className="flex items-center gap-1 text-[11px] text-[#2484C6] hover:underline font-bold mt-1.5 cursor-pointer"
                              >
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                <span>
                                  {log.cascadesCount} cascaded phase shift(s) — click to {isExpanded ? 'collapse' : 'expand'}
                                </span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 6. TIMESTAMP - Far Right Corner */}
                        <td className="p-3.5 text-right text-[var(--text-muted)] whitespace-nowrap font-mono text-[11px]">
                          <div className="flex items-center justify-end gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                            <span>{new Date(log.created_at).toLocaleString()}</span>
                          </div>
                        </td>
                      </tr>

                      {/* Interactive Cascading Expansion Sub-Table */}
                      {log.isGroupTrigger && isExpanded && (
                        <tr className="bg-[var(--input-bg)] border-b border-[var(--border-subtle)]">
                          <td colSpan={6} className="p-3 pl-8">
                            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden shadow-sm">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="bg-[var(--input-bg)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-wider font-semibold text-[10px]">
                                    <th className="p-2.5">Affected Downstream Phase</th>
                                    <th className="p-2.5">Previous Date</th>
                                    <th className="p-2.5">New Cascaded Date</th>
                                    <th className="p-2.5 text-right">Offset Delta</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-subtle)]">
                                  {log.cascadedPhases?.map((cascade) => {
                                    const oldD = formatDateCell(cascade.old_value);
                                    const newD = formatDateCell(cascade.new_value);
                                    return (
                                      <tr key={cascade.id} className="hover:bg-[var(--bg-card-hover)] transition-colors">
                                        <td className="p-2.5 font-medium text-[var(--text-main)]">
                                          {renderTargetBreadcrumb(cascade.target_hierarchy)}
                                        </td>
                                        <td className="p-2.5 font-mono text-[var(--text-muted)]">{oldD}</td>
                                        <td className="p-2.5 font-mono text-emerald-500 font-semibold">{newD}</td>
                                        <td className="p-2.5 text-right">
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#2484C6]/15 text-[#2484C6] border border-[#2484C6]/30">
                                            Cascaded Shift
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
