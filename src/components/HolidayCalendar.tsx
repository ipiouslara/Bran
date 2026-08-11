/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Trash2, RefreshCw } from 'lucide-react';
import { getHolidays, toggleHoliday, HolidayEntry } from '../lib/db';

interface HolidayCalendarProps {
  theme: 'dark' | 'light';
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toISODate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function HolidayCalendar({ theme, currentUser }: HolidayCalendarProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-based

  const [holidays, setHolidays] = useState<HolidayEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [labelModalDate, setLabelModalDate] = useState<string | null>(null);

  const isDark = theme === 'dark';
  const card = isDark ? 'theme-dark-skeuo' : 'theme-light-skeuo';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textSecondary = isDark ? 'text-neutral-400' : 'text-slate-600';

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getHolidays();
      setHolidays(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  // Calendar grid calculations
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const totalCells = Math.ceil((firstDayOfMonth + daysInMonth) / 7) * 7;

  const holidaySet = new Set(holidays.map(h => h.date));
  const monthHolidays = holidays
    .filter(h => {
      const [y, m] = h.date.split('-').map(Number);
      return y === viewYear && m - 1 === viewMonth;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const goToPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(v => v - 1); }
    else setViewMonth(m => m - 1);
  };
  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(v => v + 1); }
    else setViewMonth(m => m + 1);
  };

  const canManageHolidays = !currentUser || !currentUser.role || ['Admin', 'Project Manager', 'Lead', 'Employee'].includes(currentUser.role);

  const handleDayClick = (day: number) => {
    if (!canManageHolidays) return;
    const dayOfWeek = new Date(viewYear, viewMonth, day).getDay();
    // Weekends: automatically mark/unmark without label prompt
    const isoDate = toISODate(viewYear, viewMonth, day);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (isWeekend) return; // weekends are auto-highlighted, not manually toggled

    setSelectedDay(day);
    setLabelModalDate(isoDate);
    if (!holidaySet.has(isoDate)) {
      setLabelInput('');
    } else {
      const existing = holidays.find(h => h.date === isoDate);
      setLabelInput(existing?.label || '');
    }
  };

  const confirmToggle = async () => {
    if (!canManageHolidays || !labelModalDate) return;
    setToggling(labelModalDate);
    try {
      const label = labelInput.trim() || 'Holiday';
      await toggleHoliday(labelModalDate, label);
      await fetchHolidays();
    } catch (err: any) {
      console.error("Failed to toggle holiday:", err);
      alert(`Failed to save holiday: ${err?.message || 'Database operation failed.'}`);
    } finally {
      setToggling(null);
      setLabelModalDate(null);
      setSelectedDay(null);
      setLabelInput('');
    }
  };

  const removeHoliday = async (date: string) => {
    if (!canManageHolidays) return;
    setToggling(date);
    try {
      const existing = holidays.find(h => h.date === date);
      await toggleHoliday(date, existing?.label || '');
      await fetchHolidays();
    } catch (err: any) {
      console.error("Failed to remove holiday:", err);
      alert(`Failed to remove holiday: ${err?.message || 'Database operation failed.'}`);
    } finally {
      setToggling(null);
    }
  };

