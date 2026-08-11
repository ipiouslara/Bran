/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Sun,
  Moon,
  Database,
  Layers,
  Sparkles,
  Info,
  HelpCircle,
  LogOut,
  User,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  Users,
  Eye,
  ChevronLeft,
  ChevronRight,
  Menu,
  Calendar,
  Settings,
  Bell,
  Search,
  ChevronDown,
  Briefcase,
  History
} from 'lucide-react';

import { Project, UploadedFileState, JoinResultRow, SheetPreviewData, ColumnMappingConfig, Notification } from './types';
import {
  hasSupabaseCreds,
  getSupabase,
  checkSupabaseConnection,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  purgeOldNotifications,
  insertNotification,
  getHolidays,
  setGlobalSession,
  setGlobalCurrentUser
} from './lib/db';
import { getWorkingDaysDifference } from './utils/workingDays';
import { executeJoin } from './utils/joiner';

import { motion, AnimatePresence } from 'motion/react';

// Core components imported statically
import AuthScreen from './components/AuthScreen';
import LandingPage from './components/LandingPage';
import ProjectSelector from './components/ProjectSelector';
import UploadZone from './components/UploadZone';
import MappingSuite from './components/MappingSuite';
import DataIngestionSuite from './components/DataIngestionSuite';
import ResultsGrid from './components/ResultsGrid';
import UploadsLog from './components/UploadsLog';
import AppLayout from './components/layout/AppLayout';
import AppLayoutSkeleton from './components/skeletons/AppLayoutSkeleton';
import PageSkeleton from './components/skeletons/PageSkeleton';
import LandingSkeleton from './components/skeletons/LandingSkeleton';

// Code-split / Dynamically imported heavy components
const ConsolidatedView = React.lazy(() => import('./components/ConsolidatedView'));
const ExecutiveDashboard = React.lazy(() => import('./components/ExecutiveDashboard'));
const ProjectEditor = React.lazy(() => import('./components/ProjectEditor'));
const ProjectManagement = React.lazy(() => import('./components/ProjectManagement'));
const EmployeeDirectory = React.lazy(() => import('./components/EmployeeDirectory'));
const CapacityAllocation = React.lazy(() => import('./components/CapacityAllocation'));
const EmployeeDashboard = React.lazy(() => import('./components/EmployeeDashboard'));
const HolidayCalendar = React.lazy(() => import('./components/HolidayCalendar'));
const ActivityLog = React.lazy(() => import('./components/ActivityLog'));

