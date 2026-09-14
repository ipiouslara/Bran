import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { Settings, Save, X, RefreshCw, AlertCircle, Check, Briefcase, Layers, ArrowRight, Calendar, User, Info, AlertTriangle, Trash2, Plus, FileSpreadsheet } from 'lucide-react';
import { Project, Course, Module, Phase, Employee } from '../types';
import { getSupabase, getEmployees, getHolidays, getEffectiveHolidays, getEffectiveHolidayDates, notifyNewAssignment, notifyDateChanged, writeAuditLog as dbWriteAuditLog, getPhaseLabel, assignPhase, updatePhaseStatus, updateClientPhaseStatus, getCurrentUserId, deleteModules, createModule, dispatchCascadeNotification, getClientInternalMappings, saveClientInternalMappings, getPhaseGaps, savePhaseGaps, updateCoursePhaseSequence, updateProject, createCoursePhase, updateCourseMetadata, updateModuleMetadata, getOrCreateCourse } from '../lib/db';
import { runBidirectionalCascade, detectSequenceConflicts } from '../utils/cascadingEngine';
import {
  isWorkingDay as isWorkingDayUtil,
  addWorkingDays as addWorkingDaysUtil,
  getWorkingDaysDifference as getWorkingDaysDifferenceUtil,
  workingDaysBetween,
  getNonWorkingDayReason
} from '../utils/workingDays';
import { formatDateDDMMYYYY } from '../utils/dateFormatter';
import { useTimelineRealtime } from '../hooks/useTimelineRealtime';
import { MemoizedDateCell } from './MemoizedDateCell';
import ReportExportModal from './ReportExportModal';
import CreatePlanModal from './CreatePlanModal';

interface ProjectEditorProps {
  theme: 'dark' | 'light';
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
  refreshTrigger?: number;
  onProjectsChanged?: () => void;
  onNavigateToIngestion?: (projId?: string) => void;
}

