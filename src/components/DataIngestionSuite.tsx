import React, { useState, useEffect } from 'react';
import { AlertTriangle, Calendar, Check, Layers, ArrowRight, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { Project, UploadedFileState, JoinResultRow, PhaseGap, ClientInternalMapping } from '../types';
import { checkHolidaysConfigured, saveClientInternalMappings, savePhaseGaps, getSupabase } from '../lib/db';
import { calculateInclusiveDuration, calculateZeroLagGap } from '../utils/workingDays';
import { executeJoin } from '../utils/joiner';
import ProjectSelector from './ProjectSelector';
import UploadZone from './UploadZone';
import MappingSuite from './MappingSuite';
import ResultsGrid from './ResultsGrid';
import ProjectHolidayModal from './ProjectHolidayModal';

function getWorkflowRank(_phaseName: string): number {
  return 999;
}

interface DataIngestionSuiteProps {
  theme: 'dark' | 'light';
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
  dbRefreshCounter: number;
  handleCommitSuccess: (projectId: string) => void;
}

export default function DataIngestionSuite({
  theme,
  currentUser,
  dbRefreshCounter,
  handleCommitSuccess
}: DataIngestionSuiteProps) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Step 1 Holiday Gate State
  const [checkingHolidays, setCheckingHolidays] = useState(false);
  const [holidaysConfigured, setHolidaysConfigured] = useState<boolean | null>(null);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);

  // Uploaded Files State
  const [clientFile, setClientFile] = useState<UploadedFileState | null>(null);
  const [internalFile, setInternalFile] = useState<UploadedFileState | null>(null);

  // Computed Join Results State
  const [joinResults, setJoinResults] = useState<JoinResultRow[]>([]);

  // Verify active project holidays on selection change
  useEffect(() => {
    async function verifyHolidays() {
      if (!selectedProject?.id) {
        setHolidaysConfigured(null);
        return;
      }
      setCheckingHolidays(true);
      try {
        const status = await checkHolidaysConfigured(selectedProject.id);
        setHolidaysConfigured(status.isConfigured);
      } catch (err) {
        console.error("Error checking holidays:", err);
        setHolidaysConfigured(false);
      } finally {
        setCheckingHolidays(false);
      }
    }
    verifyHolidays();
  }, [selectedProject?.id, dbRefreshCounter]);

  // Compute join results when mappings are updated
  useEffect(() => {
    if (!clientFile?.mappingConfig || !internalFile?.mappingConfig) {
      setJoinResults([]);
      return;
    }

    const clientSheet = clientFile.sheets.find(s => s.sheetName === clientFile.selectedSheetName);
    const internalSheet = internalFile.sheets.find(s => s.sheetName === internalFile.selectedSheetName);

    if (clientSheet && internalSheet) {
      const results = executeJoin(
        clientSheet.rows,
        clientFile.mappingConfig,
        internalSheet.rows,
        internalFile.mappingConfig
      );
      setJoinResults(results);
    }
  }, [clientFile, internalFile]);

  const isConfigCompleted = clientFile?.mappingConfig && internalFile?.mappingConfig && joinResults.length > 0;

  // Custom handler for Step 4 Transactional Commit (Gaps & Mappings calculation)
  const handleIngestionCommitSuccess = async (projectId: string) => {
    try {
      // 1. Save Client-to-Internal Anchor Mappings
      if (clientFile?.mappingConfig?.phases) {
        const mappingRows: { clientPhaseName: string; anchorInternalPhaseName: string; anchorPoint: 'Start' | 'End' }[] = [];
        clientFile.mappingConfig.phases.forEach(ph => {
          mappingRows.push({
            clientPhaseName: ph.phaseName,
            anchorInternalPhaseName: ph.anchorInternalPhase || 'None',
            anchorPoint: ph.anchorPoint || 'End'
          });
        });
        if (mappingRows.length > 0) {
          await saveClientInternalMappings(projectId, mappingRows);
        }
      }

      // 2. Query inserted module phases to compute & save phase_gaps
      const sb = getSupabase();
      if (sb) {
        // Fetch courses for project
        const { data: courses } = await sb.from('courses').select('id').eq('project_id', projectId);
        const courseIds = (courses || []).map(c => c.id);

        if (courseIds.length > 0) {
          const { data: modules } = await sb.from('modules').select('id').in('course_id', courseIds);
          const moduleIds = (modules || []).map(m => m.id);

          if (moduleIds.length > 0) {
            const [intRes, cliRes, holGlobalRes, holProjRes] = await Promise.all([
              sb.from('internal_phases').select('*').in('module_id', moduleIds),
              sb.from('client_phases').select('*').in('module_id', moduleIds),
              sb.from('global_holidays').select('date'),
              sb.from('project_holidays').select('date').eq('project_id', projectId)
            ]);

            const globalDates = (holGlobalRes.data || []).map(h => h.date);
            const projDates = (holProjRes.data || []).map(h => h.date);
            const allHolidays = Array.from(new Set([...globalDates, ...projDates]));

            const internalPhases = intRes.data || [];
            const clientPhases = cliRes.data || [];
            const calculatedGaps: PhaseGap[] = [];

            // Group by module ID
            const moduleMap = new Map<string, { internal: any[]; client: any[] }>();
            moduleIds.forEach(mId => moduleMap.set(mId, { internal: [], client: [] }));

            internalPhases.forEach(ip => {
              const item = moduleMap.get(ip.module_id);
              if (item) item.internal.push(ip);
            });
            clientPhases.forEach(cp => {
              const item = moduleMap.get(cp.module_id);
              if (item) item.client.push(cp);
            });

            moduleMap.forEach(({ internal, client }) => {
              // Sort internal phases by strict workflow order
              const sortedInternal = [...internal].sort((a, b) => getWorkflowRank(a.phase_name) - getWorkflowRank(b.phase_name));

              // Compute internal-to-internal gaps (0-lag convention)
              for (let i = 0; i < sortedInternal.length - 1; i++) {
                const p1 = sortedInternal[i];
                const p2 = sortedInternal[i + 1];
                if (p1.internal_end_date && p2.internal_start_date) {
                  const gap = calculateZeroLagGap(p1.internal_end_date, p2.internal_start_date, allHolidays);
                  calculatedGaps.push({
                    projectId,
                    earlierPhaseId: p1.id,
                    laterPhaseId: p2.id,
                    workingDaysGap: gap,
                    gapType: 'internal_to_internal'
                  });
                }
              }

              // Compute client-to-internal gaps
              client.forEach(cp => {
                const clientMapping = clientFile?.mappingConfig?.phases?.find(
                  m => m.phaseName.toLowerCase() === cp.phase_name.toLowerCase()
                );
                const anchorName = clientMapping?.anchorInternalPhase || sortedInternal[0]?.phase_name || '';
                const anchorPoint = clientMapping?.anchorPoint || 'End';

                const targetInternal = sortedInternal.find(
                  ip => ip.phase_name.toLowerCase().includes(anchorName.toLowerCase()) || anchorName.toLowerCase().includes(ip.phase_name.toLowerCase())
                );

                if (targetInternal && cp.client_date) {
                  const baseDate = anchorPoint === 'Start'
                    ? (targetInternal.internal_start_date || targetInternal.internal_end_date)
                    : (targetInternal.internal_end_date || targetInternal.internal_start_date);

                  if (baseDate) {
                    const gap = calculateZeroLagGap(baseDate, cp.client_date, allHolidays);
                    calculatedGaps.push({
                      projectId,
                      earlierPhaseId: targetInternal.id,
                      laterPhaseId: cp.id,
                      workingDaysGap: gap,
                      gapType: 'client_to_internal'
                    });
                  }
                }
              });
            });

            if (calculatedGaps.length > 0) {
              await savePhaseGaps(projectId, calculatedGaps);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error computing ingestion gaps:", err);
    }

    // Call outer callback
    handleCommitSuccess(projectId);
  };

  const handleRefresh = async () => {
    if (selectedProject?.id) {
      setCheckingHolidays(true);
      try {
        const status = await checkHolidaysConfigured(selectedProject.id);
        setHolidaysConfigured(status.isConfigured);
      } catch (err) {
        console.error("Error refreshing data:", err);
      } finally {
        setCheckingHolidays(false);
      }
    }
  };

  return (
    <div id="data-ingestion-suite" className="-mt-6 space-y-6 animate-fade-up">
      {/* 1. Unified Top Header Bar matching ProjectEditor.tsx */}
      <div className="min-h-[52px] py-2 flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-[var(--border-subtle)]">
        {/* Left Section: Title + Inline Project Selector */}
        <div className="flex flex-wrap items-center gap-4">
          <h1 className={`text-2xl font-black tracking-tight ${theme === 'light' ? 'bg-gradient-to-r from-[#1DAA58] to-[#2484C6] bg-clip-text text-transparent' : 'text-white'}`}>Add Project</h1>
          <div className="flex items-center gap-2">
            <ProjectSelector
              theme={theme}
              selectedProject={selectedProject}
              onProjectSelect={setSelectedProject}
              triggerRefresh={dbRefreshCounter}
              currentUser={currentUser}
              onCommitSuccess={(projId?: string) => {
                if (projId) handleCommitSuccess(projId);
                else if (selectedProject?.id) handleCommitSuccess(selectedProject.id);
              }}
              variant="inline"
            />
          </div>
        </div>

        {/* Right Section: Action Buttons */}
        <div className="flex items-center gap-2.5">
          <ProjectSelector
            theme={theme}
            selectedProject={selectedProject}
            onProjectSelect={setSelectedProject}
            triggerRefresh={dbRefreshCounter}
            currentUser={currentUser}
            onCommitSuccess={(projId?: string) => {
              if (projId) handleCommitSuccess(projId);
              else if (selectedProject?.id) handleCommitSuccess(selectedProject.id);
            }}
            variant="actions"
          />
          <button
            onClick={handleRefresh}
            className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title="Refresh ingestion data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingHolidays ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Step 1 Pre-Ingestion Holiday Enforcement Gate Banner */}
      {selectedProject && holidaysConfigured === false && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold">Holiday Gate Active</h4>
              <p className="text-xs text-amber-200/90 mt-0.5">
                Please configure Global and Project Holidays before ingesting schedule spreadsheets.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsHolidayModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-97 cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Add Holidays</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                if (selectedProject?.id) {
                  setCheckingHolidays(true);
                  const status = await checkHolidaysConfigured(selectedProject.id);
                  setHolidaysConfigured(status.isConfigured);
                  setCheckingHolidays(false);
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingHolidays ? 'animate-spin' : ''}`} />
              <span>Re-check Holidays</span>
            </button>
          </div>
        </div>
      )}

      {/* Ingestion Steps 1 & 2 Upload and Mapping Grid */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 items-start ${
        holidaysConfigured === false ? 'opacity-50 pointer-events-none select-none' : ''
      }`}>
        {/* Client File Upload & Mapping */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#008DA5] text-white flex items-center justify-center font-bold text-xs">1</span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400">MAP DELIVERY PLAN</h2>
          </div>
          <UploadZone
            theme={theme}
            fileRole="client"
            currentFilename={clientFile?.filename || null}
            currentSheets={clientFile?.sheets || []}
            selectedSheetName={clientFile?.selectedSheetName || ''}
            onSelectSheetName={(name) => setClientFile(prev => prev ? { ...prev, selectedSheetName: name } : null)}
            onFileLoaded={(filename, sheets, defaultSheet) => {
              setClientFile({
                filename,
                sheets,
                selectedSheetName: defaultSheet
              });
            }}
            onClear={() => setClientFile(null)}
          />
          {clientFile && (
            <MappingSuite
              theme={theme}
              filename={clientFile.filename}
              fileRole="client"
              headers={clientFile.sheets.find(s => s.sheetName === clientFile.selectedSheetName)?.headers || []}
              savedConfig={clientFile.mappingConfig}
              onMappingApplied={(config) => {
                setClientFile(prev => prev ? { ...prev, mappingConfig: config } : null);
              }}
            />
          )}
        </div>

        {/* Internal File Upload & Mapping */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#008DA5] text-white flex items-center justify-center font-bold text-xs">2</span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400">MAP DEVELOPMENT PLAN</h2>
          </div>
          <UploadZone
            theme={theme}
            fileRole="internal"
            currentFilename={internalFile?.filename || null}
            currentSheets={internalFile?.sheets || []}
            selectedSheetName={internalFile?.selectedSheetName || ''}
            onSelectSheetName={(name) => setInternalFile(prev => prev ? { ...prev, selectedSheetName: name } : null)}
            onFileLoaded={(filename, sheets, defaultSheet) => {
              setInternalFile({
                filename,
                sheets,
                selectedSheetName: defaultSheet
              });
            }}
            onClear={() => setInternalFile(null)}
          />
          {internalFile && (
            <MappingSuite
              theme={theme}
              filename={internalFile.filename}
              fileRole="internal"
              headers={internalFile.sheets.find(s => s.sheetName === internalFile.selectedSheetName)?.headers || []}
              savedConfig={internalFile.mappingConfig}
              onMappingApplied={(config) => {
                setInternalFile(prev => prev ? { ...prev, mappingConfig: config } : null);
              }}
            />
          )}
        </div>
      </div>

      {/* Step 3 & 4 Comparative Joins & Transactional Commit */}
      <div className={`space-y-4 pt-4 ${
        holidaysConfigured === false ? 'opacity-50 pointer-events-none select-none' : ''
      }`}>
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-[#008DA5] text-white flex items-center justify-center font-bold text-xs">3</span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400">Timeline Comparative Joins</h2>
        </div>
        {isConfigCompleted ? (
          <ResultsGrid
            theme={theme}
            projectId={selectedProject?.id || 'proj-fallback'}
            projectName={selectedProject?.name || 'Local Sandbox'}
            clientFilename={clientFile!.filename}
            internalFilename={internalFile!.filename}
            results={joinResults}
            onCommitSuccess={(newProjId?: string) => handleIngestionCommitSuccess(newProjId || selectedProject?.id || 'proj-fallback')}
            currentUser={currentUser}
          />
        ) : (
          <div className={`p-8 rounded-lg border border-dashed text-center ${
            theme === 'dark' ? 'border-neutral-800 text-neutral-500' : 'border-neutral-300 text-neutral-400'
          }`}>
            <Layers className="w-8 h-8 mx-auto mb-2 opacity-50 text-[#008DA5]" />
            <p className="text-xs font-medium">Complete Step 1 & Step 2 mappings to generate join table comparison.</p>
          </div>
        )}
      </div>

      {isHolidayModalOpen && selectedProject && (
        <ProjectHolidayModal
          theme={theme}
          project={selectedProject}
          currentUser={currentUser}
          onClose={async () => {
            setIsHolidayModalOpen(false);
            if (selectedProject?.id) {
              setCheckingHolidays(true);
              const status = await checkHolidaysConfigured(selectedProject.id);
              setHolidaysConfigured(status.isConfigured);
              setCheckingHolidays(false);
            }
          }}
        />
      )}
    </div>
  );
}
