/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Fragment, useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import ConsolidatedViewSkeleton from './skeletons/ConsolidatedViewSkeleton';

type PhaseStatus = 'Pending' | 'Overdue' | 'In Review' | 'Completed' | 'Rejected' | 'Done' | 'Approved' | 'In Progress';

const normalizePhaseStatus = (status?: string | null): PhaseStatus => {
  if (!status) return 'Pending';
  if (status === 'Completed' || status === 'Done' || status === 'Approved') return 'Completed';
  if (status === 'In Progress' || status === 'WIP') return 'In Progress';
  if (status === 'In Review' || status === 'QA') return 'In Review';
  if (status === 'Overdue') return 'Overdue';
  if (status === 'Rejected') return 'Rejected';
  return 'Pending';
};

const StatusDropdown = ({ value, onChange, theme, options }: { value: string; onChange: (val: string) => void; theme: 'dark' | 'light'; options?: string[] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, []);

  const statuses = options || ['Pending', 'In Progress', 'In Review', 'Completed'];
  const statusColors: Record<string, string> = {
    Approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    Completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'In Progress': 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    'In Review': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    Pending: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    Overdue: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
  };

  const categoryColors: Record<string, string> = {
    Approved: '#1DAA58',
    Completed: '#1DAA58',
    'In Progress': '#008DA5',
    'In Review': '#F59E0B',
    Pending: '#6B7280',
    Overdue: '#F43F5E'
  };

  const normalizedValue =
    value === 'Completed' || value === 'Done' || value === 'Approved'
      ? 'Completed'
      : value === 'In Progress' || value === 'WIP'
      ? 'In Progress'
      : value === 'In Review' || value === 'QA'
      ? 'In Review'
      : (value && statuses.includes(value) ? value : 'Pending');
  const filtered = statuses.filter(st => st.toLowerCase().includes(search.toLowerCase()));
  const colorClass = statusColors[normalizedValue] || 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20';

  return (
    <div className="relative inline-block w-full" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-2 py-1 text-left rounded border flex items-center justify-between font-bold text-[10px] uppercase cursor-pointer ${colorClass}`}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: categoryColors[normalizedValue] || '#6B7280' }} />
          <span>{normalizedValue}</span>
        </div>
        <span className="text-[8px] opacity-70">▼</span>
      </button>
      
      {isOpen && (
        <div className={`absolute z-50 mt-1 w-36 rounded-md shadow-lg border p-1.5 space-y-1.5 ${
          theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15 text-white' : 'bg-white border-neutral-250 text-neutral-900'
        }`}>
          <input
            type="text"
            placeholder="Search status..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`w-full px-2 py-1 text-[10px] rounded focus:ring-1 focus:ring-[#2484C6] focus:outline-hidden ${
              theme === 'dark' ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-neutral-50 border-neutral-300 text-neutral-805'
            }`}
            autoFocus
          />
          <div className="max-h-32 overflow-y-auto space-y-1">
            {filtered.length === 0 ? (
              <div className="text-[10px] text-neutral-500 italic p-1 font-normal">No match</div>
            ) : (
              filtered.map(st => (
                <button
                  key={st}
                  onClick={() => {
                    onChange(st);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1.5 ${
                    theme === 'dark' ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                  } ${statusColors[st] || ''}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: categoryColors[st] || '#6B7280' }} />
                  <span>{st}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const AssigneeDropdown = ({
  value,
  onChange,
  employees,
  disabled,
  theme
}: {
  value: string;
  onChange: (val: string | null) => void;
  employees: Employee[];
  disabled?: boolean;
  theme: 'dark' | 'light';
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, []);

  const currentEmp = employees.find(e => e.id === value);
  const filtered = employees.filter(emp =>
    emp.name.toLowerCase().includes(search.toLowerCase()) ||
    emp.designation.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative inline-block w-full" ref={dropdownRef}>
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-2 py-1 text-left rounded border flex items-center justify-between text-[10px] font-medium transition-colors ${
          theme === 'dark'
            ? 'bg-[#1B1D21] text-white border-neutral-700 disabled:opacity-50'
            : 'bg-white text-neutral-900 border-neutral-350 disabled:opacity-50'
        } cursor-pointer`}
      >
        <span className="truncate max-w-[120px]">{currentEmp ? `${currentEmp.name} (${currentEmp.designation})` : '-- Unassigned --'}</span>
        <span className="text-[8px] opacity-70">▼</span>
      </button>

      {isOpen && (
        <div className={`absolute right-0 z-50 mt-1 w-48 rounded-md shadow-lg border p-1.5 space-y-1.5 ${
          theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15 text-white' : 'bg-white border-neutral-250 text-neutral-900'
        }`}>
          <input
            type="text"
            placeholder="Search assignee..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`w-full px-2 py-1 text-[10px] rounded focus:ring-1 focus:ring-[#2484C6] focus:outline-hidden ${
              theme === 'dark' ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-neutral-50 border-neutral-300 text-neutral-805'
            }`}
            autoFocus
          />
          <div className="max-h-40 overflow-y-auto space-y-1">
            <button
              onClick={() => {
                onChange(null);
                setIsOpen(false);
                setSearch('');
              }}
              className={`w-full text-left px-2 py-1 rounded text-[10px] text-neutral-500 italic transition-colors ${
                theme === 'dark' ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
              }`}
            >
              -- Unassigned --
            </button>
            {filtered.length === 0 ? (
              <div className="text-[10px] text-neutral-500 italic p-1">No match</div>
            ) : (
              filtered.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => {
                    onChange(emp.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left px-2 py-1 rounded text-[10px] transition-colors truncate ${
                    theme === 'dark' ? 'hover:bg-neutral-800 text-white' : 'hover:bg-neutral-100 text-neutral-900'
                  }`}
                >
                  {emp.name} ({emp.designation})
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
import { 
  getDBConfig, 
  fetchAllDashboardData, 
  hasSupabaseCreds,
  getEmployees,
  assignPhase,
  updatePhaseStatus,
  updateClientPhaseStatus,
  runAutoOverdueCheck,
  getAllProjectEmployeeLinks,
  notifyNewAssignment,
  getSupabase
} from '../lib/db';
import { getDashboardCache, setDashboardCache, updatePhaseInCache } from '../lib/dataCache';
import { Project, Course, Module, Phase, Employee } from '../types';
import { 
  Calendar, 
  Layers, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  ChevronLeft,
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  CalendarDays, 
  Filter,
  RefreshCw,
  SlidersHorizontal,
  Info,
  Bookmark,
  CalendarRange,
  Lock,
  AlertCircle,
  User,
  Check,
  FileText,
  UserCheck
} from 'lucide-react';
import HorizonRadialWidget from './HorizonRadialWidget';
import VelocityTrendChart from './VelocityTrendChart';

interface ConsolidatedViewProps {
  theme: 'dark' | 'light';
  mode: 'client' | 'internal';
  refreshCounter?: number;
  readOnly?: boolean;
  role?: string;
  searchQuery?: string;
  onSearchQueryChange?: (val: string) => void;
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
  focusedModuleId?: string | null;
}

// Relative date classifier based on vanilla Javascript
const getUrgencyCategory = (dateStr: string | null, today: Date): 'overdue' | 'today' | 'this-week' | 'next-week' | 'future' | 'unassigned' => {
  if (!dateStr) return 'unassigned';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'unassigned';

  // Normalize both to midnight for uniform calendar date comparisons
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffTime = dateMidnight.getTime() - todayMidnight.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'overdue';
  } else if (diffDays === 0) {
    return 'today';
  } else if (diffDays > 0 && diffDays <= 7) {
    return 'this-week';
  } else if (diffDays > 7 && diffDays <= 14) {
    return 'next-week';
  } else {
    return 'future';
  }
};

