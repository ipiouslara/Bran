/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Layers, CheckCircle2, AlertCircle, HelpCircle, RefreshCw, Clock, Search, Filter } from 'lucide-react';
import { Project, Course, Module, Phase, Employee } from '../types';
import { fetchAllDashboardData, updatePhaseStatus, runAutoOverdueCheck } from '../lib/db';

interface EmployeeDashboardProps {
  theme: 'dark' | 'light';
  employeeId: string; // The selected employee's unique record ID (or employeeId)
  employeeName: string;
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
}

export default function EmployeeDashboard({ theme, employeeId, employeeName, currentUser }: EmployeeDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);

  // Search/Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending' | 'Completed'>('all');

  const [refreshCounter, setRefreshCounter] = useState(0);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchAllDashboardData(currentUser);
      
      // Let's run the auto overdue check against the original end dates
      const overdueChanged = await runAutoOverdueCheck(res.phases);
      if (overdueChanged) {
        // Reload if anything changed
        const reloaded = await fetchAllDashboardData(currentUser);
        setProjects(reloaded.projects);
        setCourses(reloaded.courses);
        setModules(reloaded.modules);
        setPhases(reloaded.phases);
      } else {
        setProjects(res.projects);
        setCourses(res.courses);
        setModules(res.modules);
        setPhases(res.phases);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to fetch employee dashboard tasks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [employeeId, refreshCounter]);

  // Filter tasks assigned to this employee / lead
  const currentUserId = currentUser?.id || currentUser?.employeeId || employeeId;
  const currentEmpId = currentUser?.employeeId;
  const currentEmail = currentUser?.email;
  const currentName = currentUser?.name;

  const employeePhases = phases.filter(p => {
    if (!p.assignedTo) return false;
    return (
      p.assignedTo === employeeId ||
      p.assignedTo === currentUserId ||
      (currentEmpId && p.assignedTo === currentEmpId) ||
      (currentEmail && p.assignedTo.toLowerCase() === currentEmail.toLowerCase()) ||
      (currentName && p.assignedTo.toLowerCase() === currentName.toLowerCase())
    );
  });

  // Mark as Done action
  const handleMarkAsDone = async (phaseId: string) => {
    try {
      setError(null);
      // Changes status to "Completed"
      await updatePhaseStatus(phaseId, 'Completed');
      setRefreshCounter(prev => prev + 1);
    } catch (err: any) {
      console.error(err);
      setError('Failed to mark task as completed.');
    }
  };

  // Helper selectors
  const getModuleInfo = (moduleId: string) => {
    const mod = modules.find(m => m.id === moduleId);
    if (!mod) return { code: 'N/A', name: 'Unknown Module', courseCode: 'N/A', courseName: 'Unknown Course' };
    
    const crs = courses.find(c => c.id === mod.courseId);
    return {
      code: mod.code,
      name: mod.name,
      language: mod.language,
      courseCode: crs?.code || 'N/A',
      courseName: crs?.name || 'Unknown Course'
    };
  };

  // Stats calculation
  const totalTasks = employeePhases.length;
  const pendingCount = employeePhases.filter(p => p.status !== 'Completed' && p.status !== 'Done').length;
  const completedCount = employeePhases.filter(p => p.status === 'Completed' || p.status === 'Done').length;

  // Filter tasks by query and selected status
  const filteredPhases = employeePhases.filter(p => {
    // 1. Status Filter
    if (statusFilter !== 'all') {
      const isComp = p.status === 'Completed' || p.status === 'Done';
      if (statusFilter === 'Completed' && !isComp) return false;
      if (statusFilter === 'Pending' && isComp) return false;
    }

    // 2. Search Query (Course, Module, Phase details)
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    const modInfo = getModuleInfo(p.moduleId);
    return (
      p.phaseName.toLowerCase().includes(query) ||
      modInfo.code.toLowerCase().includes(query) ||
      modInfo.name.toLowerCase().includes(query) ||
      modInfo.courseCode.toLowerCase().includes(query) ||
      modInfo.courseName.toLowerCase().includes(query)
    );
  });

  // Get status badge colors
  const getStatusBadge = (status: Phase['status']) => {
    const defaultStyle = "bg-neutral-500 text-white border border-neutral-500";
    if (!status) return <span className={`px-2 py-0.5 text-[9px] uppercase font-mono rounded-full ${defaultStyle}`}>Pending</span>;

    const normalized = (status === 'Completed' || (status as string) === 'Done') ? 'Completed' : 'Pending';
    let cls = defaultStyle;
    if (normalized === 'Completed') {
      cls = "bg-emerald-600 text-white border-emerald-600 font-bold";
    } else {
      cls = "bg-sky-600 text-white border-sky-600 font-bold";
    }
    return <span className={`px-2 py-0.5 text-[9px] uppercase font-extrabold rounded-full tracking-wider border ${cls}`}>{normalized}</span>;
  };

  return (
    <div className="space-y-6">
      {/* 1. Profile Welcome Banner */}
      <div
        id="employee-profile-card"
        className={`p-6 rounded-lg border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all hover-card-glow ${
          theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15 shadow-xl' : 'bg-white border-neutral-200 shadow-md'
        }`}
      >
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 block mb-1">
            Operational Workstation
          </span>
          <h1 className="text-xl font-extrabold tracking-tight text-neutral-100 dark:text-white">
            Welcome back, {employeeName}!
          </h1>
          <p className="text-xs text-neutral-450 mt-1">
            Assigned Workspace ID: <span className="font-mono text-[#2484C6] font-bold">{employeeId}</span>
          </p>
        </div>
        <button
          onClick={() => setRefreshCounter(prev => prev + 1)}
          className={`px-3 py-1.5 rounded-md border text-xs font-semibold flex items-center gap-1.5 hover:brightness-110 active:scale-97 transition-all ${
            theme === 'dark'
              ? 'border-neutral-700 bg-neutral-800 text-neutral-300'
              : 'border-neutral-200 bg-neutral-100 text-neutral-700'
          }`}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Sync Workspace</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Tasks */}
        <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-neutral-900/40 border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
          <span className="text-[10px] uppercase font-bold text-neutral-450">My Work Scope</span>
          <p className="text-xl font-black mt-1 text-neutral-200 dark:text-white">{totalTasks}</p>
        </div>
        {/* Pending */}
        <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-neutral-900/40 border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
          <span className="text-[10px] uppercase font-bold text-sky-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" /> Pending
          </span>
          <p className="text-xl font-black mt-1 text-neutral-200 dark:text-white">{pendingCount}</p>
        </div>
        {/* Completed */}
        <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-neutral-900/40 border-neutral-800' : 'bg-neutral-50 border-neutral-200'}`}>
          <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> Completed
          </span>
          <p className="text-xl font-black mt-1 text-neutral-200 dark:text-white">{completedCount}</p>
        </div>
      </div>

      {/* 3. Search & Quick Filters Bar */}
      <div
        className={`p-4 rounded-lg border flex flex-col md:flex-row items-center justify-between gap-4 ${
          theme === 'dark' ? 'bg-[#1F2126] border-[#B1B7C3]/15' : 'bg-white border-neutral-200'
        }`}
      >
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-450" />
          <input
            type="text"
            placeholder="Search by Course, Module or Phase..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-4 py-2 text-xs rounded-md focus:outline-hidden focus:ring-1 focus:ring-[#2484C6] ${
              theme === 'dark' ? 'bg-neutral-850 border-neutral-750 text-white' : 'bg-neutral-100 border-neutral-250 text-neutral-900'
            }`}
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto self-stretch md:self-auto pb-1 md:pb-0 relative">
          <Filter className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
          <span className="text-[10px] uppercase font-bold text-neutral-400 whitespace-nowrap mr-1">Status:</span>
          {(['all', 'Pending', 'Completed'] as const).map(f => {
            const isActive = statusFilter === f;
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`relative px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'text-[#2484C6] font-extrabold'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="emp-status-active-pill"
                    className="absolute inset-0 rounded-md bg-[#2484C6]/15 border border-[#2484C6]/30"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{f === 'all' ? 'All Tasks' : f}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Active Task Cards Grid */}
      {loading ? (
        <div className="text-center py-24 flex flex-col items-center justify-center">
          <span className="w-10 h-10 border-2 border-[#2484C6]/30 border-t-[#2484C6] rounded-full animate-spin mb-4" />
          <span className="text-xs text-neutral-400">Syncing operating timelines...</span>
        </div>
      ) : filteredPhases.length === 0 ? (
        <div className={`p-12 text-center rounded-lg border border-dashed ${
          theme === 'dark' ? 'bg-neutral-900/20 border-neutral-700/60' : 'bg-neutral-50 border-neutral-250'
        }`}>
          <Layers className="w-10 h-10 text-neutral-500 mx-auto mb-3" />
          <h3 className="font-semibold text-sm mb-1">No tasks assigned here</h3>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'all'
              ? "We couldn't locate any of your assigned phases matching the active search filters."
              : "Splendid! No operational operational schedule targets are currently assigned to you."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredPhases.map(ph => {
            const modInfo = getModuleInfo(ph.moduleId);
            const isPending = ph.status !== 'Completed' && ph.status !== 'Done';
            
            return (
              <div
                key={ph.id}
                className={`p-5 rounded-lg border flex flex-col justify-between gap-4 transition-all hover-card-glow ${
                  theme === 'dark'
                    ? 'bg-[#1B1D21] border-[#B1B7C3]/15 shadow-black/40 shadow-md'
                    : 'bg-white border-neutral-200 shadow-neutral-200/40 shadow-md'
                }`}
              >
                <div className="space-y-3">
                  {/* Card Header (Course Identity) */}
                  <div className="flex items-start justify-between gap-2 border-b border-neutral-500/5 pb-2.5">
                    <div className="leading-tight">
                      <span className="font-mono text-[10px] font-bold text-[#2484C6]">
                        {modInfo.courseCode}
                      </span>
                      <p className="text-[11px] text-neutral-450 truncate max-w-[160px] font-medium mt-0.5">
                        {modInfo.courseName}
                      </p>
                    </div>
                    {getStatusBadge(ph.status)}
                  </div>

                  {/* Module details */}
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase font-bold text-neutral-400 tracking-wider">Module Coordinate</span>
                    <h3 className="text-xs font-bold text-neutral-200 dark:text-white flex items-center gap-1.5">
                      <span className="font-mono text-[11px] text-[#1DAA58]">{modInfo.code}</span>
                      <span className="text-neutral-400 font-normal">|</span>
                      <span className="truncate max-w-[200px]">{modInfo.name}</span>
                    </h3>
                    {modInfo.language && (
                      <span className="inline-block mt-1 px-1.5 py-0.5 bg-neutral-500/10 text-neutral-400 font-mono text-[9px] rounded uppercase">
                        🌐 {modInfo.language}
                      </span>
                    )}
                  </div>

                  {/* Operational Phase Details */}
                  <div className="p-3 rounded bg-neutral-500/5 space-y-1.5">
                    <span className="text-[9px] uppercase font-bold text-[#2484C6] tracking-wider block">Operational Target</span>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase text-neutral-200 dark:text-white">
                        {ph.phaseName}
                      </span>
                      <div className="text-right leading-none">
                        <span className="text-[8px] uppercase text-neutral-500 block">End Date Target</span>
                        <span className="font-mono text-xs text-rose-400 font-bold block mt-1">
                          {ph.internalEndDate || 'No Date'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Rejection Note if Rejected */}
                  {ph.status === 'Rejected' && ph.rejectionNote && (
                    <div className="p-3 rounded border border-purple-500/20 bg-purple-500/5 text-xs text-purple-300">
                      <p className="font-bold flex items-center gap-1 mb-1 text-purple-400">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>PM Rejection Review Note:</span>
                      </p>
                      <p className="italic leading-relaxed">"{ph.rejectionNote}"</p>
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="pt-3 border-t border-neutral-500/5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 text-[10px] text-neutral-450 font-mono">
                    <Clock className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Term: {ph.internalStartDate || '-'} to {ph.internalEndDate || '-'}</span>
                  </div>

                  {isPending ? (
                    <button
                      onClick={() => handleMarkAsDone(ph.id)}
                      className="px-3 py-1.5 bg-[#1DAA58] hover:brightness-110 active:scale-97 text-white text-xs font-bold rounded-md shadow-sm transition-all flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Mark as Completed</span>
                    </button>
                  ) : (
                    <span className="text-[10px] uppercase font-bold text-[#1DAA58] bg-[#1DAA58]/10 px-2 py-1 rounded">
                      Completed
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
