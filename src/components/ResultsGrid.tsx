/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Layers, Database, Sparkles, AlertCircle, CheckCircle2, Filter, RefreshCw, Check, ArrowRight, ShieldAlert } from 'lucide-react';
import { JoinResultRow } from '../types';
import { saveResultToSupabase, fetchExistingProjectData, getModuleMatchKey, getSupabase } from '../lib/db';
import ReuploadDiffModal from './ReuploadDiffModal';
import { runUploadDiff, commitDiffConfirm, UploadDiffResult, ChangedRowItem, NewRowItem } from '../utils/diffEngine';
import { formatDateDDMMYYYY } from '../utils/dateFormatter';

interface ResultsGridProps {
  theme: 'dark' | 'light';
  projectId: string;
  projectName: string;
  clientFilename: string;
  internalFilename: string;
  results: JoinResultRow[];
  onCommitSuccess: (newProjId?: string) => void;
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
}

interface PhaseDiff {
  phaseName: string;
  field: 'clientDate' | 'internalStartDate' | 'internalEndDate';
  oldVal: string | null;
  newVal: string | null;
}

interface ModuleConflict {
  key: string;
  courseCode: string;
  courseName: string;
  moduleCode: string;
  moduleName: string;
  language?: string;
  moduleId: string;
  diffs: PhaseDiff[];
  row: JoinResultRow;
}