export default function ProjectEditor({
  theme,
  currentUser,
  refreshTrigger = 0,
  onProjectsChanged,
  onNavigateToIngestion
}: ProjectEditorProps) {
  // DB entities
  const [projects, setProjects] = useState<Project[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [projectLinks, setProjectLinks] = useState<{ employee_id: string; project_id: string }[]>([]);

  // Selection state (session-persistent top filter bar)
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => sessionStorage.getItem('project_editor_project_id') || '');
  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => sessionStorage.getItem('project_editor_course_id') || '');
  
  // Tab/slider state (Delivery 1st, Development 2nd)
  const [activeTab, setActiveTab] = useState<'client' | 'internal'>('client');

  // Workstream Track Switcher State: Content (Module level) vs LMS (Course level)
  const [activeTrack, setActiveTrack] = useState<'content' | 'lms'>('content');
  const [selectedCourseIdsForLms, setSelectedCourseIdsForLms] = useState<Set<string>>(new Set());

  // Project Settings Modal (Directly in Editor)
  const [projectSettingsModalOpen, setProjectSettingsModalOpen] = useState(false);
  const [editingProjectHasLms, setEditingProjectHasLms] = useState(false);
  const [isSavingProjectSettings, setIsSavingProjectSettings] = useState(false);

  // LMS Phase Creation Modal
  const [showCreateLmsPhaseModal, setShowCreateLmsPhaseModal] = useState(false);
  const [newLmsPhaseName, setNewLmsPhaseName] = useState('');
  const [newLmsPhaseType, setNewLmsPhaseType] = useState<'client' | 'internal'>('client');
  const [isCreatingLmsPhase, setIsCreatingLmsPhase] = useState(false);

  // Course Metadata Inline/Modal Edit
  const [editingCourseMetadata, setEditingCourseMetadata] = useState<{ courseId: string; courseName: string; key: string; value: string } | null>(null);

  // Single Edit View state
  const [selectedModuleCode, setSelectedModuleCode] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');

  // Export report modal state
  const [exportReportModal, setExportReportModal] = useState<{ open: boolean; mode: 'internal' | 'client' }>({
    open: false,
    mode: 'client'
  });

  // Manual Creation Studio modal
  const [isCreatePlanModalOpen, setIsCreatePlanModalOpen] = useState(false);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [editingCourseName, setEditingCourseName] = useState('');
  const [editingCourseCode, setEditingCourseCode] = useState('');
  const [editingCourseProjectId, setEditingCourseProjectId] = useState('');
  
  const [editingModuleName, setEditingModuleName] = useState('');
  const [editingModuleCode, setEditingModuleCode] = useState('');
  const [editingModuleCourseId, setEditingModuleCourseId] = useState('');
  const [editingModuleLanguage, setEditingModuleLanguage] = useState('');

  // Single edit Phase state
  const [editedPhases, setEditedPhases] = useState<Record<string, Phase>>({});

  // Table View state (unsaved cell overrides)
  const [pendingTableEdits, setPendingTableEdits] = useState<Record<string, Partial<Phase>>>({});
  const [editingCell, setEditingCell] = useState<{ phaseId: string; field: 'internalStartDate' | 'internalEndDate' | 'clientDate' } | null>(null);
  const [remoteConflicts, setRemoteConflicts] = useState<Record<string, boolean>>({});

  // UI state
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Warning Modals
  const [orphanWarning, setOrphanWarning] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Cascade Shift Modal State
  const [cascadeModal, setCascadeModal] = useState<{
    editedPhaseName: string;
    delta: number;
    affectedPhases: {
      name: string;
      oldDate: string;
      newDate: string;
      type?: 'Internal' | 'Client';
      isPaired?: boolean;
    }[];
    completedSkippedCount: number;
    largeShiftWarning?: string;
    clientWarnings: string[];
    onConfirm: () => void;
    onApplySingleOnly?: () => void;
    onCancel?: () => void;
  } | null>(null);

  // Client Header Anchor Management Modal
  const [headerAnchorModal, setHeaderAnchorModal] = useState<{
    clientPhaseName: string;
    anchorInternalPhase: string;
    anchorPoint: 'Start' | 'End';
    workingDaysGap: number;
  } | null>(null);

  // Row selection & deletion state for Table Editor
  const [selectedModuleIds, setSelectedModuleIds] = useState<Set<string>>(new Set());
  const [deleteModal, setDeleteModal] = useState<{
    title: string;
    message: string;
    moduleIds: string[];
  } | null>(null);

  // Create Row (Target Project, Course & Modules) state
  const [showCreateRowModal, setShowCreateRowModal] = useState(false);
  const [targetProjectIdForRow, setTargetProjectIdForRow] = useState('');
  const [courseNameForRow, setCourseNameForRow] = useState('');
  const [moduleRowsToAdd, setModuleRowsToAdd] = useState<{
    id: string;
    name: string;
    language: string;
    screens: string;
  }[]>([
    { id: 'draft-1', name: '', language: 'English', screens: '' }
  ]);
  const [isCreatingRow, setIsCreatingRow] = useState(false);

  // Local state for inline module metadata edits (e.g. Screens input tabs)
  const [localModuleMetadata, setLocalModuleMetadata] = useState<Record<string, Record<string, string>>>({});

  const toggleSelectAllModules = () => {
    if (selectedModuleIds.size === activeModules.length) {
      setSelectedModuleIds(new Set());
    } else {
      setSelectedModuleIds(new Set(activeModules.map(m => m.id)));
    }
  };

  const toggleSelectModule = (modId: string) => {
    setSelectedModuleIds(prev => {
      const next = new Set(prev);
      if (next.has(modId)) {
        next.delete(modId);
      } else {
        next.add(modId);
      }
      return next;
    });
  };

  const canDeleteModules = currentUser?.role === 'Admin' || currentUser?.role === 'Project Manager';

  const handleTriggerSingleDelete = (mod: Module) => {
    setDeleteModal({
      title: 'Delete Module Row',
      message: `Are you sure you want to delete module "${mod.name}" (${mod.code})? This will permanently delete its associated internal and client phase timelines.`,
      moduleIds: [mod.id]
    });
  };

  const handleTriggerBulkDelete = () => {
    if (selectedModuleIds.size === 0) return;
    setDeleteModal({
      title: 'Delete Selected Module Rows',
      message: `Are you sure you want to delete ${selectedModuleIds.size} selected module row(s)? This will permanently delete all associated phase timelines.`,
      moduleIds: Array.from(selectedModuleIds)
    });
  };

  const handleConfirmDeleteModules = async () => {
    if (!deleteModal || deleteModal.moduleIds.length === 0) return;
    try {
      setLoading(true);
      setError(null);
      await deleteModules(deleteModal.moduleIds);

      const deletedCount = deleteModal.moduleIds.length;
      setDeleteModal(null);
      setSelectedModuleIds(new Set());
      setRefreshCounter(prev => prev + 1);
      setSuccess(`Successfully deleted ${deletedCount} module row(s).`);
      if (onProjectsChanged) onProjectsChanged();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to delete module rows.');
    } finally {
      setLoading(false);
    }
  };

  const handleProjectSelect = (projId: string) => {
    setSelectedProjectId(projId);
    setSelectedCourseId('');
    setSelectedModuleCode('');
    setSelectedLanguage('');
    sessionStorage.setItem('project_editor_project_id', projId);
    sessionStorage.removeItem('project_editor_course_id');
  };

  const handleCourseSelect = (courseId: string) => {
    setSelectedCourseId(courseId);
    setSelectedModuleCode('');
    setSelectedLanguage('');
    sessionStorage.setItem('project_editor_course_id', courseId);
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error("Supabase client is not initialized.");

      const [projRes, crsRes, modRes, phaseRes, empRes, holRes, linkRes, intSeqRes, cliSeqRes] = await Promise.all([
        sb.from('projects').select('*').order('name'),
        sb.from('courses').select('*').order('name'),
        sb.from('modules').select('*').order('code'),
        sb.from('consolidated_phases_view').select('*'),
        getEmployees(),
        getEffectiveHolidayDates(),
        sb.from('employee_project_links').select('*'),
        sb.from('internal_phases').select('id, phase_sequence'),
        sb.from('client_phases').select('id, phase_sequence, status')
      ]);

      let rawProjects = (projRes.data || []).map((p: any) => ({
        id: String(p.id),
        name: p.name || '',
        ownerId: p.owner_id ? String(p.owner_id) : undefined,
        createdAt: p.created_at,
        has_lms_track: Boolean(p.has_lms_track),
        column_order: p.column_order || null
      }));

      // Restrict projects for Project Managers to only owned projects
      if (currentUser?.role === 'Project Manager') {
        rawProjects = rawProjects.filter(p => p.ownerId === currentUser.id);
      }

      setProjects(rawProjects);
      
      const mappedCourses: Course[] = (crsRes.data || []).map((c: any) => ({
        id: String(c.id),
        projectId: String(c.project_id || c.projectId || c.project?.id || ''),
        name: c.name || '',
        code: c.code || c.name || '',
        metadata: c.metadata || null
      }));
      setCourses(mappedCourses);
      console.log('[ProjectEditor] Processed Courses:', mappedCourses);

      const mappedModules: Module[] = (modRes.data || []).map((m: any) => ({
        id: String(m.id),
        courseId: String(m.course_id || m.courseId || m.courses?.id || ''),
        name: m.name || '',
        code: m.code || m.name || '',
        language: m.language || 'English',
        metadata: m.metadata || null,
        clientCustomMetadata: m.client_custom_metadata || null,
        internalCustomMetadata: m.internal_custom_metadata || null
      }));
      setModules(mappedModules);
      console.log('[ProjectEditor] Processed Modules count:', mappedModules.length);

      const seqMap = new Map<string, number>();
      const clientStatusMap = new Map<string, string>();
      (intSeqRes.data || []).forEach((ip: any) => {
        if (ip.phase_sequence != null) seqMap.set(String(ip.id), ip.phase_sequence);
      });
      (cliSeqRes.data || []).forEach((cp: any) => {
        if (cp.phase_sequence != null) seqMap.set(String(cp.id), cp.phase_sequence);
        if (cp.status) clientStatusMap.set(String(cp.id), cp.status);
      });

      const mappedPhases: Phase[] = (phaseRes.data || []).map((p: any) => ({
        id: String(p.id),
        moduleId: p.module_id ? String(p.module_id) : null,
        courseId: p.course_id ? String(p.course_id) : null,
        entityLevel: (p.entity_level || (p.course_id && !p.module_id ? 'course' : 'module')) as 'module' | 'course',
        phaseName: p.phase_name || p.phaseName || '',
        phaseType: p.phase_type || p.phaseType || null,
        phaseTypePhase: p.phase_type_phase || p.type_phase || p.phaseTypePhase || null,
        phaseSequence: p.phase_sequence ?? seqMap.get(String(p.internal_phase_id || p.client_phase_id || p.id)) ?? null,
        clientDate: p.client_date || p.clientDate || null,
        internalStartDate: p.internal_start_date || p.internalStartDate || null,
        internalEndDate: p.internal_end_date || p.internalEndDate || null,
        sourceFileRef: p.source_file_ref || p.sourceFileRef || '',
        sourceFile: p.source_file || p.sourceFile || (p.internal_start_date || p.internal_end_date ? 'Internal' : (p.client_date ? 'Client' : 'Internal')),
        assignedTo: p.assigned_to || p.assignedTo || null,
        status: (p.status || clientStatusMap.get(String(p.client_phase_id || p.id)) || 'Pending') as Phase['status'],
        clientStatus: (clientStatusMap.get(String(p.client_phase_id || p.id)) as Phase['clientStatus']) || null,
        internalStatus: (p.status as Phase['internalStatus']) || null,
        rejectionNote: p.rejection_note || p.rejectionNote || null,
        clientPhaseId: p.client_phase_id || p.clientPhaseId || null,
        internalPhaseId: p.internal_phase_id || p.internalPhaseId || null,
        metadata: p.metadata || null
      }));
      setPhases(mappedPhases);
      console.log('[ProjectEditor] Processed Phases count:', mappedPhases.length);

      setEmployees(empRes || []);
      setHolidays(holRes || []);
      setProjectLinks(linkRes.data || []);
    } catch (err: any) {
      console.error('[ProjectEditor] Error loading project editor data:', err);
      setError(err.message || 'Failed to load timeline workspace data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser, refreshTrigger, refreshCounter]);

  // Selections & filtering helpers
  const activeCourses = useMemo(() => {
    if (!selectedProjectId) return [];
    return courses.filter(c => String(c.projectId || '').trim() === String(selectedProjectId || '').trim());
  }, [courses, selectedProjectId]);

  const currentProject = useMemo(() => {
    return projects.find(p => p.id === selectedProjectId);
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (!currentProject?.has_lms_track && activeTrack === 'lms') {
      setActiveTrack('content');
    }
  }, [currentProject?.has_lms_track, activeTrack]);

  // Automatically clear course selection if selected course doesn't belong to the active project
  useEffect(() => {
    if (selectedCourseId && activeCourses.length > 0) {
      const existsInProject = activeCourses.some(c => String(c.id).trim() === String(selectedCourseId).trim());
      if (!existsInProject) {
        setSelectedCourseId('');
        setSelectedModuleCode('');
        setSelectedLanguage('');
        sessionStorage.removeItem('project_editor_course_id');
      }
    } else if (selectedCourseId && activeCourses.length === 0) {
      setSelectedCourseId('');
      setSelectedModuleCode('');
      setSelectedLanguage('');
      sessionStorage.removeItem('project_editor_course_id');
    }
  }, [selectedProjectId, activeCourses, selectedCourseId]);

  const activeCourseIds = useMemo(() => {
    return new Set(activeCourses.map(c => c.id));
  }, [activeCourses]);

  const lmsInternalPhaseNames = useMemo(() => {
    if (!selectedProjectId) return [];
    const coursePhases = phases.filter(ph => 
      ph.entityLevel === 'course' && 
      ph.courseId && 
      activeCourseIds.has(ph.courseId) &&
      (ph.sourceFile === 'Internal' || !ph.sourceFile || !!ph.internalStartDate || !!ph.internalEndDate)
    );
    const unique = Array.from(new Set(coursePhases.map(ph => ph.phaseName).filter(Boolean)));
    return unique.sort((a, b) => {
      const phasesA = coursePhases.filter(ph => ph.phaseName === a);
      const phasesB = coursePhases.filter(ph => ph.phaseName === b);
      const seqA = Math.min(...phasesA.map(p => (p.phaseSequence && p.phaseSequence > 0) ? p.phaseSequence : Infinity));
      const seqB = Math.min(...phasesB.map(p => (p.phaseSequence && p.phaseSequence > 0) ? p.phaseSequence : Infinity));
      if (seqA !== Infinity || seqB !== Infinity) {
        if (seqA !== seqB) return seqA - seqB;
      }
      return a.localeCompare(b);
    });
  }, [phases, selectedProjectId, activeCourseIds]);

  const lmsClientPhaseNames = useMemo(() => {
    if (!selectedProjectId) return [];
    const internalSet = new Set(lmsInternalPhaseNames);
    const coursePhases = phases.filter(ph => 
      ph.entityLevel === 'course' && 
      ph.courseId && 
      activeCourseIds.has(ph.courseId) &&
      !internalSet.has(ph.phaseName) &&
      (ph.sourceFile === 'Client' || !!ph.clientDate)
    );
    const unique = Array.from(new Set(coursePhases.map(ph => ph.phaseName).filter(Boolean)));
    return unique.sort((a, b) => {
      const phasesA = coursePhases.filter(ph => ph.phaseName === a);
      const phasesB = coursePhases.filter(ph => ph.phaseName === b);
      const seqA = Math.min(...phasesA.map(p => (p.phaseSequence && p.phaseSequence > 0) ? p.phaseSequence : Infinity));
      const seqB = Math.min(...phasesB.map(p => (p.phaseSequence && p.phaseSequence > 0) ? p.phaseSequence : Infinity));
      if (seqA !== Infinity || seqB !== Infinity) {
        if (seqA !== seqB) return seqA - seqB;
      }
      return a.localeCompare(b);
    });
  }, [phases, selectedProjectId, activeCourseIds, lmsInternalPhaseNames]);

  const courseCustomColNames = useMemo(() => {
    if (!selectedProjectId) return [];
    const keys = new Set<string>();
    activeCourses.forEach(c => {
      if (c.metadata && typeof c.metadata === 'object') {
        Object.keys(c.metadata).forEach(k => keys.add(k));
      }
    });
    return Array.from(keys).sort();
  }, [activeCourses, selectedProjectId]);

  // LMS Rows: each course & language combination is displayed on its own row
  const lmsRows = useMemo(() => {
    if (!selectedProjectId) return [];
    const rows: {
      rowKey: string;
      course: Course;
      language: string;
      sNo: number;
    }[] = [];

    // Filter courses if a specific course is selected in the dropdown
    const coursesToRender = selectedCourseId
      ? activeCourses.filter(c => String(c.id).trim() === String(selectedCourseId).trim())
      : activeCourses;

    let count = 1;
    coursesToRender.forEach(course => {
      // Find all modules under this course in the current project
      const courseModules = modules.filter(m => String(m.courseId || '').trim() === String(course.id).trim());
      const rawLangs = Array.from(new Set(
        courseModules
          .map(m => (m.language || '').trim())
          .filter(Boolean)
      ));

      // Each language must display even if it is of same course
      const displayLangs = rawLangs.length > 0 ? rawLangs : ['Default/English'];

      displayLangs.forEach(lang => {
        rows.push({
          rowKey: `${course.id}_${lang.toLowerCase()}`,
          course,
          language: lang,
          sNo: count++
        });
      });
    });

    return rows;
  }, [activeCourses, modules, selectedProjectId, selectedCourseId]);

  const toggleSelectAllCoursesForLms = () => {
    if (selectedCourseIdsForLms.size === lmsRows.length) {
      setSelectedCourseIdsForLms(new Set());
    } else {
      setSelectedCourseIdsForLms(new Set(lmsRows.map(r => r.rowKey)));
    }
  };

  const toggleSelectCourseForLms = (rowKey: string) => {
    setSelectedCourseIdsForLms(prev => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  const handleCreateLmsPhaseColumn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const phaseName = newLmsPhaseName.trim();
    if (!phaseName) {
      showError('Phase name is required.');
      return;
    }
    if (activeCourses.length === 0) {
      showError('No courses available in this project to assign the LMS phase.');
      return;
    }

    try {
      setIsCreatingLmsPhase(true);
      setError(null);

      // Create phase for each course & language row
      if (lmsRows.length > 0) {
        for (const row of lmsRows) {
          await createCoursePhase(row.course.id, phaseName, newLmsPhaseType, undefined, {
            language: row.language
          });
        }
      } else {
        for (const course of activeCourses) {
          await createCoursePhase(course.id, phaseName, newLmsPhaseType);
        }
      }

      setShowCreateLmsPhaseModal(false);
      setNewLmsPhaseName('');
      setRefreshCounter(prev => prev + 1);
      showSuccess(`LMS Phase "${phaseName}" added successfully.`);
      if (onProjectsChanged) onProjectsChanged();
    } catch (err: any) {
      console.error(err);
      showError(err.message || 'Failed to create LMS phase.');
    } finally {
      setIsCreatingLmsPhase(false);
    }
  };

  const handleSaveProjectSettings = async () => {
    if (!selectedProjectId) return;
    try {
      setIsSavingProjectSettings(true);
      setError(null);
      await updateProject(selectedProjectId, {
        has_lms_track: editingProjectHasLms
      });
      setProjectSettingsModalOpen(false);
      setRefreshCounter(prev => prev + 1);
      setSuccess(`Project track settings updated successfully.`);
      if (onProjectsChanged) onProjectsChanged();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update project settings.');
    } finally {
      setIsSavingProjectSettings(false);
    }
  };

  const handleSaveCourseMetadata = async (courseId: string, key: string, value: string) => {
    const course = activeCourses.find(c => c.id === courseId);
    if (!course) return;
    const currentMeta = { ...(course.metadata || {}) };
    if (value.trim()) {
      currentMeta[key.trim()] = value.trim();
    } else {
      delete currentMeta[key.trim()];
    }

    try {
      await updateCourseMetadata(courseId, currentMeta);
      setCourses(prev => prev.map(c => c.id === courseId ? { ...c, metadata: currentMeta } : c));
      setEditingCourseMetadata(null);
      setSuccess(`Course metadata updated.`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update course metadata.');
    }
  };

  const activeCoursesMap = useMemo(() => {
    const map = new Map<string, Course>();
    courses.forEach(c => map.set(String(c.id), c));
    return map;
  }, [courses]);

  const activeModules = useMemo(() => {
    if (!selectedProjectId) return [];
    
    // If a specific course is selected, ensure it belongs to this project
    if (selectedCourseId) {
      const isCourseInCurrentProject = activeCourses.some(c => String(c.id).trim() === String(selectedCourseId).trim());
      if (isCourseInCurrentProject) {
        return modules.filter(m => String(m.courseId || '').trim() === String(selectedCourseId).trim());
      }
    }

    // "All Courses" selected (or selected course is not in current project):
    // Strictly show only modules belonging to courses of THIS particular project
    const projectCourseIds = new Set(activeCourses.map(c => String(c.id).trim()));
    if (projectCourseIds.size === 0) {
      return [];
    }
    return modules.filter(m => projectCourseIds.has(String(m.courseId || '').trim()));
  }, [modules, selectedProjectId, selectedCourseId, activeCourses]);

  const activeModuleIds = useMemo(() => activeModules.map(m => m.id), [activeModules]);

  const totalProjectModulesCount = useMemo(() => {
    const projectCourseIds = new Set(activeCourses.map(c => String(c.id).trim()));
    return modules.filter(m => projectCourseIds.has(String(m.courseId || '').trim())).length;
  }, [activeCourses, modules]);

  const isProjectCompletelyEmpty = useMemo(() => {
    if (!selectedProjectId) return false;
    // If no courses exist for this project
    if (activeCourses.length === 0) return true;
    // If courses exist, but 0 modules across all courses and 0 LMS rows
    if (totalProjectModulesCount === 0 && lmsRows.length === 0) return true;
    return false;
  }, [selectedProjectId, activeCourses, totalProjectModulesCount, lmsRows]);

  const { remotePresences } = useTimelineRealtime({
    courseId: selectedCourseId,
    activeModuleIds,
    currentUser,
    focusedCell: editingCell,
    onPhaseUpdated: (rawUpdated: any) => {
      const remotePhaseId = rawUpdated.id;
      setPhases(prev => prev.map(p => {
        if (p.id !== remotePhaseId) return p;

        return {
          ...p,
          internalStartDate: rawUpdated.internal_start_date ?? p.internalStartDate,
          internalEndDate: rawUpdated.internal_end_date ?? p.internalEndDate,
          clientDate: rawUpdated.client_date ?? p.clientDate,
          assignedTo: rawUpdated.assigned_to ?? p.assignedTo,
          status: rawUpdated.status ?? p.status,
          rejectionNote: rawUpdated.rejection_note ?? p.rejectionNote,
          phaseType: rawUpdated.phase_type ?? p.phaseType,
          phaseTypePhase: rawUpdated.type_phase ?? rawUpdated.phase_type_phase ?? p.phaseTypePhase,
          phaseSequence: rawUpdated.phase_sequence ?? p.phaseSequence
        };
      }));
    }
  });

  // Drag-and-drop state for phase column reordering
  const [draggedPhaseName, setDraggedPhaseName] = useState<string | null>(null);

  const handleDragStartPhase = (e: React.DragEvent, phaseName: string) => {
    e.dataTransfer.setData('text/plain', phaseName);
    setDraggedPhaseName(phaseName);
  };

  const handleDropPhase = async (e: React.DragEvent, targetPhaseName: string, table: 'internal_phases' | 'client_phases') => {
    e.preventDefault();
    const sourceName = e.dataTransfer.getData('text/plain') || draggedPhaseName;
    setDraggedPhaseName(null);
    if (!sourceName || sourceName === targetPhaseName || !selectedProjectId) return;

    const currentList = table === 'internal_phases' ? [...internalPhaseNames] : [...clientPhaseNames];
    const fromIdx = currentList.indexOf(sourceName);
    const toIdx = currentList.indexOf(targetPhaseName);
    if (fromIdx === -1 || toIdx === -1) return;

    currentList.splice(fromIdx, 1);
    currentList.splice(toIdx, 0, sourceName);

    setPhases(prev => prev.map(p => {
      const pIdx = currentList.indexOf(p.phaseName);
      if (pIdx !== -1) {
        return { ...p, phaseSequence: pIdx + 1 };
      }
      return p;
    }));

    // Persist to public.projects.column_order
    const savedOrder = currentProject?.column_order;
    const currentColumnOrder = (savedOrder && typeof savedOrder === 'object' && !Array.isArray(savedOrder))
      ? { ...savedOrder }
      : { internal: internalPhaseNames, client: clientPhaseNames };

    if (table === 'internal_phases') {
      currentColumnOrder.internal = currentList;
    } else {
      currentColumnOrder.client = currentList;
    }

    setProjects(prev => prev.map(proj => proj.id === selectedProjectId ? { ...proj, column_order: currentColumnOrder } : proj));

    try {
      await Promise.all([
        updateProject(selectedProjectId, { column_order: currentColumnOrder }),
        updateCoursePhaseSequence(selectedCourseId || null, currentList, table, selectedProjectId, activeModuleIds)
      ]);
      if (onProjectsChanged) onProjectsChanged();
    } catch (err: any) {
      console.warn("Failed to persist column_order or phase_sequence to DB:", err);
    }
  };

  const activeLanguages = useMemo(() => {
    const langs = modules
      .filter(m => m.courseId === selectedCourseId && m.code === selectedModuleCode && m.language)
      .map(m => m.language!);
    return Array.from(new Set(langs));
  }, [activeModules, selectedModuleCode]);

  const selectedCourse = useMemo(() => {
    return courses.find(c => c.id === selectedCourseId);
  }, [courses, selectedCourseId]);

  const uniqueLanguages = useMemo(() => {
    const langs = activeModules
      .filter(m => m.code === selectedModuleCode && m.language)
      .map(m => m.language!);
    return Array.from(new Set(langs));
  }, [activeModules, selectedModuleCode]);

  // Group modules by code for grouped layout
  const groupedRows = useMemo(() => {
    const groups: Record<string, Module[]> = {};
    activeModules.forEach(m => {
      if (!groups[m.code]) {
        groups[m.code] = [];
      }
      groups[m.code].push(m);
    });
    return Object.keys(groups).sort().map(code => ({
      code,
      modules: groups[code]
    }));
  }, [activeModules]);

  // Dynamic phase rank helper (relies purely on custom/imported phase sequence or dynamic chronological dates)
  const getPhaseOrderRank = (_phaseName: string): number => {
    return 999;
  };

  // Get chronological order of phase names under selected course for Internal Phases
  const internalPhaseNames = useMemo(() => {
    if (!selectedProjectId) return [];
    const courseModuleIds = activeModules.map(m => m.id);
    const coursePhases = phases.filter(ph => 
      ph.entityLevel !== 'course' &&
      !!ph.moduleId &&
      courseModuleIds.includes(ph.moduleId) && 
      (ph.sourceFile === 'Internal' || !!ph.internalStartDate || !!ph.internalEndDate)
    );
    
    const uniquePhaseNames = Array.from(new Set(coursePhases.map(ph => ph.phaseName).filter(Boolean)));

    const savedOrder = currentProject?.column_order;
    const customOrder: string[] = Array.isArray(savedOrder)
      ? savedOrder
      : (savedOrder && typeof savedOrder === 'object' && Array.isArray((savedOrder as any).internal))
        ? (savedOrder as any).internal
        : [];

    return uniquePhaseNames.sort((a, b) => {
      if (customOrder.length > 0) {
        const idxA = customOrder.indexOf(a);
        const idxB = customOrder.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
      }

      const phasesA = coursePhases.filter(ph => ph.phaseName === a);
      const phasesB = coursePhases.filter(ph => ph.phaseName === b);

      const seqA = Math.min(...phasesA.map(p => (p.phaseSequence && p.phaseSequence > 0) ? p.phaseSequence : Infinity));
      const seqB = Math.min(...phasesB.map(p => (p.phaseSequence && p.phaseSequence > 0) ? p.phaseSequence : Infinity));

      if (seqA !== Infinity || seqB !== Infinity) {
        if (seqA !== seqB) return seqA - seqB;
      }

      const rankA = getPhaseOrderRank(a);
      const rankB = getPhaseOrderRank(b);
      if (rankA !== rankB) return rankA - rankB;

      // Fallback date-based sort if ranks are identical
      const minDateA = Math.min(...phasesA.map(p => p.internalStartDate ? new Date(p.internalStartDate).getTime() : Infinity));
      const minDateB = Math.min(...phasesB.map(p => p.internalStartDate ? new Date(p.internalStartDate).getTime() : Infinity));
      return minDateA - minDateB;
    });
  }, [activeModules, phases, selectedProjectId, currentProject?.column_order]);

  // Get chronological order of phase names under selected course for Client Phases
  const clientPhaseNames = useMemo(() => {
    if (!selectedProjectId) return [];
    const courseModuleIds = activeModules.map(m => m.id);
    const internalSet = new Set(internalPhaseNames);
    const coursePhases = phases.filter(ph => 
      ph.entityLevel !== 'course' &&
      !!ph.moduleId &&
      courseModuleIds.includes(ph.moduleId) && 
      !internalSet.has(ph.phaseName) &&
      (ph.sourceFile === 'Client' || !!ph.clientDate)
    );
    
    const uniquePhaseNames = Array.from(new Set(coursePhases.map(ph => ph.phaseName).filter(Boolean)));

    const savedOrder = currentProject?.column_order;
    const customOrder: string[] = (savedOrder && typeof savedOrder === 'object' && !Array.isArray(savedOrder) && Array.isArray((savedOrder as any).client))
      ? (savedOrder as any).client
      : [];

    return uniquePhaseNames.sort((a, b) => {
      if (customOrder.length > 0) {
        const idxA = customOrder.indexOf(a);
        const idxB = customOrder.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
      }

      const phasesA = coursePhases.filter(ph => ph.phaseName === a);
      const phasesB = coursePhases.filter(ph => ph.phaseName === b);

      const seqA = Math.min(...phasesA.map(p => (p.phaseSequence && p.phaseSequence > 0) ? p.phaseSequence : Infinity));
      const seqB = Math.min(...phasesB.map(p => (p.phaseSequence && p.phaseSequence > 0) ? p.phaseSequence : Infinity));

      if (seqA !== Infinity || seqB !== Infinity) {
        if (seqA !== seqB) return seqA - seqB;
      }

      const rankA = getPhaseOrderRank(a);
      const rankB = getPhaseOrderRank(b);
      if (rankA !== rankB) return rankA - rankB;

      // Fallback date-based sort if ranks are identical
      const minDateA = Math.min(...phasesA.map(p => p.clientDate ? new Date(p.clientDate).getTime() : Infinity));
      const minDateB = Math.min(...phasesB.map(p => p.clientDate ? new Date(p.clientDate).getTime() : Infinity));
      return minDateA - minDateB;
    });
  }, [activeModules, phases, selectedProjectId, internalPhaseNames, currentProject?.column_order]);

  // Dynamically compute unique custom metadata keys for Delivery (Client) modules
  const customClientModuleColNames = useMemo(() => {
    if (!selectedProjectId) return [];
    const keys = new Set<string>();
    keys.add('SCREENS');
    activeModules.forEach(m => {
      if (m.clientCustomMetadata && Object.keys(m.clientCustomMetadata).length > 0) {
        Object.keys(m.clientCustomMetadata).forEach(k => {
          if (k.toUpperCase() === 'SCREENS') keys.add('SCREENS');
          else keys.add(k);
        });
      } else if (m.metadata) {
        Object.keys(m.metadata).forEach(k => {
          if (!k.toLowerCase().startsWith('internal:')) {
            const stripped = k.replace(/^client:/i, '');
            if (stripped.toUpperCase() === 'SCREENS') keys.add('SCREENS');
            else keys.add(stripped);
          }
        });
      }
    });
    return Array.from(keys).sort((a, b) => {
      if (a === 'SCREENS') return -1;
      if (b === 'SCREENS') return 1;
      return a.localeCompare(b);
    });
  }, [activeModules, selectedProjectId]);

  // Dynamically compute unique custom metadata keys for Development (Internal) modules
  const customInternalModuleColNames = useMemo(() => {
    if (!selectedProjectId) return [];
    const keys = new Set<string>();
    keys.add('SCREENS');
    activeModules.forEach(m => {
      if (m.internalCustomMetadata && Object.keys(m.internalCustomMetadata).length > 0) {
        Object.keys(m.internalCustomMetadata).forEach(k => {
          if (k.toUpperCase() === 'SCREENS') keys.add('SCREENS');
          else keys.add(k);
        });
      } else if (m.metadata) {
        Object.keys(m.metadata).forEach(k => {
          if (!k.toLowerCase().startsWith('client:')) {
            const stripped = k.replace(/^internal:/i, '');
            if (stripped.toUpperCase() === 'SCREENS') keys.add('SCREENS');
            else keys.add(stripped);
          }
        });
      }
    });
    return Array.from(keys).sort((a, b) => {
      if (a === 'SCREENS') return -1;
      if (b === 'SCREENS') return 1;
      return a.localeCompare(b);
    });
  }, [activeModules, selectedProjectId]);

  const customModuleColNames = customClientModuleColNames;

  // Existing courses in the target project selected inside Add New Row modal
  const existingCoursesInTargetProject = useMemo(() => {
    if (!targetProjectIdForRow) return [];
    return courses.filter(c => c.projectId === targetProjectIdForRow);
  }, [courses, targetProjectIdForRow]);

  // Smart reuse detection: check if course name already exists in target project
  const matchedExistingCourse = useMemo(() => {
    if (!courseNameForRow.trim()) return null;
    const target = courseNameForRow.trim().toLowerCase();
    return existingCoursesInTargetProject.find(c => (c.name || '').trim().toLowerCase() === target) || null;
  }, [existingCoursesInTargetProject, courseNameForRow]);

  // Dynamically compute all unique custom metadata keys for internal phases in the selected course
  const customInternalPhaseColNames = useMemo(() => {
    if (!selectedProjectId) return [];
    const courseModuleIds = activeModules.map(m => m.id);
    const coursePhases = phases.filter(ph => 
      !!ph.moduleId &&
      courseModuleIds.includes(ph.moduleId) && 
      (ph.sourceFile === 'Internal' || !ph.sourceFile || ph.sourceFile !== 'Client')
    );
    const keys = new Set<string>();
    coursePhases.forEach(p => {
      if (p.metadata) {
        Object.keys(p.metadata).forEach(k => keys.add(k));
      }
    });
    return Array.from(keys).sort();
  }, [activeModules, phases, selectedProjectId]);

  // Dynamically compute all unique custom metadata keys for client phases in the selected course
  const customClientPhaseColNames = useMemo(() => {
    if (!selectedProjectId) return [];
    const courseModuleIds = activeModules.map(m => m.id);
    const coursePhases = phases.filter(ph => !!ph.moduleId && courseModuleIds.includes(ph.moduleId) && ph.sourceFile === 'Client');
    const keys = new Set<string>();
    coursePhases.forEach(p => {
      if (p.metadata) {
        Object.keys(p.metadata).forEach(k => keys.add(k));
      }
    });
    return Array.from(keys).sort();
  }, [activeModules, phases, selectedProjectId]);

  const currentCourse = courses.find(c => c.id === selectedCourseId);
  const currentModule = modules.find(m => m.courseId === selectedCourseId && m.code === selectedModuleCode && m.language === selectedLanguage);
  
  // Single view phases
  const currentPhases = useMemo(() => {
    if (!currentModule) return [];
    return phases.filter(ph => ph.moduleId === currentModule.id);
  }, [phases, currentModule]);

  // Sequence conflict detection (negative gaps, inverted dates aligned with visual column order)
  const sequenceConflicts = useMemo(() => {
    if (!selectedProjectId || phases.length === 0) return [];
    const activeModuleIdSet = new Set(activeModules.map(m => m.id));
    const activeCourseIdSet = new Set(activeCourses.map(c => String(c.id)));

    const relevantPhases = phases.filter(p => {
      if (selectedCourseId) {
        return (p.courseId && String(p.courseId).trim() === String(selectedCourseId).trim()) || (p.moduleId && activeModuleIdSet.has(p.moduleId));
      }
      return (p.moduleId && activeModuleIdSet.has(p.moduleId)) || (p.courseId && activeCourseIdSet.has(String(p.courseId)));
    });

    const enrichedPhases = relevantPhases.map(p => {
      const internalIdx = internalPhaseNames.indexOf(p.phaseName);
      if (internalIdx !== -1) {
        return { ...p, phaseSequence: internalIdx + 1 };
      }
      const clientIdx = clientPhaseNames.indexOf(p.phaseName);
      if (clientIdx !== -1) {
        return { ...p, phaseSequence: clientIdx + 1 };
      }
      return p;
    });

    return detectSequenceConflicts(enrichedPhases, holidays);
  }, [phases, selectedProjectId, selectedCourseId, activeModules, activeCourses, holidays, internalPhaseNames, clientPhaseNames]);

  const conflictPhaseIds = useMemo(() => {
    const ids = new Set<string>();
    sequenceConflicts.forEach(c => {
      ids.add(c.phaseId);
      if (c.predecessorId) ids.add(c.predecessorId);
    });
    return ids;
  }, [sequenceConflicts]);

  // Sync edits
  useEffect(() => {
    if (currentProject) {
      setEditingProjectName(currentProject.name);
    }
  }, [currentProject]);

  useEffect(() => {
    if (currentCourse) {
      setEditingCourseName(currentCourse.name);
      setEditingCourseCode(currentCourse.code);
      setEditingCourseProjectId(currentCourse.projectId);
    }
  }, [currentCourse]);

  useEffect(() => {
    if (currentModule) {
      setEditingModuleName(currentModule.name);
      setEditingModuleCode(currentModule.code);
      setEditingModuleCourseId(currentModule.courseId);
      setEditingModuleLanguage(currentModule.language || '');
      
      const initialEditedPhases: Record<string, Phase> = {};
      phases.filter(ph => ph.moduleId === currentModule.id).forEach(ph => {
        initialEditedPhases[ph.id] = { ...ph };
      });
      setEditedPhases(initialEditedPhases);
    }
  }, [currentModule, phases]);

  // Working day math wrapper helpers
  const addWorkingDays = (startDateStr: string, days: number): string => {
    return addWorkingDaysUtil(startDateStr, days, holidays);
  };

  const getWorkingDaysDifference = (startDateStr: string, endDateStr: string): number => {
    return getWorkingDaysDifferenceUtil(startDateStr, endDateStr, holidays);
  };

  const showError = (msg: string) => {
    setError(msg);
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
  };

  const refreshDashboardData = async () => {
    try {
      setIsRefreshing(true);
      await loadData();
      setRefreshCounter(prev => prev + 1);
      if (onProjectsChanged) onProjectsChanged();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Open Add New Row modal initialized to current project/course
  const handleOpenCreateRowModal = () => {
    const defaultProjId = selectedProjectId || (projects.length > 0 ? projects[0].id : '');
    setTargetProjectIdForRow(defaultProjId);
    
    // Find active course if any
    const activeCrs = courses.find(c => c.id === selectedCourseId) || courses.find(c => c.projectId === defaultProjId);
    setCourseNameForRow(activeCrs ? activeCrs.name : '');
    
    setModuleRowsToAdd([
      { id: 'draft-' + Date.now(), name: '', language: 'English', screens: '' }
    ]);
    setShowCreateRowModal(true);
  };

  // Submit handler for Add New Row (Course & Modules)
  const handleCreateModuleRow = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!targetProjectIdForRow) {
      showError('Please select a target project.');
      return;
    }
    const cleanCourseName = courseNameForRow.trim();
    if (!cleanCourseName) {
      showError('Course name is required.');
      return;
    }

    const validModules = moduleRowsToAdd.filter(m => m.name.trim().length > 0);
    if (validModules.length === 0) {
      showError('Please enter at least one module name.');
      return;
    }

    try {
      setIsCreatingRow(true);
      setError(null);

      // 1. Get or create course in target project
      const courseRes = await getOrCreateCourse(targetProjectIdForRow, cleanCourseName);
      if (!courseRes.success || !courseRes.course) {
        throw new Error(courseRes.error || 'Failed to create or find course.');
      }
      const courseId = courseRes.course.id;

      // 2. Discover standard phase names for this project
      const projectCourseIds = courses.filter(c => c.projectId === targetProjectIdForRow).map(c => c.id);
      if (!projectCourseIds.includes(courseId)) {
        projectCourseIds.push(courseId);
      }
      const projectPhases = phases.filter(p => p.moduleId && projectCourseIds.includes(p.moduleId));

      let internalNames = Array.from(new Set(
        projectPhases
          .filter(p => p.sourceFile === 'Internal' || !p.sourceFile || p.sourceFile !== 'Client')
          .map(p => p.phaseName)
      )) as string[];

      let clientNames = Array.from(new Set(
        projectPhases
          .filter(p => p.sourceFile === 'Client')
          .map(p => p.phaseName)
      )) as string[];

      if (internalNames.length === 0 && internalPhaseNames && internalPhaseNames.length > 0) {
        internalNames = internalPhaseNames;
      }
      if (clientNames.length === 0 && clientPhaseNames && clientPhaseNames.length > 0) {
        clientNames = clientPhaseNames;
      }

      // 3. Create each module under the course
      for (const modItem of validModules) {
        const metadata: Record<string, any> = {};
        const screensVal = modItem.screens.trim();
        if (screensVal) {
          metadata['client:SCREENS'] = screensVal;
          metadata['internal:SCREENS'] = screensVal;
        }

        const createRes = await createModule(
          courseId,
          modItem.name.trim(), // code defaults to name (no module code required)
          modItem.name.trim(),
          modItem.language.trim() || 'English',
          internalNames,
          clientNames,
          metadata
        );

        if (!createRes.success) {
          throw new Error(createRes.error || `Failed to create module "${modItem.name}".`);
        }
      }

      setShowCreateRowModal(false);
      setModuleRowsToAdd([{ id: 'draft-1', name: '', language: 'English', screens: '' }]);
      setRefreshCounter(prev => prev + 1);
      showSuccess(`Successfully added ${validModules.length} module(s) under course "${cleanCourseName}".`);
      if (onProjectsChanged) onProjectsChanged();
    } catch (err: any) {
      console.error(err);
      showError(err.message || 'Failed to create module row(s).');
    } finally {
      setIsCreatingRow(false);
    }
  };

  // Helper to extract metadata value for a module column (e.g. SCREENS)
  const getModColVal = (mod: Module, colName: string): string => {
    if (localModuleMetadata[mod.id]?.[colName] !== undefined) {
      return localModuleMetadata[mod.id][colName];
    }
    const checkKeys = [
      colName,
      colName.toLowerCase(),
      colName.toUpperCase(),
      `client:${colName}`,
      `client:${colName.toLowerCase()}`,
      `client:${colName.toUpperCase()}`,
      `internal:${colName}`,
      `internal:${colName.toLowerCase()}`,
      `internal:${colName.toUpperCase()}`
    ];
    for (const k of checkKeys) {
      if (mod.clientCustomMetadata?.[k] !== undefined && mod.clientCustomMetadata[k] !== null) {
        return String(mod.clientCustomMetadata[k]);
      }
      if (mod.internalCustomMetadata?.[k] !== undefined && mod.internalCustomMetadata[k] !== null) {
        return String(mod.internalCustomMetadata[k]);
      }
      if (mod.metadata?.[k] !== undefined && mod.metadata[k] !== null) {
        return String(mod.metadata[k]);
      }
    }
    return '';
  };

  // Live input change handler for module metadata cell
  const handleModuleMetadataChange = (moduleId: string, colName: string, value: string) => {
    setLocalModuleMetadata(prev => ({
      ...prev,
      [moduleId]: {
        ...(prev[moduleId] || {}),
        [colName]: value
      }
    }));
  };

  // OnBlur or Enter handler to save module metadata to Supabase
  const handleSaveModuleMetadata = async (moduleId: string, colName: string, value: string) => {
    const mod = modules.find(m => m.id === moduleId);
    if (!mod) return;
    const currentVal = getModColVal(mod, colName);
    if (currentVal === value.trim()) return; // No change

    const cleanVal = value.trim();
    const updatedMetadata = { ...(mod.metadata || {}) };
    delete updatedMetadata[colName];
    updatedMetadata[`client:${colName}`] = cleanVal;
    updatedMetadata[`internal:${colName}`] = cleanVal;

    try {
      await updateModuleMetadata(moduleId, updatedMetadata);
      setModules(prev => prev.map(m => {
        if (m.id === moduleId) {
          return {
            ...m,
            metadata: updatedMetadata,
            clientCustomMetadata: { ...(m.clientCustomMetadata || {}), [colName]: cleanVal },
            internalCustomMetadata: { ...(m.internalCustomMetadata || {}), [colName]: cleanVal }
          };
        }
        return m;
      }));
    } catch (err: any) {
      console.error('Failed to update module metadata:', err);
      showError(`Failed to save ${colName}: ${err.message || 'Unknown error'}`);
    }
  };

  const showCascadeModal = ({
    editedPhaseName,
    delta,
    affectedPhases: dbAffectedPhases,
    isLargeShift
  }: {
    editedPhaseName: string;
    delta: number;
    affectedPhases: any[];
    isLargeShift: boolean;
  }): Promise<'cascade' | 'single' | 'cancel'> => {
    if (cascadeModal) {
      return Promise.resolve('cancel');
    }
    if (dbAffectedPhases.length === 0) {
      return Promise.resolve('single');
    }
    return new Promise<'cascade' | 'single' | 'cancel'>((resolve) => {
      const affectedPhasesForUi: { name: string; oldDate: string; newDate: string; type: 'Internal' | 'Client'; isPaired?: boolean }[] = [];
      const clientWarnings: string[] = [];

      dbAffectedPhases.forEach((item) => {
        const ph = phases.find(p => p.id === item.id);
        const pName = ph ? ph.phaseName : 'Phase';

        const isPaired = (item.oldStart === null && item.oldEnd !== null) || (item.oldStart !== null && item.oldEnd === null);

        if (item.oldClient && item.newClient && item.oldClient !== item.newClient) {
          affectedPhasesForUi.push({
            name: `${pName} Client Date`,
            oldDate: item.oldClient,
            newDate: item.newClient,
            type: 'Client'
          });
        }

        if (isPaired) {
          if (item.oldEnd && item.newEnd && item.oldEnd !== item.newEnd) {
            affectedPhasesForUi.push({
              name: `${pName} End (paired)`,
              oldDate: item.oldEnd,
              newDate: item.newEnd,
              type: 'Internal',
              isPaired: true
            });
            const clientPh = phases.find(
              p => p.moduleId === ph?.moduleId && p.phaseName === pName && p.sourceFile === 'Client'
            );
            if (clientPh && clientPh.clientDate && item.newEnd > clientPh.clientDate) {
              clientWarnings.push(`${pName} internal end date will exceed client deadline after this shift.`);
            }
          } else if (item.oldStart && item.newStart && item.oldStart !== item.newStart) {
            affectedPhasesForUi.push({
              name: `${pName} Start (paired)`,
              oldDate: item.oldStart,
              newDate: item.newStart,
              type: 'Internal',
              isPaired: true
            });
          }
        } else {
          if (item.oldStart && item.newStart && item.oldStart !== item.newStart) {
            affectedPhasesForUi.push({
              name: `${pName} Start`,
              oldDate: item.oldStart,
              newDate: item.newStart,
              type: 'Internal'
            });
          }
          if (item.oldEnd && item.newEnd && item.oldEnd !== item.newEnd) {
            affectedPhasesForUi.push({
              name: `${pName} End`,
              oldDate: item.oldEnd,
              newDate: item.newEnd,
              type: 'Internal'
            });
            const clientPh = phases.find(
              p => p.moduleId === ph?.moduleId && p.phaseName === pName && p.sourceFile === 'Client'
            );
            if (clientPh && clientPh.clientDate && item.newEnd > clientPh.clientDate) {
              clientWarnings.push(`${pName} internal end date will exceed client deadline after this shift.`);
            }
          }
        }
      });

      const firstAffectedPh = dbAffectedPhases.length > 0 ? phases.find(p => p.id === dbAffectedPhases[0].id) : null;
      const mId = firstAffectedPh?.moduleId;
      const completedSkippedCount = mId 
        ? phases.filter(p => p.moduleId === mId && p.status === 'Completed').length
        : 0;

      const largeShiftWarning = isLargeShift
        ? `Large date shift detected (${delta} working days). This may be intentional if correcting bad data. Please verify this is intentional.`
        : undefined;

      setCascadeModal({
        editedPhaseName,
        delta,
        affectedPhases: affectedPhasesForUi,
        completedSkippedCount,
        largeShiftWarning,
        clientWarnings,
        onConfirm: () => {
          setCascadeModal(null);
          resolve('cascade');
        },
        onApplySingleOnly: () => {
          setCascadeModal(null);
          resolve('single');
        },
        onCancel: () => {
          setCascadeModal(null);
          resolve('cancel');
        }
      });
    });
  };

  const formatDateShort = (dateStr: string) => {
    return formatDateDDMMYYYY(dateStr);
  };

  // Write to Audit Log
  const writeAuditLog = async (details: string) => {
    let actionType = 'project_rename';
    let entityType = 'project';
    let entityId = selectedProjectId || '00000000-0000-0000-0000-000000000000';

    if (details.includes('course')) {
      entityType = 'course';
      entityId = selectedCourseId || entityId;
    } else if (details.includes('module')) {
      entityType = 'module';
      const curMod = modules.find(m => m.code === selectedModuleCode && m.language === (selectedLanguage || null));
      entityId = curMod?.id || entityId;
    }

    await dbWriteAuditLog({
      actionType,
      entityType,
      entityId,
      entityLabel: details
    });
  };

  const handleOpenAnchorModal = async (clientPhaseName: string) => {
    if (!selectedProjectId) return;
    const mappings = await getClientInternalMappings(selectedProjectId);
    const existingMap = mappings.find(m => m.clientPhaseName.toLowerCase() === clientPhaseName.toLowerCase());
    const gaps = await getPhaseGaps(selectedProjectId);
    
    const clientPh = phases.find(p => p.sourceFile === 'Client' && p.phaseName.toLowerCase() === clientPhaseName.toLowerCase());
    const existingGapRecord = clientPh ? gaps.find(g => g.laterPhaseId === clientPh.id || g.laterPhaseId === (clientPh as any).clientPhaseId) : null;

    setHeaderAnchorModal({
      clientPhaseName,
      anchorInternalPhase: existingMap?.anchorInternalPhaseName || 'None',
      anchorPoint: existingMap?.anchorPoint || 'End',
      workingDaysGap: existingGapRecord ? existingGapRecord.workingDaysGap : 0
    });
  };

  const handleSaveHeaderAnchor = async () => {
    if (!headerAnchorModal || !selectedProjectId) return;
    try {
      setLoading(true);
      const { clientPhaseName, anchorInternalPhase, anchorPoint } = headerAnchorModal;
      
      await saveClientInternalMappings(selectedProjectId, [{
        clientPhaseName,
        anchorInternalPhaseName: anchorInternalPhase,
        anchorPoint
      }]);

      setHeaderAnchorModal(null);
      setSuccess(`Client header anchor for "${clientPhaseName}" updated successfully.`);
      setRefreshCounter(prev => prev + 1);
    } catch (err: any) {
      setError(err.message || "Failed to update client header anchor.");
    } finally {
      setLoading(false);
    }
  };

  // Save metadata
  const saveProjectName = async () => {
    if (!currentProject || !editingProjectName.trim()) return;
    const sb = getSupabase();
    if (!sb) return;

    try {
      setLoading(true);
      const { error: err } = await sb
        .from('projects')
        .update({ name: editingProjectName.trim() })
        .eq('id', currentProject.id);

      if (err) throw err;
      await writeAuditLog(`Renamed project from "${currentProject.name}" to "${editingProjectName.trim()}"`);
      setSuccess("Project name updated successfully.");
      setRefreshCounter(prev => prev + 1);
    } catch (err: any) {
      setError(err.message || "Failed to update project name.");
    } finally {
      setLoading(false);
    }
  };

  const saveCourseDetails = async () => {
    if (!currentCourse || !editingCourseName.trim() || !editingCourseCode.trim()) return;
    const sb = getSupabase();
    if (!sb) return;

    try {
      setLoading(true);
      const { error: err } = await sb
        .from('courses')
        .update({
          name: editingCourseName.trim(),
          code: editingCourseCode.trim(),
          project_id: editingCourseProjectId
        })
        .eq('id', currentCourse.id);

      if (err) throw err;
      await writeAuditLog(`Updated course "${currentCourse.code}" details.`);
      setSuccess("Course details updated successfully.");
      if (editingCourseProjectId !== selectedProjectId) {
        setSelectedCourseId('');
        sessionStorage.removeItem('project_editor_course_id');
        setSelectedModuleCode('');
        setSelectedLanguage('');
      }
      setRefreshCounter(prev => prev + 1);
    } catch (err: any) {
      setError(err.message || "Failed to update course details.");
    } finally {
      setLoading(false);
    }
  };

  const executeSaveModule = async () => {
    if (!currentModule || !editingModuleName.trim() || !editingModuleCode.trim()) return;
    const sb = getSupabase();
    if (!sb) return;

    try {
      setLoading(true);
      const { error: err } = await sb
        .from('modules')
        .update({
          name: editingModuleName.trim(),
          code: editingModuleCode.trim(),
          course_id: editingModuleCourseId,
          language: editingModuleLanguage.trim() || null
        })
        .eq('id', currentModule.id);

      if (err) throw err;
      await writeAuditLog(`Updated module "${currentModule.code}" / Language "${currentModule.language || 'None'}" details.`);
      setSuccess("Module structural metadata updated successfully.");
      if (editingModuleCode !== selectedModuleCode || editingModuleLanguage !== selectedLanguage || editingModuleCourseId !== selectedCourseId) {
        setSelectedModuleCode('');
        setSelectedLanguage('');
      }
      setRefreshCounter(prev => prev + 1);
    } catch (err: any) {
      setError(err.message || "Failed to update module details.");
    } finally {
      setLoading(false);
    }
  };

  const saveModuleDetails = async () => {
    if (!currentModule) return;
    const sameCourse = editingModuleCourseId === selectedCourseId;
    const sameCode = editingModuleCode === selectedModuleCode;
    const sameLang = editingModuleLanguage === selectedLanguage;

    if (sameCourse && sameCode && sameLang) {
      await executeSaveModule();
      return;
    }

    const sb = getSupabase();
    if (!sb) return;

    const { data: countPh } = await sb.from('consolidated_phases_view').select('id').eq('module_id', currentModule.id);
    if (countPh && countPh.length > 0) {
      setOrphanWarning({
        message: `This module currently has ${countPh.length} mapped phases. Re-locating it to a different Course, Code, or Language coordinate will preserve the timeline phases but shift the hierarchy anchor. Proceed?`,
        onConfirm: () => {
          setOrphanWarning(null);
          executeSaveModule();
        }
      });
      return;
    }

    await executeSaveModule();
  };

  async function handleDateEdit(
    editedPhaseId: string,
    rawFieldName: string,
    newDateValue: string,
    currentModuleId?: string | null,
    holidaysInput?: string[],
    currentCourseId?: string | null
  ): Promise<boolean> {
    const supabase = getSupabase()!;

    // Step 1: Normalize field name for cascading engine
    const fieldMap: Record<string, 'internalStartDate' | 'internalEndDate' | 'clientDate'> = {
      'internalStartDate': 'internalStartDate',
      'internal_start': 'internalStartDate',
      'internalEndDate': 'internalEndDate',
      'internal_end': 'internalEndDate',
      'clientDate': 'clientDate',
      'client_date': 'clientDate'
    };
    const engineField = fieldMap[rawFieldName] || 'internalStartDate';

    // Step 2: Get current user session
    let actorId: string;
    try {
      actorId = await getCurrentUserId();
    } catch {
      showError('Session expired. Please log in again.');
      return false;
    }

    // Step 3: Fetch active holidays, mappings, and gaps for current project
    const activeHolidayDates = await getEffectiveHolidayDates(selectedProjectId || undefined);
    setHolidays(activeHolidayDates);

    // Step 3.5: Non-Working Day Date Picker Guardrail
    const nonWorkingReason = getNonWorkingDayReason(newDateValue, activeHolidayDates);
    if (nonWorkingReason) {
      showError(`Invalid Date Selection: ${newDateValue} falls on a ${nonWorkingReason}. Please select a valid working day.`);
      return false;
    }

    const [activeMappings, activeGaps] = await Promise.all([
      getClientInternalMappings(selectedProjectId),
      getPhaseGaps(selectedProjectId)
    ]);

    // Step 4: Get all phases for the current module or course fresh from DB or state
    const origPhase = phases.find(p => p.id === editedPhaseId || p.internalPhaseId === editedPhaseId || p.clientPhaseId === editedPhaseId);
    const isCourseLevel = origPhase?.entityLevel === 'course' || (!currentModuleId && (currentCourseId || origPhase?.courseId));
    const targetCourseId = isCourseLevel ? (currentCourseId || origPhase?.courseId) : null;

    let freshQuery = supabase.from('consolidated_phases_view').select('*');
    if (isCourseLevel && targetCourseId) {
      freshQuery = freshQuery.eq('course_id', targetCourseId).eq('entity_level', 'course');
    } else if (currentModuleId) {
      freshQuery = freshQuery.eq('module_id', currentModuleId);
    }
    const { data: freshModulePhases } = await freshQuery;

    const rawModulePhases = (freshModulePhases && freshModulePhases.length > 0)
      ? freshModulePhases
      : phases.filter(p => isCourseLevel ? (p.courseId === targetCourseId && p.entityLevel === 'course') : (currentModuleId ? p.moduleId === currentModuleId : false));

    const modulePhases: Phase[] = rawModulePhases.map(p => ({
      id: p.id,
      moduleId: p.module_id || p.moduleId || null,
      courseId: p.course_id || p.courseId || null,
      entityLevel: (p.entity_level || (p.course_id && !p.module_id ? 'course' : 'module')) as 'module' | 'course',
      phaseName: p.phase_name || p.phaseName,
      phaseType: p.phase_type || p.phaseType,
      phaseTypePhase: p.phase_type_phase || p.phaseTypePhase,
      clientDate: p.client_date !== undefined ? p.client_date : p.clientDate,
      internalStartDate: p.internal_start_date !== undefined ? p.internal_start_date : p.internalStartDate,
      internalEndDate: p.internal_end_date !== undefined ? p.internal_end_date : p.internalEndDate,
      sourceFileRef: p.source_file_ref || p.sourceFileRef || 'Manual',
      sourceFile: (p.client_date || p.client_phase_id) ? 'Client' : 'Internal',
      assignedTo: p.assigned_to || p.assignedTo,
      status: p.status,
      clientPhaseId: p.client_phase_id || p.clientPhaseId,
      internalPhaseId: p.internal_phase_id || p.internalPhaseId
    }));

    const editedPhase = modulePhases.find(p => p.id === editedPhaseId || p.internalPhaseId === editedPhaseId || p.clientPhaseId === editedPhaseId);
    if (!editedPhase) {
      showError('Phase not found. Please refresh and try again.');
      return false;
    }

    const oldDate = engineField === 'internalStartDate'
      ? editedPhase.internalStartDate
      : engineField === 'internalEndDate'
      ? editedPhase.internalEndDate
      : editedPhase.clientDate;

    if (oldDate === newDateValue) {
      return true;
    }

    // Step 5: Execute Bidirectional Cascading Engine
    let cascadeResult;
    try {
      cascadeResult = runBidirectionalCascade({
        modifiedPhaseId: editedPhase.id,
        modifiedField: engineField,
        newDate: newDateValue,
        allPhases: modulePhases,
        phaseGaps: activeGaps,
        clientMappings: activeMappings,
        holidays: activeHolidayDates
      });
    } catch (err: any) {
      console.warn("Cascade execution blocked:", err.message);
      showError(err.message || "Cannot cascade dates due to sequence firewall constraint.");
      return false;
    }

    // Step 6: Build UI affected phases list for confirmation modal
    const affectedPhasesForUi: any[] = [];
    cascadeResult.updatedPhases.forEach(up => {
      const orig = modulePhases.find(op => op.id === up.id);
      if (!orig) return;

      const startChanged = up.internalStartDate !== orig.internalStartDate;
      const endChanged = up.internalEndDate !== orig.internalEndDate;
      const clientChanged = up.clientDate !== orig.clientDate;

      if (startChanged || endChanged || clientChanged) {
        affectedPhasesForUi.push({
          id: up.id,
          oldStart: orig.internalStartDate || null,
          oldEnd: orig.internalEndDate || null,
          oldClient: orig.clientDate || null,
          newStart: up.internalStartDate || null,
          newEnd: up.internalEndDate || null,
          newClient: up.clientDate || null
        });
      }
    });

    const delta = oldDate ? workingDaysBetween(oldDate, newDateValue, activeHolidayDates) : 0;

    // Step 7: Show confirmation modal
    const decision = await showCascadeModal({
      editedPhaseName: editedPhase.phaseName,
      delta,
      affectedPhases: affectedPhasesForUi,
      isLargeShift: Math.abs(delta) > 60
    });

    if (decision === 'cancel') return false;

    // Step 7b: Apply to this column only
    if (decision === 'single') {
      try {
        setLoading(true);
        const internalId = editedPhase.internalPhaseId || (editedPhase.sourceFile === 'Internal' ? editedPhase.id : null);
        const clientId = editedPhase.clientPhaseId || (editedPhase.sourceFile === 'Client' ? editedPhase.id : null);

        if (internalId && (engineField === 'internalStartDate' || engineField === 'internalEndDate')) {
          const updateData: any = {};
          if (engineField === 'internalStartDate') updateData.internal_start_date = newDateValue || null;
          if (engineField === 'internalEndDate') updateData.internal_end_date = newDateValue || null;

          const { error: iErr } = await supabase
            .from('internal_phases')
            .update(updateData)
            .eq('id', internalId);
          if (iErr) console.warn("internal_phases update warning:", iErr.message);
        }

        if (clientId && engineField === 'clientDate') {
          const { error: cErr } = await supabase
            .from('client_phases')
            .update({ client_date: newDateValue || null })
            .eq('id', clientId);
          if (cErr) console.warn("client_phases update warning:", cErr.message);
        }

        const phaseLabel = await getPhaseLabel(editedPhase.id);
        await dbWriteAuditLog({
          actionType: 'date_edit',
          entityType: 'phase',
          entityId: editedPhase.id,
          entityLabel: phaseLabel,
          oldValue: {
            phaseName: editedPhase.phaseName,
            sourceFile: editedPhase.sourceFile,
            start: editedPhase.internalStartDate,
            end: editedPhase.internalEndDate,
            client: editedPhase.clientDate
          },
          newValue: {
            phaseName: editedPhase.phaseName,
            sourceFile: editedPhase.sourceFile,
            start: engineField === 'internalStartDate' ? newDateValue : editedPhase.internalStartDate,
            end: engineField === 'internalEndDate' ? newDateValue : editedPhase.internalEndDate,
            client: engineField === 'clientDate' ? newDateValue : editedPhase.clientDate
          },
          createdAt: new Date().toISOString()
        });

        setSuccess(`Updated ${editedPhase.phaseName} without cascading.`);
        setPhases([]);
        await loadData();
        setRefreshCounter(prev => prev + 1);
        if (onProjectsChanged) onProjectsChanged();
        return true;
      } catch (err: any) {
        console.error("Error saving single edit:", err);
        showError(err.message || "Failed to update phase date.");
        return false;
      } finally {
        setLoading(false);
      }
    }

    // Step 8: Save updated phases transactionally to Supabase
    try {
      setLoading(true);

      const cascadeBatchTime = new Date().toISOString();
      for (const up of cascadeResult.updatedPhases) {
        const orig = modulePhases.find(op => op.id === up.id);
        if (!orig) continue;

        const internalId = up.internalPhaseId || (orig.sourceFile === 'Internal' ? up.id : null);
        const clientId = up.clientPhaseId || (orig.sourceFile === 'Client' ? up.id : null);

        if (internalId && (up.internalStartDate !== orig.internalStartDate || up.internalEndDate !== orig.internalEndDate)) {
          const { error: iErr } = await supabase
            .from('internal_phases')
            .update({
              internal_start_date: up.internalStartDate || null,
              internal_end_date: up.internalEndDate || null
            })
            .eq('id', internalId);
          if (iErr) console.warn("internal_phases update warning:", iErr.message);
        }

        if (clientId && up.clientDate !== orig.clientDate) {
          const { error: cErr } = await supabase
            .from('client_phases')
            .update({ client_date: up.clientDate || null })
            .eq('id', clientId);
          if (cErr) console.warn("client_phases update warning:", cErr.message);
        }

        const isDirectEdit = up.id === editedPhase.id || up.id === editedPhaseId;
        const phaseLabel = await getPhaseLabel(up.id);
        await dbWriteAuditLog({
          actionType: isDirectEdit ? 'date_edit' : 'phase_cascade',
          entityType: 'phase',
          entityId: up.id,
          entityLabel: phaseLabel,
          oldValue: {
            phaseName: orig.phaseName,
            sourceFile: orig.sourceFile,
            start: orig.internalStartDate,
            end: orig.internalEndDate,
            client: orig.clientDate
          },
          newValue: {
            phaseName: up.phaseName,
            sourceFile: up.sourceFile,
            start: up.internalStartDate,
            end: up.internalEndDate,
            client: up.clientDate
          },
          createdAt: cascadeBatchTime
        });
      }

      if (cascadeResult.updatedGaps.length > 0 && selectedProjectId) {
        await savePhaseGaps(selectedProjectId, cascadeResult.updatedGaps);
      }

      setSuccess("Dates and bidirectional phase cascades saved successfully.");
      setPhases([]);
      await loadData();
      setRefreshCounter(prev => prev + 1);
      if (onProjectsChanged) onProjectsChanged();
      return true;
    } catch (err: any) {
      console.error("Error saving cascading edits:", err);
      showError(err.message || "Failed to save cascading phase dates.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  // View 1 Single Edit save edits
  const savePhaseEdits = async () => {
    const sb = getSupabase();
    if (!sb || !currentModule) return;

    const originalPhases = phases.filter(ph => ph.moduleId === currentModule.id);
    const sortedOriginalPhases = [...originalPhases].sort((a, b) => {
      const da = a.internalStartDate ? new Date(a.internalStartDate).getTime() : 0;
      const db = b.internalStartDate ? new Date(b.internalStartDate).getTime() : 0;
      return da - db;
    });

    const updatesMap = { ...editedPhases };

    let editedPhaseId = '';
    let fieldEdited: 'internalStartDate' | 'internalEndDate' | 'clientDate' | null = null;
    let oldDate = '';
    let newDate = '';

    for (const origPh of sortedOriginalPhases) {
      const editedPh = updatesMap[origPh.id];
      if (!editedPh) continue;

      if (editedPh.internalStartDate !== origPh.internalStartDate) {
        editedPhaseId = origPh.id;
        fieldEdited = 'internalStartDate';
        oldDate = origPh.internalStartDate || '';
        newDate = editedPh.internalStartDate || '';
        break;
      }
      if (editedPh.internalEndDate !== origPh.internalEndDate) {
        editedPhaseId = origPh.id;
        fieldEdited = 'internalEndDate';
        oldDate = origPh.internalEndDate || '';
        newDate = editedPh.internalEndDate || '';
        break;
      }
    }

    const saveNonDateAndOtherEdits = async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);

        for (const ph of (Object.values(updatesMap) as Phase[])) {
          const orig = originalPhases.find(o => o.id === ph.id);
          const assignmentChanged = orig && ph.assignedTo !== orig.assignedTo;
          const statusChanged = orig && ph.status !== orig.status;
          const clientDateChanged = orig && ph.clientDate !== orig.clientDate;

          if (ph.clientDate !== undefined) {
            await sb.from('client_phases').update({
              client_date: ph.clientDate || null,
              phase_type: ph.phaseType || null,
              phase_type_phase: ph.phaseTypePhase || null
            }).eq('id', ph.id);
          }
          if (ph.phaseType !== undefined || ph.phaseTypePhase !== undefined) {
            await sb.from('internal_phases').update({
              phase_type: ph.phaseType || null,
              phase_type_phase: ph.phaseTypePhase || null
            }).eq('id', ph.id);
          }

          if (clientDateChanged) {
            const phaseLabel = await getPhaseLabel(ph.id);
            await dbWriteAuditLog({
              actionType: 'date_edit',
              entityType: 'phase',
              entityId: ph.id,
              entityLabel: phaseLabel,
              oldValue: { field: 'client_date', date: orig?.clientDate || null },
              newValue: { field: 'client_date', date: ph.clientDate || null }
            });
          }

          if (statusChanged) {
            if (ph.sourceFile === 'Client' || (!ph.internalStartDate && !ph.internalEndDate && ph.clientDate)) {
              await updateClientPhaseStatus(ph.clientPhaseId || ph.id, ph.status || 'Pending');
            } else {
              await updatePhaseStatus(ph.internalPhaseId || ph.id, ph.status || 'Pending');
            }
          }

          if (assignmentChanged) {
            await assignPhase(ph.id, ph.assignedTo || null);
          }

          if (assignmentChanged && ph.assignedTo) {
            await notifyNewAssignment(ph.id, ph.assignedTo);
          }
        }

        setSuccess("Phase details successfully saved.");
        setRefreshCounter(prev => prev + 1);
        if (onProjectsChanged) onProjectsChanged();
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to commit non-date edits.");
      } finally {
        setLoading(false);
      }
    };

    const handleRevert = () => {
      const originalMap: Record<string, Phase> = {};
      originalPhases.forEach(p => {
        originalMap[p.id] = { ...p };
      });
      setEditedPhases(originalMap);
    };

    if (editedPhaseId && fieldEdited) {
      const success = await handleDateEdit(
        editedPhaseId,
        fieldEdited,
        newDate,
        currentModule.id,
        holidays
      );
      if (success) {
        await saveNonDateAndOtherEdits();
      } else {
        handleRevert();
      }
    } else {
      await saveNonDateAndOtherEdits();
    }
  };

  const updatePhaseField = (phaseId: string, field: keyof Phase, value: any) => {
    setEditedPhases(prev => {
      const updated = { ...prev };
      if (updated[phaseId]) {
        updated[phaseId] = {
          ...updated[phaseId],
          [field]: value
        };
      }
      return updated;
    });
  };

  // --- VIEW 2 & 3 INLINE TABLE METHODS ---

  // Perform inline database save of a single cell change (triggers cascade prompt)
  const saveTableEditInline = async (
    phaseId: string, 
    field: 'internalStartDate' | 'internalEndDate' | 'clientDate', 
    newValue: string | null
  ) => {
    const orig = phases.find(p => p.id === phaseId);
    if (!orig) return;

    const sb = getSupabase();
    if (!sb) return;

    const oldVal = field === 'internalStartDate' ? orig.internalStartDate : field === 'internalEndDate' ? orig.internalEndDate : orig.clientDate;
    if (oldVal === newValue) {
      setEditingCell(null);
      return;
    }

    try {
      const success = await handleDateEdit(
        phaseId,
        field,
        newValue || '',
        orig.moduleId || null,
        holidays,
        orig.courseId || null
      );
      setPendingTableEdits(prev => {
        const cp = { ...prev };
        delete cp[phaseId];
        return cp;
      });
      setEditingCell(null);
      if (success) {
        if (onProjectsChanged) onProjectsChanged();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to process inline changes.");
      setEditingCell(null);
      setLoading(false);
    }
  };

  // Save All button handler for multiple pending table cells
  const handleSaveAllTableEdits = async () => {
    if (Object.keys(pendingTableEdits).length === 0) return;
    const sb = getSupabase();
    if (!sb) return;

    try {
      const clientEdits: { phaseId: string; clientDate: string | null }[] = [];
      const internalEdits: { phaseId: string; field: 'internalStartDate' | 'internalEndDate'; oldDate: string; newDate: string; moduleId: string | null; courseId: string | null }[] = [];

      for (const [phaseId, editsObj] of Object.entries(pendingTableEdits)) {
        const edits = editsObj as Partial<Phase>;
        const orig = phases.find(p => p.id === phaseId);
        if (!orig) continue;

        if (edits.clientDate !== undefined && edits.clientDate !== orig.clientDate) {
          clientEdits.push({ phaseId, clientDate: edits.clientDate });
        }

        const startChanged = edits.internalStartDate !== undefined && edits.internalStartDate !== orig.internalStartDate;
        const endChanged = edits.internalEndDate !== undefined && edits.internalEndDate !== orig.internalEndDate;

        if (startChanged) {
          internalEdits.push({
            phaseId,
            field: 'internalStartDate',
            oldDate: orig.internalStartDate || '',
            newDate: edits.internalStartDate || '',
            moduleId: orig.moduleId || null,
            courseId: orig.courseId || null
          });
        } else if (endChanged) {
          internalEdits.push({
            phaseId,
            field: 'internalEndDate',
            oldDate: orig.internalEndDate || '',
            newDate: edits.internalEndDate || '',
            moduleId: orig.moduleId || null,
            courseId: orig.courseId || null
          });
        }
      }

      const actorId = await getCurrentUserId();

      if (clientEdits.length > 0) {
        const ce = clientEdits[0];
        const orig = phases.find(p => p.id === ce.phaseId);
        if (orig && ce.clientDate) {
          const success = await handleDateEdit(
            ce.phaseId,
            'clientDate',
            ce.clientDate,
            orig.moduleId || null,
            holidays,
            orig.courseId || null
          );
          if (success) {
            setPendingTableEdits({});
            if (onProjectsChanged) onProjectsChanged();
          }
          return;
        }
      }

      if (internalEdits.length > 0) {
        const ie = internalEdits[0];
        const orig = phases.find(p => p.id === ie.phaseId);
        const success = await handleDateEdit(
          ie.phaseId,
          ie.field,
          ie.newDate,
          ie.moduleId,
          holidays,
          orig?.courseId || ie.courseId || null
        );
        if (success) {
          setPendingTableEdits({});
          if (onProjectsChanged) onProjectsChanged();
        }
      } else {
        setPendingTableEdits({});
        await loadData();
        setRefreshCounter(prev => prev + 1);
        setSuccess("Pending client edits saved successfully.");
        if (onProjectsChanged) onProjectsChanged();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to save table edits.");
    }
  };

  const getCellBgClass = (phase: Phase | undefined, field: 'internalStartDate' | 'internalEndDate' | 'clientDate') => {
    if (!phase) return theme === 'dark' ? 'bg-neutral-900/40 border-neutral-800' : 'bg-neutral-50 border-neutral-200';
    
    if (phase.status === 'Completed' || phase.status === 'Approved' || phase.status === 'Done') {
      return theme === 'dark' 
        ? 'bg-neutral-900/60 text-neutral-500 border-neutral-800 font-medium' 
        : 'bg-neutral-100 text-neutral-400 border-neutral-250 font-medium';
    }
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const targetDate = field === 'internalStartDate' ? phase.internalStartDate : field === 'internalEndDate' ? phase.internalEndDate : phase.clientDate;

    if (targetDate) {
      if (targetDate < todayStr || phase.status === 'Overdue') {
        return theme === 'dark' 
          ? 'bg-red-950/40 border-red-500/30 text-red-400 font-semibold' 
          : 'bg-rose-50 border-rose-200 text-rose-700 font-semibold';
      }
      
      const workingDays = getWorkingDaysDifference(todayStr, targetDate);
      if (workingDays >= 0 && workingDays <= 3) {
        return theme === 'dark' 
          ? 'bg-blue-950/40 border-blue-500/30 text-blue-400 font-semibold' 
          : 'bg-sky-50 border-sky-200 text-sky-700 font-semibold';
      }
    }
    
    return theme === 'dark' 
      ? 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/40' 
      : 'bg-white border-neutral-250 text-neutral-800 hover:bg-neutral-50';
  };

  const allowedAssignees = useMemo(() => {
    const linkedIds = projectLinks
      .filter(l => l.project_id === selectedProjectId)
      .map(l => l.employee_id);
    return employees.filter(emp => emp.role === 'Employee' && linkedIds.includes(emp.id));
  }, [employees, projectLinks, selectedProjectId]);

  return (
    <div className="-mt-6 space-y-6 animate-fade-up bg-[var(--bg-page)] text-[var(--text-main)] transition-colors duration-150">
      {/* 1. Unified Top Header Bar matching Overview.tsx */}
      <div className="min-h-[52px] py-2 flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-[var(--border-subtle)]">
        {/* Left Group: Title + View Toggles + Hierarchy Dropdowns */}
        <div className="flex flex-wrap items-center gap-4">
          <h1 className={`text-2xl font-black tracking-tight ${theme === 'light' ? 'bg-gradient-to-r from-[#1DAA58] to-[#2484C6] bg-clip-text text-transparent' : 'text-white'}`}>Project Editor</h1>

          {/* Active View Mode Tabs */}
          <div className="flex items-center gap-1 bg-[var(--input-bg)] p-1 rounded-lg border border-[var(--border-subtle)] overflow-x-auto relative">
            {[
              { id: 'client', label: 'Delivery' },
              { id: 'internal', label: 'Development' }
            ].map(t => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  className={`relative px-3 py-1 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                    isActive
                      ? 'text-[var(--text-main)] font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="editor-view-active-pill"
                      className="absolute inset-0 rounded-md bg-[var(--bg-card)] shadow-xs border border-[var(--border-subtle)]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Inline Hierarchy Dropdowns & Track Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedProjectId}
              onChange={e => handleProjectSelect(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:ring-1 focus:ring-[#1DAA58] cursor-pointer font-medium"
            >
              <option value="">-- Choose Project --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {/* Quick Project Settings Modal Trigger */}
            {selectedProjectId && (
              <button
                type="button"
                onClick={() => {
                  setEditingProjectHasLms(Boolean(currentProject?.has_lms_track));
                  setProjectSettingsModalOpen(true);
                }}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] bg-[var(--input-bg)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer"
                title="Configure Project Settings & LMS Workstream Track"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            )}

            {/* CONDITIONAL TRACK SWITCHER: Rendered strictly when project.has_lms_track === true */}
            {currentProject?.has_lms_track && (
              <div id="lms-track-switcher" className="flex items-center gap-1 bg-[var(--input-bg)] p-1 rounded-lg border border-[var(--border-subtle)] relative">
                {[
                  { id: 'content', label: 'Content' },
                  { id: 'lms', label: 'LMS' }
                ].map(track => {
                  const isTrackActive = activeTrack === track.id;
                  return (
                    <button
                      key={track.id}
                      id={`track-toggle-${track.id}`}
                      type="button"
                      onClick={() => setActiveTrack(track.id as any)}
                      className={`relative px-3 py-1 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                        isTrackActive
                          ? 'text-[var(--text-main)] font-bold'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                      }`}
                    >
                      {isTrackActive && (
                        <motion.div
                          layoutId="editor-track-active-pill"
                          className="absolute inset-0 rounded-md bg-[var(--bg-card)] shadow-xs border border-[var(--border-subtle)]"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10">{track.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <select
              value={selectedCourseId}
              disabled={!selectedProjectId}
              onChange={e => handleCourseSelect(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:ring-1 focus:ring-[#1DAA58] disabled:opacity-50 cursor-pointer"
            >
              <option value="">All Courses</option>
              {activeCourses.map(c => (
                <option key={c.id} value={c.id}>
                  {c.code && c.code !== c.name ? `${c.code} - ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Group: Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {selectedProjectId && (
            <button
              onClick={() => setIsCreatePlanModalOpen(true)}
              className="px-3 py-1.5 bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-main)] hover:border-[#1DAA58]/50 text-xs font-semibold rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              title="Open Manual Planning Studio"
            >
              <Layers className="w-3.5 h-3.5 text-[#1DAA58]" />
              <span>Create Plan</span>
            </button>
          )}

          <button
            onClick={() => setExportReportModal({ open: true, mode: activeTab })}
            className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title="Export Report to Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            <span>Export</span>
          </button>

          {activeTrack === 'lms' ? (
            <button
              onClick={() => {
                setNewLmsPhaseName('');
                setNewLmsPhaseType(activeTab === 'client' ? 'client' : 'internal');
                setShowCreateLmsPhaseModal(true);
              }}
              className="px-3.5 py-1.5 bg-gradient-to-r from-[#2484C6] to-[#6366F1] text-white font-medium text-xs rounded-lg shadow-md hover:opacity-90 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add LMS Phase</span>
            </button>
          ) : (
            <button
              onClick={handleOpenCreateRowModal}
              className="px-3.5 py-1.5 bg-gradient-to-r from-[#1DAA58] to-[#2484C6] text-white font-medium text-xs rounded-lg shadow-md hover:opacity-90 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Row</span>
            </button>
          )}

          <button
            disabled={isRefreshing || loading}
            onClick={refreshDashboardData}
            className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
            title="Refresh project data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin-linear text-[#1DAA58]' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {success && (
        <div className="p-4 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-450 flex items-start gap-2 justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-neutral-400 hover:text-white text-[10px]">✕</button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-md bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Area (Renders when a project is chosen) */}
      {selectedProjectId ? (
        <div className="space-y-6">
          {sequenceConflicts.length > 0 && (
            <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 text-xs shadow-md animate-fade-in flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="font-bold tracking-wide uppercase text-[11px] text-rose-400 flex items-center justify-between">
                  <span>Sequence Conflict Detected ({sequenceConflicts.length})</span>
                  <span className="text-[10px] font-mono lowercase opacity-80">Highlighted in red in table below</span>
                </div>
                <div className="space-y-1 text-[11px] text-rose-200/90 font-mono">
                  {sequenceConflicts.slice(0, 4).map((c, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0"></span>
                      <span>{c.message}</span>
                    </div>
                  ))}
                  {sequenceConflicts.length > 4 && (
                    <div className="text-[10px] text-rose-400 italic">...and {sequenceConflicts.length - 4} more conflict(s)</div>
                  )}
                </div>
              </div>
            </div>
          )}
          {/* Slider Layout View Container or Empty State */}
          {isProjectCompletelyEmpty ? (
            <div className="w-full border border-dashed border-[var(--border-subtle)] rounded-2xl bg-[var(--bg-card)]/60 backdrop-blur-sm p-12 md:p-16 text-center flex flex-col items-center justify-center space-y-6 shadow-xl transition-all my-2 animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1DAA58]/20 via-[#2484C6]/20 to-[#6366F1]/20 border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-main)] shadow-lg">
                <Layers className="w-8 h-8 text-[#2484C6]" />
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="text-base md:text-lg font-bold text-[var(--text-main)]">
                  No Plan Configured for {currentProject?.name || 'This Project'}
                </h3>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  This project does not have any courses, modules, or schedules yet. You can upload an existing schedule spreadsheet or build the entire plan manually using the creation studio.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (onNavigateToIngestion) {
                      onNavigateToIngestion(selectedProjectId);
                    } else {
                      sessionStorage.setItem('data_ingestion_project_id', selectedProjectId);
                      window.location.hash = '#ingestion';
                    }
                  }}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#2484C6] to-[#1DAA58] hover:opacity-95 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 active:scale-98 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Upload Plan</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCreatePlanModalOpen(true)}
                  className="px-5 py-2.5 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] text-[var(--text-main)] hover:border-[#1DAA58]/60 text-xs font-semibold shadow-md active:scale-98 transition-all flex items-center gap-2 cursor-pointer group"
                >
                  <Plus className="w-4 h-4 text-[#1DAA58] group-hover:scale-110 transition-transform" />
                  <span>Create Plan</span>
                </button>
              </div>
            </div>
          ) : (
          <div className="relative overflow-hidden w-full">
            <div 
              className="flex transition-transform duration-500 ease-in-out items-start"
              style={{ transform: `translateX(-${activeTab === 'client' ? 0 : 100}%)` }}
            >
              {/* VIEW 1: DELIVERY (CLIENT) TABLE EDITOR */}
              <div className="w-full shrink-0 px-1">
                    <div className="space-y-4">
                      {((activeTrack === 'content' ? selectedModuleIds.size > 0 : false) || Object.keys(pendingTableEdits).length > 0) && (
                        <div className="flex items-center justify-end gap-2 pb-2 border-b border-[var(--border-subtle)]">
                          {activeTrack === 'content' && selectedModuleIds.size > 0 && (
                            <button
                              onClick={handleTriggerBulkDelete}
                              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded flex items-center gap-1.5 shadow-md active:scale-97 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Selected ({selectedModuleIds.size})</span>
                            </button>
                          )}
                          {Object.keys(pendingTableEdits).length > 0 && (
                            <button
                              onClick={handleSaveAllTableEdits}
                              className="px-4 py-1.5 bg-[#1DAA58] hover:brightness-110 text-white text-xs font-bold rounded flex items-center gap-1.5 shadow-md active:scale-97 cursor-pointer"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Save All ({Object.keys(pendingTableEdits).length} pending)</span>
                            </button>
                          )}
                        </div>
                      )}

                      <div className="overflow-x-auto overscroll-x-contain touch-pan-x w-full border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-card)] shadow-xl transition-colors">
                        <table className="w-full border-collapse text-xs text-left min-w-[1000px]">
                      <thead>
                        {activeTrack === 'content' ? (
                          <tr className="bg-[var(--input-bg)] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                            <th className="py-3 px-4 w-10 text-center border-r border-[var(--border-subtle)]">
                              <input
                                type="checkbox"
                                checked={activeModules.length > 0 && selectedModuleIds.size === activeModules.length}
                                onChange={toggleSelectAllModules}
                                title="Select all visible module rows"
                                className="rounded cursor-pointer accent-[#1DAA58]"
                              />
                            </th>
                            <th className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-main)]">Course Name</th>
                            <th className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-main)]">Module Name</th>
                            <th className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-main)]">Language</th>
                            {customClientModuleColNames.map(colName => (
                              <th key={`mod-col-client-${colName}`} className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-muted)] bg-[var(--input-bg)] text-center">
                                {colName === 'SCREENS' ? 'Screens' : colName}
                              </th>
                            ))}
                            {clientPhaseNames.map(name => (
                              <React.Fragment key={name}>
                                <th
                                  draggable
                                  onDragStart={e => handleDragStartPhase(e, name)}
                                  onDragOver={e => e.preventDefault()}
                                  onDragEnd={() => setDraggedPhaseName(null)}
                                  onDrop={e => handleDropPhase(e, name, 'client_phases')}
                                  onClick={() => handleOpenAnchorModal(name)}
                                  onContextMenu={e => {
                                    e.preventDefault();
                                    handleOpenAnchorModal(name);
                                  }}
                                  title="Click or right-click to edit internal anchor mapping & gap. Drag to reorder."
                                  className="py-3 px-4 font-semibold text-center border-r border-[var(--border-subtle)] bg-[var(--input-bg)] cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors select-none text-[var(--text-main)]"
                                >
                                  {name}
                                </th>
                                {customClientPhaseColNames.map(colName => (
                                  <th key={`phase-col-client-${name}-${colName}`} className="py-3 px-4 font-semibold text-center border-r border-[var(--border-subtle)] bg-[var(--input-bg)] text-[var(--text-muted)]">{name} {colName}</th>
                                ))}
                              </React.Fragment>
                            ))}
                            <th className="py-3 px-4 w-14 min-w-[56px] text-center border-r border-[var(--border-subtle)] font-semibold bg-[var(--input-bg)] text-[var(--text-muted)]">Actions</th>
                          </tr>
                        ) : (
                          <tr className="bg-[var(--input-bg)] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                            <th className="py-3 px-4 w-10 text-center border-r border-[var(--border-subtle)]">
                              <input
                                type="checkbox"
                                checked={lmsRows.length > 0 && selectedCourseIdsForLms.size === lmsRows.length}
                                onChange={toggleSelectAllCoursesForLms}
                                title="Select all visible courses"
                                className="rounded cursor-pointer accent-[#1DAA58]"
                              />
                            </th>
                            <th className="py-3 px-4 w-12 text-center font-semibold border-r border-[var(--border-subtle)] text-[var(--text-main)]">S.no</th>
                            <th className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-main)]">Course Name</th>
                            <th className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-main)]">Language</th>
                            {courseCustomColNames.map(colName => (
                              <th key={`course-col-client-${colName}`} className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-muted)] bg-[var(--input-bg)]">{colName}</th>
                            ))}
                            {lmsClientPhaseNames.length === 0 ? (
                              <th className="py-3 px-4 font-normal italic text-[var(--text-muted)] border-r border-[var(--border-subtle)] text-center">
                                No LMS Delivery phases yet (Click "+ Add LMS Phase" above)
                              </th>
                            ) : (
                              lmsClientPhaseNames.map(name => (
                                <th
                                  key={`lms-client-phase-${name}`}
                                  onClick={() => handleOpenAnchorModal(name)}
                                  title="Click to edit internal anchor mapping & gap."
                                  className="py-3 px-4 font-semibold text-center border-r border-[var(--border-subtle)] bg-[var(--input-bg)] cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors select-none text-[var(--text-main)]"
                                >
                                  {name}
                                </th>
                              ))
                            )}
                            <th className="py-3 px-4 w-14 min-w-[56px] text-center border-r border-[var(--border-subtle)] font-semibold bg-[var(--input-bg)] text-[var(--text-muted)]">Actions</th>
                          </tr>
                        )}
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {activeTrack === 'content' ? (
                          groupedRows.length === 0 ? (
                            <tr>
                              <td colSpan={100} className="py-12 text-center text-xs text-[var(--text-muted)] italic">
                                No modules found for this course filter. Select &quot;All Courses&quot; or click &quot;+ Add New Row&quot; above.
                              </td>
                            </tr>
                          ) : (
                          groupedRows.map(group => {
                            return group.modules.map((mod, idx) => {
                              const parentCourse = activeCoursesMap.get(String(mod.courseId)) || courses.find(c => String(c.id) === String(mod.courseId));
                              const courseNameStr = parentCourse?.name || (mod as any).course_name || (mod as any).metadata?.course_name || (currentProject ? currentProject.name : '-');

                              return (
                                <tr key={mod.id} className="hover:bg-[var(--bg-card-hover)] transition-colors text-[var(--text-main)]">
                                  <td className="py-3 px-4 text-center border-r border-[var(--border-subtle)] align-middle">
                                    <input
                                      type="checkbox"
                                      checked={selectedModuleIds.has(mod.id)}
                                      onChange={() => toggleSelectModule(mod.id)}
                                      className="rounded cursor-pointer accent-[#1DAA58]"
                                    />
                                  </td>
                                  <td className="py-3 px-4 border-r border-[var(--border-subtle)] font-semibold text-[var(--text-main)] align-middle">
                                    {courseNameStr}
                                  </td>
                                  <td className="py-3 px-4 border-r border-[var(--border-subtle)] align-middle text-[var(--text-main)] font-medium">
                                    {mod.name}
                                  </td>
                                  <td className="py-3 px-4 border-r border-[var(--border-subtle)] font-semibold text-[var(--text-main)] align-middle">
                                    {mod.language || 'Default/English'}
                                  </td>
                                  {customClientModuleColNames.map(colName => (
                                    <td key={`mod-val-client-${mod.id}-${colName}`} className="p-1 border-r border-[var(--border-subtle)] align-middle text-center">
                                      <input
                                        type="text"
                                        aria-label={`${colName} for ${mod.name}`}
                                        value={
                                          localModuleMetadata[mod.id]?.[colName] !== undefined
                                            ? localModuleMetadata[mod.id][colName]
                                            : getModColVal(mod, colName)
                                        }
                                        onChange={e => handleModuleMetadataChange(mod.id, colName, e.target.value)}
                                        onBlur={e => handleSaveModuleMetadata(mod.id, colName, e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') {
                                            (e.target as HTMLInputElement).blur();
                                          }
                                        }}
                                        placeholder="-"
                                        className="w-full h-8 px-2 text-xs font-mono rounded bg-transparent hover:bg-[var(--input-bg)] focus:bg-[var(--input-bg)] focus:ring-1 focus:ring-[#1DAA58] border border-transparent focus:border-[#1DAA58] text-[var(--text-main)] outline-hidden transition-all text-center"
                                        title={`Edit ${colName} (Press Tab to move to next cell)`}
                                      />
                                    </td>
                                  ))}
                                  {clientPhaseNames.map(phaseName => {
                                    const phase = phases.find(ph => 
                                      ph.moduleId === mod.id && 
                                      ph.phaseName === phaseName && 
                                      ph.sourceFile === 'Client'
                                    );
                                    const phaseId = phase?.id || '';
                                    const field = 'clientDate';
                                    const isEditing = editingCell?.phaseId === phaseId && editingCell?.field === field;
                                    const pendingValue = pendingTableEdits[phaseId]?.[field];
                                    const remoteUsersEditing = remotePresences.filter(u => u.focusedCell?.phaseId === phaseId && u.focusedCell?.field === field);
                                    const bgClass = getCellBgClass(phase, field);

                                    const dateCell = (
                                      <MemoizedDateCell
                                        key={phaseName}
                                        phaseId={phaseId}
                                        field={field}
                                        phase={phase}
                                        pendingValue={pendingValue}
                                        hasConflict={remoteConflicts[phaseId]}
                                        hasSequenceConflict={conflictPhaseIds.has(phaseId)}
                                        isEditing={isEditing}
                                        remoteUsersEditing={remoteUsersEditing}
                                        theme={theme}
                                        bgClass={bgClass}
                                        onClick={() => {
                                          if (phaseId) setEditingCell({ phaseId, field });
                                        }}
                                        onChange={val => {
                                          if (phaseId) {
                                            setPendingTableEdits(prev => ({
                                              ...prev,
                                              [phaseId]: {
                                                ...prev[phaseId],
                                                [field]: val
                                              }
                                            }));
                                          }
                                        }}
                                        onSaveInline={val => {
                                          if (phaseId) saveTableEditInline(phaseId, field, val);
                                        }}
                                        onCancel={() => setEditingCell(null)}
                                      />
                                    );

                                    const customCells = customClientPhaseColNames.map(colName => {
                                      const val = phase?.metadata?.[colName];
                                      return (
                                        <td key={`phase-val-client-${mod.id}-${phaseName}-${colName}`} className="py-3 px-4 border-r border-[var(--border-subtle)] text-center font-mono text-neutral-400 align-middle">
                                          {val !== undefined ? String(val) : '-'}
                                        </td>
                                      );
                                    });

                                    return (
                                      <React.Fragment key={phaseName}>
                                        {dateCell}
                                        {customCells}
                                      </React.Fragment>
                                    );
                                  })}
                                  <td className="py-3 px-4 w-14 min-w-[56px] text-center border-r border-[var(--border-subtle)] align-middle">
                                    <button
                                      onClick={() => handleTriggerSingleDelete(mod)}
                                      title="Delete this row"
                                      className="p-1.5 rounded hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4 text-rose-500" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            });
                          })
                        )) : (
                          lmsRows.length === 0 ? (
                            <tr>
                              <td colSpan={5 + courseCustomColNames.length + Math.max(1, lmsClientPhaseNames.length)} className="py-8 text-center text-neutral-400">
                                No courses found for this project.
                              </td>
                            </tr>
                          ) : (
                            lmsRows.map(row => {
                              return (
                                <tr key={row.rowKey} className="hover:bg-[var(--bg-card-hover)] transition-colors text-[var(--text-main)]">
                                  <td className="py-3 px-4 text-center border-r border-[var(--border-subtle)] align-middle">
                                    <input
                                      type="checkbox"
                                      checked={selectedCourseIdsForLms.has(row.rowKey)}
                                      onChange={() => toggleSelectCourseForLms(row.rowKey)}
                                      className="rounded cursor-pointer accent-[#1DAA58]"
                                    />
                                  </td>
                                  <td className="py-3 px-4 text-center border-r border-[var(--border-subtle)] font-mono text-neutral-400 font-medium align-middle">
                                    {row.sNo}
                                  </td>
                                  <td className="py-3 px-4 border-r border-[var(--border-subtle)] align-middle text-[var(--text-main)] font-semibold">
                                    {row.course.name}
                                  </td>
                                  <td className="py-3 px-4 border-r border-[var(--border-subtle)] font-semibold text-[var(--text-main)] align-middle">
                                    {row.language}
                                  </td>
                                  {courseCustomColNames.map(colName => (
                                    <td key={`course-val-client-${row.rowKey}-${colName}`} className="py-3 px-4 border-r border-[var(--border-subtle)] font-mono text-neutral-400 align-middle">
                                      {row.course.metadata?.[colName] !== undefined ? String(row.course.metadata[colName]) : '-'}
                                    </td>
                                  ))}
                                  {lmsClientPhaseNames.length === 0 ? (
                                    <td className="py-3 px-4 border-r border-[var(--border-subtle)] text-center text-neutral-500 italic">
                                      No phases
                                    </td>
                                  ) : (
                                    lmsClientPhaseNames.map(phaseName => {
                                      const normLang = row.language.trim().toLowerCase();
                                      const phase = phases.find(ph =>
                                        ph.courseId === row.course.id &&
                                        ph.entityLevel === 'course' &&
                                        ph.phaseName === phaseName &&
                                        (ph.sourceFile === 'Client' || !!ph.clientDate) &&
                                        (ph.metadata?.language ? ph.metadata.language.trim().toLowerCase() === normLang : true)
                                      );
                                      const phaseId = phase?.id || '';
                                      const field = 'clientDate';
                                      const isEditing = editingCell?.phaseId === phaseId && editingCell?.field === field;
                                      const pendingValue = pendingTableEdits[phaseId]?.[field];
                                      const remoteUsersEditing = remotePresences.filter(u => u.focusedCell?.phaseId === phaseId && u.focusedCell?.field === field);
                                      const bgClass = getCellBgClass(phase, field);

                                      return (
                                        <MemoizedDateCell
                                          key={`lms-client-cell-${row.rowKey}-${phaseName}`}
                                          phaseId={phaseId}
                                          field={field}
                                          phase={phase}
                                          pendingValue={pendingValue}
                                          hasConflict={remoteConflicts[phaseId]}
                                          hasSequenceConflict={conflictPhaseIds.has(phaseId)}
                                          isEditing={isEditing}
                                          remoteUsersEditing={remoteUsersEditing}
                                          theme={theme}
                                          bgClass={bgClass}
                                          onClick={() => {
                                            if (phaseId) setEditingCell({ phaseId, field });
                                          }}
                                          onChange={val => {
                                            if (phaseId) {
                                              setPendingTableEdits(prev => ({
                                                ...prev,
                                                [phaseId]: {
                                                  ...prev[phaseId],
                                                  [field]: val
                                                }
                                              }));
                                            }
                                          }}
                                          onSaveInline={val => {
                                            if (phaseId) saveTableEditInline(phaseId, field, val);
                                          }}
                                          onCancel={() => setEditingCell(null)}
                                        />
                                      );
                                    })
                                  )}
                                  <td className="py-3 px-4 w-14 min-w-[56px] text-center border-r border-[var(--border-subtle)] align-middle">
                                    <button
                                      onClick={() => setEditingCourseMetadata({ courseId: row.course.id, courseName: row.course.name, key: '', value: '' })}
                                      title="Edit Course Metadata"
                                      className="p-1.5 rounded hover:bg-[#2484C6]/20 text-neutral-400 hover:text-[#2484C6] transition-colors cursor-pointer"
                                    >
                                      <Settings className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* VIEW 2: DEVELOPMENT (INTERNAL) TABLE EDITOR */}
              <div className="w-full shrink-0 px-1">
                <div className="space-y-4">
                  {( (activeTrack === 'content' ? selectedModuleIds.size > 0 : false) || Object.keys(pendingTableEdits).length > 0) && (
                    <div className="flex items-center justify-end gap-2 pb-2 border-b border-[var(--border-subtle)]">
                      {activeTrack === 'content' && selectedModuleIds.size > 0 && (
                        <button
                          onClick={handleTriggerBulkDelete}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded flex items-center gap-1.5 shadow-md active:scale-97 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Selected ({selectedModuleIds.size})</span>
                        </button>
                      )}
                      {Object.keys(pendingTableEdits).length > 0 && (
                        <button
                          onClick={handleSaveAllTableEdits}
                          className="px-4 py-1.5 bg-[#1DAA58] hover:brightness-110 text-white text-xs font-bold rounded flex items-center gap-1.5 shadow-md active:scale-97 cursor-pointer"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>Save All ({Object.keys(pendingTableEdits).length} pending)</span>
                        </button>
                      )}
                    </div>
                  )}

                  <div className="overflow-x-auto overscroll-x-contain touch-pan-x w-full border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-card)] shadow-xl transition-colors">
                    <table className="w-full border-collapse text-xs text-left min-w-[1000px]">
                      <thead>
                        {activeTrack === 'content' ? (
                          <tr className="bg-[var(--input-bg)] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                            <th className="py-3 px-4 w-10 text-center border-r border-[var(--border-subtle)]">
                              <input
                                type="checkbox"
                                checked={activeModules.length > 0 && selectedModuleIds.size === activeModules.length}
                                onChange={toggleSelectAllModules}
                                title="Select all visible module rows"
                                className="rounded cursor-pointer accent-[#1DAA58]"
                              />
                            </th>
                            <th className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-main)]">Course Name</th>
                            <th className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-main)]">Module Name</th>
                            <th className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-main)]">Language</th>
                            {customInternalModuleColNames.map(colName => (
                              <th key={`mod-col-internal-${colName}`} className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-muted)] bg-[var(--input-bg)] text-center">
                                {colName === 'SCREENS' ? 'Screens' : colName}
                              </th>
                            ))}
                            {internalPhaseNames.map(name => (
                              <React.Fragment key={name}>
                                <th
                                  draggable
                                  onDragStart={e => handleDragStartPhase(e, name)}
                                  onDragOver={e => e.preventDefault()}
                                  onDragEnd={() => setDraggedPhaseName(null)}
                                  onDrop={e => handleDropPhase(e, name, 'internal_phases')}
                                  title="Drag header to reorder phase column position"
                                  className="py-3 px-4 font-semibold text-center border-r border-[var(--border-subtle)] bg-[var(--input-bg)] cursor-grab active:cursor-grabbing hover:bg-[var(--bg-card-hover)] transition-colors select-none text-[var(--text-main)]"
                                >
                                  {name} Start
                                </th>
                                <th
                                  draggable
                                  onDragStart={e => handleDragStartPhase(e, name)}
                                  onDragOver={e => e.preventDefault()}
                                  onDragEnd={() => setDraggedPhaseName(null)}
                                  onDrop={e => handleDropPhase(e, name, 'internal_phases')}
                                  title="Drag header to reorder phase column position"
                                  className="py-3 px-4 font-semibold text-center border-r border-[var(--border-subtle)] bg-[var(--input-bg)] cursor-grab active:cursor-grabbing hover:bg-[var(--bg-card-hover)] transition-colors select-none text-[var(--text-main)]"
                                >
                                  {name} End
                                </th>
                                {customInternalPhaseColNames.map(colName => (
                                  <th key={`phase-col-${name}-${colName}`} className="py-3 px-4 font-semibold text-center border-r border-[var(--border-subtle)] bg-[var(--input-bg)] text-[var(--text-muted)]">{name} {colName}</th>
                                ))}
                              </React.Fragment>
                            ))}
                            <th className="py-3 px-4 w-14 min-w-[56px] text-center border-r border-[var(--border-subtle)] font-semibold bg-[var(--input-bg)] text-[var(--text-muted)]">Actions</th>
                          </tr>
                        ) : (
                          <tr className="bg-[var(--input-bg)] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                            <th className="py-3 px-4 w-10 text-center border-r border-[var(--border-subtle)]">
                              <input
                                type="checkbox"
                                checked={lmsRows.length > 0 && selectedCourseIdsForLms.size === lmsRows.length}
                                onChange={toggleSelectAllCoursesForLms}
                                title="Select all visible courses"
                                className="rounded cursor-pointer accent-[#1DAA58]"
                              />
                            </th>
                            <th className="py-3 px-4 w-12 text-center font-semibold border-r border-[var(--border-subtle)] text-[var(--text-main)]">S.no</th>
                            <th className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-main)]">Course Name</th>
                            <th className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-main)]">Language</th>
                            {courseCustomColNames.map(colName => (
                              <th key={`course-col-internal-${colName}`} className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-muted)] bg-[var(--input-bg)]">{colName}</th>
                            ))}
                            {lmsInternalPhaseNames.length === 0 ? (
                              <th colSpan={2} className="py-3 px-4 font-normal italic text-[var(--text-muted)] border-r border-[var(--border-subtle)] text-center">
                                No LMS Development phases yet (Click "+ Add LMS Phase" above)
                              </th>
                            ) : (
                              lmsInternalPhaseNames.map(name => (
                                <React.Fragment key={`lms-int-hdr-${name}`}>
                                  <th className="py-3 px-4 font-semibold text-center border-r border-[var(--border-subtle)] bg-[var(--input-bg)] text-[var(--text-main)]">
                                    {name} Start
                                  </th>
                                  <th className="py-3 px-4 font-semibold text-center border-r border-[var(--border-subtle)] bg-[var(--input-bg)] text-[var(--text-main)]">
                                    {name} End
                                  </th>
                                </React.Fragment>
                              ))
                            )}
                            <th className="py-3 px-4 w-14 min-w-[56px] text-center border-r border-[var(--border-subtle)] font-semibold bg-[var(--input-bg)] text-[var(--text-muted)]">Actions</th>
                          </tr>
                        )}
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {activeTrack === 'content' ? (
                          groupedRows.length === 0 ? (
                            <tr>
                              <td colSpan={100} className="py-12 text-center text-xs text-[var(--text-muted)] italic">
                                No modules found for this course filter. Select &quot;All Courses&quot; or click &quot;+ Add New Row&quot; above.
                              </td>
                            </tr>
                          ) : (
                          groupedRows.map(group => {
                            return group.modules.map((mod, idx) => {
                              const parentCourse = activeCoursesMap.get(String(mod.courseId)) || courses.find(c => String(c.id) === String(mod.courseId));
                              const courseNameStr = parentCourse?.name || (mod as any).course_name || (mod as any).metadata?.course_name || (currentProject ? currentProject.name : '-');

                              return (
                                <tr key={mod.id} className="hover:bg-[var(--bg-card-hover)] transition-colors text-[var(--text-main)]">
                                  <td className="py-3 px-4 text-center border-r border-[var(--border-subtle)] align-middle">
                                    <input
                                      type="checkbox"
                                      checked={selectedModuleIds.has(mod.id)}
                                      onChange={() => toggleSelectModule(mod.id)}
                                      className="rounded cursor-pointer accent-[#1DAA58]"
                                    />
                                  </td>
                                  <td className="py-3 px-4 border-r border-[var(--border-subtle)] font-semibold text-[var(--text-main)] align-middle">
                                    {courseNameStr}
                                  </td>
                                  <td className="py-3 px-4 border-r border-[var(--border-subtle)] align-middle text-[var(--text-main)] font-medium">
                                    {mod.name}
                                  </td>
                                  <td className="py-3 px-4 border-r border-[var(--border-subtle)] font-semibold text-[var(--text-main)] align-middle">
                                    {mod.language || 'Default/English'}
                                  </td>
                                  {customInternalModuleColNames.map(colName => (
                                    <td key={`mod-val-internal-${mod.id}-${colName}`} className="p-1 border-r border-[var(--border-subtle)] align-middle text-center">
                                      <input
                                        type="text"
                                        aria-label={`${colName} for ${mod.name}`}
                                        value={
                                          localModuleMetadata[mod.id]?.[colName] !== undefined
                                            ? localModuleMetadata[mod.id][colName]
                                            : getModColVal(mod, colName)
                                        }
                                        onChange={e => handleModuleMetadataChange(mod.id, colName, e.target.value)}
                                        onBlur={e => handleSaveModuleMetadata(mod.id, colName, e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') {
                                            (e.target as HTMLInputElement).blur();
                                          }
                                        }}
                                        placeholder="-"
                                        className="w-full h-8 px-2 text-xs font-mono rounded bg-transparent hover:bg-[var(--input-bg)] focus:bg-[var(--input-bg)] focus:ring-1 focus:ring-[#1DAA58] border border-transparent focus:border-[#1DAA58] text-[var(--text-main)] outline-hidden transition-all text-center"
                                        title={`Edit ${colName} (Press Tab to move to next cell)`}
                                      />
                                    </td>
                                  ))}
                                  {internalPhaseNames.map(phaseName => {
                                    const phase = phases.find(ph => 
                                      ph.moduleId === mod.id && 
                                      ph.phaseName === phaseName && 
                                      (ph.sourceFile === 'Internal' || !ph.sourceFile || ph.sourceFile !== 'Client')
                                    );
                                    
                                    const fields = ['internalStartDate', 'internalEndDate'] as const;
                                    const dateCells = fields.map(field => {
                                      const phaseId = phase?.id || '';
                                      const isEditing = editingCell?.phaseId === phaseId && editingCell?.field === field;
                                      const pendingValue = pendingTableEdits[phaseId]?.[field];
                                      const remoteUsersEditing = remotePresences.filter(u => u.focusedCell?.phaseId === phaseId && u.focusedCell?.field === field);
                                      const bgClass = getCellBgClass(phase, field);

                                      return (
                                        <MemoizedDateCell
                                          key={`${phaseName}-${field}`}
                                          phaseId={phaseId}
                                          field={field}
                                          phase={phase}
                                          pendingValue={pendingValue}
                                          hasConflict={remoteConflicts[phaseId]}
                                          hasSequenceConflict={conflictPhaseIds.has(phaseId)}
                                          isEditing={isEditing}
                                          remoteUsersEditing={remoteUsersEditing}
                                          theme={theme}
                                          bgClass={bgClass}
                                          onClick={() => {
                                            if (phaseId) setEditingCell({ phaseId, field });
                                          }}
                                          onChange={val => {
                                            if (phaseId) {
                                              setPendingTableEdits(prev => ({
                                                ...prev,
                                                [phaseId]: {
                                                  ...prev[phaseId],
                                                  [field]: val
                                                }
                                              }));
                                            }
                                          }}
                                          onSaveInline={val => {
                                            if (phaseId) saveTableEditInline(phaseId, field, val);
                                          }}
                                          onCancel={() => setEditingCell(null)}
                                        />
                                      );
                                    });

                                    const customCells = customInternalPhaseColNames.map(colName => {
                                      const val = phase?.metadata?.[colName];
                                      return (
                                        <td key={`phase-val-${mod.id}-${phaseName}-${colName}`} className="py-3 px-4 border-r border-[var(--border-subtle)] text-center font-mono text-neutral-400 align-middle">
                                          {val !== undefined ? String(val) : '-'}
                                        </td>
                                      );
                                    });

                                    return (
                                      <React.Fragment key={phaseName}>
                                        {dateCells}
                                        {customCells}
                                      </React.Fragment>
                                    );
                                  })}
                                  <td className="py-3 px-4 w-14 min-w-[56px] text-center border-r border-[var(--border-subtle)] align-middle">
                                    <button
                                      onClick={() => handleTriggerSingleDelete(mod)}
                                      title="Delete this row"
                                      className="p-1.5 rounded hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4 text-rose-500" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            });
                          })
                        )) : (
                          lmsRows.length === 0 ? (
                            <tr>
                              <td colSpan={5 + courseCustomColNames.length + Math.max(1, lmsInternalPhaseNames.length * 2)} className="py-8 text-center text-neutral-400">
                                No courses found for this project.
                              </td>
                            </tr>
                          ) : (
                            lmsRows.map(row => {
                              return (
                                <tr key={row.rowKey} className="hover:bg-[var(--bg-card-hover)] transition-colors text-[var(--text-main)]">
                                  <td className="py-3 px-4 text-center border-r border-[var(--border-subtle)] align-middle">
                                    <input
                                      type="checkbox"
                                      checked={selectedCourseIdsForLms.has(row.rowKey)}
                                      onChange={() => toggleSelectCourseForLms(row.rowKey)}
                                      className="rounded cursor-pointer accent-[#1DAA58]"
                                    />
                                  </td>
                                  <td className="py-3 px-4 text-center border-r border-[var(--border-subtle)] font-mono text-neutral-400 font-medium align-middle">
                                    {row.sNo}
                                  </td>
                                  <td className="py-3 px-4 border-r border-[var(--border-subtle)] align-middle text-[var(--text-main)] font-semibold">
                                    {row.course.name}
                                  </td>
                                  <td className="py-3 px-4 border-r border-[var(--border-subtle)] font-semibold text-[var(--text-main)] align-middle">
                                    {row.language}
                                  </td>
                                  {courseCustomColNames.map(colName => (
                                    <td key={`course-val-int-${row.rowKey}-${colName}`} className="py-3 px-4 border-r border-[var(--border-subtle)] font-mono text-neutral-400 align-middle">
                                      {row.course.metadata?.[colName] !== undefined ? String(row.course.metadata[colName]) : '-'}
                                    </td>
                                  ))}
                                  {lmsInternalPhaseNames.length === 0 ? (
                                    <td colSpan={2} className="py-3 px-4 border-r border-[var(--border-subtle)] text-center text-neutral-500 italic">
                                      No phases
                                    </td>
                                  ) : (
                                    lmsInternalPhaseNames.map(phaseName => {
                                      const normLang = row.language.trim().toLowerCase();
                                      const phase = phases.find(ph =>
                                        ph.courseId === row.course.id &&
                                        ph.entityLevel === 'course' &&
                                        ph.phaseName === phaseName &&
                                        (ph.sourceFile === 'Internal' || !ph.sourceFile || ph.sourceFile !== 'Client' || !!ph.internalStartDate || !!ph.internalEndDate) &&
                                        (ph.metadata?.language ? ph.metadata.language.trim().toLowerCase() === normLang : true)
                                      );

                                      const fields = ['internalStartDate', 'internalEndDate'] as const;
                                      return fields.map(field => {
                                        const phaseId = phase?.id || '';
                                        const isEditing = editingCell?.phaseId === phaseId && editingCell?.field === field;
                                        const pendingValue = pendingTableEdits[phaseId]?.[field];
                                        const remoteUsersEditing = remotePresences.filter(u => u.focusedCell?.phaseId === phaseId && u.focusedCell?.field === field);
                                        const bgClass = getCellBgClass(phase, field);

                                        return (
                                          <MemoizedDateCell
                                            key={`lms-int-cell-${row.rowKey}-${phaseName}-${field}`}
                                            phaseId={phaseId}
                                            field={field}
                                            phase={phase}
                                            pendingValue={pendingValue}
                                            hasConflict={remoteConflicts[phaseId]}
                                            hasSequenceConflict={conflictPhaseIds.has(phaseId)}
                                            isEditing={isEditing}
                                            remoteUsersEditing={remoteUsersEditing}
                                            theme={theme}
                                            bgClass={bgClass}
                                            onClick={() => {
                                              if (phaseId) setEditingCell({ phaseId, field });
                                            }}
                                            onChange={val => {
                                              if (phaseId) {
                                                setPendingTableEdits(prev => ({
                                                  ...prev,
                                                  [phaseId]: {
                                                    ...prev[phaseId],
                                                    [field]: val
                                                  }
                                                }));
                                              }
                                            }}
                                            onSaveInline={val => {
                                              if (phaseId) saveTableEditInline(phaseId, field, val);
                                            }}
                                            onCancel={() => setEditingCell(null)}
                                          />
                                        );
                                      });
                                    })
                                  )}
                                  <td className="py-3 px-4 w-14 min-w-[56px] text-center border-r border-[var(--border-subtle)] align-middle">
                                    <button
                                      onClick={() => setEditingCourseMetadata({ courseId: row.course.id, courseName: row.course.name, key: '', value: '' })}
                                      title="Edit Course Metadata"
                                      className="p-1.5 rounded hover:bg-[#2484C6]/20 text-neutral-400 hover:text-[#2484C6] transition-colors cursor-pointer"
                                    >
                                      <Settings className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>
          </div>
          )}

        </div>
      ) : (
        <div className="p-16 rounded-xl text-center border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)] flex flex-col items-center justify-center transition-colors">
          <Info className="w-10 h-10 text-[var(--text-muted)] mb-3 opacity-55" />
          <h4 className="font-bold text-sm text-[var(--text-main)]">Select Project to Begin</h4>
          <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm leading-relaxed">
            Please choose a project from the dropdown above to load the operational schedule workstation.
          </p>
        </div>
      )}

      {/* Warning confirmation alerts for match/orphan checks */}
      {orphanWarning && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/75 backdrop-blur-xs animate-fade-in overflow-y-auto"
          onClick={() => setOrphanWarning(null)}
        >
          <div 
            className={`relative max-w-md w-full max-h-[90vh] my-auto p-6 rounded-2xl border text-xs shadow-2xl overflow-y-auto ${
              theme === 'dark' ? 'bg-[#1B1D21] border-neutral-750 text-white' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-amber-500 mb-2 uppercase tracking-wide flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 animate-bounce" />
              <span>Orphan Warning</span>
            </h3>
            <p className="mb-4 text-neutral-450 leading-relaxed">
              {orphanWarning.message}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setOrphanWarning(null)}
                className={`px-3 py-1.5 border rounded font-semibold hover:bg-neutral-500/10 cursor-pointer ${
                  theme === 'dark' ? 'border-neutral-700 text-neutral-350' : 'border-neutral-300 text-neutral-700'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={orphanWarning.onConfirm}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold transition-all shadow-md active:scale-97 cursor-pointer"
              >
                Proceed Rename
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Cascade Confirmation Modal */}
      {cascadeModal && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/75 backdrop-blur-xs animate-fade-in overflow-y-auto"
          onClick={() => {
            if (cascadeModal.onCancel) {
              cascadeModal.onCancel();
            } else {
              setCascadeModal(null);
            }
          }}
        >
          <div 
            className={`relative max-w-lg w-full max-h-[90vh] my-auto rounded-2xl border text-xs shadow-2xl overflow-hidden flex flex-col transition-all ${
              theme === 'dark' ? 'bg-[#181A1E] border-neutral-700/60 text-white' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between p-5 pb-3 border-b shrink-0 ${
              theme === 'dark' ? 'border-neutral-700/40' : 'border-neutral-200'
            }`}>
              <h3 className={`text-sm font-bold uppercase tracking-wide flex items-center gap-2 ${
                theme === 'dark' ? 'text-amber-400' : 'text-amber-600'
              }`}>
                <div className={`p-1.5 rounded-md border ${
                  theme === 'dark' ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-600'
                }`}>
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <span>Confirm Date Shift</span>
              </h3>
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                theme === 'dark' ? 'text-neutral-400 bg-neutral-800/60 border-neutral-700/50' : 'text-neutral-600 bg-neutral-100 border-neutral-300'
              }`}>
                {cascadeModal.affectedPhases.length} Affected
              </span>
            </div>
            
            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              <p className={`leading-relaxed text-xs ${
                theme === 'dark' ? 'text-neutral-300' : 'text-neutral-700'
              }`}>
                Shifting <strong className={theme === 'dark' ? 'text-white font-semibold' : 'text-neutral-900 font-bold'}>"{cascadeModal.editedPhaseName}"</strong> by {Math.abs(cascadeModal.delta)} working days will also affect {cascadeModal.affectedPhases.length} phase{cascadeModal.affectedPhases.length !== 1 ? 's' : ''}:
              </p>

              <div className={`max-h-52 overflow-y-auto space-y-2 p-3 rounded-lg border font-mono text-[11px] ${
                theme === 'dark' ? 'bg-[#111215] border-neutral-800' : 'bg-neutral-50 border-neutral-200'
              }`}>
                {cascadeModal.affectedPhases.map((item, idx) => (
                  <div key={idx} className={`flex justify-between items-center gap-2 p-2 rounded transition-colors ${
                    theme === 'dark' ? 'bg-neutral-900/60 hover:bg-neutral-800/50' : 'bg-white border border-neutral-200/80 shadow-2xs hover:bg-neutral-100/50'
                  }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider shrink-0 ${
                        item.type === 'Client'
                          ? (theme === 'dark' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'bg-sky-100 text-sky-700 border border-sky-200')
                          : (theme === 'dark' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'bg-purple-100 text-purple-700 border border-purple-200')
                      }`}>
                        {item.type || 'Internal'}
                      </span>
                      <span className={`truncate ${
                        item.isPaired
                          ? (theme === 'dark' ? 'text-amber-400 font-semibold' : 'text-amber-600 font-bold')
                          : (theme === 'dark' ? 'text-neutral-200' : 'text-neutral-800 font-medium')
                      }`}>
                        {item.name}
                        {item.isPaired && (
                          <span className={`ml-1 text-[8px] font-bold px-1 py-0.2 rounded border ${
                            theme === 'dark' ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' : 'text-amber-700 bg-amber-100 border-amber-300'
                          }`}>
                            paired
                          </span>
                        )}
                      </span>
                    </div>
                    <span className={`font-semibold shrink-0 select-all ${
                      theme === 'dark' ? 'text-neutral-350' : 'text-neutral-600 font-mono'
                    }`}>
                      {formatDateShort(item.oldDate)} → {formatDateShort(item.newDate)}
                    </span>
                  </div>
                ))}
              </div>

              {cascadeModal.completedSkippedCount > 0 && (
                <p className={`text-[11px] font-semibold flex items-center gap-1.5 ${
                  theme === 'dark' ? 'text-amber-400/90' : 'text-amber-600'
                }`}>
                  <Info className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  <span>{cascadeModal.completedSkippedCount} Completed phase(s) will not be shifted.</span>
                </p>
              )}

              {/* Delta > 30 Days Warning */}
              {cascadeModal.largeShiftWarning && (
                <div className={`p-2.5 rounded-md border text-[10px] font-medium ${
                  theme === 'dark' ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}>
                  ⚠️ {cascadeModal.largeShiftWarning}
                </div>
              )}

              {/* Client Deadline Exceeded Warnings */}
              {cascadeModal.clientWarnings.length > 0 && (
                <div className={`p-2.5 rounded-md border text-[10px] font-medium space-y-1 ${
                  theme === 'dark' ? 'bg-red-500/10 border-red-500/25 text-red-400' : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  {cascadeModal.clientWarnings.map((warn, idx) => (
                    <div key={idx}>⚠ {warn}</div>
                  ))}
                </div>
              )}
            </div>

            <div className={`flex flex-wrap items-center justify-end gap-2.5 p-4 border-t shrink-0 ${
              theme === 'dark' ? 'border-neutral-700/40 bg-[#141518]' : 'border-neutral-200 bg-neutral-50'
            }`}>
              <button
                onClick={() => {
                  if (cascadeModal.onCancel) {
                    cascadeModal.onCancel();
                  } else {
                    setCascadeModal(null);
                  }
                }}
                className={`px-3.5 py-2 border rounded-lg font-semibold text-xs transition-colors cursor-pointer ${
                  theme === 'dark' ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-800' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (cascadeModal.onApplySingleOnly) {
                    cascadeModal.onApplySingleOnly();
                  } else {
                    setCascadeModal(null);
                  }
                }}
                title="Apply changes only to this single cell without shifting adjacent phases"
                className={`px-3.5 py-2 border rounded-lg font-semibold text-xs transition-colors cursor-pointer ${
                  theme === 'dark'
                    ? 'border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
                    : 'border-neutral-300 bg-neutral-100 text-neutral-800 hover:bg-neutral-200'
                }`}
              >
                Apply to This Column Only
              </button>
              <button
                onClick={cascadeModal.onConfirm}
                title="Cascade shift forward/backward to downstream & upstream phases preserving dynamic working gaps"
                className="px-4 py-2 bg-gradient-to-r from-[#1DAA58] to-[#2484C6] hover:brightness-110 text-white rounded-lg font-bold text-xs transition-all shadow-md active:scale-97 cursor-pointer flex items-center gap-1.5"
              >
                <span>Cascade Timeline</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Delete Row Confirmation Modal */}
      {deleteModal && createPortal(
        <div 
          className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-md animate-in fade-in duration-150 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto"
          onClick={() => setDeleteModal(null)}
        >
          <div 
            className={`relative max-w-md w-full max-h-[90vh] my-auto p-6 rounded-2xl border shadow-2xl space-y-4 overflow-y-auto ${
              theme === 'dark' ? 'bg-[#1B1D21] border-rose-500/30 text-white' : 'bg-white border-rose-300 text-neutral-900'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-2 rounded-full bg-rose-500/10">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold">{deleteModal.title}</h3>
            </div>
            <p className="text-xs text-neutral-400 whitespace-pre-line leading-relaxed">
              {deleteModal.message}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteModal(null)}
                className={`px-4 py-2 text-xs font-semibold rounded border cursor-pointer ${
                  theme === 'dark' ? 'border-neutral-700 hover:bg-neutral-800 text-neutral-300' : 'border-neutral-300 hover:bg-neutral-100 text-neutral-700'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteModules}
                className="px-4 py-2 text-xs font-bold rounded bg-rose-600 hover:bg-rose-700 text-white shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Create Row Modal (Target Project, Course & Multi-Module) */}
      {showCreateRowModal && createPortal(
        <div 
          className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto"
          onClick={() => setShowCreateRowModal(false)}
        >
          <div 
            className={`relative max-w-2xl w-full max-h-[90vh] my-auto rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
              theme === 'dark' ? 'bg-[#1B1D21] border-neutral-750 text-white' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-neutral-500/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 text-[#1DAA58]">
                <div className="p-1.5 rounded-lg bg-[#1DAA58]/10">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-main)]">Add New Row (Course & Modules)</h3>
                  <p className="text-[11px] text-[var(--text-muted)]">Attach modules to an existing course or create a new course in the target project.</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateRowModal(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800/50 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateModuleRow} className="flex flex-col flex-1 min-h-0 text-xs">
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
                {/* 1. Target Project */}
                <div>
                  <label className="block font-semibold mb-1 text-[var(--text-muted)]">
                    Target Project <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={targetProjectIdForRow}
                    onChange={e => {
                      const newProjId = e.target.value;
                      setTargetProjectIdForRow(newProjId);
                      const firstC = courses.find(c => c.projectId === newProjId);
                      setCourseNameForRow(firstC ? firstC.name : '');
                    }}
                    required
                    className={`w-full p-2.5 rounded-lg border outline-hidden focus:border-[#1DAA58] focus:ring-1 focus:ring-[#1DAA58] transition font-medium ${
                      theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-neutral-50 border-neutral-300 text-neutral-900'
                    }`}
                  >
                    <option value="" disabled>-- Select a Project --</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Course Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block font-semibold text-[var(--text-muted)]">
                      Course Name <span className="text-rose-500">*</span>
                    </label>
                    {existingCoursesInTargetProject.length > 0 && (
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {existingCoursesInTargetProject.length} existing course(s) in this project
                      </span>
                    )}
                  </div>

                  <input
                    type="text"
                    list="existing-project-courses-datalist"
                    placeholder="e.g. Safety Protocols & Compliance"
                    value={courseNameForRow}
                    onChange={e => setCourseNameForRow(e.target.value)}
                    required
                    className={`w-full p-2.5 rounded-lg border outline-hidden focus:border-[#1DAA58] focus:ring-1 focus:ring-[#1DAA58] transition font-medium ${
                      theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                    }`}
                  />
                  <datalist id="existing-project-courses-datalist">
                    {existingCoursesInTargetProject.map(c => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>

                  {/* Real-Time Smart Reuse Indicator */}
                  {matchedExistingCourse ? (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs">
                      <Check className="w-4 h-4 shrink-0" />
                      <div>
                        <span className="font-bold">Course exists: </span>
                        <span>"{matchedExistingCourse.name}". New module(s) will be automatically attached under this course.</span>
                      </div>
                    </div>
                  ) : courseNameForRow.trim() ? (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-400 text-xs">
                      <Plus className="w-4 h-4 shrink-0" />
                      <div>
                        <span className="font-bold">New Course: </span>
                        <span>"{courseNameForRow.trim()}" does not exist yet and will be created under this project.</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Type a new course name or select an existing course from the dropdown/datalist.
                    </p>
                  )}
                </div>

                {/* 3. Modules Section */}
                <div className="space-y-3 pt-2 border-t border-neutral-500/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-[var(--text-main)]">Module Details</h4>
                      <p className="text-[11px] text-[var(--text-muted)]">Add one or multiple modules to this course.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setModuleRowsToAdd(prev => [
                          ...prev,
                          { id: 'draft-' + Date.now() + '-' + Math.random(), name: '', language: 'English', screens: '' }
                        ]);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-[#1DAA58]/10 hover:bg-[#1DAA58]/20 text-[#1DAA58] font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Another Module</span>
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                    {moduleRowsToAdd.map((modDraft, index) => (
                      <div
                        key={modDraft.id}
                        className={`p-3.5 rounded-xl border space-y-2.5 relative transition-colors ${
                          theme === 'dark' ? 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700' : 'bg-neutral-50 border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
                            Module {index + 1}
                          </span>
                          {moduleRowsToAdd.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setModuleRowsToAdd(prev => prev.filter(m => m.id !== modDraft.id));
                              }}
                              className="text-neutral-400 hover:text-rose-500 transition-colors p-1 cursor-pointer"
                              title="Remove this module"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                          <div className="sm:col-span-6">
                            <label className="block text-[11px] font-semibold mb-1 text-[var(--text-muted)]">
                              Module Name <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Introduction & Basics"
                              value={modDraft.name}
                              onChange={e => {
                                const val = e.target.value;
                                setModuleRowsToAdd(prev => prev.map(m => m.id === modDraft.id ? { ...m, name: val } : m));
                              }}
                              required
                              className={`w-full p-2 rounded-lg border outline-hidden focus:border-[#1DAA58] focus:ring-1 focus:ring-[#1DAA58] transition ${
                                theme === 'dark' ? 'bg-neutral-950 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                              }`}
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-semibold mb-1 text-[var(--text-muted)]">
                              Language
                            </label>
                            <input
                              type="text"
                              placeholder="English"
                              value={modDraft.language}
                              onChange={e => {
                                const val = e.target.value;
                                setModuleRowsToAdd(prev => prev.map(m => m.id === modDraft.id ? { ...m, language: val } : m));
                              }}
                              className={`w-full p-2 rounded-lg border outline-hidden focus:border-[#1DAA58] focus:ring-1 focus:ring-[#1DAA58] transition ${
                                theme === 'dark' ? 'bg-neutral-950 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                              }`}
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-semibold mb-1 text-[var(--text-muted)]">
                              Screens
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. 24"
                              value={modDraft.screens}
                              onChange={e => {
                                const val = e.target.value;
                                setModuleRowsToAdd(prev => prev.map(m => m.id === modDraft.id ? { ...m, screens: val } : m));
                              }}
                              className={`w-full p-2 rounded-lg border outline-hidden focus:border-[#1DAA58] focus:ring-1 focus:ring-[#1DAA58] transition text-center font-mono ${
                                theme === 'dark' ? 'bg-neutral-950 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-neutral-900'
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-5 border-t border-neutral-500/10 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCreateRowModal(false)}
                  className={`px-4 py-2 font-semibold rounded-lg border cursor-pointer transition ${
                    theme === 'dark' ? 'border-neutral-700 hover:bg-neutral-800 text-neutral-300' : 'border-neutral-300 hover:bg-neutral-100 text-neutral-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingRow}
                  className="px-5 py-2 font-bold rounded-lg bg-gradient-to-r from-[#1DAA58] to-[#2484C6] hover:brightness-110 text-white shadow-md cursor-pointer flex items-center gap-1.5 active:scale-97 disabled:opacity-50 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {isCreatingRow
                      ? 'Creating...'
                      : `Create ${moduleRowsToAdd.filter(m => m.name.trim()).length || 1} Module(s)`}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* In-Page Summary Report Exporter Modal */}
      {exportReportModal.open && (
        <ReportExportModal
          theme={theme}
          mode={exportReportModal.mode}
          projectName={selectedProjectId ? projects.find(p => p.id === selectedProjectId)?.name : 'All Projects'}
          courses={courses}
          modules={modules}
          phases={phases}
          employees={employees}
          onClose={() => setExportReportModal({ open: false, mode: 'internal' })}
        />
      )}
      {/* Client Header Anchor Management Modal */}
      {headerAnchorModal && createPortal(
        <div 
          className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto animate-fadeIn"
          onClick={() => setHeaderAnchorModal(null)}
        >
          <div 
            className={`relative max-w-md w-full max-h-[90vh] my-auto rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
              theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/20 text-white' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 sm:p-5 border-b border-neutral-500/15 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#2484C6]" />
                <h3 className="text-base font-bold">Client Header Anchor Management</h3>
              </div>
              <button
                onClick={() => setHeaderAnchorModal(null)}
                className="text-neutral-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-neutral-400 mb-1">Client Phase Name</label>
                <input
                  type="text"
                  disabled
                  value={headerAnchorModal.clientPhaseName}
                  className={`w-full px-3 py-2 rounded-md font-mono ${
                    theme === 'dark' ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-100 text-neutral-700'
                  }`}
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-400 mb-1">Anchor Internal Phase</label>
                <select
                  value={headerAnchorModal.anchorInternalPhase}
                  onChange={(e) => setHeaderAnchorModal(prev => prev ? { ...prev, anchorInternalPhase: e.target.value } : null)}
                  className={`w-full px-3 py-2 rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#2484C6] ${
                    theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-neutral-950'
                  }`}
                >
                  <option value="">-- Select Anchor Internal Phase --</option>
                  {internalPhaseNames.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-neutral-400 mb-1">Anchor Point</label>
                <div className="flex gap-2">
                  {(['Start', 'End'] as const).map(pt => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => setHeaderAnchorModal(prev => prev ? { ...prev, anchorPoint: pt } : null)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-md border transition-all cursor-pointer ${
                        headerAnchorModal.anchorPoint === pt
                          ? 'bg-[#2484C6] border-[#2484C6] text-white font-bold'
                          : theme === 'dark' ? 'bg-neutral-800 border-neutral-700 text-neutral-400' : 'bg-neutral-100 border-neutral-300 text-neutral-700'
                      }`}
                    >
                      {pt} Date
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-400 mb-1">Target Working-Day Gap</label>
                <input
                  type="number"
                  value={headerAnchorModal.workingDaysGap}
                  onChange={(e) => setHeaderAnchorModal(prev => prev ? { ...prev, workingDaysGap: parseInt(e.target.value, 10) || 0 } : null)}
                  className={`w-full px-3 py-2 rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#2484C6] ${
                    theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-neutral-950'
                  }`}
                />
                <p className="text-[11px] text-neutral-400 mt-1">
                  Working days between target internal anchor date and client target date (0-lag convention).
                </p>
              </div>
            </div>

            <div className="p-4 sm:p-5 border-t border-neutral-500/15 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setHeaderAnchorModal(null)}
                className="px-4 py-2 text-xs font-semibold text-neutral-400 hover:text-white rounded-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveHeaderAnchor}
                className="px-4 py-2 bg-[#1DAA58] hover:brightness-110 text-white text-xs font-bold rounded-md shadow-md active:scale-97 cursor-pointer"
              >
                Save Anchor Configuration
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* PROJECT SETTINGS MODAL (INLINE LMS TOGGLE) */}
      {projectSettingsModalOpen && currentProject && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/75 backdrop-blur-xs overflow-y-auto"
          onClick={() => setProjectSettingsModalOpen(false)}
        >
          <div 
            className={`relative w-full max-w-md max-h-[90vh] my-auto rounded-2xl p-6 shadow-2xl border flex flex-col overflow-hidden transition-colors ${
              theme === 'dark' ? 'bg-[#18181B] border-neutral-750 text-white' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#2484C6]" />
                <h3 className="font-bold text-sm">Project Settings: {currentProject.name}</h3>
              </div>
              <button
                onClick={() => setProjectSettingsModalOpen(false)}
                className="p-1 rounded hover:bg-neutral-500/20 text-neutral-400 hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs overflow-y-auto flex-1">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--input-bg)] cursor-pointer hover:border-[#2484C6]/40 transition-colors">
                <input
                  type="checkbox"
                  id="modal-enable-lms-checkbox"
                  checked={editingProjectHasLms}
                  onChange={e => setEditingProjectHasLms(e.target.checked)}
                  className="mt-0.5 rounded cursor-pointer accent-[#2484C6] w-4 h-4"
                />
                <div className="space-y-0.5">
                  <span className="font-bold text-sm text-[var(--text-main)] block">Enable LMS Staging Track for this project</span>
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    Activates course-level milestone deliverables and displays the <span className="font-semibold text-[#2484C6]">[ Content | LMS ]</span> track toggle switch in the Project Editor header.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)] shrink-0">
              <button
                type="button"
                onClick={() => setProjectSettingsModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold text-neutral-400 hover:text-white rounded-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="save-project-settings-btn"
                disabled={isSavingProjectSettings}
                onClick={handleSaveProjectSettings}
                className="px-4 py-1.5 bg-[#2484C6] hover:brightness-110 text-white text-xs font-bold rounded-md shadow-md active:scale-97 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSavingProjectSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* CREATE LMS PHASE MODAL */}
      {showCreateLmsPhaseModal && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/75 backdrop-blur-xs overflow-y-auto"
          onClick={() => setShowCreateLmsPhaseModal(false)}
        >
          <div 
            className={`relative w-full max-w-md max-h-[90vh] my-auto rounded-2xl p-6 shadow-2xl border flex flex-col overflow-hidden transition-colors ${
              theme === 'dark' ? 'bg-[#18181B] border-neutral-750 text-white' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] shrink-0">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#2484C6]" />
                <h3 className="font-bold text-sm">Add LMS Course-Level Phase</h3>
              </div>
              <button
                onClick={() => setShowCreateLmsPhaseModal(false)}
                className="p-1 rounded hover:bg-neutral-500/20 text-neutral-400 hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLmsPhaseColumn} className="flex flex-col flex-1 min-h-0 text-xs">
              <div className="py-4 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block font-semibold mb-1 text-[var(--text-muted)]">Phase Name <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. LMS QA Staging, Client Signoff"
                    value={newLmsPhaseName}
                    onChange={e => setNewLmsPhaseName(e.target.value)}
                    required
                    autoFocus
                    className={`w-full p-2.5 rounded border outline-hidden focus:border-[#2484C6] text-xs ${
                      theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-black'
                    }`}
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-[var(--text-muted)]">Phase Type</label>
                  <select
                    value={newLmsPhaseType}
                    onChange={e => setNewLmsPhaseType(e.target.value as 'client' | 'internal')}
                    className={`w-full p-2.5 rounded border outline-hidden focus:border-[#2484C6] text-xs cursor-pointer ${
                      theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-black'
                    }`}
                  >
                    <option value="internal">Internal Development Phase (Start & End dates)</option>
                    <option value="client">Client Delivery Phase (Milestone date)</option>
                  </select>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                    This phase milestone will be created across all {activeCourses.length} course(s) in this project.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)] shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCreateLmsPhaseModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-neutral-400 hover:text-white rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingLmsPhase || !newLmsPhaseName.trim()}
                  className="px-4 py-1.5 bg-[#1DAA58] hover:brightness-110 text-white text-xs font-bold rounded-md shadow-md active:scale-97 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isCreatingLmsPhase ? 'Creating Phase...' : 'Add LMS Phase'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* EDIT COURSE METADATA MODAL */}
      {editingCourseMetadata && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/75 backdrop-blur-xs overflow-y-auto"
          onClick={() => setEditingCourseMetadata(null)}
        >
          <div 
            className={`relative w-full max-w-md max-h-[90vh] my-auto rounded-2xl p-6 shadow-2xl border flex flex-col overflow-hidden transition-colors ${
              theme === 'dark' ? 'bg-[#18181B] border-neutral-750 text-white' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#2484C6]" />
                <h3 className="font-bold text-sm">Course Metadata: {editingCourseMetadata.courseName}</h3>
              </div>
              <button
                onClick={() => setEditingCourseMetadata(null)}
                className="p-1 rounded hover:bg-neutral-500/20 text-neutral-400 hover:text-neutral-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs overflow-y-auto flex-1">
              {/* Existing Metadata */}
              {(() => {
                const course = activeCourses.find(c => c.id === editingCourseMetadata.courseId);
                const entries = Object.entries(course?.metadata || {});
                if (entries.length === 0) {
                  return <p className="text-neutral-400 italic">No custom metadata defined for this course yet.</p>;
                }
                return (
                  <div className="space-y-2">
                    <label className="block font-semibold text-[var(--text-muted)]">Current Metadata Fields</label>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {entries.map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between px-3 py-1.5 rounded bg-[var(--input-bg)] border border-[var(--border-subtle)]">
                          <span className="font-mono font-semibold text-[var(--text-main)]">{k}: <span className="font-normal text-neutral-400">{String(v)}</span></span>
                          <button
                            type="button"
                            onClick={() => handleSaveCourseMetadata(editingCourseMetadata.courseId, k, '')}
                            title="Remove key"
                            className="p-1 hover:bg-rose-500/20 rounded text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                <label className="block font-semibold text-[var(--text-muted)]">Add or Update Custom Key</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Key (e.g. LMS_ID)"
                    value={editingCourseMetadata.key}
                    onChange={e => setEditingCourseMetadata(prev => prev ? { ...prev, key: e.target.value } : null)}
                    className={`p-2 rounded border outline-hidden text-xs ${
                      theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-black'
                    }`}
                  />
                  <input
                    type="text"
                    placeholder="Value (e.g. 1042)"
                    value={editingCourseMetadata.value}
                    onChange={e => setEditingCourseMetadata(prev => prev ? { ...prev, value: e.target.value } : null)}
                    className={`p-2 rounded border outline-hidden text-xs ${
                      theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-black'
                    }`}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)] shrink-0">
              <button
                type="button"
                onClick={() => setEditingCourseMetadata(null)}
                className="px-3 py-1.5 text-xs font-semibold text-neutral-400 hover:text-white rounded-md cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={!editingCourseMetadata.key.trim()}
                onClick={() => handleSaveCourseMetadata(editingCourseMetadata.courseId, editingCourseMetadata.key, editingCourseMetadata.value)}
                className="px-4 py-1.5 bg-[#2484C6] hover:brightness-110 text-white text-xs font-bold rounded-md shadow-md active:scale-97 cursor-pointer disabled:opacity-50"
              >
                Save Field
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Manual Creation Studio Modal */}
      {isCreatePlanModalOpen && currentProject && (
        <CreatePlanModal
          theme={theme}
          project={currentProject}
          currentUser={currentUser}
          onClose={() => setIsCreatePlanModalOpen(false)}
          onSuccess={() => {
            setIsCreatePlanModalOpen(false);
            setSuccess(`Plan created successfully for ${currentProject.name}!`);
            setRefreshCounter(prev => prev + 1);
            if (onProjectsChanged) onProjectsChanged();
          }}
        />
      )}

    </div>
  );
}
