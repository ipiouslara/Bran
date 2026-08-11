/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Trash2, Plus, RefreshCw, X } from 'lucide-react';
import { getGlobalHolidays, toggleGlobalHoliday, deleteGlobalHoliday, GlobalHoliday } from '../lib/db';

interface GlobalHolidaysModalProps {
  theme: 'dark' | 'light';
  currentUser?: { email: string; role: string; id?: string; name?: string } | null;
  onClose: () => void;
  onChanged?: () => void;
}

function GlobalHolidaysModalComponent({ theme, currentUser, onClose, onChanged }: GlobalHolidaysModalProps) {
  const [globalHolidays, setGlobalHolidays] = useState<GlobalHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDark = theme === 'dark';

  const fetchGlobalHolidays = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    setError(null);
    try {
      const data = await getGlobalHolidays();
      setGlobalHolidays(data);
    } catch (err: any) {
      console.error("Failed to load global holidays:", err);
      setError(err?.message || "Failed to load company holidays.");
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGlobalHolidays(true);
  }, [fetchGlobalHolidays]);

  const handleAddGlobalHoliday = useCallback(async () => {
    if (!newDate.trim()) {
      setError("Please select a date.");
      return;
    }
    const label = newLabel.trim() || 'Company Holiday';
    setBusyDate(newDate);
    setError(null);
    try {
      await toggleGlobalHoliday(newDate, label);
      setNewDate('');
      setNewLabel('');
      await fetchGlobalHolidays(false);
      if (onChanged) onChanged();
    } catch (err: any) {
      console.error("Failed to add global holiday:", err);
      setError(err?.message || "Failed to save global holiday.");
    } finally {
      setBusyDate(null);
    }
  }, [newDate, newLabel, fetchGlobalHolidays, onChanged]);

  const handleDeleteGlobalHoliday = useCallback(async (date: string) => {
    setBusyDate(date);
    setError(null);
    try {
      await deleteGlobalHoliday(date);
      await fetchGlobalHolidays(false);
      if (onChanged) onChanged();
    } catch (err: any) {
      console.error("Failed to delete global holiday:", err);
      setError(err?.message || "Failed to delete global holiday.");
    } finally {
      setBusyDate(null);
    }
  }, [fetchGlobalHolidays, onChanged]);

  const canManage = useMemo(() => {
    return !currentUser || !currentUser.role || ['Admin', 'Project Manager'].includes(currentUser.role);
  }, [currentUser]);

  const modalJSX = (
    <div 
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div 
        className={`relative w-full max-w-xl max-h-[85vh] overflow-y-auto p-6 rounded-2xl border shadow-2xl ${
          isDark ? 'bg-[#1B1D21] border-[#B1B7C3]/20 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-neutral-500/15">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#2484C6]/15 text-[#2484C6]">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#193661]'}`}>
                Manage Global Default Holidays
              </h3>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-neutral-400' : 'text-slate-600'}`}>
                Company-wide default non-working days inherited by all project calendars.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-md border text-xs transition-all ${
              isDark ? 'border-neutral-700 hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'border-slate-200 hover:bg-neutral-100 text-slate-600'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Add Global Holiday Form */}
        {canManage && (
          <div className={`p-4 rounded-xl border mb-5 ${
            isDark ? 'bg-neutral-900/60 border-neutral-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <h4 className="text-xs font-bold uppercase tracking-wider mb-2 text-[#2484C6] flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span>Add Company Default Holiday</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-400 mb-1">Date</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className={`w-full px-2.5 py-1.5 text-xs rounded border focus:ring-1 focus:ring-[#2484C6] ${
                    isDark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-neutral-400 mb-1">Holiday Name</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddGlobalHoliday()}
                  placeholder="e.g. Founder's Day"
                  className={`w-full px-2.5 py-1.5 text-xs rounded border focus:ring-1 focus:ring-[#2484C6] ${
                    isDark ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
              <button
                onClick={handleAddGlobalHoliday}
                disabled={busyDate === newDate}
                className="py-1.5 px-3 bg-[#2484C6] hover:bg-[#1a6ea8] text-white text-xs font-bold rounded flex items-center justify-center gap-1 transition-all cursor-pointer"
              >
                {busyDate === newDate ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Add Holiday</span>
              </button>
            </div>
          </div>
        )}

        {/* Global Holidays Table */}
        <div className={`rounded-xl border overflow-hidden ${
          isDark ? 'border-neutral-800 bg-neutral-900/40' : 'border-slate-200 bg-white'
        }`}>
          <div className="p-3 border-b border-neutral-500/10 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-neutral-400">
              Active Company Holidays ({globalHolidays.length})
            </span>
            <button
              onClick={() => fetchGlobalHolidays(true)}
              className="text-[11px] text-[#2484C6] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-neutral-400">Loading global holidays...</div>
          ) : globalHolidays.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500 italic">No global company holidays defined.</div>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-neutral-500/10">
              {globalHolidays.map((h) => (
                <div key={h.date} className="p-3 flex items-center justify-between hover:bg-neutral-500/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded bg-[#2484C6]/15 text-[#2484C6]">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{h.label || 'Company Holiday'}</p>
                      <p className="text-[10px] font-mono text-slate-500 dark:text-neutral-400">{h.date}</p>
                    </div>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => handleDeleteGlobalHoliday(h.date)}
                      disabled={busyDate === h.date}
                      className="p-1 text-rose-500 hover:bg-rose-500/15 rounded transition-all cursor-pointer"
                      title="Delete company holiday"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 mt-4 border-t border-neutral-500/10">
          <button
            onClick={onClose}
            className={`px-4 py-1.5 text-xs font-semibold rounded border cursor-pointer ${
              isDark ? 'border-neutral-700 text-neutral-300 hover:bg-neutral-800' : 'border-slate-300 text-slate-700 hover:bg-neutral-100'
            }`}
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );

  return createPortal(modalJSX, document.body);
}

export default React.memo(GlobalHolidaysModalComponent);
