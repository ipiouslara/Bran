/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar, Trash2, RefreshCw, X, Globe, RotateCcw, Plus } from 'lucide-react';
import { 
  getEffectiveHolidays, 
  addProjectHoliday, 
  overrideGlobalHoliday, 
  restoreGlobalHoliday, 
  removeProjectHoliday,
  EffectiveHoliday 
} from '../lib/db';
import { Project } from '../types';
import GlobalHolidaysModal from './GlobalHolidaysModal';
import { formatDateDDMMYYYY } from '../utils/dateFormatter';

interface ProjectHolidayModalProps {
  theme: 'dark' | 'light';
  project: Project;
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
  onClose: () => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toISODate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function ProjectHolidayModalComponent({ theme, project, currentUser, onClose }: ProjectHolidayModalProps) {
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());

  const [effectiveHolidays, setEffectiveHolidays] = useState<EffectiveHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  
  const [labelInput, setLabelInput] = useState('');
  const [selectedIsoDate, setSelectedIsoDate] = useState<string | null>(null);
  const [showGlobalModal, setShowGlobalModal] = useState(false);

  const isDark = theme === 'dark';

  const fetchEffectiveHolidays = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const data = await getEffectiveHolidays(project.id);
      setEffectiveHolidays(data);
    } catch (err: any) {
      console.error("Failed to load effective holidays:", err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    fetchEffectiveHolidays(true);
  }, [fetchEffectiveHolidays]);

  // Memoized Calendar Grid Boundaries
  const { firstDayOfMonth, daysInMonth, totalCells } = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = Math.ceil((firstDay + days) / 7) * 7;
    return { firstDayOfMonth: firstDay, daysInMonth: days, totalCells: cells };
  }, [viewYear, viewMonth]);

  // Memoized Holiday Lookup Map
  const holidayMap = useMemo(() => {
    const map = new Map<string, EffectiveHoliday>();
    effectiveHolidays.forEach(h => map.set(h.date, h));
    return map;
  }, [effectiveHolidays]);

  // Memoized Monthly Holiday Subset
  const monthHolidays = useMemo(() => {
    return effectiveHolidays
      .filter(h => {
        const [y, m] = h.date.split('-').map(Number);
        return y === viewYear && m - 1 === viewMonth;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [effectiveHolidays, viewYear, viewMonth]);

  const goToPrevMonth = useCallback(() => {
    setViewMonth(prev => {
      if (prev === 0) {
        setViewYear(y => y - 1);
        return 11;
      }
      return prev - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setViewMonth(prev => {
      if (prev === 11) {
        setViewYear(y => y + 1);
        return 0;
      }
      return prev + 1;
    });
  }, []);

  const canManageHolidays = useMemo(() => {
    return !currentUser || !currentUser.role || ['Admin', 'Project Manager'].includes(currentUser.role);
  }, [currentUser]);

  const handleDayClick = useCallback((day: number) => {
    if (!canManageHolidays) return;
    const dayOfWeek = new Date(viewYear, viewMonth, day).getDay();
    const isoDate = toISODate(viewYear, viewMonth, day);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (isWeekend) return;

    const existing = holidayMap.get(isoDate);
    setSelectedIsoDate(isoDate);
    setLabelInput(existing?.label || '');
  }, [canManageHolidays, viewYear, viewMonth, holidayMap]);

  const confirmAction = useCallback(async () => {
    if (!canManageHolidays || !selectedIsoDate) return;
    setBusyDate(selectedIsoDate);
    try {
      const existing = holidayMap.get(selectedIsoDate);

      if (!existing) {
        const label = labelInput.trim() || 'Project Holiday';
        await addProjectHoliday(project.id, project.name, selectedIsoDate, label);
      } else if (existing.type === 'global') {
        await overrideGlobalHoliday(project.id, project.name, selectedIsoDate, existing.label);
      } else if (existing.type === 'overridden') {
        await restoreGlobalHoliday(project.id, selectedIsoDate);
      } else if (existing.type === 'project') {
        await removeProjectHoliday(project.id, selectedIsoDate);
      }
      await fetchEffectiveHolidays(false);
    } catch (err: any) {
      console.error("Holiday action failed:", err);
      alert(`Operation failed: ${err?.message || 'Database error'}`);
    } finally {
      setBusyDate(null);
      setSelectedIsoDate(null);
      setLabelInput('');
    }
  }, [canManageHolidays, selectedIsoDate, holidayMap, labelInput, project.id, project.name, fetchEffectiveHolidays]);

  const handleRestore = useCallback(async (date: string) => {
    if (!canManageHolidays) return;
    setBusyDate(date);
    try {
      await restoreGlobalHoliday(project.id, date);
      await fetchEffectiveHolidays(false);
    } catch (err: any) {
      console.error("Restore failed:", err);
    } finally {
      setBusyDate(null);
    }
  }, [canManageHolidays, project.id, fetchEffectiveHolidays]);

  const handleRemoveProjectHoliday = useCallback(async (date: string) => {
    if (!canManageHolidays) return;
    setBusyDate(date);
    try {
      await removeProjectHoliday(project.id, date);
      await fetchEffectiveHolidays(false);
    } catch (err: any) {
      console.error("Remove failed:", err);
    } finally {
      setBusyDate(null);
    }
  }, [canManageHolidays, project.id, fetchEffectiveHolidays]);

  const handleOverrideGlobal = useCallback(async (date: string, label: string) => {
    if (!canManageHolidays) return;
    setBusyDate(date);
    try {
      await overrideGlobalHoliday(project.id, project.name, date, label);
      await fetchEffectiveHolidays(false);
    } catch (err: any) {
      console.error("Override failed:", err);
    } finally {
      setBusyDate(null);
    }
  }, [canManageHolidays, project.id, project.name, fetchEffectiveHolidays]);

  const handleGlobalModalChanged = useCallback(() => {
    fetchEffectiveHolidays(false);
  }, [fetchEffectiveHolidays]);

  const todayStr = useMemo(() => {
    const t = new Date();
    return toISODate(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  const modalJSX = (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl border shadow-2xl ${
          isDark ? 'bg-[#1B1D21] border-[#B1B7C3]/20 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-neutral-500/15">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#2484C6]/15 text-[#2484C6]">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#193661]'}`}>
                Holiday Calendar — <span className="text-[#2484C6] font-black">{project.name}</span>
              </h2>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-neutral-400' : 'text-slate-600'}`}>
                Project-scoped working days, global defaults, and PM custom overrides.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManageHolidays && (
              <button
                onClick={() => setShowGlobalModal(true)}
                className="px-2.5 py-1.5 rounded-md bg-[#2484C6] hover:bg-[#1a6ea8] text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="Manage company-wide global holidays"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Manage Global Holidays</span>
              </button>
            )}
            <button
              onClick={() => fetchEffectiveHolidays(true)}
              className={`p-1.5 rounded-md border text-xs flex items-center gap-1 transition-all ${
                isDark ? 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:text-white' : 'border-slate-200 bg-white text-slate-700 hover:text-slate-900'
              }`}
              title="Refresh effective holidays"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-md border text-xs transition-all ${
                isDark ? 'border-neutral-700 hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'border-slate-200 hover:bg-neutral-100 text-slate-600'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Calendar Grid Section */}
          <div className={`lg:col-span-2 p-4 rounded-xl border ${
            isDark ? 'bg-neutral-900/60 border-neutral-800' : 'bg-slate-50/70 border-slate-200'
          }`}>
            {/* Month Navigation */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-500/10 mb-3">
              <button
                onClick={goToPrevMonth}
                className={`p-1 rounded-md border transition-all ${
                  isDark ? 'border-neutral-700 hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'border-slate-200 hover:bg-white text-slate-600 hover:text-slate-900 shadow-xs'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="text-center">
                <p className={`text-sm font-black tracking-tight ${isDark ? 'text-white' : 'text-[#193661]'}`}>
                  {MONTH_NAMES[viewMonth]}
                </p>
                <p className={`text-[10px] font-semibold mt-0.5 ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>{viewYear}</p>
              </div>

              <button
                onClick={goToNextMonth}
                className={`p-1 rounded-md border transition-all ${
                  isDark ? 'border-neutral-700 hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'border-slate-200 hover:bg-white text-slate-600 hover:text-slate-900 shadow-xs'
                }`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Day Labels Row */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_LABELS.map(d => (
                <div
                  key={d}
                  className={`text-center text-[10px] font-bold uppercase tracking-wider py-1 ${
                    d === 'Sun' || d === 'Sat' ? 'text-rose-500 font-extrabold' : isDark ? 'text-neutral-400' : 'text-slate-700'
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Cells */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: totalCells }).map((_, cellIdx) => {
                const day = cellIdx - firstDayOfMonth + 1;
                const isCurrentMonth = day >= 1 && day <= daysInMonth;
                if (!isCurrentMonth) {
                  return <div key={cellIdx} className="aspect-square" />;
                }

                const isoDate = toISODate(viewYear, viewMonth, day);
                const dayOfWeek = new Date(viewYear, viewMonth, day).getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const isToday = isoDate === todayStr;
                const holidayInfo = holidayMap.get(isoDate);
                const isBusy = busyDate === isoDate;

                let cellBg = '';
                let cellText = '';
                let cellBorder = '';
                let stateDot = null;

                if (isToday) {
                  cellBg = '!bg-[#2484C6]';
                  cellText = '!text-white font-bold';
                  cellBorder = '!border-2 !border-[#2484C6]';
                } else if (holidayInfo?.type === 'global') {
                  cellBg = isDark ? 'bg-sky-500/20' : 'bg-sky-100';
                  cellText = isDark ? 'text-sky-300 font-bold' : 'text-sky-800 font-bold';
                  cellBorder = 'border border-sky-300';
                  stateDot = <span className="w-1.5 h-1.5 rounded-full bg-[#2484C6]" />;
                } else if (holidayInfo?.type === 'project') {
                  cellBg = isDark ? 'bg-emerald-500/20' : 'bg-emerald-100';
                  cellText = isDark ? 'text-emerald-300 font-bold' : 'text-emerald-800 font-bold';
                  cellBorder = 'border border-emerald-300';
                  stateDot = <span className="w-1.5 h-1.5 rounded-full bg-[#1DAA58]" />;
                } else if (holidayInfo?.type === 'overridden') {
                  cellBg = isDark ? 'bg-neutral-800/40' : 'bg-neutral-100';
                  cellText = 'line-through text-slate-400 dark:text-neutral-500 font-normal';
                  cellBorder = 'border border-dashed border-slate-300 dark:border-neutral-700';
                } else if (isWeekend) {
                  cellBg = isDark ? 'bg-rose-500/10' : 'bg-slate-150';
                  cellText = isDark ? 'text-rose-400/80 font-bold' : 'text-rose-600/80 font-bold';
                  cellBorder = isDark ? 'border border-rose-500/20' : 'border border-slate-200';
                } else {
                  cellBg = isDark ? 'bg-neutral-800/60 hover:bg-neutral-700/80' : 'bg-white hover:bg-[#2484C6]/10';
                  cellText = isDark ? 'text-neutral-200 font-medium' : 'text-slate-900 font-semibold';
                  cellBorder = isDark ? 'border border-neutral-700/60' : 'border border-slate-200';
                }

                return (
                  <div
                    key={cellIdx}
                    onClick={() => !isWeekend && !isBusy && handleDayClick(day)}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center relative transition-all shadow-xs
                      ${cellBg} ${cellText} ${cellBorder}
                      ${!isWeekend ? 'cursor-pointer hover:scale-95' : 'cursor-default'}
                      ${isBusy ? 'opacity-50' : ''}
                    `}
                    title={
                      isWeekend 
                        ? 'Weekend non-working day' 
                        : holidayInfo?.type === 'global' 
                        ? `Global Holiday: ${holidayInfo.label} (Click to override for this project)`
                        : holidayInfo?.type === 'project'
                        ? `Project Holiday: ${holidayInfo.label} (Click to edit/remove)`
                        : holidayInfo?.type === 'overridden'
                        ? `Overridden Global Holiday: ${holidayInfo.label} (Click to restore)`
                        : 'Click to add project holiday'
                    }
                  >
                    <span className={`text-[13px] leading-none ${isToday ? '!text-white' : ''}`}>
                      {day}
                    </span>
                    {!isToday && stateDot && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2">
                        {stateDot}
                      </span>
                    )}
                    {isToday && (
                      <span className="text-[7.5px] font-bold !text-white/90 mt-0.5">TODAY</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 3 Visual States Legend */}
            <div className={`flex items-center gap-4 mt-4 pt-3 border-t border-neutral-500/15 text-[10.5px] font-semibold flex-wrap ${
              isDark ? 'text-neutral-400' : 'text-slate-600'
            }`}>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-sky-200 border border-sky-400 flex items-center justify-center">
                  <Globe className="w-2 h-2 text-sky-700" />
                </span>
                <span>Global Company Holiday</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-200 border border-emerald-400" />
                <span>Project-Specific Holiday</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-neutral-200 border border-dashed border-neutral-400 line-through text-[8px] flex items-center justify-center text-slate-500">
                  ✕
                </span>
                <span>Removed for this Project</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded !bg-[#2484C6]" />
                <span>Today</span>
              </div>
            </div>
          </div>

          {/* Sidebar: Month Holidays List */}
          <div className="lg:col-span-1 space-y-4">
            <div className={`p-4 rounded-xl border ${
              isDark ? 'bg-neutral-900/60 border-neutral-800' : 'bg-slate-50/70 border-slate-200'
            }`}>
              <h3 className={`text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${
                isDark ? 'text-neutral-300' : 'text-slate-800'
              }`}>
                <Calendar className="w-3.5 h-3.5 text-[#2484C6]" />
                <span>{MONTH_NAMES[viewMonth]} Schedule</span>
              </h3>

              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <RefreshCw className="w-4 h-4 text-[#2484C6] animate-spin" />
                </div>
              ) : monthHolidays.length === 0 ? (
                <div className={`text-center py-6 text-xs ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
                  <Calendar className="w-6 h-6 mx-auto mb-2 opacity-30" />
                  <p>No holidays for this month.</p>
                  <p className="mt-0.5 text-[10px] opacity-70">Click any weekday on the grid to add one.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {monthHolidays.map((h, idx) => {
                    const [, , dayStr] = h.date.split('-');
                    const dayNum = parseInt(dayStr, 10);
                    const dayOfWeek = new Date(viewYear, viewMonth, dayNum).getDay();
                    const dayName = DAY_LABELS[dayOfWeek];

                    if (h.type === 'global') {
                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-2 rounded-lg border text-xs ${
                            isDark ? 'bg-sky-500/10 border-sky-500/20' : 'bg-sky-50 border-sky-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-md bg-sky-500/20 flex items-center justify-center shrink-0 text-[#2484C6]">
                              <Globe className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold truncate text-slate-900 dark:text-white text-[11px] flex items-center gap-1">
                                <span>{h.label}</span>
                              </p>
                              <p className="text-[9px] font-mono text-sky-600 dark:text-sky-400">Company Holiday • {formatDateDDMMYYYY(h.date)}</p>
                            </div>
                          </div>
                          {canManageHolidays && (
                            <button
                              onClick={() => handleOverrideGlobal(h.date, h.label)}
                              disabled={busyDate === h.date}
                              className="px-1.5 py-0.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded text-[9px] font-bold shrink-0 ml-1 transition-all"
                              title="Override/remove this company holiday for this project"
                            >
                              Override
                            </button>
                          )}
                        </div>
                      );
                    }

                    if (h.type === 'project') {
                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-2 rounded-lg border text-xs ${
                            isDark ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-md bg-emerald-500/20 flex flex-col items-center justify-center shrink-0">
                              <span className="text-[8px] font-bold text-emerald-600 uppercase">{dayName}</span>
                              <span className="text-xs font-black leading-none text-slate-900 dark:text-white">{dayNum}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold truncate text-slate-900 dark:text-white text-[11px]">{h.label}</p>
                              <p className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400">Project Holiday • {h.date}</p>
                            </div>
                          </div>
                          {canManageHolidays && (
                            <button
                              onClick={() => handleRemoveProjectHoliday(h.date)}
                              disabled={busyDate === h.date}
                              className="p-1 text-rose-500 hover:bg-rose-500/20 rounded transition-all shrink-0 ml-1"
                              title="Remove project holiday"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-2 rounded-lg border text-xs opacity-75 ${
                          isDark ? 'bg-neutral-800/40 border-neutral-700/60' : 'bg-neutral-100 border-neutral-250'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-md bg-neutral-500/20 flex items-center justify-center shrink-0 text-slate-400">
                            <X className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold truncate line-through text-slate-500 dark:text-neutral-400 text-[11px]">{h.label}</p>
                            <p className="text-[9px] text-rose-500 font-semibold">Removed for this project • {h.date}</p>
                          </div>
                        </div>
                        {canManageHolidays && (
                          <button
                            onClick={() => handleRestore(h.date)}
                            disabled={busyDate === h.date}
                            className="px-1.5 py-0.5 bg-[#2484C6]/15 hover:bg-[#2484C6]/25 text-[#2484C6] rounded text-[9px] font-bold flex items-center gap-0.5 shrink-0 ml-1 transition-all cursor-pointer"
                            title="Restore global holiday for this project"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Undo</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Prompt Modal */}
        {selectedIsoDate && (
          <div 
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedIsoDate(null); }}
          >
            <div 
              className={`relative z-10 w-full max-w-sm p-5 rounded-xl border shadow-2xl ${
                isDark ? 'bg-[#1B1D21] border-neutral-700 text-white' : 'bg-white border-slate-200 text-slate-900'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const existing = holidayMap.get(selectedIsoDate);
                if (!existing) {
                  return (
                    <>
                      <h4 className="text-xs font-bold uppercase tracking-wider mb-1 text-[#1DAA58] flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Project Holiday</span>
                      </h4>
                      <p className="text-xs text-neutral-400 mb-3">{selectedIsoDate}</p>
                      <div className="mb-4">
                        <label className="block text-[10px] uppercase font-bold text-neutral-400 mb-1">Holiday Name / Label</label>
                        <input
                          type="text"
                          value={labelInput}
                          onChange={e => setLabelInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && confirmAction()}
                          placeholder="e.g. Milestone Release Hold"
                          autoFocus
                          className={`w-full px-2.5 py-1.5 text-xs rounded border focus:ring-1 focus:ring-[#2484C6] ${
                            isDark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                        />
                      </div>
                    </>
                  );
                }

                if (existing.type === 'global') {
                  return (
                    <>
                      <h4 className="text-xs font-bold uppercase tracking-wider mb-1 text-sky-500 flex items-center gap-1">
                        <Globe className="w-3.5 h-3.5" />
                        <span>Override Global Holiday</span>
                      </h4>
                      <p className="text-xs text-neutral-400 mb-3">{selectedIsoDate} — {existing.label}</p>
                      <p className="text-xs leading-relaxed mb-4 text-slate-600 dark:text-neutral-300">
                        This is a company-wide global holiday. Do you want to <strong>remove/override</strong> it for project <span className="text-[#2484C6] font-bold">{project.name}</span>?
                      </p>
                    </>
                  );
                }

                if (existing.type === 'overridden') {
                  return (
                    <>
                      <h4 className="text-xs font-bold uppercase tracking-wider mb-1 text-[#2484C6] flex items-center gap-1">
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore Global Holiday</span>
                      </h4>
                      <p className="text-xs text-neutral-400 mb-3">{selectedIsoDate} — {existing.label}</p>
                      <p className="text-xs leading-relaxed mb-4 text-slate-600 dark:text-neutral-300">
                        This global holiday was removed for this project. Do you want to <strong>restore</strong> it back to the company default?
                      </p>
                    </>
                  );
                }

                return (
                  <>
                    <h4 className="text-xs font-bold uppercase tracking-wider mb-1 text-rose-500 flex items-center gap-1">
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove Project Holiday</span>
                    </h4>
                    <p className="text-xs text-neutral-400 mb-3">{selectedIsoDate} — {existing.label}</p>
                    <p className="text-xs leading-relaxed mb-4 text-slate-600 dark:text-neutral-300">
                      Remove project-specific holiday <strong>"{existing.label}"</strong> from {project.name}?
                    </p>
                  </>
                );
              })()}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setSelectedIsoDate(null); setLabelInput(''); }}
                  className={`flex-1 py-1.5 rounded text-xs font-semibold border ${
                    isDark ? 'border-neutral-700 text-neutral-400 hover:bg-neutral-800' : 'border-slate-300 text-slate-700 hover:bg-neutral-100'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAction}
                  disabled={!!busyDate}
                  className="flex-1 py-1.5 rounded text-xs font-bold text-white bg-[#2484C6] hover:bg-[#1a6ea8] transition-all cursor-pointer"
                >
                  {busyDate ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Holidays Management Sub-Modal */}
        {showGlobalModal && (
          <GlobalHolidaysModal
            theme={theme}
            currentUser={currentUser}
            onClose={() => setShowGlobalModal(false)}
            onChanged={handleGlobalModalChanged}
          />
        )}

      </div>
    </div>
  );

  return createPortal(modalJSX, document.body);
}

export default React.memo(ProjectHolidayModalComponent, (prev, next) => {
  return (
    prev.project.id === next.project.id &&
    prev.theme === next.theme &&
    prev.currentUser?.id === next.currentUser?.id &&
    prev.currentUser?.role === next.currentUser?.role
  );
});
