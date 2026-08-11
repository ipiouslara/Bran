/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
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
  Layers, 
  AlertCircle,
  Briefcase,
  UserCheck
} from 'lucide-react';
import { getEmployeeCapacityData, EmployeeCapacitySummary } from '../lib/db';
import { formatDateLocal } from '../utils/workingDays';

interface EmployeeCapacityProps {
  theme: 'dark' | 'light';
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
  refreshTrigger?: number;
}

export default function EmployeeCapacity({ theme, currentUser, refreshTrigger = 0 }: EmployeeCapacityProps) {
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
      setStartDate(formatDateLocal(firstDay));
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
  }, [startDate, endDate, refreshTrigger]);

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
    <div className="space-y-6">
      {/* Top Filter & Date Range Header */}
      <div className={`p-5 rounded-lg border shadow-sm ${
        theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15 text-white' : 'bg-white border-neutral-200 text-neutral-900'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-neutral-500/10">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#2484C6]" />
              <span>Employee Capacity & Workload Allocation</span>
            </h2>
            <p className="text-xs text-neutral-450 mt-1">
              Real-time resource capacity matrix accounting for weekends and company holidays
            </p>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => applyPreset('14days')}
              className={`px-3 py-1.5 text-xs font-semibold rounded cursor-pointer transition-colors ${
                activePreset === '14days' 
                  ? 'bg-[#2484C6] text-white' 
                  : theme === 'dark' ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-750' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              Next 14 Days
            </button>
            <button
              onClick={() => applyPreset('month')}
              className={`px-3 py-1.5 text-xs font-semibold rounded cursor-pointer transition-colors ${
                activePreset === 'month' 
                  ? 'bg-[#2484C6] text-white' 
                  : theme === 'dark' ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-750' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => applyPreset('30days')}
              className={`px-3 py-1.5 text-xs font-semibold rounded cursor-pointer transition-colors ${
                activePreset === '30days' 
                  ? 'bg-[#2484C6] text-white' 
                  : theme === 'dark' ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-750' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              Next 30 Days
            </button>
          </div>
        </div>

        {/* Custom Date Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 items-end">
          <div>
            <label className={`block text-[10px] uppercase font-bold mb-1 ${theme === 'dark' ? 'text-neutral-400' : 'text-slate-700'}`}>Window Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                setActivePreset('custom');
              }}
              className={`w-full px-3 py-1.5 rounded text-xs border focus:ring-1 focus:ring-[#2484C6] focus:outline-hidden ${
                theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-slate-300 text-slate-900 shadow-xs'
              }`}
            />
          </div>

          <div>
            <label className={`block text-[10px] uppercase font-bold mb-1 ${theme === 'dark' ? 'text-neutral-400' : 'text-slate-700'}`}>Window End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                setActivePreset('custom');
              }}
              className={`w-full px-3 py-1.5 rounded text-xs border focus:ring-1 focus:ring-[#2484C6] focus:outline-hidden ${
                theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-slate-300 text-slate-900 shadow-xs'
              }`}
            />
          </div>

          <div>
            <label className={`block text-[10px] uppercase font-bold mb-1 ${theme === 'dark' ? 'text-neutral-400' : 'text-slate-700'}`}>Search Employee</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, designation..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className={`w-full pl-9 pr-3 py-1.5 rounded text-xs border focus:ring-1 focus:ring-[#2484C6] focus:outline-hidden ${
                  theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 shadow-xs'
                }`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-[10px] uppercase font-bold mb-1 ${theme === 'dark' ? 'text-neutral-400' : 'text-slate-700'}`}>Filter Capacity</label>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value as any)}
              className={`w-full px-3 py-1.5 rounded text-xs border focus:ring-1 focus:ring-[#2484C6] focus:outline-hidden ${
                theme === 'dark' ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-white border-slate-300 text-slate-900 shadow-xs'
              }`}
            >
              <option value="all">All Capacity Thresholds</option>
              <option value="green">🟢 Optimal (0 - 80%)</option>
              <option value="yellow">🟡 Fully Booked (81 - 100%)</option>
              <option value="red">🔴 Over-allocated (&gt; 100%)</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI Overview Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className={`p-4 rounded-lg border shadow-xs ${
          theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15' : 'bg-white border-neutral-200'
        }`}>
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Members</span>
            <Users className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-xl font-extrabold">{stats.total}</p>
          <span className="text-[10px] text-neutral-450 mt-0.5 block">Active team members</span>
        </div>

        <div className={`p-4 rounded-lg border shadow-xs ${
          theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15' : 'bg-white border-neutral-200'
        }`}>
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Optimal Workload</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <p className="text-xl font-extrabold text-emerald-400">{stats.green}</p>
          <span className="text-[10px] text-neutral-450 mt-0.5 block">0 - 80% Capacity</span>
        </div>

        <div className={`p-4 rounded-lg border shadow-xs ${
          theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15' : 'bg-white border-neutral-200'
        }`}>
          <div className="flex items-center justify-between text-amber-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Fully Booked</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-xl font-extrabold text-amber-400">{stats.yellow}</p>
          <span className="text-[10px] text-neutral-450 mt-0.5 block">81 - 100% Capacity</span>
        </div>

        <div className={`p-4 rounded-lg border shadow-xs ${
          theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15' : 'bg-white border-neutral-200'
        }`}>
          <div className="flex items-center justify-between text-rose-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Over-allocated</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <p className="text-xl font-extrabold text-rose-400">{stats.red}</p>
          <span className="text-[10px] text-neutral-450 mt-0.5 block">&gt; 100% Capacity</span>
        </div>

        <div className={`p-4 rounded-lg border shadow-xs col-span-2 sm:col-span-1 ${
          theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15' : 'bg-white border-neutral-200'
        }`}>
          <div className="flex items-center justify-between text-sky-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Avg Capacity</span>
            <UserCheck className="w-4 h-4" />
          </div>
          <p className="text-xl font-extrabold">{stats.avgCap}%</p>
          <span className="text-[10px] text-neutral-450 mt-0.5 block">Team workload average</span>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Capacity Table & Cards */}
      <div className={`p-5 rounded-lg border shadow-sm space-y-4 ${
        theme === 'dark' ? 'bg-[#1B1D21] border-[#B1B7C3]/15 text-white' : 'bg-white border-neutral-200 text-neutral-900'
      }`}>
        <div className="flex items-center justify-between pb-2 border-b border-neutral-500/10">
          <h3 className="text-sm font-semibold">Resource Workload Matrix</h3>
          <span className="text-xs text-neutral-400">
            Showing {filteredSummaries.length} of {summaries.length} team members
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-xs text-neutral-400">
            Calculating working days & workload allocations...
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="text-center py-12 text-xs text-neutral-400 border border-dashed rounded-lg">
            No employees found matching the current search & capacity filter.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSummaries.map(emp => {
              const colorInfo = getCapacityColor(emp.statusCategory);
              const isExpanded = !!expandedEmployees[emp.employeeId];

              return (
                <div 
                  key={emp.employeeId}
                  className={`border rounded-lg overflow-hidden transition-all ${
                    theme === 'dark' ? 'border-neutral-800 bg-neutral-900/40 hover:bg-neutral-850/40' : 'border-neutral-250 bg-neutral-50 hover:bg-white'
                  }`}
                >
                  {/* Summary Bar */}
                  <div 
                    className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
                    onClick={() => toggleExpand(emp.employeeId)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#2484C6]/20 text-[#2484C6] flex items-center justify-center font-bold text-xs shrink-0">
                        {emp.employeeName.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold">{emp.employeeName}</h4>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colorInfo.badge}`}>
                            {emp.capacityPercentage}% Capacity
                          </span>
                          {emp.overlappingPhaseCount > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>{emp.overlappingPhaseCount} Overlapping Overlaps</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-450 mt-0.5">
                          {emp.employeeDesignation} • {emp.employeeRole} • {emp.assignedPhases.length} Active Phase(s)
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar & Toggle */}
                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                      <div className="w-48 space-y-1">
                        <div className="flex justify-between text-[10px] font-semibold text-neutral-400">
                          <span>{emp.allocatedWorkingDays} allocated days</span>
                          <span>/ {emp.availableWorkingDays} days</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-neutral-700/30 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${colorInfo.bar}`}
                            style={{ width: `${Math.min(emp.capacityPercentage, 100)}%` }}
                          />
                        </div>
                      </div>

                      <button className={`p-1 rounded ${theme === 'dark' ? 'text-neutral-400 hover:text-white' : 'text-slate-700 hover:text-slate-950'}`}>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Phase Allocation Breakdown */}
                  {isExpanded && (
                    <div className="p-4 border-t border-neutral-500/10 bg-neutral-950/20 space-y-3">
                      <h5 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-[#2484C6]" />
                        <span>Allocated Phase Details ({emp.assignedPhases.length})</span>
                      </h5>

                      {emp.assignedPhases.length === 0 ? (
                        <p className="text-xs text-neutral-450 italic">
                          No active phases assigned to this team member in the selected date window.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-xs text-left">
                            <thead>
                              <tr className={theme === 'dark' ? 'bg-neutral-900/60 border-b border-neutral-800' : 'bg-neutral-100 border-b border-neutral-250'}>
                                <th className="p-2 font-semibold">Phase Name</th>
                                <th className="p-2 font-semibold">Project</th>
                                <th className="p-2 font-semibold">Course & Module</th>
                                <th className="p-2 font-semibold text-center">Start Date</th>
                                <th className="p-2 font-semibold text-center">End Date</th>
                                <th className="p-2 font-semibold text-center">Days in Window</th>
                                <th className="p-2 font-semibold text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {emp.assignedPhases.map(ph => (
                                <tr key={ph.id} className="border-b border-neutral-800/40 hover:bg-neutral-800/20">
                                  <td className="p-2 font-semibold">{ph.phaseName}</td>
                                  <td className="p-2 text-neutral-400">{ph.projectName}</td>
                                  <td className="p-2 text-neutral-400 font-mono text-[11px]">{ph.moduleCodeName}</td>
                                  <td className="p-2 text-center text-neutral-400">{ph.startDate || '-'}</td>
                                  <td className="p-2 text-center text-neutral-400">{ph.endDate || '-'}</td>
                                  <td className="p-2 text-center font-bold text-sky-400">{ph.workingDaysInWindow} working day(s)</td>
                                  <td className="p-2 text-center">
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                                      {ph.status}
                                    </span>
                                  </td>
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
    </div>
  );
}
