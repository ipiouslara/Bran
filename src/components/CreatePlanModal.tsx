/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Plus, 
  Trash2, 
  Layers, 
  Calendar, 
  ArrowRight, 
  Link2, 
  Sparkles, 
  Check, 
  AlertTriangle, 
  Globe, 
  CheckCircle2, 
  HelpCircle,
  FileSpreadsheet
} from 'lucide-react';
import { 
  getOrCreateCourse, 
  createModule, 
  saveClientInternalMappings, 
  updateProject, 
  createCoursePhase,
  getEffectiveHolidays,
  addProjectHoliday,
  removeProjectHoliday,
  EffectiveHoliday
} from '../lib/db';
import { Project } from '../types';
import ProjectHolidayModal from './ProjectHolidayModal';

interface ModuleDraftItem {
  id: string;
  name: string;
  language: string;
  screens: string;
  customMetadata: { key: string; value: string }[];
}

interface PhaseLinkDraft {
  clientPhaseName: string;
  anchorInternalPhase: string;
  anchorPoint: 'Start' | 'End';
  workingDaysGap: number;
}

interface LmsPhaseDraft {
  id: string;
  name: string;
  type: 'client' | 'internal';
}

interface CreatePlanModalProps {
  theme: 'dark' | 'light';
  project: Project;
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
  onClose: () => void;
  onSuccess: (projectId: string) => void;
}

const COMMON_LANGUAGES = [
  'English',
  'Spanish',
  'German',
  'French',
  'Japanese',
  'Chinese (Mandarin)',
  'Portuguese',
  'Italian',
  'Arabic',
  'Hindi'
];

const DEFAULT_DELIVERY_PRESETS = [
  'Alpha Delivery',
  'Beta Delivery',
  'Gold Delivery',
  'Final Sign-off'
];

const DEFAULT_DEV_PRESETS = [
  'Storyboard',
  'Graphic Design',
  'Development',
  'Internal QA'
];

