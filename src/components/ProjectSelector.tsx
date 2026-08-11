/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, Plus, Trash2, Check, PlusCircle, AlertTriangle } from 'lucide-react';
import { Project, Employee } from '../types';
import { 
  getSupabase, 
  deleteProject, 
  fetchExistingProjectData, 
  claimProjectOwnership, 
  getEmployees,
  writeAuditLog,
  getCurrentUserId,
  ensureEmployeeProfileExists
} from '../lib/db';

interface ProjectSelectorProps {
  theme: 'dark' | 'light';
  selectedProject: Project | null;
  onProjectSelect: (proj: Project | null) => void;
  triggerRefresh: number;
  onCommitSuccess?: () => void;
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
  variant?: 'card' | 'inline' | 'actions';
}

export default function ProjectSelector({
  theme,
  selectedProject,
  onProjectSelect,
  triggerRefresh,
  onCommitSuccess,
  currentUser,
  variant = 'card'
}: ProjectSelectorProps) {
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newProjName, setNewProjName] = useState('');

  // Notifications & Custom modal state
  const [selectorError, setSelectorError] = useState<string | null>(null);
  const [selectorSuccess, setSelectorSuccess] = useState<string | null>(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // PM ownership mapping assignment
  const [showClaimDropdown, setShowClaimDropdown] = useState(false);
  const [pmsList, setPmsList] = useState<Employee[]>([]);
  const [selectedPmId, setSelectedPmId] = useState('');

  // Load PMs list for ownership assignment
  useEffect(() => {
    const fetchPMs = async () => {
      try {
        const emps = await getEmployees();
        const pms = emps.filter(e => e.role === 'Project Manager' || e.role === 'Admin');
        setPmsList(pms);
      } catch (err) {
        console.error("Failed to load PM directory list:", err);
      }
    };
    fetchPMs();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    const sb = getSupabase();
    if (sb) {
      try {
        let query = sb.from('projects').select('*');
        
        // Scope to user projects if PM
        if (currentUser && currentUser.role === 'Project Manager') {
          query = query.eq('owner_id', currentUser.id);
        } else if (currentUser && (currentUser.role === 'Employee' || currentUser.role === 'Lead') && currentUser.id) {
          // Employee/Lead can only view projects they are assigned to in employee_project_links or via assigned phases
          const { data: linkedProjs } = await sb
            .from('employee_project_links')
            .select('project_id')
            .eq('employee_id', currentUser.id);
          const linkedIds = (linkedProjs || []).map(l => l.project_id);

          const { data: assignedPhases } = await sb
            .from('internal_phases')
            .select('module_id')
            .eq('assigned_to', currentUser.id);

          let assignedProjIds: string[] = [];
          if (assignedPhases && assignedPhases.length > 0) {
            const mIds = assignedPhases.map(ph => ph.module_id);
            const { data: mData } = await sb.from('modules').select('course_id').in('id', mIds);
            if (mData && mData.length > 0) {
              const cIds = mData.map(m => m.course_id);
              const { data: cData } = await sb.from('courses').select('project_id').in('id', cIds);
              if (cData && cData.length > 0) {
                assignedProjIds = cData.map(c => c.project_id);
              }
            }
          }

          const allowedIds = Array.from(new Set([...linkedIds, ...assignedProjIds]));

          if (allowedIds.length > 0) {
            query = query.in('id', allowedIds);
          } else {
            setProjectsList([]);
            onProjectSelect(null);
            setLoading(false);
            return;
          }
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        if (data) {
          const mapped: Project[] = data.map(item => ({
            id: item.id,
            name: item.name,
            createdAt: item.created_at,
            ownerId: item.owner_id
          }));
          setProjectsList(mapped);
          
          const stillExists = selectedProject && mapped.some(p => p.id === selectedProject.id);
          if (!stillExists) {
            const nameMatch = selectedProject && mapped.find(p => p.name === selectedProject.name);
            if (nameMatch) {
              onProjectSelect(nameMatch);
            } else if (mapped.length > 0) {
              onProjectSelect(mapped[0]);
            } else {
              onProjectSelect(null);
            }
          }
        }
      } catch (err) {
        console.error("Could not load from Supabase:", err);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProjects();
  }, [triggerRefresh, currentUser, selectedProject?.id]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;

    setLoading(true);
    const sb = getSupabase();
    if (sb) {
      try {
        let authUserId = '';
        try {
          authUserId = await getCurrentUserId();
        } catch (authErr) {
          setSelectorError("Authentication session expired — please log in again");
          setLoading(false);
          return;
        }

        const { data: existing } = await sb
          .from('projects')
          .select('*')
          .eq('name', newProjName.trim())
          .maybeSingle();

        if (existing) {
          const isOwner = !existing.owner_id || existing.owner_id === authUserId;
          const isAdmin = (currentUser?.role || '').trim().toLowerCase() === 'admin';
          
          if (!isOwner && !isAdmin) {
            setSelectorError("This project belongs to another Project Manager — contact an Admin to make changes");
            setLoading(false);
            return;
          }

          let validOwnerId: string | null = null;
          if (authUserId) {
            validOwnerId = await ensureEmployeeProfileExists(authUserId, currentUser);
          }

          if (!existing.owner_id && validOwnerId) {
            const { error: updateErr } = await sb.from('projects').update({ owner_id: validOwnerId }).eq('id', existing.id);
            if (updateErr) throw updateErr;

            await writeAuditLog({
              actionType: 'ownership_reassign',
              entityType: 'project',
              entityId: existing.id,
              entityLabel: existing.name,
              oldValue: { owner_id: null, name: 'Orphaned' },
              newValue: { owner_id: validOwnerId, name: currentUser?.name || currentUser?.email || 'Current PM' }
            });
            onCommitSuccess?.();
          }

          const nextProj: Project = { id: existing.id, name: existing.name, createdAt: existing.created_at, ownerId: validOwnerId || existing.owner_id };
          onProjectSelect(nextProj);
        } else {
          let validOwnerId: string | null = null;
          if (authUserId) {
            validOwnerId = await ensureEmployeeProfileExists(authUserId, currentUser);
          }

          const { data, error } = await sb.from('projects').insert({ name: newProjName.trim(), owner_id: validOwnerId }).select('*').single();
          if (error) throw error;
          
          if (data) {
            await writeAuditLog({
              actionType: 'project_create',
              entityType: 'project',
              entityId: data.id,
              entityLabel: data.name,
              oldValue: null,
              newValue: { name: data.name, owner_id: data.owner_id, owner_name: currentUser?.name }
            });

            const nextProj: Project = { id: data.id, name: data.name, createdAt: data.created_at, ownerId: data.owner_id };
            onProjectSelect(nextProj);
            onCommitSuccess?.();
          }
        }
      } catch (err: any) {
        console.error("Could not insert project to Supabase:", err);
        const errMsg = err.message || '';
        if (err.code === '23505' || errMsg.toLowerCase().includes('unique') || errMsg.toLowerCase().includes('duplicate') || errMsg.toLowerCase().includes('already exists')) {
          setSelectorError("The project is owned by some other project manager — contact an Admin to make changes");
        } else {
          setSelectorError(`Could not create project: ${err.message || JSON.stringify(err)}`);
        }
      }
    }

    setNewProjName('');
    setIsAdding(false);
    loadProjects();
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;

    const isAdmin = (currentUser?.role || '').trim().toLowerCase() === 'admin';
    const isOwner = !selectedProject.ownerId || selectedProject.ownerId === currentUser?.id;
    if (!isOwner && !isAdmin) {
      setSelectorError("This project belongs to another Project Manager — contact an Admin to make changes");
      return;
    }

    try {
      setLoading(true);
      const counts = await fetchExistingProjectData(selectedProject.id);
      const coursesCount = counts.courses?.length || 0;
      const modulesCount = counts.modules?.length || 0;
      const phasesCount = counts.phases?.length || 0;

      const confirmMsg = `Are you sure you want to delete the project "${selectedProject.name}"?\n\nThis will permanently remove:\n- ${coursesCount} Course(s)\n- ${modulesCount} Module(s)\n- ${phasesCount} Phase(s)\n\nThis is a destructive operation and cannot be undone.`;
      
      setDeleteConfirmModal({
        message: confirmMsg,
        onConfirm: async () => {
          setDeleteConfirmModal(null);
          try {
            setLoading(true);
            await deleteProject(selectedProject.id);
            setSelectorSuccess(`Project "${selectedProject.name}" deleted successfully.`);
            onCommitSuccess?.();
            
            const sb = getSupabase();
            let queryList: Project[] = [];
            if (sb) {
              let query = sb.from('projects').select('*');
              if (currentUser && currentUser.role === 'Project Manager') {
                query = query.eq('owner_id', currentUser.id);
              }
              const { data, error } = await query.order('created_at', { ascending: false });
              if (!error && data) {
                queryList = data.map(item => ({
                  id: item.id,
                  name: item.name,
                  createdAt: item.created_at,
                  ownerId: item.owner_id
                }));
              }
            }
            setProjectsList(queryList);
            if (queryList.length > 0) {
              onProjectSelect(queryList[0]);
            } else {
              onProjectSelect(null);
            }
          } catch (err: any) {
            console.error(err);
            setSelectorError("Failed to delete project: " + (err.message || err));
          } finally {
            setLoading(false);
          }
        }
      });
    } catch (err: any) {
      console.error(err);
      setSelectorError("Failed to delete project: " + (err.message || err));
    }
  };

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2">
        <select
          aria-label="Select Project Workspace"
          value={selectedProject?.id || ''}
          onChange={(e) => {
            const found = projectsList.find(p => p.id === e.target.value);
            if (found) onProjectSelect(found);
          }}
          className="px-3 py-1.5 text-xs rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:ring-1 focus:ring-[#1DAA58] cursor-pointer"
        >
          <option value="">-- Choose Project --</option>
          {projectsList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {currentUser?.role === 'Admin' && selectedProject && !selectedProject.ownerId && (
          <div className="flex items-center gap-1.5">
            {!showClaimDropdown ? (
              <button
                onClick={() => {
                  setShowClaimDropdown(true);
                  if (pmsList.length > 0) setSelectedPmId(pmsList[0].id);
                }}
                className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-md text-xs font-semibold flex items-center gap-1 transition-all border border-amber-500/25 cursor-pointer animate-pulse"
                title="Assign an owner to this orphaned project"
              >
                Claim Ownership
              </button>
            ) : (
              <div className="flex items-center gap-1 bg-[var(--input-bg)] p-1 rounded-md border border-[var(--border-subtle)]">
                <select
                  value={selectedPmId}
                  onChange={(e) => setSelectedPmId(e.target.value)}
                  className="px-1.5 py-1 text-[11px] rounded bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none"
                >
                  {pmsList.length === 0 ? (
                    <option value="">No PMs available</option>
                  ) : (
                    pmsList.map(pm => (
                      <option key={pm.id} value={pm.id}>
                        {pm.name}
                      </option>
                    ))
                  )}
                </select>
                <button
                  onClick={async () => {
                    if (!selectedPmId) return;
                    try {
                      setLoading(true);
                      await claimProjectOwnership(selectedProject.id, selectedPmId);
                      setShowClaimDropdown(false);
                      setSelectorSuccess("Ownership successfully claimed.");
                      onCommitSuccess?.();
                      loadProjects();
                    } catch (err: any) {
                      setSelectorError("Failed to claim ownership: " + (err.message || err));
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="px-2 py-0.5 bg-amber-500 text-neutral-950 font-bold rounded text-[10px] hover:brightness-110 cursor-pointer"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setShowClaimDropdown(false)}
                  className="px-1.5 py-0.5 text-neutral-400 hover:text-white text-[10px] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (variant === 'actions') {
    return (
      <div className="flex items-center gap-2">
        {!isAdding ? (
          <>
            <button
              onClick={() => setIsAdding(true)}
              className="px-3.5 py-1.5 bg-gradient-to-r from-[#1DAA58] to-[#2484C6] text-white font-medium text-xs rounded-lg shadow-md hover:opacity-90 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>

            <button
              onClick={handleDeleteProject}
              disabled={!selectedProject}
              className="px-3 py-1.5 rounded-lg text-rose-500 dark:text-rose-400 hover:bg-rose-500/10 border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              title="Delete target project"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </>
        ) : (
          <form onSubmit={handleCreateProject} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Unique project name..."
              value={newProjName}
              onChange={(e) => setNewProjName(e.target.value)}
              required
              className="px-3 py-1.5 text-xs rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:ring-1 focus:ring-[#1DAA58]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-[#1DAA58] text-white rounded-lg text-xs font-medium hover:brightness-110 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Create</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-2.5 py-1.5 text-xs text-neutral-400 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
          </form>
        )}

        {deleteConfirmModal && createPortal(
          <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
            onClick={() => setDeleteConfirmModal(null)}
          >
            <div 
              className={`max-w-md w-full p-6 rounded-xl border text-xs shadow-2xl ${
                theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15 text-white' : 'bg-white border-neutral-200 text-neutral-900'
              }`}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-sm font-bold text-amber-500 mb-2 uppercase tracking-wide flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Confirm Deletion</span>
              </h3>
              <p className="mb-4 text-neutral-400 leading-relaxed whitespace-pre-line">
                {deleteConfirmModal.message}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteConfirmModal(null)}
                  className={`px-3 py-1.5 border rounded font-semibold hover:bg-neutral-500/10 cursor-pointer ${
                    theme === 'dark' ? 'border-neutral-700 text-neutral-300' : 'border-neutral-300 text-neutral-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={deleteConfirmModal.onConfirm}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold transition-all shadow-md active:scale-97 cursor-pointer"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  return (
    <div
      id="project-selector"
      className={`p-4 rounded-lg border transition-all hover-card-glow relative ${
        theme === 'dark'
          ? 'bg-[#1B1D21] border-[#B1B7C3]/15 text-white'
          : 'bg-white border-neutral-200 text-neutral-800'
      }`}
    >
      {selectorError && (
        <div className="mb-3 p-3 rounded-md bg-rose-500/10 border border-rose-500/20 text-xs text-rose-455 flex items-start gap-2 justify-between">
          <span>{selectorError}</span>
          <button onClick={() => setSelectorError(null)} className="text-neutral-450 hover:text-white text-[10px]">✕</button>
        </div>
      )}
      {selectorSuccess && (
        <div className="mb-3 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-450 flex items-start gap-2 justify-between">
          <span>{selectorSuccess}</span>
          <button onClick={() => setSelectorSuccess(null)} className="text-neutral-450 hover:text-white text-[10px]">✕</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-[#2484C6]/15 text-[#2484C6]">
            <Briefcase className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Target Strategic Project</h2>
            <div className="mt-1 flex items-center gap-2">
              {loading ? (
                <span className="text-xs text-neutral-500">Querying workspaces...</span>
              ) : selectedProject ? (
                <span className="font-semibold text-sm">{selectedProject.name}</span>
              ) : (
                <span className="text-xs text-rose-400">No active project selected</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isAdding ? (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                aria-label="Select Project Workspace"
                value={selectedProject?.id || ''}
                onChange={(e) => {
                  const found = projectsList.find(p => p.id === e.target.value);
                  if (found) onProjectSelect(found);
                }}
                className={`min-w-[140px] px-3 py-1.5 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
                  theme === 'dark' ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-neutral-100 border-neutral-300 text-neutral-900'
                }`}
              >
                {projectsList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {currentUser?.role === 'Admin' && selectedProject && !selectedProject.ownerId && (
                <div className="flex items-center gap-1.5">
                  {!showClaimDropdown ? (
                    <button
                      onClick={() => {
                        setShowClaimDropdown(true);
                        if (pmsList.length > 0) {
                          setSelectedPmId(pmsList[0].id);
                        }
                      }}
                      className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-md text-xs font-semibold flex items-center gap-1 transition-all border border-amber-500/25 cursor-pointer animate-pulse"
                      title="Assign an owner to this orphaned project"
                    >
                      Claim Ownership
                    </button>
                  ) : (
                    <div className="flex items-center gap-1 bg-neutral-900/40 p-1 rounded-md border border-neutral-700/30">
                      <select
                        value={selectedPmId}
                        onChange={(e) => setSelectedPmId(e.target.value)}
                        className={`px-1.5 py-1 text-[11px] rounded focus:outline-hidden ${
                          theme === 'dark' ? 'bg-neutral-800 text-white' : 'bg-white text-neutral-900'
                        }`}
                      >
                        {pmsList.length === 0 ? (
                          <option value="">No PMs available</option>
                        ) : (
                          pmsList.map(pm => (
                            <option key={pm.id} value={pm.id}>
                              {pm.name}
                            </option>
                          ))
                        )}
                      </select>
                      <button
                        onClick={async () => {
                          if (!selectedPmId) return;
                          try {
                            setLoading(true);
                            await claimProjectOwnership(selectedProject.id, selectedPmId);
                            setShowClaimDropdown(false);
                            setSelectorSuccess("Ownership successfully claimed.");
                            onCommitSuccess?.();
                            loadProjects();
                          } catch (err: any) {
                            setSelectorError("Failed to claim ownership: " + (err.message || err));
                          } finally {
                            setLoading(false);
                          }
                        }}
                        className="px-2 py-0.5 bg-amber-500 text-neutral-950 font-bold rounded text-[10px] hover:brightness-110 cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setShowClaimDropdown(false)}
                        className="px-1.5 py-0.5 text-neutral-400 hover:text-white text-[10px] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => setIsAdding(true)}
                className="px-3 py-1.5 bg-neutral-500/10 hover:bg-neutral-500/20 text-[#2484C6] rounded-md text-xs font-medium flex items-center gap-1 transition-all border border-neutral-500/25 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>New</span>
              </button>

              {selectedProject && (
                <button
                  onClick={handleDeleteProject}
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-md text-xs font-medium flex items-center gap-1 transition-all border border-rose-500/25 cursor-pointer"
                  title="Delete target project and all nested courses/modules/phases"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleCreateProject} className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Unique project name..."
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
                required
                className={`px-3 py-1.5 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#1DAA58] ${
                  theme === 'dark' ? 'bg-neutral-850 text-white border-neutral-750' : 'bg-white text-neutral-900 border-neutral-300'
                }`}
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[#1DAA58] text-white rounded-md text-xs font-medium hover:brightness-110 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Create</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-2.5 py-1.5 text-xs text-neutral-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmModal && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setDeleteConfirmModal(null)}
        >
          <div 
            className={`max-w-md w-full p-6 rounded-xl border text-xs shadow-2xl ${
              theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15 text-white' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-amber-500 mb-2 uppercase tracking-wide flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>Confirm Deletion</span>
            </h3>
            <p className="mb-4 text-neutral-400 leading-relaxed whitespace-pre-line">
              {deleteConfirmModal.message}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmModal(null)}
                className={`px-3 py-1.5 border rounded font-semibold hover:bg-neutral-500/10 cursor-pointer ${
                  theme === 'dark' ? 'border-neutral-700 text-neutral-300' : 'border-neutral-300 text-neutral-700'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={deleteConfirmModal.onConfirm}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold transition-all shadow-md active:scale-97 cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