const getPhaseCategory = (_name: string): string | null => {
  return null;
};

const getAvatarColorClass = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'bg-blue-600',
    'bg-emerald-600',
    'bg-teal-600',
    'bg-violet-600',
    'bg-amber-600',
    'bg-pink-600',
    'bg-indigo-600'
  ];
  return colors[Math.abs(hash) % colors.length];
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function ConsolidatedView({
  theme,
  mode,
  refreshCounter = 0,
  readOnly = false,
  role = 'Project Manager',
  currentUser = null,
  focusedModuleId = null,
  ...props
}: ConsolidatedViewProps) {
  const cached = getDashboardCache();
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    projects: Project[];
    courses: Course[];
    modules: Module[];
    phases: Phase[];
  }>(cached ? {
    projects: cached.projects,
    courses: cached.courses,
    modules: cached.modules,
    phases: cached.phases
  } : { projects: [], courses: [], modules: [], phases: [] });

  // Employee Directory for Assignation dropdowns
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projectLinks, setProjectLinks] = useState<{ employee_id: string; project_id: string }[]>(
    cached ? cached.projectLinks : []
  );
  const [rejectingPhaseId, setRejectingPhaseId] = useState<string | null>(null);
  const [rejectionNoteInput, setRejectionNoteInput] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);

  // Filter States
  const [activePreset, setActivePreset] = useState<'all' | 'overdue' | 'today' | 'this-week' | 'next-week' | 'future' | 'unassigned'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // Dropdown filter states (Type / Phase / Language)
  const [filterType, setFilterType] = useState('');
  const [filterPhase, setFilterPhase] = useState('');
  const [filterLanguage, setFilterLanguage] = useState('');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  const activeSearchQuery = props.searchQuery !== undefined ? props.searchQuery : searchQuery;
  const activeSetSearchQuery = props.onSearchQueryChange !== undefined ? props.onSearchQueryChange : setSearchQuery;

  // Pagination and card expansion states
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  
  // Table Sorting States (for PM only table view)
  const [sortField, setSortField] = useState<string>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Scan all unique custom metadata keys from modules and phases based on active mode
  const customMetadataKeys = useMemo(() => {
    const keys = new Set<string>();
    
    const addKeyIfAllowed = (metaObj: any, sourceRole: 'client' | 'internal') => {
      if (!metaObj) return;
      Object.keys(metaObj).forEach(k => {
        if (k.startsWith('client:')) {
          if (mode === 'client') keys.add(k);
        } else if (k.startsWith('internal:')) {
          if (mode === 'internal') keys.add(k);
        } else {
          // Fallback for un-prefixed keys
          if (sourceRole === mode) {
            keys.add(k);
          }
        }
      });
    };

    data.modules.forEach(m => {
      if (m.metadata) {
        addKeyIfAllowed(m.metadata, mode);
      }
    });

    data.phases.forEach(p => {
      if (p.metadata) {
        const role = (p.sourceFile === 'Client') ? 'client' : 'internal';
        addKeyIfAllowed(p.metadata, role);
      }
    });

    return Array.from(keys);
  }, [data.modules, data.phases, mode]);

  // Reset pagination on filter adjustments
  useEffect(() => {
    setCurrentPage(1);
  }, [activePreset, customStartDate, customEndDate, activeSearchQuery, filterType, filterPhase, filterLanguage, sortField, sortAsc]);

  // Auto-expand card if focusedModuleId changes
  useEffect(() => {
    if (focusedModuleId) {
      setExpandedCardIds(prev => ({ ...prev, [focusedModuleId]: true }));
    }
  }, [focusedModuleId]);

  // Dynamic system time to evaluate relative dates
  const [todayDate] = useState(() => new Date());

  // Load Employees list for Assignments
  useEffect(() => {
    const loadEmps = async () => {
      try {
        const emps = await getEmployees();
        setEmployees(emps);
      } catch (err) {
        console.error('Failed to load employee list inside ConsolidatedView:', err);
      }
    };
    loadEmps();
  }, [refreshCounter]);

  const loadData = async (isSilent: boolean = false) => {
    try {
      if (!isSilent && !getDashboardCache()) {
        setLoading(true);
      }
      setError(null);
      const res = await fetchAllDashboardData(currentUser);
      let links: { employee_id: string; project_id: string }[] = [];
      try {
        links = await getAllProjectEmployeeLinks();
      } catch (err) {
        console.error("Failed to load project employee links:", err);
      }
      
      // Auto-run overdue check on loaded phases
      const overdueChanged = await runAutoOverdueCheck(res.phases);
      let finalPhases = res.phases;
      if (overdueChanged) {
        const reloaded = await fetchAllDashboardData(currentUser);
        finalPhases = reloaded.phases;
      }

      const newData = {
        projects: res.projects,
        courses: res.courses,
        modules: res.modules,
        phases: finalPhases
      };

      setData(newData);
      setProjectLinks(links);
      setDashboardCache({
        ...newData,
        projectLinks: links
      });
      
      setExpandedCardIds(prev => {
        if (Object.keys(prev).length > 0) return prev;
        const defaultExpanded: Record<string, boolean> = {};
        res.modules.forEach(m => {
          defaultExpanded[m.id] = false;
        });
        return defaultExpanded;
      });
    } catch (err: any) {
      console.error(err);
      if (!getDashboardCache()) {
        setError(err.message || 'Failed to fetch consolidated dashboard timelines from storage.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Perform silent background load if cache exists to avoid blocking full screen
    const hasCache = !!getDashboardCache();
    loadData(hasCache);
  }, [refreshCounter, mode]);

  // Clean custom states when custom picker is used or presets are toggled
  const handlePresetSelect = (preset: typeof activePreset) => {
    setActivePreset(preset);
    setCustomStartDate('');
    setCustomEndDate('');
  };

  const handleCustomDateChange = (start: string, end: string) => {
    setCustomStartDate(start);
    setCustomEndDate(end);
  };

  // Helper selectors to extract phase properties
  const getRelevantPhaseDate = (ph: Phase): string | null => {
    return (mode === 'client' ? ph.clientDate : ph.internalEndDate) ?? null;
  };

  const doesPhaseMatchActiveFilters = (ph: Phase): boolean => {
    const dateStr = getRelevantPhaseDate(ph);

    if (customStartDate || customEndDate) {
      if (!dateStr) return false;
      const timestamp = new Date(dateStr).getTime();
      if (customStartDate && timestamp < new Date(customStartDate).getTime()) return false;
      if (customEndDate && timestamp > new Date(customEndDate).getTime()) return false;
    }

    if (activePreset === 'all') return true;
    if (activePreset === 'unassigned') return !dateStr;
    if (!dateStr) return false;
    return getUrgencyCategory(dateStr, todayDate) === activePreset;
  };

  // Flatten projects/courses/modules for flat-list card layout
  const allModulesFlattened = useMemo(() => {
    const list: {
      project: Project;
      course: Course;
      module: Module;
      phases: Phase[];
    }[] = [];

    data.projects.forEach(project => {
      const projCourses = data.courses.filter(c => c.projectId === project.id);
      projCourses.forEach(course => {
        const courseModules = data.modules.filter(m => m.courseId === course.id);
        courseModules.forEach(mod => {
          const mPhases = data.phases.filter(p => p.moduleId === mod.id && (
            mode === 'client'
              ? (p.sourceFile === 'Client' || !p.sourceFile)
              : (p.sourceFile === 'Internal' || !p.sourceFile)
          ));
          
          list.push({
            project,
            course,
            module: mod,
            phases: mPhases
          });
        });
      });
    });
    return list;
  }, [data, mode]);

  // Build filtered lists
  const filteredModules = useMemo(() => {
    if (focusedModuleId) {
      return allModulesFlattened.filter(({ module: mod }) => mod.id === focusedModuleId);
    }
    return allModulesFlattened.filter(({ project, course, module: mod, phases: mPhases }) => {
      // 1. Search filter (Course Code, Name, Module Code, Name, Language)
      const matchesSearch = !activeSearchQuery.trim() || [
        project.name,
        course.code,
        course.name,
        mod.code,
        mod.name,
        mod.language
      ].some(val => val?.toLowerCase().includes(activeSearchQuery.toLowerCase().trim()));

      if (!matchesSearch) return false;

      // 2. Language dropdown filter
      if (filterLanguage) {
        if (!mod.language || mod.language.toLowerCase() !== filterLanguage.toLowerCase()) return false;
      }

      // 3. Phase name dropdown filter
      if (filterPhase) {
        if (!mPhases.some(ph => ph.phaseName?.toLowerCase() === filterPhase.toLowerCase())) return false;
      }

      // 4. Type dropdown filter
      if (filterType) {
        if (!mPhases.some(ph => (ph as any).phaseType?.toLowerCase() === filterType.toLowerCase())) return false;
      }

      // 5. Date / Urgency Preset Filter
      if (customStartDate || customEndDate) {
        if (mPhases.length === 0) return false;
        return mPhases.some(ph => {
          const targetDateStr = getRelevantPhaseDate(ph);
          if (!targetDateStr) return false;
          const targetTime = new Date(targetDateStr).getTime();
          if (customStartDate && targetTime < new Date(customStartDate).getTime()) return false;
          if (customEndDate && targetTime > new Date(customEndDate).getTime()) return false;
          return true;
        });
      }

      if (activePreset === 'all') return true;

      if (activePreset === 'unassigned') {
        if (mPhases.length === 0) return true;
        return mPhases.some(ph => !getRelevantPhaseDate(ph));
      }

      if (mPhases.length === 0) return false;
      return mPhases.some(ph => {
        const targetDateStr = getRelevantPhaseDate(ph);
        const urgency = getUrgencyCategory(targetDateStr, todayDate);
        return urgency === activePreset;
      });
    });
  }, [allModulesFlattened, activeSearchQuery, activePreset, customStartDate, customEndDate, todayDate, filterType, filterPhase, filterLanguage]);

  // Derive distinct values for dropdown filters from all loaded data
  const distinctTypes = useMemo(() => {
    const set = new Set<string>();
    allModulesFlattened.forEach(({ phases }) =>
      phases.forEach(ph => { if ((ph as any).phaseType) set.add((ph as any).phaseType); })
    );
    return Array.from(set).sort();
  }, [allModulesFlattened]);

  const distinctPhaseNames = useMemo(() => {
    const set = new Set<string>();
    allModulesFlattened.forEach(({ phases }) =>
      phases.forEach(ph => { if (ph.phaseName) set.add(ph.phaseName); })
    );
    return Array.from(set).sort();
  }, [allModulesFlattened]);

  const distinctLanguages = useMemo(() => {
    const set = new Set<string>();
    allModulesFlattened.forEach(({ module: mod }) => {
      if (mod.language) set.add(mod.language);
    });
    return Array.from(set).sort();
  }, [allModulesFlattened]);

  // Calculate high-level statistics based on ALL raw database records loaded
  const stats = (() => {
    let overdue = 0;
    let today = 0;
    let thisWeek = 0;
    let nextWeek = 0;
    let futureIndex = 0;
    let totalPhases = 0;

    const relevantPhases = data.phases.filter(p => (
      mode === 'client'
        ? (p.sourceFile === 'Client' || !p.sourceFile)
        : (p.sourceFile === 'Internal' || !p.sourceFile)
    ));

    relevantPhases.forEach(ph => {
      const dateStr = getRelevantPhaseDate(ph);
      if (dateStr) {
        totalPhases++;
        const category = getUrgencyCategory(dateStr, todayDate);
        if (category === 'overdue') overdue++;
        else if (category === 'today') today++;
        else if (category === 'this-week') thisWeek++;
        else if (category === 'next-week') nextWeek++;
        else if (category === 'future') futureIndex++;
      }
    });

    return { overdue, today, thisWeek, nextWeek, futureIndex, totalPhases };
  })();

  // Render proper badge for urgency cues
  const getUrgencyBadge = (dateStr: string | null) => {
    if (!dateStr) return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] bg-neutral-500/10 text-neutral-400 border border-neutral-500/20">
        Unassigned
      </span>
    );
    
    const category = getUrgencyCategory(dateStr, todayDate);
    
    if (category === 'overdue') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-455 border border-rose-500/20 animate-pulse">
          <AlertTriangle className="w-3 h-3 text-rose-455" />
          Overdue
        </span>
      );
    } else if (category === 'today') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/20">
          <Clock className="w-3 h-3" />
          Today
        </span>
      );
    } else if (category === 'this-week') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-[#2484C6]/15 text-[#2484C6] border border-[#2484C6]/20">
          This Week
        </span>
      );
    } else if (category === 'next-week') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
          Next Week
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-medium bg-[#B1B7C3]/10 text-[#B1B7C3]/90 border border-[#B1B7C3]/15">
          Future
        </span>
      );
    }
  };

  // Get date text visual intensity
  const getDateColorClass = (dateStr: string | null) => {
    if (!dateStr) return 'text-neutral-500 italic';
    const category = getUrgencyCategory(dateStr, todayDate);
    if (category === 'overdue') return 'text-rose-400 font-bold';
    if (category === 'today') return 'text-amber-500 font-bold';
    if (category === 'this-week') return 'text-[#2484C6] font-medium';
    return theme === 'dark' ? 'text-neutral-300' : 'text-neutral-800';
  };

  const toggleCardExpanded = (modId: string) => {
    setExpandedCardIds(prev => ({ ...prev, [modId]: !prev[modId] }));
  };

  const relevantPhases = useMemo(() => {
    return data.phases.filter(p => (
      mode === 'client'
        ? (p.sourceFile === 'Client' || !p.sourceFile)
        : (p.sourceFile === 'Internal' || !p.sourceFile)
    ));
  }, [data.phases, mode]);

  const filteredRelevantPhases = useMemo(() => {
    return filteredModules.flatMap(({ phases }) => phases.filter(ph => {
      if (filterType && ph.phaseType?.toLowerCase() !== filterType.toLowerCase()) return false;
      if (filterPhase && ph.phaseName?.toLowerCase() !== filterPhase.toLowerCase()) return false;
      return doesPhaseMatchActiveFilters(ph);
    }));
  }, [filteredModules, filterType, filterPhase, customStartDate, customEndDate, activePreset, todayDate]);

  // Calculate development phase counts for donut chart
  const phaseCategoryCounts = useMemo(() => {
    const counts = { Pending: 0, Completed: 0 };
    filteredRelevantPhases.forEach(ph => {
      const status = normalizePhaseStatus(ph.status);
      const category = status === 'Completed' ? 'Completed' : 'Pending';
      counts[category]++;
    });
    return counts;
  }, [filteredRelevantPhases]);

  const totalCategorized = useMemo(() => {
    return (Object.values(phaseCategoryCounts) as number[]).reduce((a, b) => a + b, 0);
  }, [phaseCategoryCounts]);

  const donutSegments = useMemo(() => {
    const categoryColors: Record<string, string> = {
      Pending: '#6B7280',
      Completed: '#1DAA58'
    };
    const segments: {
      category: string;
      count: number;
      percent: number;
      color: string;
      strokeDasharray: string;
      strokeDashoffset: number;
    }[] = [];
    let accumulatedPercent = 0;
    const categories = ['Pending', 'Completed'];
    categories.forEach(cat => {
      const count = phaseCategoryCounts[cat as keyof typeof phaseCategoryCounts] || 0;
      const percent = totalCategorized > 0 ? (count / totalCategorized) * 100 : 0;
      segments.push({
        category: cat,
        count,
        percent,
        color: categoryColors[cat] || '#6B7280',
        strokeDasharray: `${percent} ${100 - percent}`,
        strokeDashoffset: -accumulatedPercent
      });
      accumulatedPercent += percent;
    });
    return segments;
  }, [phaseCategoryCounts, totalCategorized]);

  // Calculate status metrics for flat colored cards
  const statusCounts = useMemo(() => {
    const counts = { Pending: 0, Overdue: 0, InReview: 0, Completed: 0, InProgress: 0 };
    filteredRelevantPhases.forEach(ph => {
      const status = normalizePhaseStatus(ph.status);
      if (status === 'Pending') counts.Pending++;
      else if (status === 'Overdue') counts.Overdue++;
      else if (status === 'In Review') counts.InReview++;
      else if (status === 'Completed') counts.Completed++;
      else if (status === 'In Progress') counts.InProgress++;
    });
    return counts;
  }, [filteredRelevantPhases]);

  // Pagination bounds
  const itemsPerPage = 9;

  // PM sortable table view data selectors
  const tableRows = useMemo(() => {
    const rows: {
      project: Project;
      course: Course;
      module: Module;
      phase: Phase;
      date: string | null;
      urgency: string;
      uniqueKey: string;
    }[] = [];

    filteredModules.forEach(({ project, course, module: mod, phases: mPhases }) => {
      mPhases.forEach(ph => {
        if (!doesPhaseMatchActiveFilters(ph)) return;
        if (filterType && ph.phaseType?.toLowerCase() !== filterType.toLowerCase()) return;
        if (filterPhase && ph.phaseName?.toLowerCase() !== filterPhase.toLowerCase()) return;

        const date = getRelevantPhaseDate(ph);
        const urgency = getUrgencyCategory(date, todayDate);

        rows.push({
          project,
          course,
          module: mod,
          phase: ph,
          date,
          urgency,
          uniqueKey: `${mod.id}-${ph.id}`
        });
      });
    });
    return rows;
  }, [filteredModules, activePreset, customStartDate, customEndDate, filterType, filterPhase, todayDate]);

  const sortedTableRows = useMemo(() => {
    const items = [...tableRows];
    items.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (sortField.startsWith('meta_')) {
        const metaKey = sortField.replace('meta_', '');
        const valA_raw = a.phase.metadata?.[metaKey] ?? a.module.metadata?.[metaKey] ?? '';
        const valB_raw = b.phase.metadata?.[metaKey] ?? b.module.metadata?.[metaKey] ?? '';
        const numA = Number(valA_raw);
        const numB = Number(valB_raw);
        if (!isNaN(numA) && !isNaN(numB) && valA_raw !== '' && valB_raw !== '') {
          valA = numA;
          valB = numB;
        } else {
          valA = String(valA_raw).toLowerCase();
          valB = String(valB_raw).toLowerCase();
        }
      } else {
        switch (sortField) {
          case 'date':
            valA = a.date || '9999-12-31';
            valB = b.date || '9999-12-31';
            break;
          case 'bucket':
            const priority = { 'overdue': 1, 'today': 2, 'this-week': 3, 'next-week': 4, 'future': 5, 'unassigned': 6 };
            valA = priority[a.urgency as keyof typeof priority] || 7;
            valB = priority[b.urgency as keyof typeof priority] || 7;
            break;
          case 'project':
            valA = a.project.name || '';
            valB = b.project.name || '';
            break;
          case 'pm':
            const pmA = employees.find(e => e.id === a.project.ownerId)?.name || '';
            const pmB = employees.find(e => e.id === b.project.ownerId)?.name || '';
            valA = pmA;
            valB = pmB;
            break;
          case 'course':
            valA = a.course.code || '';
            valB = b.course.code || '';
            break;
          case 'module':
            valA = a.module.code || '';
            valB = b.module.code || '';
            break;
          case 'type':
            valA = a.phase.phaseType || '';
            valB = b.phase.phaseType || '';
            break;
          case 'typePhase':
            valA = a.phase.phaseTypePhase || '';
            valB = b.phase.phaseTypePhase || '';
            break;
          case 'status':
            valA = a.phase.status || '';
            valB = b.phase.status || '';
            break;
        }
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
    return items;
  }, [tableRows, sortField, sortAsc]);

  const tableItemsPerPage = 20;
  const totalTablePages = Math.ceil(sortedTableRows.length / tableItemsPerPage);
  const paginatedTableRows = useMemo(() => {
    const start = (currentPage - 1) * tableItemsPerPage;
    return sortedTableRows.slice(start, start + tableItemsPerPage);
  }, [sortedTableRows, currentPage]);

  if (loading && data.projects.length === 0) {
    return <ConsolidatedViewSkeleton theme={theme} mode={mode} />;
  }

  if (error) {
    return (
      <div className="p-6 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-rose-455 space-y-2">
        <AlertTriangle className="w-6 h-6 text-rose-500" />
        <p className="font-bold text-sm">Dashboard Load Error</p>
        <p>{error}</p>
        <button 
          onClick={() => loadData()}
          className="px-3 py-1 bg-red-500/20 text-red-400 rounded-md hover:bg-red-500/30 transition-colors"
        >
          Retry Load
        </button>
      </div>
    );
  }

   return (
    <div className="-mt-6 space-y-6 bg-[var(--bg-page)] text-[var(--text-main)] transition-colors duration-150">
      
      {assignError && (
        <div className="p-3.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-xs text-rose-450 flex items-start justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Assignment Saving Failed:</span>
              <p className="mt-0.5 text-[var(--text-muted)]">{assignError}</p>
            </div>
          </div>
          <button
            onClick={() => setAssignError(null)}
            className="p-1 hover:bg-[var(--bg-card-hover)] rounded text-[var(--text-muted)] hover:text-[var(--text-main)] shrink-0"
          >
            ✕
          </button>
        </div>
      )}
      
      {/* 1. Page Header Bar — matches Overview 52px layout */}
      <div className="min-h-[52px] py-2 flex flex-wrap items-center justify-between border-b border-[var(--border-subtle)] px-0 gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={`text-xl sm:text-2xl font-black tracking-tight ${theme === 'light' ? 'bg-gradient-to-r from-[#1DAA58] to-[#2484C6] bg-clip-text text-transparent' : 'text-white'}`}>
            {mode === 'client' ? 'Delivery Progress' : 'Development Progress'}
          </h1>

          {/* Inline Time Horizon Selector */}
          <div className="flex flex-wrap items-center gap-1 bg-[var(--input-bg)] p-1 rounded-lg border border-[var(--border-subtle)] relative">
            {(['all', 'overdue', 'today', 'this-week', 'next-week', 'future', 'unassigned'] as const).map((h) => {
              const isActive = activePreset === h;
              return (
                <button
                  key={h}
                  onClick={() => handlePresetSelect(h)}
                  className={`relative px-2.5 py-1 rounded-md text-[11px] sm:text-xs font-semibold cursor-pointer transition-colors ${
                    isActive
                      ? 'text-[var(--text-main)] font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="consolidated-horizon-active-pill"
                      className="absolute inset-0 rounded-md bg-[var(--bg-card)] shadow-xs border border-[var(--border-subtle)]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">
                    {h === 'all'
                      ? 'All Timelines'
                      : h === 'overdue'
                      ? 'Overdue'
                      : h === 'today'
                      ? 'Today'
                      : h === 'this-week'
                      ? 'This Week'
                      : h === 'next-week'
                      ? 'Next Week'
                      : h === 'future'
                      ? 'Future'
                      : 'Unassigned'}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setIsFilterModalOpen(true)}
            className="px-3 py-1 text-xs font-semibold rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-main)] flex items-center gap-2 transition-all cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
          </button>
        </div>

        <button
          onClick={() => loadData()}
          disabled={loading}
          title="Refresh Data from server"
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin-linear text-[#1DAA58]' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* 2. Concentric Radial + All Projects Status + Donut Status — Responsive Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Card 1: Concentric Time Horizon Radial (Header Title Removed) */}
        <div className="min-h-[320px] h-full flex flex-col">
          <HorizonRadialWidget
            stats={stats}
            title=""
            activePreset={activePreset}
            onPresetSelect={handlePresetSelect}
          />
        </div>

        {/* Card 2: All Projects Status List */}
        <div className="h-[320px] p-4 sm:p-4.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-lg flex flex-col justify-between overflow-hidden transition-colors">
          <div className="flex-1 overflow-y-auto space-y-2 my-1 pr-1 custom-scrollbar">
            {data.projects.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-[var(--text-muted)]">
                No active projects found
              </div>
            ) : (
              data.projects.map(proj => {
                const projCourses = data.courses.filter(c => c.projectId === proj.id);
                const projCourseIds = projCourses.map(c => c.id);
                const projModules = data.modules.filter(m => projCourseIds.includes(m.courseId));
                const projModIds = projModules.map(m => m.id);
                const projPhases = filteredRelevantPhases.filter(ph => projModIds.includes(ph.moduleId));
                const totalPh = projPhases.length;
                const completedPh = projPhases.filter(p => p.status === 'Completed' || p.status === 'Approved' || p.status === 'Done').length;
                const pct = totalPh > 0 ? Math.round((completedPh / totalPh) * 100) : 100;
                
                const hasOverdue = projPhases.some(p => p.status === 'Overdue');
                const health = hasOverdue ? 'Red' : pct >= 70 ? 'Green' : 'Yellow';

                return (
                  <div key={proj.id} className="p-2.5 rounded-lg bg-[var(--input-bg)] border border-[var(--border-subtle)] flex flex-col gap-1.5 hover:border-[var(--border-subtle)] transition-all">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--text-main)] truncate max-w-[170px]">{proj.name}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        health === 'Green' ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20' :
                        health === 'Yellow' ? 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20' :
                        'bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20'
                      }`}>
                        {pct}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--input-bg)] overflow-hidden border border-[var(--border-subtle)]">
                      <div
                        className="h-full bg-gradient-to-r from-[#1DAA58] to-[#2484C6] transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
            <span>Overall Portfolio Progress</span>
            <span className="font-bold text-[var(--text-main)]">
              {data.projects.length > 0 ? `${Math.round(data.projects.reduce((acc, p) => {
                const pCourses = data.courses.filter(c => c.projectId === p.id).map(c => c.id);
                const pMods = data.modules.filter(m => pCourses.includes(m.courseId)).map(m => m.id);
                const pPh = filteredRelevantPhases.filter(ph => pMods.includes(ph.moduleId));
                const c = pPh.filter(x => x.status === 'Completed' || x.status === 'Approved' || x.status === 'Done').length;
                return acc + (pPh.length > 0 ? (c / pPh.length) * 100 : 100);
              }, 0) / data.projects.length)}%` : '100%'}
            </span>
          </div>
        </div>

        {/* Card 3: Restructured Status Breakdown (Rings on LEFT, Bars on RIGHT, Title Removed) */}
        <div className="h-[320px] p-4 sm:p-4.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-lg flex items-center justify-between gap-4 overflow-hidden transition-colors">
          {/* LEFT: Circular Donut Ring Chart */}
          <div className="flex flex-col items-center justify-center shrink-0 w-36 space-y-2">
            <div className="relative w-28 h-28 flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 42 42">
                {totalCategorized > 0 ? (
                  donutSegments.map((seg, idx) => (
                    <circle
                      key={idx}
                      cx="21"
                      cy="21"
                      r="15.91549430918954"
                      fill="transparent"
                      stroke={seg.color}
                      strokeWidth="4.5"
                      strokeDasharray={seg.strokeDasharray}
                      strokeDashoffset={seg.strokeDashoffset}
                      transform="rotate(-90 21 21)"
                      className="transition-all duration-500 ease-in-out"
                    />
                  ))
                ) : (
                  <circle
                    cx="21"
                    cy="21"
                    r="15.91549430918954"
                    fill="transparent"
                    stroke={theme === 'dark' ? '#374151' : '#E5E7EB'}
                    strokeWidth="4.5"
                    strokeDasharray="100 0"
                    transform="rotate(-90 21 21)"
                  />
                )}
                {/* Center Ring Label */}
                <g className="translate-x-[21px] translate-y-[21px]">
                  <text
                    textAnchor="middle"
                    dy="-2"
                    className={`text-[2.5px] font-black uppercase tracking-wider ${
                      theme === 'dark' ? 'fill-neutral-400' : 'fill-neutral-500'
                    }`}
                  >
                    Phases Total
                  </text>
                  <text
                    textAnchor="middle"
                    dy="5"
                    className={`text-[6.5px] font-black ${
                      theme === 'dark' ? 'fill-white' : 'fill-neutral-900'
                    }`}
                  >
                    {totalCategorized}
                  </text>
                </g>
              </svg>
            </div>
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest text-center">Status Ring</span>
          </div>

          {/* RIGHT: Status Progress Bars & Detailed Metric Counters */}
          <div className="flex-1 flex flex-col justify-center gap-2 min-w-0">
            {([
              { label: 'Completed', count: statusCounts.Completed, color: '#1DAA58', bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
              { label: 'In Review', count: statusCounts.InReview, color: '#F59E0B', bg: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
              { label: 'In Progress', count: statusCounts.InProgress, color: '#008DA5', bg: 'bg-teal-500/10 border-teal-500/20 text-teal-400' },
              { label: 'Pending', count: statusCounts.Pending, color: '#6B7280', bg: 'bg-slate-500/10 border-slate-500/20 text-slate-400' },
              { label: 'Overdue', count: statusCounts.Overdue, color: '#F43F5E', bg: 'bg-rose-500/10 border-rose-500/20 text-rose-400' }
            ]).map((st) => {
              const pct = totalCategorized > 0 ? Math.round((st.count / totalCategorized) * 100) : 0;

              return (
                <div key={st.label} className="p-2 rounded-lg bg-[var(--input-bg)] border border-[var(--border-subtle)] flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-[var(--text-muted)]">{st.label}</span>
                    <span className="font-black text-[var(--text-main)]">{st.count} <span className="text-[9px] text-[var(--text-muted)] font-normal">({pct}%)</span></span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-[var(--input-bg)] overflow-hidden border border-[var(--border-subtle)]">
                    <div
                      className="h-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: st.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. CONSOLIDATED FILTER PANEL */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsFilterModalOpen(false)} />
          <div className={`relative w-full max-w-2xl rounded-3xl border p-6 shadow-2xl ${theme === 'dark' ? 'bg-[#101214] border-[#3A3F4A]' : 'bg-white border-neutral-200'}`}>
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-[var(--text-main)]">Filters</h2>
                <p className="text-sm text-[var(--text-muted)]">Refine timelines, status, courses, phases and language</p>
              </div>
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="rounded-full p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] transition-all"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">Search text</label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="Course, Module, Language"
                      value={activeSearchQuery}
                      onChange={(e) => activeSetSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 rounded-2xl border text-sm focus:ring-1 focus:ring-[#2484C6] focus:outline-none transition-all bg-[var(--input-bg)] border-[var(--border-subtle)] text-[var(--text-main)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">Start Date</label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => handleCustomDateChange(e.target.value, customEndDate)}
                      className="w-full px-3 py-2 rounded-2xl border text-sm focus:ring-1 focus:ring-[#2484C6] focus:outline-none bg-[var(--input-bg)] border-[var(--border-subtle)] text-[var(--text-main)]"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">End Date</label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => handleCustomDateChange(customStartDate, e.target.value)}
                      className="w-full px-3 py-2 rounded-2xl border text-sm focus:ring-1 focus:ring-[#2484C6] focus:outline-none bg-[var(--input-bg)] border-[var(--border-subtle)] text-[var(--text-main)]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">Course Type</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl border text-sm focus:ring-1 focus:ring-[#2484C6] focus:outline-none bg-[var(--input-bg)] border-[var(--border-subtle)] text-[var(--text-main)] cursor-pointer"
                  >
                    <option value="">All Types</option>
                    {distinctTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">Phase</label>
                  <select
                    value={filterPhase}
                    onChange={(e) => setFilterPhase(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl border text-sm focus:ring-1 focus:ring-[#2484C6] focus:outline-none bg-[var(--input-bg)] border-[var(--border-subtle)] text-[var(--text-main)] cursor-pointer"
                  >
                    <option value="">All Phases</option>
                    {distinctPhaseNames.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">Language</label>
                  <select
                    value={filterLanguage}
                    onChange={(e) => setFilterLanguage(e.target.value)}
                    className="w-full px-3 py-2 rounded-2xl border text-sm focus:ring-1 focus:ring-[#2484C6] focus:outline-none bg-[var(--input-bg)] border-[var(--border-subtle)] text-[var(--text-main)] cursor-pointer"
                  >
                    <option value="">All Languages</option>
                    {distinctLanguages.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => {
                    setCustomStartDate('');
                    setCustomEndDate('');
                    activeSetSearchQuery('');
                    setFilterType('');
                    setFilterPhase('');
                    setFilterLanguage('');
                  }}
                  className="px-3 py-2 rounded-2xl border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer"
                >
                  Clear Filters
                </button>
                <button
                  type="button"
                  onClick={() => setIsFilterModalOpen(false)}
                  className="px-3 py-2 rounded-2xl bg-[#2484C6] text-white text-xs font-semibold hover:bg-[#1b78b8] transition-all cursor-pointer"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. TABLE VIEW FOR BOTH PM AND SHARED TRACKER (READ-ONLY) */}
      {sortedTableRows.length > 0 ? (
        <div className="space-y-6 mt-6">
          <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-lg transition-colors">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[var(--input-bg)] border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                  {/* Header Columns */}
                  {(() => {
                    const columns = mode === 'client' ? [
                      { key: 'pm', label: 'Owner', align: 'text-left' },
                      { key: 'date', label: 'Due Date', align: 'text-center' },
                      { key: 'bucket', label: 'Schedule', align: 'text-center' },
                      { key: 'project', label: 'Project', align: 'text-center' },
                      { key: 'course', label: 'Course', align: 'text-left' },
                      { key: 'module', label: 'Module', align: 'text-left' },
                      { key: 'type', label: 'Type', align: 'text-center' },
                      { key: 'phase', label: 'Phase', align: 'text-center' }
                    ] : [
                      ...(currentUser?.role !== 'Project Manager' ? [{ key: 'pm', label: 'Project Manager', align: 'text-left' }] : []),
                      { key: 'date', label: 'Date', align: 'text-center' },
                      { key: 'bucket', label: 'Timeline Status', align: 'text-center' },
                      { key: 'project', label: 'Project', align: 'text-center' },
                      { key: 'course', label: 'Course', align: 'text-left' },
                      { key: 'module', label: 'Module', align: 'text-left' },
                      { key: 'type', label: 'Type', align: 'text-center' },
                      { key: 'typePhase', label: 'Type Phase', align: 'text-center' }
                    ];
                    customMetadataKeys.forEach(k => {
                      const displayLabel = k.replace(/^(client|internal):/, '');
                      columns.push({ key: `meta_${k}`, label: displayLabel, align: 'text-center' });
                    });
                    columns.push({ key: 'status', label: 'Status', align: 'text-center' });

                    return columns.map((col) => {
                      const isCurrent = sortField === col.key;
                      const extraPadding = (col.key === 'project' || col.key === 'course' || col.key === 'type' || col.key === 'phase' || col.key === 'typePhase') ? 'px-6' : col.key === 'status' ? 'px-5' : '';
                      return (
                        <th
                          key={col.key}
                          onClick={() => {
                            if (sortField === col.key) {
                              setSortAsc(!sortAsc);
                            } else {
                              setSortField(col.key);
                              setSortAsc(true);
                            }
                          }}
                          className={`p-2.5 ${extraPadding} font-bold uppercase tracking-wider text-[10px] cursor-pointer hover:bg-[var(--bg-card-hover)] select-none transition-colors ${col.align}`}
                        >
                          <div className={`flex items-center gap-1 ${col.align === 'text-center' ? 'justify-center' : ''}`}>
                            <span>{col.label}</span>
                            {isCurrent && (
                              <span className="text-[10px] text-[#2484C6]">
                                {sortAsc ? '▲' : '▼'}
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    });
                  })()}
                  {mode === 'internal' && currentUser?.role !== 'Employee' && <th className="p-2.5 font-bold uppercase tracking-wider text-[10px] text-center">Assignee / Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {paginatedTableRows.map(({ project, course, module: mod, phase: ph, date, urgency, uniqueKey }) => {
                  const status = normalizePhaseStatus(ph.status);
                  const isRejected = status === 'Rejected';
                  const isInReview = status === 'In Review';
                  const isCompleted = status === 'Completed';

                  return (
                    <Fragment key={uniqueKey}>
                      <tr className="transition-colors hover:bg-[var(--bg-card-hover)] text-[var(--text-main)]">
                        {/* Owner Column */}
                        {(mode === 'client' || currentUser?.role !== 'Project Manager') && (
                          <td className="p-2.5 font-bold text-left">
                            {employees.find(e => e.id === project.ownerId)?.name || <span className="text-[var(--text-muted)] italic">Unassigned PM</span>}
                          </td>
                        )}

                        {/* 1. Date */}
                        <td className="p-2.5 font-mono text-center">
                          <span className={getDateColorClass(date)}>
                            {date || '-'}
                          </span>
                        </td>

                        {/* 2. Bucket */}
                        <td className="p-2.5 text-center">
                          <div className="flex justify-center">
                            {getUrgencyBadge(date)}
                          </div>
                        </td>

                        {/* Project Column */}
                        <td className="p-2.5 px-6 font-bold text-center">
                          {project.name}
                        </td>

                        {/* 3. Course */}
                        <td className="p-2.5 px-6 text-left">
                          {course.code && course.code.trim().toLowerCase() !== course.name.trim().toLowerCase() ? (
                            <>
                              <div className="font-bold whitespace-nowrap">{course.code}</div>
                              <div className="text-[10px] text-[var(--text-muted)]" title={course.name}>
                                {course.name}
                              </div>
                            </>
                          ) : (
                            <div className="font-bold" title={course.name}>
                              {course.name}
                            </div>
                          )}
                        </td>

                        {/* 4. Module */}
                        <td className="p-2.5 text-left">
                          {mod.code && mod.code.trim().toLowerCase() !== mod.name.trim().toLowerCase() ? (
                            <>
                              <div className="font-bold flex items-center gap-1.5 whitespace-nowrap">
                                <span>{mod.code}</span>
                                {mod.language && (
                                  <span className="px-1 py-0.2 rounded text-[9px] font-mono font-bold leading-none bg-[var(--input-bg)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                                    🌐 {mod.language}
                                  </span>
                                )}
                              </div>
                              <div className={`text-[10px] ${theme === 'dark' ? 'text-neutral-400' : 'text-slate-600'}`} title={mod.name}>
                                {mod.name}
                              </div>
                            </>
                          ) : (
                            <div className="font-bold flex items-center gap-1.5">
                              <span title={mod.name}>{mod.name}</span>
                              {mod.language && (
                                <span className="px-1 py-0.2 rounded text-[9px] font-mono font-bold leading-none bg-[var(--input-bg)] text-[var(--text-muted)] border border-[var(--border-subtle)] shrink-0">
                                  🌐 {mod.language}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 5. Type */}
                        <td className={`p-2.5 px-6 font-semibold text-center ${theme === 'dark' ? 'text-neutral-350' : 'text-slate-700'}`}>
                          {ph.phaseType || <span className={theme === 'dark' ? 'text-neutral-550 italic' : 'text-slate-400 italic'}>-</span>}
                        </td>

                        {/* 6. Phase / Type Phase */}
                        <td className={`p-2.5 px-6 font-semibold text-center ${theme === 'dark' ? 'text-neutral-350' : 'text-slate-700'}`}>
                          {(ph.phaseTypePhase || (ph as any).type_phase) || <span className={theme === 'dark' ? 'text-neutral-550 italic' : 'text-slate-400 italic'}>-</span>}
                        </td>

                        {/* Custom columns metadata */}
                        {customMetadataKeys.map(key => {
                          const val = ph.metadata?.[key] ?? mod.metadata?.[key] ?? '-';
                          return (
                            <td key={key} className={`p-2.5 font-semibold font-mono text-center ${theme === 'dark' ? 'text-neutral-350' : 'text-slate-700'}`}>
                              {val}
                            </td>
                          );
                        })}

                        {/* 7. Status */}
                        <td className="p-2.5 px-5 text-center">
                          {readOnly ? (
                            (() => {
                              const statusColors: Record<string, string> = {
                                Completed: theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200',
                                Pending: theme === 'dark' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-sky-50 text-sky-700 border-sky-200'
                              };
                              const categoryColors: Record<string, string> = {
                                Completed: '#1DAA58',
                                Pending: '#6B7280'
                              };
                              const displayStatus = status === 'Completed' ? 'Completed' : 'Pending';
                              const cls = statusColors[displayStatus] || 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20';
                              const dotColor = categoryColors[displayStatus] || '#6B7280';
                              return (
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase font-bold border tracking-wider ${cls}`}>
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                                  <span>{displayStatus}</span>
                                </span>
                              );
                            })()
                          ) : (
                            <StatusDropdown
                              value={status === 'Completed' ? 'Completed' : 'Pending'}
                              options={mode === 'client' ? ['Pending', 'Completed'] : undefined}
                              onChange={async (val) => {
                                const previousStatus = ph.status;
                                const newStatus = val as Phase['status'];
                                // 0ms Optimistic UI update
                                setData(prev => ({
                                  ...prev,
                                  phases: prev.phases.map(item => item.id === ph.id ? { ...item, status: newStatus } : item)
                                }));
                                updatePhaseInCache(ph.id, { status: newStatus });

                                try {
                                  setAssignError(null);
                                  if (mode === 'client') {
                                    await updateClientPhaseStatus(ph.id, val);
                                  } else {
                                    await updatePhaseStatus(ph.id, val);
                                  }
                                } catch (err: any) {
                                  console.error(err);
                                  // Revert on failure
                                  setData(prev => ({
                                    ...prev,
                                    phases: prev.phases.map(item => item.id === ph.id ? { ...item, status: previousStatus } : item)
                                  }));
                                  updatePhaseInCache(ph.id, { status: previousStatus });
                                  setAssignError(err.message || "Failed to update status.");
                                }
                                await loadData(true);
                              }}
                              theme={theme}
                            />
                          )}
                        </td>

                        {/* 8. Assignee / Actions (Internal mode only) */}
                        {mode === 'internal' && currentUser?.role !== 'Employee' && (
                          <td className="p-2.5">
                            <div className="flex flex-col gap-2 max-w-[200px]">
                              {readOnly ? (
                                <div className="text-[11px] font-semibold text-neutral-350">
                                  {employees.find(e => e.id === ph.assignedTo)?.name || <span className="text-neutral-500 italic">Unassigned</span>}
                                </div>
                              ) : (
                                <>
                                  {(() => {
                                    const linkedEmpIds = projectLinks
                                      .filter(link => link.project_id === project.id)
                                      .map(link => link.employee_id);
                                    const availableEmployees = employees.filter(emp => emp.role === 'Employee' && (linkedEmpIds.includes(emp.id) || emp.id === ph.assignedTo));
                                    return (
                                      <AssigneeDropdown
                                        value={ph.assignedTo || ''}
                                        onChange={async (val) => {
                                          const previousAssignedTo = ph.assignedTo;
                                          // 0ms Optimistic UI update
                                          setData(prev => ({
                                            ...prev,
                                            phases: prev.phases.map(item => item.id === ph.id ? { ...item, assignedTo: val } : item)
                                          }));
                                          updatePhaseInCache(ph.id, { assignedTo: val });

                                          try {
                                            setAssignError(null);
                                            await assignPhase(ph.id, val);
                                            if (val) {
                                              notifyNewAssignment(ph.id, val).catch(console.error);
                                            }
                                          } catch (err: any) {
                                            console.error(err);
                                            // Revert on failure
                                            setData(prev => ({
                                              ...prev,
                                              phases: prev.phases.map(item => item.id === ph.id ? { ...item, assignedTo: previousAssignedTo } : item)
                                            }));
                                            updatePhaseInCache(ph.id, { assignedTo: previousAssignedTo });
                                            setAssignError(err.message || "Failed to save resource assignment.");
                                          }
                                          await loadData(true);
                                        }}
                                        employees={availableEmployees}
                                        disabled={isCompleted}
                                        theme={theme}
                                      />
                                    );
                                  })()}

                                  {/* Action Buttons */}
                                  {isInReview && (
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={async () => {
                                          await updatePhaseStatus(ph.id, 'Completed');
                                          await loadData();
                                        }}
                                        className="flex-1 py-0.5 px-2 bg-[#1DAA58] hover:brightness-110 text-white text-[9.5px] font-bold rounded flex items-center justify-center gap-0.5 cursor-pointer transition-all"
                                      >
                                        <Check className="w-3 h-3" />
                                        <span>Approve</span>
                                      </button>
                                      <button
                                        onClick={() => {
                                          setRejectingPhaseId(ph.id);
                                          setRejectionNoteInput('');
                                        }}
                                        className="flex-1 py-0.5 px-2 bg-purple-600 hover:bg-purple-755 text-white text-[9.5px] font-bold rounded flex items-center justify-center gap-0.5 cursor-pointer transition-all"
                                      >
                                        <AlertCircle className="w-3 h-3" />
                                        <span>Reject</span>
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>

                      {/* Expandable inline sub-row for Rejection Feedback */}
                      {mode === 'internal' && (rejectingPhaseId === ph.id || (isRejected && ph.rejectionNote)) && (
                        <tr className={theme === 'dark' ? 'bg-[#181A1E]/40' : 'bg-neutral-50/50'}>
                          <td colSpan={
                            (() => {
                              const baseColCount = currentUser?.role === 'Project Manager' ? 8 : 9;
                              return (mode === 'internal' && currentUser?.role !== 'Employee') ? (baseColCount + 1) : baseColCount;
                            })()
                          } className="p-3">
                            {rejectingPhaseId === ph.id && !readOnly ? (
                              <div className="space-y-1.5 max-w-lg p-2 border border-purple-500/20 rounded bg-purple-500/5">
                                <span className="text-[9px] uppercase font-bold text-purple-400">Reason for Rejection:</span>
                                <textarea
                                  value={rejectionNoteInput}
                                  onChange={(e) => setRejectionNoteInput(e.target.value)}
                                  placeholder="Provide actionable feedback..."
                                  className={`w-full p-1.5 text-[10.5px] rounded focus:outline-hidden focus:ring-1 focus:ring-purple-500 ${
                                    theme === 'dark' ? 'bg-neutral-850 text-white border-neutral-700' : 'bg-white text-neutral-955 border-neutral-300'
                                  }`}
                                  rows={2}
                                />
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRejectingPhaseId(null);
                                      setRejectionNoteInput('');
                                    }}
                                    className="px-2 py-0.5 text-[10px] rounded border border-neutral-700 text-neutral-400 hover:bg-neutral-800"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!rejectionNoteInput.trim()) {
                                        setError('Please specify a rejection reason.');
                                        return;
                                      }
                                      await updatePhaseStatus(ph.id, 'Rejected', rejectionNoteInput.trim());
                                      setRejectingPhaseId(null);
                                      setRejectionNoteInput('');
                                      await loadData();
                                    }}
                                    className="px-2 py-0.5 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold text-[10px]"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-2 rounded bg-purple-500/5 border border-purple-500/10 text-[10px] text-purple-300 leading-snug max-w-lg">
                                <span className="font-bold block text-purple-400">Rejection Note:</span>
                                "{ph.rejectionNote}"
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer for Table */}
          {totalTablePages > 1 && (
            <div className="flex items-center justify-between pt-6 border-t border-neutral-500/10">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`px-3 py-1.5 rounded-md border text-xs font-medium flex items-center gap-1 transition-all ${
                  currentPage === 1
                    ? 'opacity-50 cursor-not-allowed text-neutral-500'
                    : theme === 'dark'
                      ? 'border-neutral-800 bg-neutral-900 text-white hover:bg-neutral-800'
                      : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50'
                }`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalTablePages }, (_, i) => i + 1).map(pageNum => (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-7.5 h-7.5 rounded-md text-xs font-bold transition-all border ${
                      pageNum === currentPage
                        ? theme === 'dark'
                          ? 'bg-[#2484C6] border-[#2484C6] text-white font-extrabold'
                          : 'bg-[#1DAA58] border-[#1DAA58] text-white font-extrabold'
                        : theme === 'dark'
                          ? 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-white'
                          : 'border-neutral-250 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalTablePages))}
                disabled={currentPage === totalTablePages}
                className={`px-3 py-1.5 rounded-md border text-xs font-medium flex items-center gap-1 transition-all ${
                  currentPage === totalTablePages
                    ? 'opacity-50 cursor-not-allowed text-neutral-500'
                    : theme === 'dark'
                      ? 'border-neutral-800 bg-neutral-900 text-white hover:bg-neutral-800'
                      : 'border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50'
                }`}
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        ) : (
          <div className={`p-10 rounded-lg text-center border border-dashed flex flex-col items-center justify-center ${
            theme === 'dark' ? 'bg-neutral-800/10 border-neutral-700/60' : 'bg-neutral-50 border-neutral-250'
          }`}>
            <Layers className="w-10 h-10 text-neutral-500 mb-3" />
            <h3 className="font-semibold text-sm mb-1">No Matching Chronologies Found</h3>
            <p className="text-xs text-neutral-400 max-w-md mx-auto">
              We couldn't locate any stored project metrics fitting your current filter or text query. Adjust search bounds or try toggling presets.
            </p>
            {data.projects.length === 0 && (
              <div className="mt-4 p-3.5 max-w-sm rounded-md bg-[#2484C6]/15 text-[#2484C6] border border-[#2484C6]/20 text-xs">
                <p className="font-bold flex items-center justify-center gap-1.5 mb-1">
                  <Info className="w-4 h-4" />
                  <span>Empty Database Projects List</span>
                </p>
                <p className="leading-relaxed text-[11px] text-neutral-400">
                  To evaluate the read-only dashboards, switch to the <strong>Data Ingestion</strong> portal, map relevant Excel files, and commit project timelines!
                </p>
              </div>
            )}
          </div>
        )
      }

    </div>
  );
}