export default function ResultsGrid({
  theme,
  projectId,
  projectName,
  clientFilename,
  internalFilename,
  results,
  onCommitSuccess,
  currentUser = null
}: ResultsGridProps) {
  const [filter, setFilter] = useState<'all' | 'matched' | 'client-only' | 'internal-only'>('all');
  const [committing, setCommitting] = useState(false);
  const [commitLog, setCommitLog] = useState<{ status: 'idle' | 'success' | 'error'; message?: string }>({ status: 'idle' });

  // DB Duplicates Check States
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [unchangedKeys, setUnchangedKeys] = useState<string[]>([]);
  const [newModulesList, setNewModulesList] = useState<JoinResultRow[]>([]);
  const [conflicts, setConflicts] = useState<ModuleConflict[]>([]);
  const [confirmedConflictKeys, setConfirmedConflictKeys] = useState<string[]>([]);

  // Re-upload Diff Modal States
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [diffResult, setDiffResult] = useState<UploadDiffResult | null>(null);
  const [isSubmittingDiff, setIsSubmittingDiff] = useState(false);

  const runAudit = async () => {
    try {
      setLoadingAudit(true);
      setAuditError(null);
      
      const existing = await fetchExistingProjectData(projectId);
      
      // Map existing modules by match key
      const existingModulesMap = new Map<string, { mod: any; course: any; phases: any[] }>();
      existing.modules.forEach(m => {
        const course = existing.courses.find(c => c.id === m.course_id);
        if (course) {
          const key = getModuleMatchKey(course.code, m.code, m.language || undefined);
          const phases = existing.phases.filter(p => p.module_id === m.id);
          existingModulesMap.set(key, { mod: m, course, phases });
        }
      });

      const newMods: JoinResultRow[] = [];
      const sameKeys: string[] = [];
      const dConflicts: ModuleConflict[] = [];

      results.forEach(row => {
        const rowKey = getModuleMatchKey(row.courseCode, row.moduleCode, row.language);
        const existingData = existingModulesMap.get(rowKey);

        if (!existingData) {
          newMods.push(row);
        } else {
          const { mod, phases: storedPhases } = existingData;
          const diffs: PhaseDiff[] = [];
          
          // Only check phases that were actually uploaded in row.phases
          row.phases.forEach(uPh => {
            const phName = uPh.phaseName;
            const sPh = (storedPhases || []).find(ph => ph.phase_name === phName);

            const upClient = uPh.clientDate || null;
            const upStart = uPh.internalStartDate || null;
            const upEnd = uPh.internalEndDate || null;

            const stClient = sPh?.client_date || null;
            const stStart = sPh?.internal_start_date || null;
            const stEnd = sPh?.internal_end_date || null;

            if (clientFilename && upClient !== stClient) {
              diffs.push({ phaseName: phName, field: 'clientDate', oldVal: stClient, newVal: upClient });
            }
            if (internalFilename) {
              if (upStart !== stStart) {
                diffs.push({ phaseName: phName, field: 'internalStartDate', oldVal: stStart, newVal: upStart });
              }
              if (upEnd !== stEnd) {
                diffs.push({ phaseName: phName, field: 'internalEndDate', oldVal: stEnd, newVal: upEnd });
              }
            }
          });

          if (diffs.length === 0) {
            sameKeys.push(rowKey);
          } else {
            dConflicts.push({
              key: rowKey,
              courseCode: row.courseCode,
              courseName: row.courseName,
              moduleCode: row.moduleCode,
              moduleName: row.moduleName,
              language: row.language,
              moduleId: mod.id,
              diffs,
              row
            });
          }
        }
      });

      setNewModulesList(newMods);
      setUnchangedKeys(sameKeys);
      setConflicts(dConflicts);
      setConfirmedConflictKeys([]);
    } catch (err: any) {
      console.error(err);
      setAuditError(err.message || 'Error executing duplicate database audit');
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    runAudit();
  }, [projectId, results]);

  // Compute breakdown stats
  const total = results.length;
  const matchedCount = results.filter(r => r.status === 'matched').length;
  const clientOnlyCount = results.filter(r => r.status === 'client-only').length;
  const internalOnlyCount = results.filter(r => r.status === 'internal-only').length;

  const filteredResults = results.filter(r => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const flattenParsedRows = (joinResults: JoinResultRow[]): any[] => {
    const flat: any[] = [];
    for (const row of joinResults) {
      for (const phase of row.phases || []) {
        if (phase.phaseName) {
          flat.push({
            courseCode: row.courseCode,
            courseName: row.courseName,
            moduleCode: row.moduleCode,
            moduleName: row.moduleName,
            language: row.language,
            phaseName: phase.phaseName,
            phaseType: phase.phaseType,
            phaseTypePhase: phase.phaseTypePhase,
            clientDate: phase.clientDate,
            internalStartDate: phase.internalStartDate,
            internalEndDate: phase.internalEndDate,
            start_date: phase.internalStartDate,
            end_date: phase.internalEndDate,
            client_date: phase.clientDate,
            metadata: phase.metadata || {},
            moduleMetadata: row.moduleMetadata || {},
            rawRow: row
          });
        }
      }
    }
    return flat;
  };

  const determineSourceFile = (): 'Client' | 'Internal' => {
    if (clientFilename && !internalFilename) return 'Client';
    if (internalFilename && !clientFilename) return 'Internal';
    return 'Client';
  };

  const handleCommitToDb = async () => {
    setCommitting(true);
    setCommitLog({ status: 'idle' });

    try {
      // Enforce ownership check
      const sb = getSupabase();
      if (sb) {
        const { data: existing } = await sb.from('projects').select('owner_id').eq('id', projectId).maybeSingle();
        if (existing) {
          let userRole = currentUser?.role || '';
          let userId = currentUser?.id || '';

          if (!userRole || !userId) {
            try {
              const { data: { session } } = await sb.auth.getSession();
              if (session?.user) {
                userId = userId || session.user.id;
                const { data: emp } = await sb.from('employees').select('role').eq('id', session.user.id).maybeSingle();
                if (emp?.role) userRole = emp.role;
              }
            } catch (e) {
              console.warn('Fallback role lookup warning:', e);
            }
          }

          const isOwner = !existing.owner_id || existing.owner_id === userId;
          const isAdmin = userRole.trim().toLowerCase() === 'admin';
          if (!isOwner && !isAdmin) {
            setCommitLog({
              status: 'error',
              message: "This project belongs to another Project Manager — contact an Admin to make changes"
            });
            setCommitting(false);
            return;
          }
        }
      }

      // Step 1: Flatten rows and determine source file type
      const flattenedRows = flattenParsedRows(results);
      const sourceFile = determineSourceFile();

      // Step 2: Run pre-upload diff check
      const diff = await runUploadDiff(flattenedRows, sourceFile, currentUser?.id, projectId);
      const totalChanges = diff.changedRows.length + diff.newRows.length + diff.missingRows.length;

      // Condition 1: No changes detected at all
      if (totalChanges === 0) {
        setCommitLog({
          status: 'success',
          message: 'No changes detected — database is already up to date.'
        });
        setCommitting(false);
        return;
      }

      // Show diff confirmation modal with categorized metric badges for all uploads with changes
      setDiffResult(diff);
      setShowDiffModal(true);

    } catch (err: any) {
      console.error(err);
      setCommitLog({
        status: 'error',
        message: err.message || 'Error occurred while running upload diff.'
      });
    } finally {
      setCommitting(false);
    }
  };

  const [diffModalError, setDiffModalError] = useState<string | null>(null);

  const handleConfirmDiffModal = async (confirmedChanges: ChangedRowItem[], confirmedNewRows: NewRowItem[]) => {
    setIsSubmittingDiff(true);
    setDiffModalError(null);
    try {
      const sourceFile = determineSourceFile();
      const commitRes = await commitDiffConfirm(
        confirmedChanges,
        confirmedNewRows,
        sourceFile,
        currentUser?.id,
        projectId,
        clientFilename,
        internalFilename
      );

      if (commitRes.success) {
        setCommitLog({
          status: 'success',
          message: `Upload complete: ${confirmedChanges.length} rows updated, ${confirmedNewRows.length} rows added to project "${projectName}".`
        });
        setShowDiffModal(false);
        setDiffModalError(null);
        onCommitSuccess(projectId);
      } else {
        throw new Error(commitRes.error || 'Failed to commit upload diff.');
      }
    } catch (err: any) {
      console.error(err);
      setDiffModalError(err.message || 'Error committing selected changes.');
      setCommitLog({
        status: 'error',
        message: err.message || 'Error committing selected changes.'
      });
    } finally {
      setIsSubmittingDiff(false);
    }
  };

  return (
    <div
      id="results-panel"
      className={`p-6 rounded-xl border transition-all hover-card-glow ${
        theme === 'dark'
          ? 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-white shadow-xl'
          : 'bg-white border-neutral-200 text-neutral-850 shadow-md'
      }`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#B1B7C3]/10">
        <div className="flex items-center gap-2.5">
          <Layers className="w-5 h-5 text-[#1DAA58]" />
          <div>
            <h2 className="font-semibold text-base leading-tight">Timeline Join & Audit Logic</h2>
            <p className="text-xs text-neutral-400 mt-1">
              Matching rows by exact <span className="font-mono bg-neutral-500/10 px-1 py-0.5 rounded text-[10px]">Course + Module + Language</span> parameters.
            </p>
          </div>
        </div>

        {/* Database commit trigger actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCommitToDb}
            disabled={committing || total === 0 || loadingAudit}
            className="px-4 py-2 bg-gradient-to-r from-[#1DAA58] to-[#2484C6] text-white rounded-md font-semibold text-xs flex items-center gap-1.5 hover:brightness-110 disabled:opacity-40 hover:scale-[1.01] transition-all active:scale-98 cursor-pointer"
          >
            {committing ? (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Database className="w-3.5 h-3.5" />
            )}
            <span>Commit to Database</span>
          </button>
        </div>
      </div>

      {/* Summary counters section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-5">
        <div className="p-3.5 rounded-xl bg-[var(--input-bg)] border border-[var(--border-subtle)]">
          <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Indexed Rows</p>
          <p className="text-xl font-bold mt-1 text-[#2484C6]">{total}</p>
        </div>

        <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/30">
          <p className="text-[10px] uppercase font-bold text-emerald-400/90 tracking-wider">Perfect Matched</p>
          <p className="text-xl font-bold mt-1 text-emerald-400">{matchedCount}</p>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/30">
          <p className="text-[10px] uppercase font-bold text-amber-500/90 tracking-wider">Missing Internal</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <p className="text-xl font-bold text-amber-500">{clientOnlyCount}</p>
            {clientOnlyCount > 0 && <span className="text-[10px] text-amber-500/80 px-1 bg-amber-500/10 rounded font-medium">Warning</span>}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/30">
          <p className="text-[10px] uppercase font-bold text-amber-500/90 tracking-wider">Missing Client</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <p className="text-xl font-bold text-amber-500">{internalOnlyCount}</p>
            {internalOnlyCount > 0 && <span className="text-[10px] text-[#2484C6] px-1 bg-[#2484C6]/10 rounded font-medium">Warning</span>}
          </div>
        </div>
      </div>

      {/* DB INTEGRATION AUDIT COMPONENT */}
      {loadingAudit ? (
        <div className="my-5 p-5 bg-neutral-500/5 rounded-lg border border-[#B1B7C3]/10 flex items-center justify-center gap-3">
          <RefreshCw className="w-4.5 h-4.5 text-[#2484C6] animate-spin" />
          <span className="text-xs text-neutral-400">Performing historical duplication & conflict audit against database...</span>
        </div>
      ) : auditError ? (
        <div className="my-5 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-bold">Audit Initialization Failed</p>
            <p className="mt-0.5">{auditError}</p>
          </div>
        </div>
      ) : (
        <div className="my-6 p-5 rounded-lg bg-neutral-500/5 border border-[#B1B7C3]/15">
          <div className="flex items-center justify-between pb-3 border-b border-[#B1B7C3]/10">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
              <h3 className="text-sm font-semibold text-neutral-200 font-sans tracking-tight">Database Merge Conflict & Duplicate Audit</h3>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{newModulesList.length} New</span>
              <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20" title="Identical dates found in the database, skipped automatically">{unchangedKeys.length} Unchanged (Silent)</span>
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">{conflicts.length} Conflicting</span>
            </div>
          </div>

          <div className="mt-3 text-xs text-neutral-400 leading-relaxed">
            <p>
              To protect past uploads, we verified that there are no overlapping dates inside the database/your local storage matching on <span className="font-semibold text-neutral-200 font-mono text-[10px] bg-neutral-500/10 px-1 py-0.5 rounded">Course + Module + Language</span> parameters.
            </p>
            {unchangedKeys.length > 0 && (
              <p className="mt-1.5 text-emerald-400 font-medium flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>{unchangedKeys.length} unchanged modules match current saved records perfectly and will be skipped silently during saving.</span>
              </p>
            )}
          </div>

          {conflicts.length > 0 ? (
            <div className="mt-5 space-y-4">
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500 flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-500" />
                <div>
                  <p className="font-bold">Confirmation Required for Overwriting Dates</p>
                  <p className="mt-1 leading-normal text-amber-400/90">
                    The {conflicts.length} modules below already exist in the database, but one or more date values differ from what's stored. Check the boxes to approve updating their timelines. Unchecked modules will be untouched.
                  </p>
                  <div className="flex gap-2.5 mt-3">
                    <button
                      type="button"
                      onClick={() => setConfirmedConflictKeys(conflicts.map(c => c.key))}
                      className="px-3 py-1 bg-amber-500 text-neutral-900 rounded font-bold text-[10px] hover:bg-amber-400 transition-all cursor-pointer animate-none"
                    >
                      Approve All Conflicts
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmedConflictKeys([])}
                      className="px-3 py-1 bg-transparent text-amber-500 border border-amber-500/30 rounded font-bold text-[10px] hover:bg-amber-500/10 transition-all cursor-pointer"
                    >
                      Clear Selections
                    </button>
                  </div>
                </div>
              </div>

              {/* List of conflict comparisons */}
              <div className="space-y-3.5 max-h-[350px] overflow-y-auto pr-1">
                {conflicts.map((conflict, cIdx) => {
                  const isConfirmed = confirmedConflictKeys.includes(conflict.key);
                  
                  return (
                    <div
                      key={cIdx}
                      className={`p-4 rounded-lg border transition-all ${
                        isConfirmed
                          ? 'bg-amber-500/3 border-amber-500/30 shadow-inner'
                          : 'bg-neutral-500/5 border-[#B1B7C3]/10 hover:border-neutral-750'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-neutral-500/10">
                        <div className="flex items-start gap-2.5">
                          <input
                            type="checkbox"
                            id={`cb-${conflict.key}`}
                            checked={isConfirmed}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setConfirmedConflictKeys(prev => [...prev, conflict.key]);
                              } else {
                                setConfirmedConflictKeys(prev => prev.filter(k => k !== conflict.key));
                              }
                            }}
                            className="mt-1 w-4 h-4 text-amber-500 bg-neutral-900 border-neutral-750 rounded focus:ring-amber-500 cursor-pointer"
                          />
                          <div>
                            <label htmlFor={`cb-${conflict.key}`} className="font-bold text-neutral-200 text-xs hover:text-white cursor-pointer flex items-baseline gap-1.5">
                              <span>Course: {conflict.courseCode} — Module: {conflict.moduleCode}</span>
                              {conflict.language && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-neutral-500/20 text-neutral-400 uppercase font-mono">{conflict.language}</span>
                              )}
                            </label>
                            <p className="text-[10px] text-neutral-400 mt-0.5">{conflict.moduleName}</p>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono leading-none ${
                          isConfirmed ? 'bg-amber-500/20 text-amber-400 font-bold' : 'bg-neutral-500/20 text-neutral-400'
                        }`}>
                          {isConfirmed ? 'APPROVED TO MERGE' : 'Pending Review'}
                        </span>
                      </div>

                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-left font-mono text-[10px] border-collapse">
                          <thead>
                            <tr className="text-neutral-500 border-b border-[#B1B7C3]/5">
                              <th className="pb-1 font-semibold">Phase Context</th>
                              <th className="pb-1 font-semibold">Timeline Point</th>
                              <th className="pb-1 font-semibold text-red-500/80">Stored in Database</th>
                              <th className="pb-1" />
                              <th className="pb-1 font-semibold text-emerald-400">New from current upload</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-500/5">
                            {conflict.diffs.map((diff, dSubIdx) => (
                              <tr key={dSubIdx} className="hover:bg-neutral-500/2 text-neutral-400">
                                <td className="py-1 text-neutral-300 font-medium">{diff.phaseName}</td>
                                <td className="py-1 font-semibold text-neutral-450">
                                  {diff.field === 'clientDate' ? 'Client Date' : diff.field === 'internalStartDate' ? 'Internal Start' : 'Internal End'}
                                </td>
                                <td className="py-1 line-through text-red-500/70">{diff.oldVal || 'null/unassigned'}</td>
                                <td className="py-1 text-center"><ArrowRight className="w-3 h-3 text-neutral-500 inline" /></td>
                                <td className="py-1 text-emerald-400 font-semibold">{diff.newVal || 'null/unassigned'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              <span>Perfect! No merge conflicts detected with other courses or modules in this database project. All uploads are safe to ingest directly.</span>
            </div>
          )}
        </div>
      )}

      {commitLog.status === 'success' && (
        <div className="mb-5 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-start gap-2.5 shadow-sm leading-normal">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-400" />
          <span>{commitLog.message}</span>
        </div>
      )}

      {commitLog.status === 'error' && (
        <div className="mb-5 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-start gap-2.5 leading-normal">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Database Transaction Failed</p>
            <p className="mt-1">{commitLog.message}</p>
          </div>
        </div>
      )}

      {/* Filters section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2">
        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
          <Filter className="w-3.5 h-3.5 text-[#2484C6]" />
          <span>Grid Filters:</span>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${
              filter === 'all'
                ? 'bg-neutral-500/20 text-white border border-[#B1B7C3]/30'
                : 'bg-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            All Results ({total})
          </button>
          <button
            onClick={() => setFilter('matched')}
            className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${
              filter === 'matched'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                : 'bg-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Matched ({matchedCount})
          </button>
          <button
            onClick={() => setFilter('client-only')}
            className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${
              filter === 'client-only'
                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/25'
                : 'bg-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Client Only ({clientOnlyCount})
          </button>
          <button
            onClick={() => setFilter('internal-only')}
            className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${
              filter === 'internal-only'
                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/25'
                : 'bg-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Internal Only ({internalOnlyCount})
          </button>
        </div>
      </div>

      {/* Main comparative result rows listing */}
      {filteredResults.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[#B1B7C3]/15">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-[#193661] text-white border-b border-[#DCDEE4]/20 font-semibold">
                <th className="p-3">Status</th>
                <th className="p-3">Structural Identity</th>
                <th className="p-3">Client Deliverable Dates</th>
                <th className="p-3">Internal Operational Timeline</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map((row, index) => {
                const isMatched = row.status === 'matched';
                const isClientOnly = row.status === 'client-only';
                const isInternalOnly = row.status === 'internal-only';

                return (
                  <tr
                    key={index}
                    className={`border-b border-[#B1B7C3]/10 transition-colors ${
                      isMatched
                        ? 'bg-emerald-500/2 hover:bg-emerald-500/5'
                        : 'bg-amber-500/2 hover:bg-amber-500/5'
                    }`}
                  >
                    {/* Status Badge */}
                    <td className="p-3 align-top whitespace-nowrap">
                      {isMatched ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Matched
                        </span>
                      ) : isClientOnly ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          Missing Internal
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          Missing Client
                        </span>
                      )}
                    </td>

                    {/* Meta info columns */}
                    <td className="p-3 align-top">
                      <div>
                        <div className="font-semibold text-neutral-200">
                          Course: <span className="font-mono text-xs">{row.courseCode}</span>
                        </div>
                        <div className="text-neutral-400 mt-0.5">
                          Module: <span className="font-mono text-xs font-medium">{row.moduleCode}</span>
                        </div>
                        {row.language && (
                          <div className="text-[10px] text-neutral-500 uppercase font-mono tracking-wider mt-1">
                            🌐 Language: {row.language}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Client Dates column mapping */}
                    <td className="p-3 align-top">
                      {isInternalOnly ? (
                        <div className="text-neutral-500 italic flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                          <span>Mismatched: Not in Client Sheet</span>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {row.phases.filter(ph => ph.clientDate).map((ph, idx) => (
                            <div key={idx} className="flex flex-col">
                              <span className="text-[10px] text-neutral-400 font-medium">
                                {ph.phaseName}
                                {ph.metadata && Object.keys(ph.metadata).length > 0 && (
                                  <span className="ml-1 text-[9px] text-neutral-500 font-normal">
                                    ({Object.entries(ph.metadata).map(([k, v]) => `${k}: ${v}`).join(', ')})
                                  </span>
                                )}
                              </span>
                              <span className="font-mono text-xs text-[#2484C6]">{formatDateDDMMYYYY(ph.clientDate)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Internal Dates columns mapping */}
                    <td className="p-3 align-top">
                      {isClientOnly ? (
                        <div className="text-neutral-500 italic flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                          <span>Mismatched: Not in Internal Sheet</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {row.phases.filter(ph => ph.internalStartDate || ph.internalEndDate).map((ph, idx) => (
                            <div key={idx} className="flex flex-col">
                              <span className="text-[10px] text-neutral-400 font-semibold">
                                {ph.phaseName}
                                {ph.metadata && Object.keys(ph.metadata).length > 0 && (
                                  <span className="ml-1 text-[9px] text-neutral-500 font-normal">
                                    ({Object.entries(ph.metadata).map(([k, v]) => `${k}: ${v}`).join(', ')})
                                  </span>
                                )}
                              </span>
                              <div className="flex gap-2 text-xs font-mono">
                                <div className="flex flex-col">
                                  <span className="text-[9px] uppercase text-neutral-500">Start</span>
                                  <span className="text-emerald-500">{formatDateDDMMYYYY(ph.internalStartDate)}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] uppercase text-neutral-500">End</span>
                                  <span className="text-emerald-400">{formatDateDDMMYYYY(ph.internalEndDate)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-10 bg-neutral-500/5 rounded-lg border border-[#B1B7C3]/10 text-neutral-400 text-xs">
          No lines match current status filter.
        </div>
      )}

      {/* Re-upload Diff & Confirmation Modal */}
      {showDiffModal && diffResult && (
        <ReuploadDiffModal
          theme={theme}
          sourceFile={clientFilename ? 'Client' : 'Internal'}
          clientFilename={clientFilename}
          internalFilename={internalFilename}
          projectName={projectName}
          diffResult={diffResult}
          onCancel={() => {
            setShowDiffModal(false);
            setDiffModalError(null);
          }}
          onConfirm={handleConfirmDiffModal}
          isSubmitting={isSubmittingDiff}
          submissionError={diffModalError}
        />
      )}
    </div>
  );
}
