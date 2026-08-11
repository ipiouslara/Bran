import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { Settings, Save, X, RefreshCw, AlertCircle, Check, Briefcase, Layers, ArrowRight, Calendar, User, Info, AlertTriangle, Trash2, Plus, FileSpreadsheet } from 'lucide-react';
import { Project, Course, Module, Phase, Employee } from '../types';
import { getSupabase, getEmployees, getHolidays, getEffectiveHolidays, getEffectiveHolidayDates, notifyNewAssignment, notifyDateChanged, writeAuditLog as dbWriteAuditLog, getPhaseLabel, assignPhase, updatePhaseStatus, getCurrentUserId, deleteModules, createModule, dispatchCascadeNotification, getClientInternalMappings, saveClientInternalMappings, getPhaseGaps, savePhaseGaps, updateCoursePhaseSequence } from '../lib/db';
import { runBidirectionalCascade } from '../utils/cascadingEngine';
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

interface ProjectEditorProps {
  theme: 'dark' | 'light';
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
  refreshTrigger?: number;
  onProjectsChanged?: () => void;
}

export default function ProjectEditor({
  theme,
  currentUser,
  refreshTrigger = 0,
  onProjectsChanged
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

  // Single Edit View state
  const [selectedModuleCode, setSelectedModuleCode] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');

  // Export report modal state
  const [exportReportModal, setExportReportModal] = useState<{ open: boolean; mode: 'internal' | 'client' }>({
    open: false,
    mode: 'client'
  });
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

  // Create Row state
  const [showCreateRowModal, setShowCreateRowModal] = useState(false);
  const [newRowCode, setNewRowCode] = useState('');
  const [newRowName, setNewRowName] = useState('');
  const [newRowLanguage, setNewRowLanguage] = useState('English');
  const [isCreatingRow, setIsCreatingRow] = useState(false);

  const handleCreateModuleRow = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedCourseId && activeCourses.length === 0) {
      showError('Please select a project before adding a row.');
      return;
    }
    const targetCourseId = selectedCourseId || (activeCourses.length > 0 ? activeCourses[0].id : '');
    if (!targetCourseId) {
      showError('Please select a course to add a row.');
      return;
    }
    if (!newRowCode.trim() || !newRowName.trim()) {
      showError('Module code and module name are required.');
      return;
    }

    try {
      setIsCreatingRow(true);
      setError(null);

      const courseModuleIds = activeModules.map(m => m.id);
      const coursePhases = phases.filter(p => courseModuleIds.includes(p.moduleId));
      
      const internalNames = Array.from(new Set(
        coursePhases
          .filter(p => p.sourceFile === 'Internal' || !p.sourceFile || p.sourceFile !== 'Client')
          .map(p => p.phaseName)
      )) as string[];

      const clientNames = Array.from(new Set(
        coursePhases
          .filter(p => p.sourceFile === 'Client')
          .map(p => p.phaseName)
      )) as string[];

      await createModule(
        targetCourseId,
        newRowCode.trim(),
        newRowName.trim(),
        newRowLanguage.trim() || 'English',
        internalNames,
        clientNames
      );

      setShowCreateRowModal(false);
      setNewRowCode('');
      setNewRowName('');
      setNewRowLanguage('English');
      setRefreshCounter(prev => prev + 1);
      setSuccess(`Module row "${newRowName.trim()}" created successfully.`);
      if (onProjectsChanged) onProjectsChanged();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create module row.');
    } finally {
      setIsCreatingRow(false);
    }
  };

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

      const [projRes, crsRes, modRes, phaseRes, empRes, holRes, linkRes] = await Promise.all([
        sb.from('projects').select('*').order('name'),
        sb.from('courses').select('*').order('name'),
        sb.from('modules').select('*').order('code'),
        sb.from('consolidated_phases_view').select('*'),
        getEmployees(),
        getEffectiveHolidayDates(),
        sb.from('employee_project_links').select('*')
      ]);

      let rawProjects = (projRes.data || []).map((p: any) => ({
        id: String(p.id),
        name: p.name || '',
        ownerId: p.owner_id ? String(p.owner_id) : undefined,
        createdAt: p.created_at
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
        code: c.code || c.name || ''
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

      const mappedPhases: Phase[] = (phaseRes.data || []).map((p: any) => ({
        id: String(p.id),
        moduleId: String(p.module_id || p.moduleId || p.modules?.id || ''),
        phaseName: p.phase_name || p.phaseName || '',
        phaseType: p.phase_type || p.phaseType || null,
        phaseTypePhase: p.phase_type_phase || p.type_phase || p.phaseTypePhase || null,
        phaseSequence: p.phase_sequence ?? p.phaseSequence ?? null,
        clientDate: p.client_date || p.clientDate || null,
        internalStartDate: p.internal_start_date || p.internalStartDate || null,
        internalEndDate: p.internal_end_date || p.internalEndDate || null,
        sourceFileRef: p.source_file_ref || p.sourceFileRef || '',
        sourceFile: p.source_file || p.sourceFile || (p.internal_start_date || p.internal_end_date ? 'Internal' : (p.client_date ? 'Client' : 'Internal')),
        assignedTo: p.assigned_to || p.assignedTo || null,
        status: p.status || 'Pending',
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
    return courses.filter(c => String(c.projectId) === String(selectedProjectId) || c.projectId === selectedProjectId);
  }, [courses, selectedProjectId]);

  const activeCoursesMap = useMemo(() => {
    const map = new Map<string, Course>();
    courses.forEach(c => map.set(String(c.id), c));
    return map;
  }, [courses]);

  const activeModules = useMemo(() => {
    if (!selectedProjectId) return [];
    if (selectedCourseId) {
      return modules.filter(m => String(m.courseId) === String(selectedCourseId) || m.courseId === selectedCourseId);
    }
    const projectCourseIds = new Set(activeCourses.map(c => String(c.id)));
    // If activeCourses is empty or courses don't link via projectId, return all modules for safety
    if (projectCourseIds.size === 0) {
      return modules;
    }
    return modules.filter(m => projectCourseIds.has(String(m.courseId)));
  }, [modules, selectedProjectId, selectedCourseId, activeCourses]);

  const activeModuleIds = useMemo(() => activeModules.map(m => m.id), [activeModules]);

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

    await updateCoursePhaseSequence(selectedCourseId || null, currentList, table, selectedProjectId, activeModuleIds);
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
      courseModuleIds.includes(ph.moduleId) && 
      (ph.sourceFile === 'Internal' || !!ph.internalStartDate || !!ph.internalEndDate)
    );
    
    const uniquePhaseNames = Array.from(new Set(coursePhases.map(ph => ph.phaseName).filter(Boolean)));

    return uniquePhaseNames.sort((a, b) => {
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
  }, [activeModules, phases, selectedProjectId]);

  // Get chronological order of phase names under selected course for Client Phases
  const clientPhaseNames = useMemo(() => {
    if (!selectedProjectId) return [];
    const courseModuleIds = activeModules.map(m => m.id);
    const internalSet = new Set(internalPhaseNames);
    const coursePhases = phases.filter(ph => 
      courseModuleIds.includes(ph.moduleId) && 
      !internalSet.has(ph.phaseName) &&
      (ph.sourceFile === 'Client' || !!ph.clientDate)
    );
    
    const uniquePhaseNames = Array.from(new Set(coursePhases.map(ph => ph.phaseName).filter(Boolean)));

    return uniquePhaseNames.sort((a, b) => {
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
  }, [activeModules, phases, selectedProjectId]);

  // Dynamically compute unique custom metadata keys for Delivery (Client) modules
  const customClientModuleColNames = useMemo(() => {
    if (!selectedProjectId) return [];
    const keys = new Set<string>();
    activeModules.forEach(m => {
      if (m.clientCustomMetadata && Object.keys(m.clientCustomMetadata).length > 0) {
        Object.keys(m.clientCustomMetadata).forEach(k => keys.add(k));
      } else if (m.metadata) {
        Object.keys(m.metadata).forEach(k => {
          if (!k.toLowerCase().startsWith('internal:')) {
            keys.add(k.replace(/^client:/i, ''));
          }
        });
      }
    });
    return Array.from(keys).sort();
  }, [activeModules, selectedProjectId]);

  // Dynamically compute unique custom metadata keys for Development (Internal) modules
  const customInternalModuleColNames = useMemo(() => {
    if (!selectedProjectId) return [];
    const keys = new Set<string>();
    activeModules.forEach(m => {
      if (m.internalCustomMetadata && Object.keys(m.internalCustomMetadata).length > 0) {
        Object.keys(m.internalCustomMetadata).forEach(k => keys.add(k));
      } else if (m.metadata) {
        Object.keys(m.metadata).forEach(k => {
          if (!k.toLowerCase().startsWith('client:')) {
            keys.add(k.replace(/^internal:/i, ''));
          }
        });
      }
    });
    return Array.from(keys).sort();
  }, [activeModules, selectedProjectId]);

  const customModuleColNames = customClientModuleColNames;

  // Dynamically compute all unique custom metadata keys for internal phases in the selected course
  const customInternalPhaseColNames = useMemo(() => {
    if (!selectedProjectId) return [];
    const courseModuleIds = activeModules.map(m => m.id);
    const coursePhases = phases.filter(ph => 
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
    const coursePhases = phases.filter(ph => courseModuleIds.includes(ph.moduleId) && ph.sourceFile === 'Client');
    const keys = new Set<string>();
    coursePhases.forEach(p => {
      if (p.metadata) {
        Object.keys(p.metadata).forEach(k => keys.add(k));
      }
    });
    return Array.from(keys).sort();
  }, [activeModules, phases, selectedProjectId]);

  const currentProject = projects.find(p => p.id === selectedProjectId);
  const currentCourse = courses.find(c => c.id === selectedCourseId);
  const currentModule = modules.find(m => m.courseId === selectedCourseId && m.code === selectedModuleCode && m.language === selectedLanguage);
  
  // Single view phases
  const currentPhases = useMemo(() => {
    if (!currentModule) return [];
    return phases.filter(ph => ph.moduleId === currentModule.id);
  }, [phases, currentModule]);

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
  }) => {
    if (cascadeModal) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
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
          resolve(true);
        },
        onCancel: () => {
          setCascadeModal(null);
          resolve(false);
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
    currentModuleId: string,
    holidaysInput: string[]
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

    // Step 4: Get all phases for the current module fresh from DB or state
    const { data: freshModulePhases } = await supabase
      .from('consolidated_phases_view')
      .select('*')
      .eq('module_id', currentModuleId);

    const rawModulePhases = (freshModulePhases && freshModulePhases.length > 0)
      ? freshModulePhases
      : phases.filter(p => p.moduleId === currentModuleId);

    const modulePhases: Phase[] = rawModulePhases.map(p => ({
      id: p.id,
      moduleId: p.module_id || p.moduleId,
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
    const cascadeResult = runBidirectionalCascade({
      modifiedPhaseId: editedPhase.id,
      modifiedField: engineField,
      newDate: newDateValue,
      allPhases: modulePhases,
      phaseGaps: activeGaps,
      clientMappings: activeMappings,
      holidays: activeHolidayDates
    });

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
    const confirmed = await showCascadeModal({
      editedPhaseName: editedPhase.phaseName,
      delta,
      affectedPhases: affectedPhasesForUi,
      isLargeShift: Math.abs(delta) > 60
    });

    if (!confirmed) return false;

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
            await updatePhaseStatus(ph.id, ph.status || 'Pending');
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
        orig.moduleId,
        holidays
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
      const internalEdits: { phaseId: string; field: 'internalStartDate' | 'internalEndDate'; oldDate: string; newDate: string; moduleId: string }[] = [];

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
            moduleId: orig.moduleId
          });
        } else if (endChanged) {
          internalEdits.push({
            phaseId,
            field: 'internalEndDate',
            oldDate: orig.internalEndDate || '',
            newDate: edits.internalEndDate || '',
            moduleId: orig.moduleId
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
            orig.moduleId,
            holidays
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
        const success = await handleDateEdit(
          ie.phaseId,
          ie.field,
          ie.newDate,
          ie.moduleId,
          holidays
        );
        if (success) {
          setPendingTableEdits({});
          if (onProjectsChanged) onProjectsChanged();
        }
      } else {
        setPendingTableEdits({});
        setPhases([]);
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

          {/* Inline Hierarchy Dropdowns */}
          <div className="flex items-center gap-2">
            <select
              value={selectedProjectId}
              onChange={e => handleProjectSelect(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:ring-1 focus:ring-[#1DAA58] cursor-pointer"
            >
              <option value="">-- Choose Project --</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

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
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setExportReportModal({ open: true, mode: activeTab })}
            className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title="Export Report to Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            <span>Export</span>
          </button>

          <button
            onClick={() => setShowCreateRowModal(true)}
            className="px-3.5 py-1.5 bg-gradient-to-r from-[#1DAA58] to-[#2484C6] text-white font-medium text-xs rounded-lg shadow-md hover:opacity-90 transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Row</span>
          </button>

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
          {/* Slider Layout View Container */}
          <div className="relative overflow-hidden w-full">
            <div 
              className="flex transition-transform duration-500 ease-in-out items-start"
              style={{ transform: `translateX(-${activeTab === 'client' ? 0 : 100}%)` }}
            >
              
              {/* VIEW 1: DELIVERY (CLIENT) TABLE EDITOR */}
              <div className="w-full shrink-0 px-1">
                <div className="space-y-4">
                  {(selectedModuleIds.size > 0 || Object.keys(pendingTableEdits).length > 0) && (
                    <div className="flex items-center justify-end gap-2 pb-2 border-b border-neutral-500/10">
                      {selectedModuleIds.size > 0 && (
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

                  <div className="overflow-x-auto w-full border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-card)] shadow-xl transition-colors">
                    <table className="w-full border-collapse text-xs text-left min-w-[900px]">
                      <thead>
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
                            <th key={`mod-col-client-${colName}`} className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-muted)] bg-[var(--input-bg)]">{colName}</th>
                          ))}
                          {clientPhaseNames.map(name => (
                            <React.Fragment key={name}>
                              <th
                                draggable
                                onDragStart={e => handleDragStartPhase(e, name)}
                                onDragOver={e => e.preventDefault()}
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
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {groupedRows.map(group => {
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
                                  <td key={`mod-val-client-${mod.id}-${colName}`} className="py-3 px-4 border-r border-[var(--border-subtle)] font-mono text-neutral-400 align-middle">
                                    {mod.clientCustomMetadata?.[colName] !== undefined
                                      ? String(mod.clientCustomMetadata[colName])
                                      : (mod.metadata?.[colName] !== undefined
                                          ? String(mod.metadata[colName])
                                          : (mod.metadata?.[`client:${colName}`] !== undefined ? String(mod.metadata[`client:${colName}`]) : '-'))}
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
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* VIEW 2: DEVELOPMENT (INTERNAL) TABLE EDITOR */}
              <div className="w-full shrink-0 px-1">
                <div className="space-y-4">
                  {(selectedModuleIds.size > 0 || Object.keys(pendingTableEdits).length > 0) && (
                    <div className="flex items-center justify-end gap-2 pb-2 border-b border-[var(--border-subtle)]">
                      {selectedModuleIds.size > 0 && (
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

                  <div className="overflow-x-auto w-full border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-card)] shadow-xl transition-colors">
                    <table className="w-full border-collapse text-xs text-left min-w-[900px]">
                      <thead>
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
                            <th key={`mod-col-internal-${colName}`} className="py-3 px-4 font-semibold border-r border-[var(--border-subtle)] text-[var(--text-muted)] bg-[var(--input-bg)]">{colName}</th>
                          ))}
                          {internalPhaseNames.map(name => (
                            <React.Fragment key={name}>
                              <th
                                draggable
                                onDragStart={e => handleDragStartPhase(e, name)}
                                onDragOver={e => e.preventDefault()}
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
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {groupedRows.map(group => {
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
                                  <td key={`mod-val-internal-${mod.id}-${colName}`} className="py-3 px-4 border-r border-[var(--border-subtle)] font-mono text-neutral-400 align-middle">
                                    {mod.internalCustomMetadata?.[colName] !== undefined
                                      ? String(mod.internalCustomMetadata[colName])
                                      : (mod.metadata?.[colName] !== undefined
                                          ? String(mod.metadata[colName])
                                          : (mod.metadata?.[`internal:${colName}`] !== undefined ? String(mod.metadata[`internal:${colName}`]) : '-'))}
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
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            </div>
          </div>

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
      {orphanWarning && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
          onClick={() => setOrphanWarning(null)}
        >
          <div 
            className={`max-w-md w-full p-6 rounded-lg border text-xs shadow-2xl ${
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
        </div>
      )}

      {/* Cascade Confirmation Modal */}
      {cascadeModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in"
          onClick={() => {
            if (cascadeModal.onCancel) {
              cascadeModal.onCancel();
            } else {
              setCascadeModal(null);
            }
          }}
        >
          <div 
            className={`max-w-lg w-full p-6 rounded-xl border text-xs shadow-2xl transition-all ${
              theme === 'dark' ? 'bg-[#181A1E] border-neutral-700/60 text-white' : 'bg-white border-neutral-200 text-neutral-900'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between pb-3 mb-3 border-b ${
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
            
            <p className={`mb-3 leading-relaxed text-xs ${
              theme === 'dark' ? 'text-neutral-300' : 'text-neutral-700'
            }`}>
              Shifting <strong className={theme === 'dark' ? 'text-white font-semibold' : 'text-neutral-900 font-bold'}>"{cascadeModal.editedPhaseName}"</strong> by {Math.abs(cascadeModal.delta)} working days will also affect {cascadeModal.affectedPhases.length} phase{cascadeModal.affectedPhases.length !== 1 ? 's' : ''}:
            </p>

            <div className={`mb-4 max-h-56 overflow-y-auto space-y-2 p-3 rounded-lg border font-mono text-[11px] ${
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
              <p className={`text-[11px] mb-3 font-semibold flex items-center gap-1.5 ${
                theme === 'dark' ? 'text-amber-400/90' : 'text-amber-600'
              }`}>
                <Info className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                <span>{cascadeModal.completedSkippedCount} Completed phase(s) will not be shifted.</span>
              </p>
            )}

            {/* Delta > 30 Days Warning */}
            {cascadeModal.largeShiftWarning && (
              <div className={`mb-3 p-2.5 rounded-md border text-[10px] font-medium ${
                theme === 'dark' ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}>
                ⚠️ {cascadeModal.largeShiftWarning}
              </div>
            )}

            {/* Client Deadline Exceeded Warnings */}
            {cascadeModal.clientWarnings.length > 0 && (
              <div className={`mb-4 p-2.5 rounded-md border text-[10px] font-medium space-y-1 ${
                theme === 'dark' ? 'bg-red-500/10 border-red-500/25 text-red-400' : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {cascadeModal.clientWarnings.map((warn, idx) => (
                  <div key={idx}>⚠ {warn}</div>
                ))}
              </div>
            )}

            <div className={`flex justify-end gap-2.5 pt-3 border-t ${
              theme === 'dark' ? 'border-neutral-700/40' : 'border-neutral-200'
            }`}>
              <button
                onClick={() => {
                  if (cascadeModal.onCancel) {
                    cascadeModal.onCancel();
                  } else {
                    setCascadeModal(null);
                  }
                }}
                className={`px-4 py-2 border rounded-md font-semibold text-xs transition-colors cursor-pointer ${
                  theme === 'dark' ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-800' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={cascadeModal.onConfirm}
                className="px-4 py-2 bg-gradient-to-r from-[#1DAA58] to-[#2484C6] hover:brightness-110 text-white rounded-md font-bold text-xs transition-all shadow-md active:scale-97 cursor-pointer flex items-center gap-1.5"
              >
                <span>Confirm Shift</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Row Confirmation Modal */}
      {deleteModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-md animate-in fade-in duration-150 flex items-center justify-center p-4">
          <div className={`max-w-md w-full p-6 rounded-xl border shadow-2xl space-y-4 ${
            theme === 'dark' ? 'bg-[#1B1D21] border-rose-500/30 text-white' : 'bg-white border-rose-300 text-neutral-900'
          }`}>
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

      {/* Create Row Modal */}
      {showCreateRowModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`max-w-md w-full p-6 rounded-xl border shadow-2xl space-y-4 ${
            theme === 'dark' ? 'bg-[#1B1D21] border-neutral-750 text-white' : 'bg-white border-neutral-200 text-neutral-900'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-neutral-500/10">
              <div className="flex items-center gap-2 text-[#2484C6]">
                <Plus className="w-5 h-5" />
                <h3 className="text-base font-bold">Add New Row (Module)</h3>
              </div>
              <button
                onClick={() => setShowCreateRowModal(false)}
                className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateModuleRow} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-neutral-400">Target Course</label>
                <div className={`p-2.5 rounded border font-mono ${
                  theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-neutral-300' : 'bg-neutral-100 border-neutral-250 text-neutral-700'
                }`}>
                  {selectedCourse?.code ? `${selectedCourse.code} - ${selectedCourse.name}` : 'No course selected'}
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-neutral-300">Module Code <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. M6, M7, M_INTRO"
                  value={newRowCode}
                  onChange={e => setNewRowCode(e.target.value)}
                  required
                  className={`w-full p-2.5 rounded border font-mono outline-hidden focus:border-[#2484C6] ${
                    theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-black'
                  }`}
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-neutral-300">Module Name <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Scrap Analysis and Processing"
                  value={newRowName}
                  onChange={e => setNewRowName(e.target.value)}
                  required
                  className={`w-full p-2.5 rounded border outline-hidden focus:border-[#2484C6] ${
                    theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-black'
                  }`}
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-neutral-300">Language</label>
                <input
                  type="text"
                  placeholder="e.g. English, German, French, Spanish"
                  value={newRowLanguage}
                  onChange={e => setNewRowLanguage(e.target.value)}
                  className={`w-full p-2.5 rounded border outline-hidden focus:border-[#2484C6] ${
                    theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-neutral-300 text-black'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-neutral-500/10">
                <button
                  type="button"
                  onClick={() => setShowCreateRowModal(false)}
                  className={`px-4 py-2 font-semibold rounded border cursor-pointer ${
                    theme === 'dark' ? 'border-neutral-700 hover:bg-neutral-800 text-neutral-300' : 'border-neutral-300 hover:bg-neutral-100 text-neutral-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingRow}
                  className="px-5 py-2 font-bold rounded bg-[#2484C6] hover:brightness-110 text-white shadow-md cursor-pointer flex items-center gap-1.5 active:scale-97 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isCreatingRow ? 'Creating Row...' : 'Create Row in Database'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
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
      {headerAnchorModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className={`max-w-md w-full p-6 rounded-xl border shadow-2xl space-y-4 ${
            theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/20 text-white' : 'bg-white border-neutral-200 text-neutral-900'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-neutral-500/15">
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

            <div className="space-y-4 text-xs">
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

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-500/15">
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
        </div>
      )}

    </div>
  );
}
