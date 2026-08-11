/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Filter, 
  SlidersHorizontal,
  Layers, 
  AlertCircle,
  Briefcase,
  UserCheck,
  RefreshCw,
  X
} from 'lucide-react';
import { getEmployeeCapacityData, EmployeeCapacitySummary } from '../lib/db';
import { formatDateLocal } from '../utils/workingDays';
import TableSkeleton from './skeletons/TableSkeleton';

interface CapacityAllocationProps {
  theme: 'dark' | 'light';
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
  refreshTrigger?: number;
}

export default function CapacityAllocation({ theme, currentUser, refreshTrigger = 0 }: CapacityAllocationProps) {
  // Date window presets
  const today = new Date();
  const defaultStart = formatDateLocal(today);
  const defaultEndObj = new Date(today);
  defaultEndObj.setDate(defaultEndObj.getDate() + 30);
  const defaultEnd = formatDateLocal(defaultEndObj);

  const [startDate, setStartDate] = useState<string>(defaultStart);
  const [endDate, setEndDate] = useState<string>(defaultEnd);
  const [activePreset, setActivePreset] = useState<'14days' | 'month' | '30days' | 'custom'>('30days');

  // Data & UI states
  const [summaries, setSummaries] = useState<EmployeeCapacitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');

  // Expanded employee drawers
  const [expandedEmployees, setExpandedEmployees] = useState<Record<string, boolean>>({});

  const applyPreset = (preset: '14days' | 'month' | '30days') => {
    setActivePreset(preset);
    const now = new Date();
    const startStr = formatDateLocal(now);

    if (preset === '14days') {
      const target = new Date(now);
      target.setDate(target.getDate() + 14);
      setStartDate(startStr);
      setEndDate(formatDateLocal(target));
    } else if (preset === 'month') {
      const year = now.getFullYear();
      const month = now.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      setStartDate(startStr);
      setEndDate(formatDateLocal(lastDay));
    } else if (preset === '30days') {
      const target = new Date(now);
      target.setDate(target.getDate() + 30);
      setStartDate(startStr);
      setEndDate(formatDateLocal(target));
    }
  };

  const loadCapacityData = async () => {
    if (!startDate || !endDate) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getEmployeeCapacityData(startDate, endDate);
      setSummaries(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load employee capacity data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCapacityData();
  }, [startDate, endDate, refreshTrigger, refreshCounter]);

  const toggleExpand = (empId: string) => {
    setExpandedEmployees(prev => ({ ...prev, [empId]: !prev[empId] }));
  };

  // KPI Overview calculations
  const stats = useMemo(() => {
    const total = summaries.length;
    const green = summaries.filter(s => s.statusCategory === 'green').length;
    const yellow = summaries.filter(s => s.statusCategory === 'yellow').length;
    const red = summaries.filter(s => s.statusCategory === 'red').length;
    const avgCap = total > 0 ? Math.round(summaries.reduce((acc, s) => acc + s.capacityPercentage, 0) / total) : 0;
    return { total, green, yellow, red, avgCap };
  }, [summaries]);

  // Filtered summaries
  const filteredSummaries = useMemo(() => {
    return summaries.filter(emp => {
      const matchesSearch = 
        emp.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.employeeEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.employeeDesignation.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCat = categoryFilter === 'all' || emp.statusCategory === categoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [summaries, searchTerm, categoryFilter]);

  const getCapacityColor = (category: 'green' | 'yellow' | 'red') => {
    switch (category) {
      case 'green':
        return {
          bar: 'bg-emerald-500',
          badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          label: 'Optimal Workload (0-80%)'
        };
      case 'yellow':
        return {
          bar: 'bg-amber-500',
          badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          label: 'Fully Booked (81-100%)'
        };
      case 'red':
        return {
          bar: 'bg-rose-500',
          badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          label: 'Over-allocated (>100%)'
        };
    }
  };

  return (
    <div id="capacity-allocation-page" className="-mt-6 space-y-6 animate-fade-up bg-[var(--bg-page)] text-[var(--text-main)] transition-colors duration-150">
      {/* ── 1. Minimalist Title & Horizon & Filters Header Bar (Matching Overview Page) ── */}
      <div className="h-[52px] flex items-center justify-between border-b border-[var(--border-subtle)] px-0">
        {/* Left Section: Title + Horizon Selector + Filters Button */}
        <div className="flex items-center gap-4">
          <h1 className={`text-2xl font-black tracking-tight ${theme === 'light' ? 'bg-gradient-to-r from-[#1DAA58] to-[#2484C6] bg-clip-text text-transparent' : 'text-white'}`}>Capacity &amp; Allocation</h1>

          {/* Horizon Date Presets matching Overview page */}
          <div className="flex items-center gap-1 bg-[var(--input-bg)] p-1 rounded-lg border border-[var(--border-subtle)] relative">
            {(['14days', 'month', '30days'] as const).map((h) => {
              const isActive = activePreset === h;
              return (
                <button
                  key={h}
                  onClick={() => applyPreset(h)}
                  className={`relative px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    isActive
                      ? 'text-[var(--text-main)] font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="capacity-horizon-active-pill"
                      className="absolute inset-0 rounded-md bg-[var(--bg-card)] shadow-xs border border-[var(--border-subtle)]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">
                    {h === '14days' ? '14 Days' : h === 'month' ? 'This Month' : 'Next 30 Days'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Filters Button (Matching Development Progress page style) */}
          <button
            type="button"
            onClick={() => setIsFilterModalOpen(true)}
            className="px-3 py-1 text-xs font-semibold rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-main)] flex items-center gap-2 transition-all cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            {(startDate !== defaultStart || endDate !== defaultEnd || categoryFilter !== 'all') && (
              <span className="w-2 h-2 rounded-full bg-[#2484C6]" />
            )}
          </button>
        </div>

        {/* Right Section: Inline Search Bar + Refresh Button */}
        <div className="flex items-center gap-2">
          {/* Top Right Search Input (Matching Projects Page style) */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search name, designation..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-[var(--input-bg)] text-[var(--text-main)] border border-[var(--border-subtle)] focus:outline-none focus:ring-1 focus:ring-[#1DAA58] transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2 text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Refresh Button (Matching All Other Pages) */}
          <button
            onClick={() => setRefreshCounter(prev => prev + 1)}
            className="px-3 py-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold shrink-0"
            title="Refresh capacity data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
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

      {/* ── 2. KPI Capacity Metric Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Total Active</span>
            <span className="text-xl font-bold text-[var(--text-main)] mt-0.5 block">{stats.total}</span>
          </div>
          <Users className="w-6 h-6 text-[var(--text-muted)] opacity-60" />
        </div>

        <div className="p-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] uppercase font-bold text-emerald-500 dark:text-emerald-400 block">Optimal</span>
            <span className="text-xl font-bold text-emerald-500 dark:text-emerald-400 mt-0.5 block">{stats.green}</span>
          </div>
          <CheckCircle2 className="w-6 h-6 text-emerald-500/50" />
        </div>

        <div className="p-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] uppercase font-bold text-amber-500 dark:text-amber-400 block">Fully Booked</span>
            <span className="text-xl font-bold text-amber-500 dark:text-amber-400 mt-0.5 block">{stats.yellow}</span>
          </div>
          <Clock className="w-6 h-6 text-amber-500/50" />
        </div>

        <div className="p-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[10px] uppercase font-bold text-rose-500 dark:text-rose-400 block">Over-allocated</span>
            <span className="text-xl font-bold text-rose-500 dark:text-rose-400 mt-0.5 block">{stats.red}</span>
          </div>
          <AlertTriangle className="w-6 h-6 text-rose-500/50" />
        </div>

        <div className="p-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl flex items-center justify-between col-span-2 sm:col-span-1 shadow-lg">
          <div>
            <span className="text-[10px] uppercase font-bold text-cyan-500 dark:text-cyan-400 block">Avg Capacity</span>
            <span className="text-xl font-bold text-cyan-500 dark:text-cyan-400 mt-0.5 block">{stats.avgCap}%</span>
          </div>
          <Layers className="w-6 h-6 text-cyan-500/50" />
        </div>
      </div>

      {/* ── 3. Employee Workload Allocation List ── */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-xl overflow-hidden">
        {!loading && filteredSummaries.length === 0 ? (
          <div className="text-center py-16 text-neutral-500 border border-dashed border-neutral-800 rounded-xl m-6">
            <Users className="w-8 h-8 text-neutral-500 mx-auto mb-2" />
            <p className="text-xs font-semibold text-neutral-400">No personnel entries match the chosen filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {filteredSummaries.map(emp => {
              const colors = getCapacityColor(emp.statusCategory);
              const isExpanded = !!expandedEmployees[emp.employeeId];

              return (
                <div key={emp.employeeId} className="p-4 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Employee Profile */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-full bg-[var(--input-bg)] border border-[var(--border-subtle)] flex items-center justify-center text-xs font-bold text-[var(--text-main)] shrink-0">
                        {emp.employeeName.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-[var(--text-main)] truncate">{emp.employeeName}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[var(--input-bg)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                            {emp.employeeDesignation}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{emp.employeeEmail}</p>
                      </div>
                    </div>

                    {/* Workload Progress & Metrics */}
                    <div className="flex items-center gap-4 min-w-[280px]">
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-[var(--text-muted)] text-[10px] uppercase font-bold">{colors.label}</span>
                          <span className="font-bold text-[var(--text-main)] font-mono">{emp.capacityPercentage}%</span>
                        </div>
                        <div className="w-full h-2 bg-[var(--input-bg)] rounded-full overflow-hidden border border-[var(--border-subtle)]">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                            style={{ width: `${Math.min(emp.capacityPercentage, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono">
                          <span>{emp.allocatedWorkingDays} allocated days</span>
                          <span>{emp.availableWorkingDays} window working days</span>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleExpand(emp.employeeId)}
                        className="p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all shrink-0 cursor-pointer"
                        title={isExpanded ? "Collapse phase breakdown" : "Expand phase breakdown"}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Phase Allocation Breakdown Drawer */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-3 bg-[var(--input-bg)] rounded-xl p-3">
                      <h4 className="text-[10px] uppercase font-bold text-[var(--text-muted)] flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-[#2484C6]" />
                        <span>Assigned Project Phase Allocations ({emp.assignedPhases.length})</span>
                      </h4>

                      {emp.assignedPhases.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] italic">No project phase assignments active in this date window.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs font-mono">
                            <thead>
                              <tr className="text-[10px] text-[var(--text-muted)] uppercase border-b border-[var(--border-subtle)]">
                                <th className="py-1.5 px-2">Project</th>
                                <th className="py-1.5 px-2">Module</th>
                                <th className="py-1.5 px-2">Phase</th>
                                <th className="py-1.5 px-2">Start Date</th>
                                <th className="py-1.5 px-2">End Date</th>
                                <th className="py-1.5 px-2 text-right">Window Days</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-subtle)]">
                              {emp.assignedPhases.map((phase, idx) => (
                                <tr key={idx} className="hover:bg-[var(--bg-card-hover)]">
                                  <td className="py-1.5 px-2 font-sans font-bold text-[var(--text-main)]">{phase.projectName}</td>
                                  <td className="py-1.5 px-2 text-[var(--text-muted)]">{phase.moduleCodeName}</td>
                                  <td className="py-1.5 px-2 text-[var(--text-main)] font-semibold">{phase.phaseName}</td>
                                  <td className="py-1.5 px-2 text-[var(--text-muted)]">{phase.startDate}</td>
                                  <td className="py-1.5 px-2 text-[var(--text-muted)]">{phase.endDate}</td>
                                  <td className="py-1.5 px-2 text-right font-bold text-emerald-500 dark:text-emerald-400">{phase.workingDaysInWindow}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 4. Filter Modal Popover (Development Progress Style) ── */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsFilterModalOpen(false)} />
          <div className="relative w-full max-w-md rounded-3xl border border-[#3A3F4A] bg-[#101214] p-6 shadow-2xl space-y-5 text-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-white">Capacity &amp; Allocation Filters</h2>
                <p className="text-xs text-neutral-400">Refine calculation window dates and workload status</p>
              </div>
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="rounded-full p-2 text-neutral-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-widest text-neutral-400 mb-1.5">Window Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => {
                    setStartDate(e.target.value);
                    setActivePreset('custom');
                  }}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-[#111316] border border-[#2C303B] text-white focus:ring-1 focus:ring-[#2484C6] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold tracking-widest text-neutral-400 mb-1.5">Window End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => {
                    setEndDate(e.target.value);
                    setActivePreset('custom');
                  }}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-[#111316] border border-[#2C303B] text-white focus:ring-1 focus:ring-[#2484C6] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold tracking-widest text-neutral-400 mb-1.5">Capacity Workload Status</label>
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-[#111316] border border-[#2C303B] text-white focus:ring-1 focus:ring-[#2484C6] focus:outline-hidden"
                >
                  <option value="all">All Workload Statuses</option>
                  <option value="green">Optimal (0 - 80%)</option>
                  <option value="yellow">Fully Booked (81 - 100%)</option>
                  <option value="red">Over-allocated (&gt;100%)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setStartDate(defaultStart);
                  setEndDate(defaultEnd);
                  setCategoryFilter('all');
                  setActivePreset('30days');
                }}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-900 transition-all cursor-pointer"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="px-4 py-2 bg-[#2484C6] hover:brightness-110 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