export default function App() {

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('app-theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    } catch (e) {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('app-theme', theme);
    } catch (e) {}
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const [currentUser, setCurrentUser] = useState<{ email: string; role: string; id?: string; employeeId?: string; name?: string } | null>(null);
  const [activePage, setActivePage] = useState<'dashboard' | 'client' | 'internal' | 'ingestion' | 'directory' | 'employee-directory' | 'capacity-allocation' | 'audit-log' | 'employee_dashboard' | 'tracker' | 'calendar' | 'projects' | 'project_editor' | 'activity_log' | 'uploads_log' | 'employees' | 'allocations' | 'my_dashboard'>('dashboard');

  const [searchQuery, setSearchQuery] = useState('');
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [focusedModuleId, setFocusedModuleId] = useState<string | null>(null);

  const navigateToPage = (page: typeof activePage) => {
    setFocusedModuleId(null);
    setActivePage(page);
  };

  // 3-screen flow: landing → auth → app
  const [appView, setAppView] = useState<'landing' | 'auth' | 'app'>('landing');
  
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('sidebar_expanded');
    return saved !== null ? JSON.parse(saved) : false; // default to collapsed
  });

  const [showInfoBanner, setShowInfoBanner] = useState<boolean>(() => {
    return localStorage.getItem('dismiss_bran_info') !== 'true';
  });
  
  // Database Connection Validation Status
  const [connectionStatus, setConnectionStatus] = useState<{ checked: boolean; error: string | null }>({ checked: false, error: null });
  const [dbRefreshCounter, setDbRefreshCounter] = useState(0);

  // Runtime database credential entry states
  const [runtimeUrl, setRuntimeUrl] = useState('');
  const [runtimeKey, setRuntimeKey] = useState('');

  useEffect(() => {
    const verifyConnection = async () => {
      const result = await checkSupabaseConnection();
      if (!result.success) {
        setConnectionStatus({ checked: true, error: result.error || "Unreachable" });
      } else {
        setConnectionStatus({ checked: true, error: null });
      }
    };
    verifyConnection();
  }, []);

  // Strict Route Guard for All Roles
  useEffect(() => {
    if (activePage === 'calendar') {
      if (currentUser?.role === 'Lead') {
        setActivePage('internal');
      } else if (currentUser?.role === 'Employee') {
        setActivePage('employee_dashboard');
      } else {
        setActivePage('projects');
      }
      return;
    }

    if (currentUser?.role === 'Lead') {
      const restrictedForLead = ['client', 'ingestion', 'project_editor', 'calendar', 'activity_log', 'audit-log', 'settings', 'projects'];
      if (restrictedForLead.includes(activePage)) {
        setActivePage('internal');
      }
    } else if (currentUser?.role === 'Employee') {
      const restrictedForEmp = ['client', 'ingestion', 'project_editor', 'calendar', 'activity_log', 'audit-log', 'settings', 'projects', 'directory', 'employee-directory'];
      if (restrictedForEmp.includes(activePage)) {
        setActivePage('employee_dashboard');
      }
    }
  }, [currentUser?.role, activePage]);

  const renderSidebarItem = (
    id: string,
    page: string | null,
    label: string,
    sublabel: string,
    IconComponent: any,
    onClickAction?: () => void
  ) => {
    const isActive = page ? activePage === page : false;
    const clickHandler = page ? () => navigateToPage(page as any) : onClickAction;

    return (
      <button
        id={id}
        onClick={clickHandler}
        className={`w-full p-2 rounded-md flex items-center ${
          sidebarExpanded ? 'gap-3 text-left' : 'justify-center'
        } transition-all relative group cursor-pointer ${
          isActive
            ? theme === 'dark'
              ? 'bg-[#2484C6] text-white font-bold'
              : 'bg-[#1DAA58] text-white font-bold shadow-xs'
            : theme === 'dark'
              ? 'text-neutral-400 hover:text-white hover:bg-neutral-500/10'
              : 'text-slate-800 hover:text-slate-950 hover:bg-slate-100'
        }`}
        title={!sidebarExpanded ? `${label}: ${sublabel}` : ""}
      >
        <IconComponent className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : theme === 'dark' ? 'text-neutral-400' : 'text-slate-600'}`} />
        {sidebarExpanded && (
          <div className="leading-none text-left">
            <span className={`text-xs font-semibold block ${isActive ? 'text-white' : theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{label}</span>
            <span className={`text-[9px] block font-normal mt-0.5 ${isActive ? 'text-white/90' : theme === 'dark' ? 'text-neutral-400' : 'text-slate-600'}`}>{sublabel}</span>
          </div>
        )}
      </button>
    );
  };

  // Active workspace project context
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Mapped spreadsheets files states
  const [clientFile, setClientFile] = useState<UploadedFileState | null>(null);
  const [internalFile, setInternalFile] = useState<UploadedFileState | null>(null);

  // Result metrics
  const [joinResults, setJoinResults] = useState<JoinResultRow[]>([]);
  const [dbCommitCounter, setDbCommitCounter] = useState(0);

  // Sync React currentUser state with global DB session helper
  useEffect(() => {
    setGlobalCurrentUser(currentUser);
  }, [currentUser]);

  // Initialize user context on mount via Supabase Auth Session
  useEffect(() => {
    const sb = getSupabase();
    if (sb) {
      sb.auth.getSession().then(({ data, error }) => {
        if (!error && data?.session) {
          setGlobalSession(data.session);
        } else {
          setGlobalSession(null);
        }
      }).catch(err => {
        console.warn("Auth getSession error:", err);
        setGlobalSession(null);
      });
      const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
        setGlobalSession(session);
      });
      return () => {
        subscription?.unsubscribe();
      };
    }
  }, []);

  const getRelativeTimeString = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays}d ago`;
  };

  const loadAndCheckNotifications = async () => {
    if (!currentUser || !currentUser.id) return;
    const sb = getSupabase();
    if (!sb) return;

    try {
      await purgeOldNotifications(currentUser.id);
      const existing = await getNotifications(currentUser.id);

      if (currentUser.role === 'Employee' || currentUser.role === 'Lead') {
        const hData = await getHolidays();
        const holidayDates = hData.map(h => h.date);

        const { data: assignedPhases, error: phaseErr } = await sb
          .from('internal_phases')
          .select('id, phase_name, internal_end_date, status, modules(name)')
          .eq('assigned_to', currentUser.id)
          .eq('status', 'Pending');

        if (!phaseErr && assignedPhases) {
          const today = new Date();
          const todayStr = today.toISOString().split('T')[0];

          for (const phase of assignedPhases) {
            const moduleName = (phase.modules as any)?.name || 'Unknown Module';

            if (phase.internal_end_date && new Date(phase.internal_end_date) < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
              await sb.from('internal_phases').update({ status: 'Overdue' }).eq('id', phase.id);
              const hasOverdueNotif = existing.some(n => n.phaseId === phase.id && n.type === 'overdue');
              if (!hasOverdueNotif) {
                const msg = `${phase.phase_name} on ${moduleName} is now overdue.`;
                await insertNotification(currentUser.id, phase.id, 'overdue', msg);
              }
            }

            if (phase.internal_end_date) {
              const workingDaysLeft = getWorkingDaysDifference(todayStr, phase.internal_end_date, holidayDates);
              if (workingDaysLeft === 1) {
                const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                const hasDueSoonToday = existing.some(n => {
                  return n.phaseId === phase.id && 
                         n.type === 'due_soon' && 
                         !n.isRead &&
                         new Date(n.createdAt).getTime() >= todayMidnight;
                });

                if (!hasDueSoonToday) {
                  const msg = `${phase.phase_name} on ${moduleName} is due tomorrow.`;
                  await insertNotification(currentUser.id, phase.id, 'due_soon', msg);
                }
              }
            }
          }
        }
      }

      const updated = await getNotifications(currentUser.id);
      setNotifications(updated);
    } catch (err) {
      console.error("Error loading or checking notifications:", err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadAndCheckNotifications();
      const interval = setInterval(loadAndCheckNotifications, 60000);
      return () => clearInterval(interval);
    } else {
      setNotifications([]);
    }
  }, [currentUser]);

  const handleMarkAllRead = async () => {
    if (!currentUser || !currentUser.id) return;
    try {
      await markAllNotificationsRead(currentUser.id);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const handleNotificationClick = async (n: Notification) => {
    try {
      await markNotificationRead(n.id);
      setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, isRead: true } : notif));
      setIsNotificationsOpen(false);

      if (n.moduleId) {
        setFocusedModuleId(n.moduleId);
        if (currentUser?.role === 'Admin' || currentUser?.role === 'Project Manager') {
          setActivePage('internal');
        } else {
          setActivePage('tracker');
        }
      }
    } catch (err) {
      console.error("Failed to process notification click:", err);
    }
  };

  // Recalculate Joined Matrix on mapping/tab adjustments
  useEffect(() => {
    if (
      clientFile &&
      clientFile.mappingConfig &&
      internalFile &&
      internalFile.mappingConfig
    ) {
      const activeClientSheet = clientFile.sheets.find(s => s.sheetName === clientFile.selectedSheetName) || clientFile.sheets[0];
      const activeInternalSheet = internalFile.sheets.find(s => s.sheetName === internalFile.selectedSheetName) || internalFile.sheets[0];

      if (activeClientSheet && activeInternalSheet) {
        const results = executeJoin(
          activeClientSheet.rows,
          clientFile.mappingConfig,
          activeInternalSheet.rows,
          internalFile.mappingConfig
        );
        setJoinResults(results);
      }
    } else {
      setJoinResults([]);
    }
  }, [clientFile, internalFile]);

  const [isExitingLogin, setIsExitingLogin] = useState(false);

  // Handle successful logins
  const handleLoginSuccess = (email: string, role: string, employeeId?: string, name?: string) => {
    setCurrentUser({ email, role, id: employeeId, employeeId, name });
    setIsExitingLogin(true);
    setTimeout(() => {
      setAppView('app');
      setIsExitingLogin(false);
    }, 500);
  };

  // Automatically redirect based on roles upon login
  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'Employee' || currentUser.role === 'Lead') {
        setActivePage('employee_dashboard');
      } else {
        setActivePage('dashboard');
      }
    }
  }, [currentUser]);


  const handleLogout = () => {
    setCurrentUser(null);
    setAppView('landing');
    const sb = getSupabase();
    if (sb) {
      sb.auth.signOut();
    }
  };

  const triggerDbReload = () => {
    setDbRefreshCounter(prev => prev + 1);
  };

  const handleCommitSuccess = (newProjId?: string) => {
    setDbCommitCounter(prev => prev + 1);
    setDbRefreshCounter(prev => prev + 1);
    if (newProjId) {
      setSelectedProject(prev => prev ? { ...prev, id: newProjId } : { id: newProjId, name: 'Ingested Project', createdAt: new Date().toISOString() });
    }
  };

  // Connection Verification Loading Screen
  if (!connectionStatus.checked) {
    if (currentUser) {
      return <AppLayoutSkeleton theme={theme} />;
    }
    return <LandingSkeleton />;
  }

  // Connection Failure Blocking Screen
  if (connectionStatus.checked && connectionStatus.error) {
    const handleSaveRuntimeCreds = (e: React.FormEvent) => {
      e.preventDefault();
      window.location.reload();
    };

    const handleClearRuntimeCreds = () => {
      setRuntimeUrl('');
      setRuntimeKey('');
      window.location.reload();
    };

    return (
      <div className="min-h-screen flex items-center justify-center p-6 font-sans" style={{ background: '#030712' }}>
        <div
          className="max-w-md w-full p-8 rounded-2xl text-center space-y-5"
          style={{ background: '#0D0F14', border: '1px solid rgba(244,63,94,0.22)', boxShadow: '0 25px 80px rgba(0,0,0,0.7)' }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto animate-pulse"
            style={{ background: 'rgba(244,63,94,0.10)', border: '1px solid rgba(244,63,94,0.22)' }}
          >
            <AlertTriangle className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-rose-400">Database Connection Failure</h1>
            <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.40)' }}>
              Bran requires a secure, active cloud connection. Please provide database credentials or declare them in your environment variables.
            </p>
          </div>

          <div
            className="p-3 rounded-xl text-left font-mono text-[9px] text-rose-300/80 break-words leading-relaxed"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(244,63,94,0.15)' }}
          >
            <strong className="text-rose-400">Error:</strong> {connectionStatus.error}
          </div>

          <form onSubmit={handleSaveRuntimeCreds} className="space-y-3 text-left pt-1">
            <div>
              <label className="block text-[10px] uppercase font-bold mb-1.5 tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Supabase Project URL</label>
              <input
                type="text"
                required
                placeholder="https://your-project.supabase.co"
                value={runtimeUrl}
                onChange={e => setRuntimeUrl(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl text-white outline-none transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold mb-1.5 tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Anon Public API Key</label>
              <input
                type="password"
                required
                placeholder="your-supabase-public-anon-key"
                value={runtimeKey}
                onChange={e => setRuntimeKey(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl text-white outline-none transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="flex-grow py-2.5 text-white rounded-xl text-xs font-bold transition-all hover:brightness-110 active:scale-[0.98] cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #E11D48, #BE123C)', boxShadow: '0 4px 16px rgba(225,29,72,0.30)' }}
              >
                Save & Connect
              </button>
              {(runtimeUrl || runtimeKey) && (
                <button
                  type="button"
                  onClick={handleClearRuntimeCreds}
                  className="px-4 py-2.5 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.5)' }}
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  const showLoginOverlay = appView === 'landing' || !currentUser || isExitingLogin;

  return (
    <>
      {showLoginOverlay && (
        <div
          className={`fixed inset-0 z-50 bg-[#030712] overflow-y-auto gpu-accelerated transform transition-transform duration-500 ease-in-out ${
            isExitingLogin ? '-translate-y-full pointer-events-none' : 'translate-y-0'
          }`}
        >
          <LandingPage onLoginSuccess={handleLoginSuccess} />
        </div>
      )}

      <AppLayout
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        activePage={activePage}
        onNavigate={(page) => navigateToPage(page as any)}
        currentUser={currentUser}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        notifications={notifications}
        onMarkAllNotificationsRead={handleMarkAllRead}
        onNotificationClick={handleNotificationClick}
        onLogout={handleLogout}
        activeProjectsCount={joinResults.length > 0 ? 1 : 0}
      >
        <React.Suspense fallback={<PageSkeleton theme={theme} />}>
          <div
            key={activePage}
            className="w-full page-enter gpu-accelerated"
          >
            {activePage === 'dashboard' && (
              <ExecutiveDashboard
                theme={theme}
                currentUser={currentUser}
                onNavigateToTimeline={(projectId, isInternal) => {
                  setSelectedProject({ id: projectId, name: 'Target Scope', createdAt: new Date().toISOString() });
                  setActivePage(isInternal ? 'internal' : 'client');
                }}
                onNavigateToHolidays={(projectId) => {
                  setSelectedProject({ id: projectId, name: 'Target Scope', createdAt: new Date().toISOString() });
                  setActivePage('calendar');
                }}
              />
            )}

            {activePage === 'client' && (
              <ConsolidatedView 
                theme={theme} 
                mode="client" 
                refreshCounter={dbCommitCounter} 
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                currentUser={currentUser}
                role={currentUser?.role}
              />
            )}

            {activePage === 'internal' && (
              <ConsolidatedView 
                theme={theme} 
                mode="internal" 
                refreshCounter={dbCommitCounter} 
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                currentUser={currentUser}
                role={currentUser?.role}
                focusedModuleId={focusedModuleId}
              />
            )}

            {activePage === 'ingestion' && (
              <DataIngestionSuite
                theme={theme}
                currentUser={currentUser}
                dbRefreshCounter={dbRefreshCounter}
                handleCommitSuccess={(newProjId) => {
                  handleCommitSuccess(newProjId);
                }}
              />
            )}

            {(activePage === 'directory' || activePage === 'employee-directory') && (
              <EmployeeDirectory 
                theme={theme} 
                refreshTrigger={dbCommitCounter}
                onDirectoryChanged={handleCommitSuccess}
                currentUser={currentUser}
              />
            )}

            {activePage === 'capacity-allocation' && (
              <CapacityAllocation 
                theme={theme} 
                currentUser={currentUser} 
                refreshTrigger={dbCommitCounter}
              />
            )}

            {activePage === 'tracker' && (
              <ConsolidatedView 
                theme={theme} 
                mode="internal" 
                readOnly={currentUser?.role === 'Employee'}
                role={currentUser?.role}
                currentUser={currentUser}
                refreshCounter={dbCommitCounter} 
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                focusedModuleId={focusedModuleId}
              />
            )}

            {activePage === 'uploads_log' && (
              <UploadsLog theme={theme} refreshTimer={dbCommitCounter} />
            )}

            {activePage === 'employees' && (
              <EmployeeDirectory theme={theme} currentUser={currentUser} />
            )}

            {activePage === 'allocations' && (
              <CapacityAllocation theme={theme} currentUser={currentUser} />
            )}

            {(activePage === 'employee_dashboard' || activePage === 'my_dashboard') && (
              <EmployeeDashboard 
                theme={theme} 
                employeeId={currentUser?.id || currentUser?.employeeId || 'emp-fallback'} 
                employeeName={currentUser?.name || 'Resource Member'} 
                currentUser={currentUser}
              />
            )}

            {activePage === 'calendar' && (
              <HolidayCalendar theme={theme} currentUser={currentUser} />
            )}

            {activePage === 'projects' && (
              <ProjectManagement 
                theme={theme} 
                currentUser={currentUser} 
                refreshTrigger={dbCommitCounter}
                onProjectsChanged={() => setDbCommitCounter(prev => prev + 1)}
                onNavigateToProjectEditor={(projId: string) => {
                  sessionStorage.setItem('project_editor_project_id', projId);
                  sessionStorage.removeItem('project_editor_course_id');
                  setSelectedProject({ id: projId, name: '', createdAt: new Date().toISOString() });
                  setActivePage('project_editor');
                }}
              />
            )}

            {activePage === 'project_editor' && (
              <ProjectEditor 
                theme={theme} 
                currentUser={currentUser} 
                refreshTrigger={dbCommitCounter}
                onProjectsChanged={() => setDbCommitCounter(prev => prev + 1)}
              />
            )}

            {(activePage === 'activity_log' || activePage === 'audit-log') && (
              <ActivityLog 
                theme={theme} 
                currentUser={currentUser} 
                refreshTrigger={dbCommitCounter}
              />
            )}
          </div>
        </React.Suspense>
      </AppLayout>
    </>
  );
}