export default function CreatePlanModal({
  theme,
  project,
  currentUser,
  onClose,
  onSuccess
}: CreatePlanModalProps) {
  // Course State
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');

  // Modules State
  const [modules, setModules] = useState<ModuleDraftItem[]>([
    { id: 'mod-' + Date.now(), name: '', language: 'English', screens: '', customMetadata: [] }
  ]);

  // Phase Definitions State
  const [deliveryPhases, setDeliveryPhases] = useState<string[]>([
    'Alpha Delivery',
    'Beta Delivery',
    'Final Sign-off'
  ]);
  const [newDeliveryPhaseInput, setNewDeliveryPhaseInput] = useState('');

  const [developmentPhases, setDevelopmentPhases] = useState<string[]>([
    'Storyboard',
    'Graphic Design',
    'Development',
    'Internal QA'
  ]);
  const [newDevPhaseInput, setNewDevPhaseInput] = useState('');

  // Phase Linking / Anchor Mappings State
  const [phaseLinks, setPhaseLinks] = useState<Record<string, PhaseLinkDraft>>({});

  // Holidays State
  const [effectiveHolidays, setEffectiveHolidays] = useState<EffectiveHoliday[]>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(false);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayLabel, setNewHolidayLabel] = useState('');
  const [isAddingHoliday, setIsAddingHoliday] = useState(false);

  // LMS Track State
  const [enableLmsTrack, setEnableLmsTrack] = useState(Boolean(project.has_lms_track));
  const [lmsPhases, setLmsPhases] = useState<LmsPhaseDraft[]>([
    { id: 'lms-1', name: 'LMS Upload', type: 'internal' },
    { id: 'lms-2', name: 'LMS QA & Testing', type: 'internal' },
    { id: 'lms-3', name: 'LMS Client Review', type: 'client' }
  ]);
  const [newLmsPhaseInput, setNewLmsPhaseInput] = useState('');
  const [newLmsPhaseType, setNewLmsPhaseType] = useState<'client' | 'internal'>('internal');

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load project holidays
  const loadHolidays = async () => {
    try {
      setLoadingHolidays(true);
      const data = await getEffectiveHolidays(project.id);
      setEffectiveHolidays(data);
    } catch (err) {
      console.error('Failed to load project holidays:', err);
    } finally {
      setLoadingHolidays(false);
    }
  };

  useEffect(() => {
    loadHolidays();
  }, [project.id]);

  // Sync phase links whenever delivery or development phases change
  useEffect(() => {
    setPhaseLinks(prev => {
      const next: Record<string, PhaseLinkDraft> = {};
      deliveryPhases.forEach(dPhase => {
        if (prev[dPhase]) {
          next[dPhase] = prev[dPhase];
        } else {
          // Default anchor to the last development phase if available
          const defaultAnchor = developmentPhases.length > 0
            ? developmentPhases[developmentPhases.length - 1]
            : 'None';
          next[dPhase] = {
            clientPhaseName: dPhase,
            anchorInternalPhase: defaultAnchor,
            anchorPoint: 'End',
            workingDaysGap: 0
          };
        }
      });
      return next;
    });
  }, [deliveryPhases, developmentPhases]);

  // Modules helpers
  const handleAddModule = () => {
    setModules(prev => [
      ...prev,
      { id: 'mod-' + Date.now(), name: '', language: 'English', screens: '', customMetadata: [] }
    ]);
  };

  const handleRemoveModule = (id: string) => {
    if (modules.length <= 1) return;
    setModules(prev => prev.filter(m => m.id !== id));
  };

  const handleUpdateModule = (id: string, updates: Partial<ModuleDraftItem>) => {
    setModules(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const handleAddModuleMetadata = (modId: string) => {
    setModules(prev => prev.map(m => {
      if (m.id !== modId) return m;
      return {
        ...m,
        customMetadata: [...m.customMetadata, { key: '', value: '' }]
      };
    }));
  };

  const handleUpdateModuleMetadata = (modId: string, idx: number, key: string, value: string) => {
    setModules(prev => prev.map(m => {
      if (m.id !== modId) return m;
      const nextMeta = [...m.customMetadata];
      nextMeta[idx] = { key, value };
      return { ...m, customMetadata: nextMeta };
    }));
  };

  const handleRemoveModuleMetadata = (modId: string, idx: number) => {
    setModules(prev => prev.map(m => {
      if (m.id !== modId) return m;
      const nextMeta = m.customMetadata.filter((_, i) => i !== idx);
      return { ...m, customMetadata: nextMeta };
    }));
  };

  // Phase Definitions helpers
  const handleAddDeliveryPhase = () => {
    const val = newDeliveryPhaseInput.trim();
    if (!val) return;
    if (!deliveryPhases.includes(val)) {
      setDeliveryPhases(prev => [...prev, val]);
    }
    setNewDeliveryPhaseInput('');
  };

  const handleRemoveDeliveryPhase = (name: string) => {
    setDeliveryPhases(prev => prev.filter(p => p !== name));
  };

  const handleAddDevPhase = () => {
    const val = newDevPhaseInput.trim();
    if (!val) return;
    if (!developmentPhases.includes(val)) {
      setDevelopmentPhases(prev => [...prev, val]);
    }
    setNewDevPhaseInput('');
  };

  const handleRemoveDevPhase = (name: string) => {
    setDevelopmentPhases(prev => prev.filter(p => p !== name));
  };

  // LMS Phase helpers
  const handleAddLmsPhase = () => {
    const val = newLmsPhaseInput.trim();
    if (!val) return;
    setLmsPhases(prev => [
      ...prev,
      { id: 'lms-' + Date.now(), name: val, type: newLmsPhaseType }
    ]);
    setNewLmsPhaseInput('');
  };

  const handleRemoveLmsPhase = (id: string) => {
    setLmsPhases(prev => prev.filter(p => p.id !== id));
  };

  // Holiday helpers
  const handleAddInlineHoliday = async () => {
    if (!newHolidayDate) return;
    const label = newHolidayLabel.trim() || 'Project Holiday';
    try {
      setIsAddingHoliday(true);
      await addProjectHoliday(project.id, project.name, newHolidayDate, label);
      setNewHolidayDate('');
      setNewHolidayLabel('');
      await loadHolidays();
    } catch (err: any) {
      console.error('Failed to add project holiday:', err);
    } finally {
      setIsAddingHoliday(false);
    }
  };

  const handleRemoveHoliday = async (date: string) => {
    try {
      await removeProjectHoliday(project.id, date);
      await loadHolidays();
    } catch (err: any) {
      console.error('Failed to remove holiday:', err);
    }
  };

  // Form Submission
  const handleSubmitPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanCourseName = courseName.trim();
    if (!cleanCourseName) {
      setErrorMessage('Course Name is required.');
      return;
    }

    const validModules = modules.filter(m => m.name.trim().length > 0);
    if (validModules.length === 0) {
      setErrorMessage('Please provide at least one valid module name.');
      return;
    }

    if (deliveryPhases.length === 0 && developmentPhases.length === 0) {
      setErrorMessage('Please define at least one Delivery or Development phase.');
      return;
    }

    try {
      setIsSubmitting(true);

      // 1. Create Course
      const courseRes = await getOrCreateCourse(project.id, cleanCourseName, courseCode.trim() || undefined);
      if (!courseRes.success || !courseRes.course) {
        throw new Error(courseRes.error || 'Failed to create course in project.');
      }
      const courseId = courseRes.course.id;

      // 2. Create Modules with metadata
      for (const mod of validModules) {
        const metadataPayload: Record<string, any> = {};
        const screensVal = mod.screens.trim();
        if (screensVal) {
          metadataPayload['client:SCREENS'] = screensVal;
          metadataPayload['internal:SCREENS'] = screensVal;
        }

        // Extra custom metadata
        mod.customMetadata.forEach(meta => {
          const k = meta.key.trim();
          const v = meta.value.trim();
          if (k) {
            metadataPayload[`client:${k}`] = v;
            metadataPayload[`internal:${k}`] = v;
          }
        });

        const modRes = await createModule(
          courseId,
          mod.name.trim(),
          mod.name.trim(),
          mod.language.trim() || 'English',
          developmentPhases,
          deliveryPhases,
          metadataPayload
        );

        if (!modRes.success) {
          console.warn(`Warning creating module ${mod.name}:`, modRes.error);
        }
      }

      // 3. Save Client-to-Internal Anchor Mappings
      const mappingRows = Object.values(phaseLinks).map(link => ({
        clientPhaseName: link.clientPhaseName,
        anchorInternalPhaseName: link.anchorInternalPhase,
        anchorPoint: link.anchorPoint
      }));

      if (mappingRows.length > 0) {
        await saveClientInternalMappings(project.id, mappingRows);
      }

      // 4. LMS Track Phases if enabled
      if (enableLmsTrack) {
        await updateProject(project.id, { has_lms_track: true });
        for (const lmsPhase of lmsPhases) {
          if (lmsPhase.name.trim()) {
            await createCoursePhase(courseId, lmsPhase.name.trim(), lmsPhase.type);
          }
        }
      }

      // Success
      onSuccess(project.id);
      onClose();
    } catch (err: any) {
      console.error('Error creating project plan:', err);
      setErrorMessage(err.message || 'Failed to create project plan. Please review inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const globalHolidaysCount = useMemo(() => {
    return effectiveHolidays.filter(h => h.type === 'global').length;
  }, [effectiveHolidays]);

  const projectHolidaysCount = useMemo(() => {
    return effectiveHolidays.filter(h => h.type === 'project').length;
  }, [effectiveHolidays]);

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/75 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-4xl my-auto max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden bg-[#16181D] border-[#B1B7C3]/15 text-white"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 p-5 sm:p-6 border-b border-neutral-800 flex items-center justify-between bg-[#1B1D23]">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">Create Project Plan Studio</h2>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {project.name}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Configure courses, modules, phase schedules, links, and holidays for this project.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmitPlan} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ── Section 1: Course & Modules ── */}
          <div className="space-y-4 bg-neutral-900/60 p-4 sm:p-5 rounded-xl border border-neutral-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide text-xs">
              <span className="w-5 h-5 rounded-full bg-emerald-500 text-neutral-950 flex items-center justify-center font-bold text-[10px]">1</span>
              <span>Course &amp; Module Details</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">
                  Course Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Information Security Fundamentals"
                  value={courseName}
                  onChange={e => setCourseName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">
                  Course Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. SEC-101"
                  value={courseCode}
                  onChange={e => setCourseCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Modules List */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                  Modules ({modules.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddModule}
                  className="text-xs px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg flex items-center gap-1 font-semibold transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Another Module</span>
                </button>
              </div>

              {modules.map((mod, modIdx) => (
                <div key={mod.id} className="p-3 bg-neutral-950 rounded-xl border border-neutral-800/80 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-neutral-400">Module {modIdx + 1}</span>
                    {modules.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveModule(mod.id)}
                        className="p-1 rounded text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Remove module"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5">
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] text-neutral-400 mb-1">Module Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Module 1: Cyber Hygiene"
                        value={mod.name}
                        onChange={e => handleUpdateModule(mod.id, { name: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[10px] text-neutral-400 mb-1">Language</label>
                      <select
                        value={mod.language}
                        onChange={e => handleUpdateModule(mod.id, { language: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-white focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                      >
                        {COMMON_LANGUAGES.map(lang => (
                          <option key={lang} value={lang}>{lang}</option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-1">
                      <label className="block text-[10px] text-neutral-400 mb-1">Screens</label>
                      <input
                        type="text"
                        placeholder="e.g. 24"
                        value={mod.screens}
                        onChange={e => handleUpdateModule(mod.id, { screens: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-white focus:ring-1 focus:ring-emerald-500 focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* Extra custom metadata */}
                  {mod.customMetadata.length > 0 && (
                    <div className="pt-2 border-t border-neutral-800/60 space-y-2">
                      <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                        Custom Metadata Fields
                      </span>
                      {mod.customMetadata.map((meta, mIdx) => (
                        <div key={mIdx} className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Key (e.g. Complexity)"
                            value={meta.key}
                            onChange={e => handleUpdateModuleMetadata(mod.id, mIdx, e.target.value, meta.value)}
                            className="flex-1 px-2.5 py-1 text-xs rounded bg-neutral-900 border border-neutral-800 text-white focus:outline-none"
                          />
                          <input
                            type="text"
                            placeholder="Value (e.g. High)"
                            value={meta.value}
                            onChange={e => handleUpdateModuleMetadata(mod.id, mIdx, meta.key, e.target.value)}
                            className="flex-1 px-2.5 py-1 text-xs rounded bg-neutral-900 border border-neutral-800 text-white focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveModuleMetadata(mod.id, mIdx)}
                            className="p-1 text-neutral-500 hover:text-rose-400"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <button
                      type="button"
                      onClick={() => handleAddModuleMetadata(mod.id)}
                      className="text-[10px] text-neutral-400 hover:text-emerald-400 flex items-center gap-1 font-semibold transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Custom Metadata (e.g. Complexity, Type)</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Section 2: Phase Definitions ── */}
          <div className="space-y-4 bg-neutral-900/60 p-4 sm:p-5 rounded-xl border border-neutral-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide text-xs">
              <span className="w-5 h-5 rounded-full bg-cyan-500 text-neutral-950 flex items-center justify-center font-bold text-[10px]">2</span>
              <span>Delivery &amp; Development Phase Schedules</span>
            </h3>

            {/* Delivery Phases */}
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                Client Delivery Milestones / Phases ({deliveryPhases.length})
              </label>

              <div className="flex flex-wrap gap-1.5">
                {deliveryPhases.map(phaseName => (
                  <span
                    key={phaseName}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                  >
                    <span>{phaseName}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDeliveryPhase(phaseName)}
                      className="hover:text-rose-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Add new delivery milestone (e.g. UAT Delivery)"
                  value={newDeliveryPhaseInput}
                  onChange={e => setNewDeliveryPhaseInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddDeliveryPhase(); } }}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
                <button
                  type="button"
                  onClick={handleAddDeliveryPhase}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Add Milestone
                </button>
              </div>

              {/* Suggestions */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] text-neutral-400">
                <span>Presets:</span>
                {DEFAULT_DELIVERY_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    disabled={deliveryPhases.includes(preset)}
                    onClick={() => setDeliveryPhases(prev => [...prev, preset])}
                    className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:pointer-events-none text-neutral-300 cursor-pointer"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Development Phases */}
            <div className="space-y-2 pt-3 border-t border-neutral-800/80">
              <label className="block text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                Internal Development Workflow Phases ({developmentPhases.length})
              </label>

              <div className="flex flex-wrap gap-1.5">
                {developmentPhases.map(phaseName => (
                  <span
                    key={phaseName}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                  >
                    <span>{phaseName}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDevPhase(phaseName)}
                      className="hover:text-rose-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Add internal phase (e.g. Audio Sync)"
                  value={newDevPhaseInput}
                  onChange={e => setNewDevPhaseInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddDevPhase(); } }}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleAddDevPhase}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Add Phase
                </button>
              </div>

              {/* Suggestions */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] text-neutral-400">
                <span>Presets:</span>
                {DEFAULT_DEV_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    disabled={developmentPhases.includes(preset)}
                    onClick={() => setDevelopmentPhases(prev => [...prev, preset])}
                    className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:pointer-events-none text-neutral-300 cursor-pointer"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Section 3: Phase Linking / Anchor Mappings (Feature from Add Project) ── */}
          <div className="space-y-4 bg-neutral-900/60 p-4 sm:p-5 rounded-xl border border-neutral-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide text-xs">
              <span className="w-5 h-5 rounded-full bg-amber-500 text-neutral-950 flex items-center justify-center font-bold text-[10px]">3</span>
              <span>Link Phases (Anchor Mappings &amp; Gaps)</span>
            </h3>

            <p className="text-xs text-neutral-400">
              Link each Client Delivery milestone to an Internal Development anchor phase to automate date cascading.
            </p>

            {deliveryPhases.length === 0 ? (
              <p className="text-xs text-neutral-500 italic">No delivery milestones defined above.</p>
            ) : (
              <div className="space-y-3">
                {deliveryPhases.map(dPhase => {
                  const link = phaseLinks[dPhase] || {
                    clientPhaseName: dPhase,
                    anchorInternalPhase: developmentPhases[developmentPhases.length - 1] || 'None',
                    anchorPoint: 'End',
                    workingDaysGap: 0
                  };

                  return (
                    <div key={dPhase} className="p-3 bg-neutral-950 rounded-xl border border-neutral-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 min-w-[160px]">
                        <span className="font-bold text-cyan-400">{dPhase}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
                      </div>

                      <div className="flex flex-wrap items-center gap-3 flex-1">
                        <div className="flex-1 min-w-[140px]">
                          <label className="block text-[10px] text-neutral-400 mb-0.5">Anchor Internal Phase</label>
                          <select
                            value={link.anchorInternalPhase}
                            onChange={e => {
                              const val = e.target.value;
                              setPhaseLinks(prev => ({
                                ...prev,
                                [dPhase]: { ...link, anchorInternalPhase: val }
                              }));
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-white focus:outline-none"
                          >
                            <option value="None">None (Unanchored)</option>
                            {developmentPhases.map(devP => (
                              <option key={devP} value={devP}>{devP}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-neutral-400 mb-0.5">Anchor Point</label>
                          <div className="flex items-center gap-1 bg-neutral-900 p-0.5 rounded-lg border border-neutral-800">
                            {(['Start', 'End'] as const).map(pt => (
                              <button
                                key={pt}
                                type="button"
                                onClick={() => {
                                  setPhaseLinks(prev => ({
                                    ...prev,
                                    [dPhase]: { ...link, anchorPoint: pt }
                                  }));
                                }}
                                className={`px-2.5 py-1 text-[11px] rounded font-semibold transition-colors ${
                                  link.anchorPoint === pt
                                    ? 'bg-amber-500 text-neutral-950'
                                    : 'text-neutral-400 hover:text-white'
                                }`}
                              >
                                {pt} Date
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="w-20">
                          <label className="block text-[10px] text-neutral-400 mb-0.5">Gap (Days)</label>
                          <input
                            type="number"
                            value={link.workingDaysGap}
                            onChange={e => {
                              const val = parseInt(e.target.value, 10) || 0;
                              setPhaseLinks(prev => ({
                                ...prev,
                                [dPhase]: { ...link, workingDaysGap: val }
                              }));
                            }}
                            className="w-full px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-white font-mono text-center focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Section 4: Project Holidays Configuration (Holiday Gate & Management) ── */}
          <div className="space-y-4 bg-neutral-900/60 p-4 sm:p-5 rounded-xl border border-neutral-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide text-xs">
                <span className="w-5 h-5 rounded-full bg-violet-500 text-neutral-950 flex items-center justify-center font-bold text-[10px]">4</span>
                <span>Project Holidays Configuration</span>
              </h3>

              <button
                type="button"
                onClick={() => setIsHolidayModalOpen(true)}
                className="text-xs px-3 py-1 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/20 rounded-lg flex items-center gap-1.5 font-semibold transition-all cursor-pointer self-start sm:self-auto"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Open Full Holiday Calendar</span>
              </button>
            </div>

            <p className="text-xs text-neutral-400">
              Configure project-specific holidays so working day counts and timeline cascading dates are accurate.
            </p>

            {/* Quick Status Pill */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-300 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span>{globalHolidaysCount} Global Holidays Active</span>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-violet-400" />
                <span>{projectHolidaysCount} Project-Specific Holidays</span>
              </span>
            </div>

            {/* Inline Quick Add Holiday */}
            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800/80 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Quick Add Project Holiday
              </span>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="date"
                  value={newHolidayDate}
                  onChange={e => setNewHolidayDate(e.target.value)}
                  className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-white focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Holiday label (e.g. Regional Festival, Client Blackout)"
                  value={newHolidayLabel}
                  onChange={e => setNewHolidayLabel(e.target.value)}
                  className="flex-1 w-full px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-xs text-white focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!newHolidayDate || isAddingHoliday}
                  onClick={handleAddInlineHoliday}
                  className="w-full sm:w-auto px-3.5 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  {isAddingHoliday ? 'Adding...' : 'Add Date'}
                </button>
              </div>

              {/* Active Project Holidays List */}
              {projectHolidaysCount > 0 && (
                <div className="pt-2 flex flex-wrap gap-2">
                  {effectiveHolidays.filter(h => h.type === 'project').map(h => (
                    <span
                      key={h.date}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-violet-500/10 text-violet-300 border border-violet-500/20"
                    >
                      <span className="font-mono font-bold">{h.date}</span>
                      <span>({h.label})</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveHoliday(h.date)}
                        className="hover:text-rose-400 transition-colors ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Section 5: LMS Workstream Track (Optional) ── */}
          <div className="space-y-4 bg-neutral-900/60 p-4 sm:p-5 rounded-xl border border-neutral-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide text-xs">
                <span className="w-5 h-5 rounded-full bg-blue-500 text-neutral-950 flex items-center justify-center font-bold text-[10px]">5</span>
                <span>LMS Workstream Track (Optional)</span>
              </h3>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableLmsTrack}
                  onChange={e => setEnableLmsTrack(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="ml-2 text-xs font-semibold text-neutral-300">
                  {enableLmsTrack ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>

            {enableLmsTrack && (
              <div className="space-y-3 pt-2">
                <p className="text-xs text-neutral-400">
                  Define Course-level LMS phases (e.g. upload, testing, staging, client sign-off) that track across course languages.
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {lmsPhases.map(ph => (
                    <span
                      key={ph.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20"
                    >
                      <span>{ph.name}</span>
                      <span className="text-[10px] uppercase opacity-70">({ph.type})</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveLmsPhase(ph.id)}
                        className="hover:text-rose-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Add LMS phase (e.g. Scorm Packaging)"
                    value={newLmsPhaseInput}
                    onChange={e => setNewLmsPhaseInput(e.target.value)}
                    className="flex-1 w-full px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white focus:outline-none"
                  />
                  <select
                    value={newLmsPhaseType}
                    onChange={e => setNewLmsPhaseType(e.target.value as any)}
                    className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white focus:outline-none cursor-pointer"
                  >
                    <option value="internal">Internal Phase</option>
                    <option value="client">Client Delivery Phase</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddLmsPhase}
                    className="w-full sm:w-auto px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Add LMS Phase
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Sticky Footer */}
        <div className="shrink-0 p-4 sm:p-5 border-t border-neutral-800 bg-[#1B1D23] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-neutral-400 flex items-center gap-3">
            <span>{modules.filter(m => m.name.trim()).length} Module(s)</span>
            <span>•</span>
            <span>{deliveryPhases.length} Delivery</span>
            <span>•</span>
            <span>{developmentPhases.length} Dev Phases</span>
            {enableLmsTrack && (
              <>
                <span>•</span>
                <span className="text-blue-400">{lmsPhases.length} LMS Phases</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmitPlan}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#1DAA58] to-[#2484C6] text-white hover:brightness-110 shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-97 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSubmitting ? 'Creating Project Plan...' : 'Create & Commit Plan'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Embedded Project Holidays Modal if requested */}
      {isHolidayModalOpen && (
        <ProjectHolidayModal
          theme={theme}
          project={project}
          currentUser={currentUser}
          onClose={() => {
            setIsHolidayModalOpen(false);
            loadHolidays();
          }}
        />
      )}
    </div>,
    document.body
  );
}
