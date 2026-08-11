import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { Briefcase, Edit2, Trash2, Save, X, RefreshCw, AlertCircle, Check, Users, UserPlus, Calendar, Globe, Plus, ExternalLink, FolderKanban, Search } from 'lucide-react';
import { Project, Course, Module, Phase, Employee } from '../types';
import TableSkeleton from './skeletons/TableSkeleton';
import ProjectHolidayModal from './ProjectHolidayModal';
import GlobalHolidaysModal from './GlobalHolidaysModal';
import { formatDateDDMMYYYY } from '../utils/dateFormatter';
import { 
  getSupabase, 
  getEmployees, 
  writeAuditLog, 
  claimProjectOwnership, 
  deleteProject,
  getProjectLeadAssignments,
  assignLeadToProject,
  removeLeadFromProject,
  ProjectLeadAssignment
} from '../lib/db';

interface ProjectManagementProps {
  theme: 'dark' | 'light';
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
  refreshTrigger?: number;
  onProjectsChanged?: () => void;
  onNavigateToProjectEditor?: (projectId: string) => void;
}

export default function ProjectManagement({
  theme,
  currentUser,
  refreshTrigger = 0,
  onProjectsChanged,
  onNavigateToProjectEditor
}: ProjectManagementProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [pmsList, setPmsList] = useState<Employee[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Search & Status Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'on_hold'>('all');

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const [reassigningProjectId, setReassigningProjectId] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState('');

  const [selectedHolidayProject, setSelectedHolidayProject] = useState<Project | null>(null);
  const [showGlobalModal, setShowGlobalModal] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const handleCloseHolidayModal = React.useCallback(() => {
    setSelectedHolidayProject(null);
  }, []);

  const [assignLeadProject, setAssignLeadProject] = useState<Project | null>(null);
  const [allLeads, setAllLeads] = useState<Employee[]>([]);
  const [projectLeadAssignments, setProjectLeadAssignments] = useState<ProjectLeadAssignment[]>([]);
  const [selectedLeadIdToAssign, setSelectedLeadIdToAssign] = useState('');
  const [assigningLeadBusy, setAssigningLeadBusy] = useState(false);

  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [cascadeCounts, setCascadeCounts] = useState({ courses: 0, modules: 0, phases: 0 });

  const isAdminOrPM = currentUser?.role === 'Admin' || currentUser?.role === 'Project Manager';

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error("Supabase client is not initialized.");

      const emps = await getEmployees();
      const pms = emps.filter(e => e.role === 'Project Manager' || e.role === 'Admin');
      const leads = emps.filter(e => e.role === 'Lead');
      setPmsList(pms);
      setAllLeads(leads);

      const [projRes, crsRes, modRes, phRes, leadAssns] = await Promise.all([
        sb.from('projects').select('*').order('created_at', { ascending: false }),
        sb.from('courses').select('*'),
        sb.from('modules').select('*'),
        sb.from('consolidated_phases_view').select('*'),
        getProjectLeadAssignments()
      ]);

      if (projRes.error) throw projRes.error;
      if (crsRes.error) throw crsRes.error;
      if (modRes.error) throw modRes.error;
      if (phRes.error) throw phRes.error;

      setProjectLeadAssignments(leadAssns);

      const rawProjects: Project[] = (projRes.data || []).map(p => ({
        id: p.id,
        name: p.name,
        ownerId: p.owner_id || undefined,
        createdAt: p.created_at
      }));

      const rawCourses: Course[] = (crsRes.data || []).map(c => ({
        id: c.id,
        projectId: c.project_id,
        name: c.name,
        code: c.code
      }));

      const rawModules: Module[] = (modRes.data || []).map(m => ({
        id: m.id,
        courseId: m.course_id,
        name: m.name,
        code: m.code
      }));

      const rawPhases: Phase[] = (phRes.data || []).map(ph => ({
        id: ph.id,
        moduleId: ph.module_id,
        phaseName: ph.phase_name,
        phaseType: ph.phase_type,
        phaseTypePhase: ph.phase_type_phase,
        clientDate: ph.client_date,
        internalStartDate: ph.internal_start_date,
        internalEndDate: ph.internal_end_date,
        sourceFileRef: ph.source_file_ref,
        sourceFile: ph.client_date ? 'Client' : 'Internal',
        assignedTo: ph.assigned_to,
        status: ph.status
      }));

      setProjects(rawProjects);
      setCourses(rawCourses);
      setModules(rawModules);
      setPhases(rawPhases);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load project database information.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [refreshCounter, refreshTrigger]);

  const handleCreateProject = async () => {
    const trimmedName = newProjectName.trim();
    if (!trimmedName) return;
    const sb = getSupabase();
    if (!sb) return;

    try {
      setCreatingProject(true);
      setError(null);

      // Check if a project with this name already exists
      const existing = projects.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
      if (existing) {
        const ownerName = getOwnerName(existing.ownerId);
        if (currentUser?.role === 'Project Manager') {
          setError(`Project "${trimmedName}" already exists and is owned by ${ownerName}. You cannot create a duplicate project.`);
          setCreatingProject(false);
          return;
        } else if (currentUser?.role === 'Admin') {
          const confirmClaim = window.confirm(
            `Project "${trimmedName}" already exists (Owned by ${ownerName}). Do you want to claim ownership of this existing project?`
          );
          if (confirmClaim) {
            await claimProjectOwnership(existing.id, currentUser.id || '');
            setNewProjectName('');
            setShowCreateModal(false);
            await loadData();
            if (onProjectsChanged) onProjectsChanged();
            return;
          } else {
            setError(`Project creation cancelled: "${trimmedName}" already exists.`);
            setCreatingProject(false);
            return;
          }
        }
      }

      const { data: newProj, error: createErr } = await sb
        .from('projects')
        .insert({
          name: trimmedName,
          owner_id: currentUser?.id || null
        })
        .select('*')
        .single();

      if (createErr) throw createErr;

      await writeAuditLog({
        actionType: 'create_project',
        entityType: 'project',
        entityId: newProj.id,
        entityLabel: newProj.name,
        oldValue: null,
        newValue: { name: newProj.name }
      });

      setNewProjectName('');
      setShowCreateModal(false);
      await loadData();
      if (onProjectsChanged) onProjectsChanged();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create project.');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleRename = async (projectId: string) => {
    if (!editName.trim()) return;
    try {
      setLoading(true);
      const sb = getSupabase();
      if (!sb) return;

      const origProj = projects.find(p => p.id === projectId);
      const { error: err } = await sb
        .from('projects')
        .update({ name: editName.trim() })
        .eq('id', projectId);

      if (err) throw err;

      if (origProj) {
        await writeAuditLog({
          actionType: 'project_rename',
          entityType: 'project',
          entityId: projectId,
          entityLabel: editName.trim(),
          oldValue: { name: origProj.name },
          newValue: { name: editName.trim() }
        });
      }

      setEditingProjectId(null);
      setEditName('');
      setRefreshCounter(prev => prev + 1);
      if (onProjectsChanged) onProjectsChanged();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to rename project.");
      setLoading(false);
    }
  };

  const handleReassignOwner = async (projectId: string, newOwnerId: string) => {
    try {
      setLoading(true);
      await claimProjectOwnership(projectId, newOwnerId);
      setReassigningProjectId(null);
      setSelectedOwnerId('');
      setRefreshCounter(prev => prev + 1);
      if (onProjectsChanged) onProjectsChanged();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to reassign project owner.");
      setLoading(false);
    }
  };

  const triggerDeleteConfirm = (project: Project) => {
    const projectCourses = courses.filter(c => c.projectId === project.id);
    const courseIds = projectCourses.map(c => c.id);
    const projectModules = modules.filter(m => courseIds.includes(m.courseId));
    const moduleIds = projectModules.map(m => m.id);
    const projectPhases = phases.filter(ph => moduleIds.includes(ph.moduleId));

    setCascadeCounts({
      courses: projectCourses.length,
      modules: projectModules.length,
      phases: projectPhases.length
    });
    setDeletingProject(project);
  };

  const handleConfirmDelete = async () => {
    if (!deletingProject) return;
    try {
      setLoading(true);
      await deleteProject(deletingProject.id);
      setDeletingProject(null);
      setRefreshCounter(prev => prev + 1);
      if (onProjectsChanged) onProjectsChanged();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to delete project.");
      setLoading(false);
    }
  };

  const getProjectCoursesCount = (projId: string) => courses.filter(c => c.projectId === projId).length;
  const getProjectModulesCount = (projId: string) => {
    const projCourses = courses.filter(c => c.projectId === projId).map(c => c.id);
    return modules.filter(m => projCourses.includes(m.courseId)).length;
  };
  const getProjectPhasesSummary = (projId: string) => {
    const projCourses = courses.filter(c => c.projectId === projId).map(c => c.id);
    const projModules = modules.filter(m => projCourses.includes(m.courseId)).map(m => m.id);
    const rawPhases = phases.filter(ph => projModules.includes(ph.moduleId));

    // Deduplicate phases so start date, end date, and client date for the same phase entry are counted as 1 phase
    const uniquePhaseMap = new Map<string, Phase>();
    rawPhases.forEach(p => {
      const key = `${p.moduleId}_${(p.phaseName || '').trim().toLowerCase()}_${(p.phaseType || '').trim().toLowerCase()}`;
      if (!uniquePhaseMap.has(key)) {
        uniquePhaseMap.set(key, p);
      } else {
        const existing = uniquePhaseMap.get(key)!;
        // Merge completed status if any entry is completed
        if (p.status === 'Completed') {
          uniquePhaseMap.set(key, { ...existing, status: 'Completed' });
        }
      }
    });

    const uniquePhases = Array.from(uniquePhaseMap.values());
    const total = uniquePhases.length;
    const completed = uniquePhases.filter(p => p.status === 'Completed').length;
    const pending = total - completed;
    const onTrackPct = total > 0 ? Math.round((completed / total) * 100) : 100;
    return { pending, completed, total, onTrackPct };
  };

  const getOwnerName = (ownerId?: string) => {
    if (!ownerId) return 'Orphaned';
    const found = pmsList.find(p => p.id === ownerId);
    return found ? found.name : 'Unknown';
  };

  const isPMOnly = currentUser?.role === 'Project Manager';

  const filteredProjects = useMemo(() => {
    return projects.filter(project => {
      // 1. PM role restriction: only show projects owned by this PM
      if (isPMOnly && project.ownerId !== currentUser?.id) {
        return false;
      }

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || project.name.toLowerCase().includes(q) || project.id.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      const stats = getProjectPhasesSummary(project.id);
      if (statusFilter === 'active') return stats.onTrackPct < 100 && stats.total > 0;
      if (statusFilter === 'completed') return stats.onTrackPct === 100 && stats.total > 0;
      if (statusFilter === 'on_hold') return stats.total === 0;
      return true;
    });
  }, [projects, searchQuery, statusFilter, courses, modules, phases, currentUser, isPMOnly]);

  return (
    <div id="project-management" className="-mt-6 space-y-6 animate-fade-up bg-[var(--bg-page)] text-[var(--text-main)] transition-colors duration-150">
      {/* 1. Header & Title Bar matching Overview layout */}
      <div className="min-h-[52px] py-2 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)]">
        {/* Left Section: Title + Quick Filters + Compact Search */}
        <div className="flex flex-wrap items-center gap-4">
          <h1 className={`text-2xl font-black tracking-tight ${theme === 'light' ? 'bg-gradient-to-r from-[#1DAA58] to-[#2484C6] bg-clip-text text-transparent' : 'text-white'}`}>Projects</h1>

          {/* Inline Quick Filter Pills */}
          <div className="flex items-center gap-1 bg-[var(--input-bg)] p-1 rounded-lg border border-[var(--border-subtle)] overflow-x-auto relative">
            {[
              { id: 'all', label: 'All Projects' },
              { id: 'active', label: 'Active' },
              { id: 'completed', label: 'Completed' },
              { id: 'on_hold', label: 'On Hold' }
            ].map(tab => {
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id as any)}
                  className={`relative px-3 py-1 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                    isActive
                      ? 'text-[var(--text-main)] font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="projects-status-active-pill"
                      className="absolute inset-0 rounded-md bg-[var(--bg-card)] shadow-xs border border-[var(--border-subtle)]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Compact Inline Search Bar */}
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:ring-1 focus:ring-[#1DAA58] transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Section: Action Buttons */}
        <div className="flex items-center gap-2.5">
          {isAdminOrPM && (
            <button
              onClick={() => setShowGlobalModal(true)}
              className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            >
              <Globe className="w-3.5 h-3.5 text-[#008DA5]" />
              <span>Global Holidays</span>
            </button>
          )}

          {isAdminOrPM && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-1.5 bg-gradient-to-r from-[#1DAA58] to-[#2484C6] text-white font-medium text-xs rounded-lg shadow-md hover:opacity-90 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Project</span>
            </button>
          )}

          <button
            disabled={isRefreshing || loading}
            onClick={async () => {
              setIsRefreshing(true);
              await loadData();
              setIsRefreshing(false);
            }}
            className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
            title="Refresh projects list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin-linear text-[#1DAA58]' : ''}`} />
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

      {/* Main Table Container in Dual-Theme Variable Styling */}
      <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xl overflow-hidden transition-colors">
        {!loading && filteredProjects.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)] border border-dashed rounded-xl border-[var(--border-subtle)] m-6">
            <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-40 text-[#1DAA58]" />
            <p className="text-xs font-semibold text-[var(--text-muted)]">No project scopes match your search or filter parameters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[var(--input-bg)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-wider font-semibold text-[10px]">
                  <th className="p-4">Project Name</th>
                  {currentUser?.role !== 'Project Manager' && <th className="p-4">Owner</th>}
                  <th className="p-4">Courses / Modules</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Holidays</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredProjects.map(project => {
                  const cCount = getProjectCoursesCount(project.id);
                  const mCount = getProjectModulesCount(project.id);
                  const stats = getProjectPhasesSummary(project.id);
                  const canManage = currentUser?.role === 'Admin' || (currentUser?.role === 'Project Manager' && project.ownerId === currentUser.id);

                  return (
                    <tr
                      key={project.id}
                      className="hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer group"
                      onClick={() => {
                        if (onNavigateToProjectEditor) {
                          onNavigateToProjectEditor(project.id);
                        }
                      }}
                    >
                      <td className="p-4 font-semibold text-[var(--text-main)]">
                        {editingProjectId === project.id ? (
                          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              className="px-2 py-1 text-xs rounded-md bg-neutral-800 text-white border border-neutral-700 focus:outline-none focus:ring-1 focus:ring-[#1DAA58]"
                            />
                            <button
                              onClick={() => handleRename(project.id)}
                              className="p-1 hover:bg-emerald-500/20 text-emerald-400 rounded"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingProjectId(null)}
                              className="p-1 hover:bg-rose-500/20 text-rose-400 rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="group-hover:text-[#1DAA58] transition-colors">{project.name}</span>
                          </div>
                        )}
                      </td>

                      {currentUser?.role !== 'Project Manager' && (
                        <td className="p-4 text-slate-900 dark:text-neutral-300 font-medium" onClick={e => e.stopPropagation()}>
                          {reassigningProjectId === project.id ? (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={selectedOwnerId}
                                onChange={e => setSelectedOwnerId(e.target.value)}
                                className="px-2 py-1 text-xs rounded-md bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:ring-1 focus:ring-[#1DAA58]"
                              >
                                <option value="">Select PM</option>
                                {pmsList.map(pm => (
                                  <option key={pm.id} value={pm.id}>{pm.name}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleReassignOwner(project.id, selectedOwnerId)}
                                className="p-1 hover:bg-emerald-500/20 text-emerald-400 rounded"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setReassigningProjectId(null)}
                                className="p-1 hover:bg-rose-500/20 text-rose-400 rounded"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span>{getOwnerName(project.ownerId)}</span>
                              {currentUser?.role === 'Admin' && (
                                <button
                                  onClick={() => {
                                    setReassigningProjectId(project.id);
                                    setSelectedOwnerId(project.ownerId || '');
                                  }}
                                  className="text-[10px] text-[#1DAA58] hover:underline cursor-pointer font-medium"
                                >
                                  (Reassign)
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )}

                      <td className="p-4 text-slate-900 dark:text-neutral-400 font-medium">
                        <span className="font-bold text-[var(--text-main)]">{cCount}</span> courses / <span className="font-bold text-[var(--text-main)]">{mCount}</span> modules
                      </td>

                      <td className="p-4">
                        <div className="w-36 space-y-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-slate-900 dark:text-neutral-400">{stats.completed} / {stats.total} Completed</span>
                            <span className="text-[#1DAA58]">{stats.onTrackPct}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-neutral-800 overflow-hidden border border-[var(--border-subtle)]">
                            <div
                              className="h-full bg-gradient-to-r from-[#1DAA58] to-[#2484C6] transition-all duration-300"
                              style={{ width: `${stats.onTrackPct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="p-4" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedHolidayProject(project)}
                          className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg cursor-pointer flex items-center gap-1.5 font-semibold text-[10px] transition-all"
                          title="Manage Project Blackout Holidays"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Holidays</span>
                        </button>
                      </td>

                      <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-2 items-center">
                          <button
                            onClick={() => {
                              if (onNavigateToProjectEditor) {
                                onNavigateToProjectEditor(project.id);
                              }
                            }}
                            className="px-2.5 py-1.5 bg-[#1DAA58]/10 hover:bg-[#1DAA58]/20 text-[#1DAA58] border border-[#1DAA58]/30 hover:border-[#1DAA58]/50 rounded-lg cursor-pointer flex items-center gap-1 font-bold text-[10px] transition-all"
                            title="Open in Project Editor"
                          >
                            <span>Open in Editor</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>

                          {canManage && (
                            <>
                              <button
                                onClick={() => {
                                  setAssignLeadProject(project);
                                  setSelectedLeadIdToAssign('');
                                }}
                                className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg cursor-pointer transition-colors"
                                title="Assign Lead"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditingProjectId(project.id);
                                  setEditName(project.name);
                                }}
                                className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg cursor-pointer transition-colors"
                                title="Rename Project"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => triggerDeleteConfirm(project)}
                                className="p-1.5 hover:bg-rose-500/20 text-rose-400 rounded-lg cursor-pointer transition-colors"
                                title="Delete Project"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="max-w-md w-full p-6 rounded-2xl bg-[#121214] border border-white/10 text-white text-xs shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-[#008DA5]" />
                <h3 className="text-sm font-bold">Create New Project Scope</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Project Name</label>
              <input
                type="text"
                placeholder="e.g. Corporate Client Alpha 2026"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-900 text-white border border-neutral-800 focus:outline-none focus:ring-1 focus:ring-[#008DA5]"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl border border-neutral-800 text-neutral-400 hover:bg-neutral-800 font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={!newProjectName.trim() || creatingProject}
                onClick={handleCreateProject}
                className="px-4 py-2 rounded-xl bg-[#008DA5] hover:bg-[#007A90] text-white font-bold transition-all disabled:opacity-50"
              >
                {creatingProject ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showGlobalModal && (
        <GlobalHolidaysModal
          theme={theme}
          currentUser={currentUser}
          onClose={() => setShowGlobalModal(false)}
          onChanged={loadData}
        />
      )}

      {assignLeadProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className={`max-w-md w-full p-6 rounded-lg border text-xs shadow-2xl ${
            theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15 text-white' : 'bg-white border-neutral-200 text-neutral-900'
          }`}>
            <div className="flex justify-between items-center mb-3">
              <h3 className={`text-sm font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-white' : 'text-[#193661]'}`}>
                Assign Lead — {assignLeadProject.name}
              </h3>
              <button onClick={() => setAssignLeadProject(null)} className="p-1 hover:bg-neutral-500/20 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-neutral-400 mb-4 leading-relaxed">
              Assign Team Leads (<code className="text-[#2484C6]">role = Lead</code>) to grant them permission to view and manage internal phases for this project scope.
            </p>

            {/* Currently Assigned Leads */}
            <div className="mb-4">
              <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1.5">Assigned Project Leads</label>
              {(() => {
                const currentAssns = projectLeadAssignments.filter(a => a.project_id === assignLeadProject.id);
                if (currentAssns.length === 0) {
                  return <p className="text-neutral-500 italic text-xs py-1">No Leads assigned to this project yet.</p>;
                }
                return (
                  <div className="space-y-1.5">
                    {currentAssns.map(assn => {
                      const leadObj = allLeads.find(l => l.id === assn.lead_id);
                      return (
                        <div key={assn.id} className="flex items-center justify-between p-2 rounded bg-neutral-500/10 border border-neutral-500/20">
                          <span className="font-semibold text-xs">{leadObj ? `${leadObj.name} (${leadObj.employeeId})` : assn.lead_id}</span>
                          <button
                            onClick={async () => {
                              try {
                                await removeLeadFromProject(assignLeadProject.id, assn.lead_id);
                                const updated = await getProjectLeadAssignments();
                                setProjectLeadAssignments(updated);
                              } catch (err: any) {
                                alert(`Failed to remove lead: ${err.message}`);
                              }
                            }}
                            className="p-1 text-rose-400 hover:bg-rose-500/20 rounded cursor-pointer"
                            title="Remove Lead"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Add New Lead Dropdown */}
            <div className="mb-4">
              <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Select Lead from Employee Directory</label>
              <div className="flex gap-2">
                <select
                  value={selectedLeadIdToAssign}
                  onChange={e => setSelectedLeadIdToAssign(e.target.value)}
                  className={`flex-1 px-2.5 py-1.5 text-xs rounded border focus:ring-1 focus:ring-[#2484C6] ${
                    theme === 'dark' ? 'bg-neutral-800 text-white border-neutral-700' : 'bg-white text-slate-900 border-slate-300'
                  }`}
                >
                  <option value="">Select a Lead...</option>
                  {allLeads.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.employeeId}) — {l.designation}</option>
                  ))}
                </select>
                <button
                  disabled={!selectedLeadIdToAssign || assigningLeadBusy}
                  onClick={async () => {
                    if (!selectedLeadIdToAssign) return;
                    setAssigningLeadBusy(true);
                    try {
                      await assignLeadToProject(assignLeadProject.id, selectedLeadIdToAssign, currentUser?.id);
                      const updated = await getProjectLeadAssignments();
                      setProjectLeadAssignments(updated);
                      setSelectedLeadIdToAssign('');
                    } catch (err: any) {
                      alert(`Failed to assign lead: ${err.message}`);
                    } finally {
                      setAssigningLeadBusy(false);
                    }
                  }}
                  className={`px-3 py-1.5 bg-[#2484C6] hover:bg-[#1a6ea8] text-white font-bold text-xs rounded transition-all cursor-pointer ${
                    !selectedLeadIdToAssign ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {assigningLeadBusy ? 'Saving...' : 'Assign'}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setAssignLeadProject(null)}
                className={`px-4 py-2 text-xs font-semibold rounded border cursor-pointer ${
                  theme === 'dark' ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-800' : 'border-neutral-300 text-slate-700 hover:bg-neutral-100'
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Holiday Calendar Modal */}
      {selectedHolidayProject && (
        <ProjectHolidayModal
          theme={theme}
          project={selectedHolidayProject}
          currentUser={currentUser}
          onClose={handleCloseHolidayModal}
        />
      )}

      {/* Delete Cascade Impact Warning Modal */}
      {deletingProject && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div className={`max-w-md w-full p-6 rounded-xl border text-xs shadow-2xl ${
            theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15 text-white' : 'bg-white border-neutral-200 text-neutral-900'
          }`}>
            <h3 className="text-sm font-bold text-rose-500 mb-2 uppercase tracking-wide">
              Cascade Deletion Impact Confirmation
            </h3>
            <p className="mb-4 text-neutral-400 leading-relaxed">
              You are about to delete project <strong className="text-neutral-200">"{deletingProject.name}"</strong>. This action is destructive and will execute a database-level cascading deletion.
            </p>
            
            <div className="mb-4 p-3 rounded bg-rose-500/5 border border-rose-500/20 text-neutral-300">
              <p className="font-bold text-rose-400 mb-1">Destruction Impact Report:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Courses to delete: <strong>{cascadeCounts.courses}</strong></li>
                <li>Modules to delete: <strong>{cascadeCounts.modules}</strong></li>
                <li>Phases to delete: <strong>{cascadeCounts.phases}</strong></li>
              </ul>
            </div>

            <p className="text-[11px] text-neutral-400 mb-5">
              Warning: Deleting the courses, modules, and phases will also orphan any operational history, status reports, and timeline scheduling data linked with this project context.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeletingProject(null)}
                className={`px-3 py-1.5 border rounded font-semibold hover:bg-neutral-500/10 cursor-pointer ${
                  theme === 'dark' ? 'border-neutral-700 text-neutral-300' : 'border-neutral-300 text-neutral-700'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold transition-all shadow-md active:scale-97 cursor-pointer"
              >
                Confirm Destructive Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