  const todayStr = toISODate(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className={`text-xl font-bold font-sans tracking-tight flex items-center gap-2 ${textPrimary}`}>
            <span>Holiday Calendar</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider bg-amber-500/15 text-amber-500 border border-amber-500/20">
              Corporate Operations
            </span>
          </h1>
          <p className={`text-xs mt-1 ${textSecondary}`}>
            Click any weekday to mark or unmark it as a company holiday. Weekends are auto-shaded.
          </p>
        </div>
        <button
          onClick={fetchHolidays}
          className={`p-2 rounded-md border flex items-center gap-1.5 text-xs transition-colors ${
            isDark
              ? 'bg-neutral-800 border-[#B1B7C3]/15 text-neutral-350 hover:text-white'
              : 'bg-white border-neutral-250 text-[#5A6072] hover:text-[#193661]'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* ===== CALENDAR GRID ===== */}
        <div className={`lg:col-span-2 p-4 skeuo-card-base ${card}`}>
          {/* Month Navigation */}
          <div className="flex items-center justify-between pb-3 border-b border-neutral-500/10 mb-3">
            <button
              onClick={goToPrevMonth}
              className={`p-1 rounded-md border transition-all ${
                isDark ? 'border-[#B1B7C3]/10 hover:bg-neutral-700 text-neutral-400 hover:text-white' : 'border-neutral-200 hover:bg-neutral-100 text-[#5A6072] hover:text-[#193661]'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <div className="text-center">
              <p className={`text-sm font-black tracking-tight ${textPrimary}`}>
                {MONTH_NAMES[viewMonth]}
              </p>
              <p className={`text-[10px] font-semibold mt-0.5 ${textSecondary}`}>{viewYear}</p>
            </div>

            <button
              onClick={goToNextMonth}
              className={`p-1 rounded-md border transition-all ${
                isDark ? 'border-[#B1B7C3]/10 hover:bg-neutral-700 text-neutral-400 hover:text-white' : 'border-neutral-200 hover:bg-neutral-100 text-[#5A6072] hover:text-[#193661]'
              }`}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Day Labels Row */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS.map(d => (
              <div
                key={d}
                className={`text-center text-[9px] font-bold uppercase tracking-wider py-0.5 ${
                  d === 'Sun' || d === 'Sat' ? 'text-rose-400/70' : textSecondary
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
              const isHoliday = holidaySet.has(isoDate);
              const isToggling = toggling === isoDate;

              let cellBg = '';
              let cellText = '';
              let cellBorder = '';

              if (isToday) {
                cellBg = '!bg-[#2484C6]';
                cellText = '!text-white font-bold';
                cellBorder = '!border-2 !border-[#2484C6]';
              } else if (isHoliday) {
                cellBg = isDark ? 'bg-amber-500/20' : 'bg-amber-50';
                cellText = 'text-amber-600 font-semibold';
                cellBorder = 'border border-amber-300';
              } else if (isWeekend) {
                cellBg = isDark ? 'bg-rose-500/5' : 'bg-slate-50';
                cellText = isDark ? 'text-rose-400/60' : 'text-rose-500/70 font-medium';
                cellBorder = isDark ? 'border border-rose-500/10' : 'border border-slate-200';
              } else {
                cellBg = isDark ? 'bg-neutral-800/40 hover:bg-neutral-700/60' : 'bg-white hover:bg-[#2484C6]/5';
                cellText = isDark ? 'text-neutral-300' : 'text-slate-800 font-medium';
                cellBorder = isDark ? 'border border-neutral-700/50 hover:border-[#2484C6]/30' : 'border border-slate-200 hover:border-[#2484C6]/40';
              }

              const cellShadow = isToday ? 'shadow-sm' : (isDark ? 'theme-dark-skeuo-cell' : 'theme-light-skeuo-cell');
              return (
                <div
                  key={cellIdx}
                  onClick={() => !isWeekend && !isToggling && handleDayClick(day)}
                  className={`aspect-square rounded-md flex flex-col items-center justify-center relative transition-all
                    ${cellBg} ${cellText} ${cellBorder} ${cellShadow}
                    ${!isWeekend ? 'cursor-pointer hover:scale-95' : 'cursor-default'}
                    ${isToggling ? 'opacity-50' : ''}
                  `}
                  title={isWeekend ? 'Weekend' : isHoliday ? holidays.find(h => h.date === isoDate)?.label : 'Click to mark as holiday'}
                >
                  <span className={`text-[15px] font-bold leading-none ${isToday ? '!text-white' : ''}`}>
                    {day}
                  </span>
                  {isHoliday && !isToday && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-500" />
                  )}
                  {isToday && (
                    <span className="text-[8px] font-bold !text-white/90 mt-0.5">TODAY</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className={`flex items-center gap-4 mt-4 pt-3 border-t border-neutral-500/10 text-[10px] ${textSecondary}`}>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded !bg-[#2484C6]" />
              <span>Today</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded ${isDark ? 'bg-amber-500/25 border border-amber-500/30' : 'bg-amber-50 border border-amber-200'}`} />
              <span>Holiday</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded ${isDark ? 'bg-rose-500/10 border border-rose-500/10' : 'bg-rose-50/60 border border-rose-200/60'}`} />
              <span>Weekend</span>
            </div>
          </div>
        </div>

        {/* ===== SIDEBAR: THIS MONTH'S HOLIDAYS ===== */}
        <div className="lg:col-span-1 space-y-4">
          <div className={`p-5 skeuo-card-base ${card}`}>
            <h2 className={`text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-1.5 ${textSecondary}`}>
              <Calendar className="w-4 h-4 text-[#2484C6]" />
              <span>{MONTH_NAMES[viewMonth]} Holidays</span>
            </h2>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-5 h-5 text-[#2484C6] animate-spin" />
              </div>
            ) : monthHolidays.length === 0 ? (
              <div className={`text-center py-8 text-xs ${textSecondary}`}>
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No holidays marked for this month.</p>
                <p className="mt-1 opacity-60">Click any weekday on the calendar to add one.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {monthHolidays.map((h, idx) => {
                  const [, , dayStr] = h.date.split('-');
                  const dayNum = parseInt(dayStr, 10);
                  const dayOfWeek = new Date(viewYear, viewMonth, dayNum).getDay();
                  const dayName = DAY_LABELS[dayOfWeek];
                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-xs ${
                        isDark
                          ? 'bg-amber-500/10 border-amber-500/20'
                          : 'bg-amber-50 border-amber-200/70'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <div className={`flex flex-col items-center justify-center w-8 h-8 rounded-md shrink-0 text-center ${
                          isDark ? 'bg-amber-500/20' : 'bg-amber-100'
                        }`}>
                          <span className="text-[9px] font-bold text-amber-500 uppercase">{dayName}</span>
                          <span className={`text-sm font-black leading-none ${isDark ? 'text-white' : 'text-[#193661]'}`}>{dayNum}</span>
                        </div>
                        <div className="min-w-0">
                          <p className={`font-bold truncate ${isDark ? 'text-white' : 'text-[#193661]'}`}>{h.label}</p>
                          <p className={`text-[10px] font-mono mt-0.5 ${isDark ? 'text-neutral-400' : 'text-[#5A6072]'}`}>{h.date}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeHoliday(h.date)}
                        disabled={toggling === h.date}
                        className={`p-1.5 rounded-md transition-all shrink-0 ml-2 ${
                          isDark
                            ? 'hover:bg-rose-500/20 text-neutral-500 hover:text-rose-400'
                            : 'hover:bg-rose-50 text-[#5A6072] hover:text-rose-500'
                        } ${toggling === h.date ? 'opacity-50' : ''}`}
                        title="Remove holiday"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className={`p-4 skeuo-card-base ${card}`}>
            <h3 className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${textSecondary}`}>
              Year Summary
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className={textSecondary}>Total Holidays ({viewYear})</span>
                <span className={`font-black text-amber-500`}>
                  {holidays.filter(h => h.date.startsWith(String(viewYear))).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className={textSecondary}>This Month</span>
                <span className={`font-bold ${isDark ? 'text-white' : 'text-[#193661]'}`}>
                  {monthHolidays.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== HOLIDAY LABEL MODAL ===== */}
      {labelModalDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setLabelModalDate(null); setSelectedDay(null); }} />
          <div className={`relative z-10 w-full max-w-sm mx-4 p-6 rounded-2xl border shadow-2xl ${
            isDark ? 'bg-[#1B1D21] border-[#B1B7C3]/20' : 'bg-white border-neutral-200'
          }`}>
            <h3 className={`text-sm font-black mb-1 ${textPrimary}`}>
              {holidaySet.has(labelModalDate) ? 'Remove Holiday' : 'Mark as Holiday'}
            </h3>
            <p className={`text-xs mb-4 ${textSecondary}`}>
              {labelModalDate} — {DAY_LABELS[new Date(labelModalDate).getDay()]}
            </p>

            {!holidaySet.has(labelModalDate) && (
              <div className="mb-4">
                <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1.5 ${textSecondary}`}>
                  Holiday Name / Label
                </label>
                <input
                  type="text"
                  value={labelInput}
                  onChange={e => setLabelInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmToggle()}
                  placeholder="e.g. Diwali, Independence Day"
                  autoFocus
                  className={`w-full px-3 py-2 rounded-lg border text-xs focus:ring-2 focus:ring-[#2484C6] focus:outline-none transition-all ${
                    isDark
                      ? 'bg-neutral-900 border-[#B1B7C3]/15 text-white placeholder-neutral-500'
                      : 'bg-neutral-50 border-neutral-300 text-[#193661] placeholder-[#5A6072]'
                  }`}
                />
              </div>
            )}

            {holidaySet.has(labelModalDate) && (
              <p className={`text-xs mb-4 p-3 rounded-lg ${isDark ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
                This will <strong>remove</strong> the holiday marking for this date.
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setLabelModalDate(null); setSelectedDay(null); }}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  isDark ? 'border-[#B1B7C3]/15 text-neutral-400 hover:text-white hover:bg-neutral-800' : 'border-neutral-200 text-[#5A6072] hover:text-[#193661] hover:bg-neutral-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={confirmToggle}
                disabled={!!toggling}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold text-white transition-all ${
                  holidaySet.has(labelModalDate)
                    ? 'bg-rose-500 hover:bg-rose-600'
                    : 'bg-[#2484C6] hover:bg-[#1a6fa8]'
                } ${toggling ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {toggling ? 'Saving...' : holidaySet.has(labelModalDate) ? 'Remove' : 'Mark Holiday'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
