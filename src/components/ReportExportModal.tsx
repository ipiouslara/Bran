/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * In-Page Summary Report Exporter Modal Component
 */

import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Calendar,
  X,
  Download,
  Filter,
  Check,
  AlertCircle
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { Course, Module, Phase, Employee } from '../types';

export type DatePreset = 'all' | '7days' | '15days' | 'month' | 'custom';

interface ReportExportModalProps {
  theme: 'dark' | 'light';
  mode: 'internal' | 'client';
  projectName?: string;
  courses: Course[];
  modules: Module[];
  phases: Phase[];
  employees: Employee[];
  onClose: () => void;
}

export function filterPhasesByDateRange(
  phases: Phase[],
  mode: 'internal' | 'client',
  preset: DatePreset,
  customStart?: string,
  customEnd?: string,
  nowDate: Date = new Date()
): Phase[] {
  if (preset === 'all') return phases;

  let cutoffStart: Date | null = null;
  let cutoffEnd: Date | null = null;

  if (preset === '7days') {
    cutoffStart = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    cutoffEnd = new Date(nowDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  } else if (preset === '15days') {
    cutoffStart = new Date(nowDate.getTime() - 15 * 24 * 60 * 60 * 1000);
    cutoffEnd = new Date(nowDate.getTime() + 15 * 24 * 60 * 60 * 1000);
  } else if (preset === 'month') {
    cutoffStart = new Date(nowDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    cutoffEnd = new Date(nowDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  } else if (preset === 'custom') {
    if (customStart) cutoffStart = new Date(customStart);
    if (customEnd) {
      cutoffEnd = new Date(customEnd);
      cutoffEnd.setHours(23, 59, 59, 999);
    }
  }

  return phases.filter(phase => {
    let dateStr: string | null = null;
    if (mode === 'client') {
      dateStr = phase.clientDate || null;
    } else {
      dateStr = phase.internalStartDate || phase.internalEndDate || null;
    }

    if (!dateStr) return false;

    const dateVal = new Date(dateStr);
    if (isNaN(dateVal.getTime())) return false;

    if (cutoffStart && dateVal < cutoffStart) return false;
    if (cutoffEnd && dateVal > cutoffEnd) return false;

    return true;
  });
}

export default function ReportExportModal({
  theme,
  mode,
  projectName = 'BRAN Project',
  courses,
  modules,
  phases,
  employees,
  onClose
}: ReportExportModalProps) {
  const [preset, setPreset] = useState<DatePreset>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  const isDark = theme === 'dark';
  const cardBg = isDark ? 'bg-[#1B1D21] text-white border-[#B1B7C3]/20' : 'bg-white text-neutral-900 border-neutral-200';
  const inputBg = isDark ? 'bg-neutral-900 border-neutral-750 text-white' : 'bg-neutral-50 border-neutral-300 text-neutral-900';

  const employeeMap = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach(e => map.set(e.id, e.name));
    return map;
  }, [employees]);

  const courseMap = useMemo(() => {
    const map = new Map<string, Course>();
    courses.forEach(c => map.set(c.id, c));
    return map;
  }, [courses]);

  const moduleMap = useMemo(() => {
    const map = new Map<string, Module>();
    modules.forEach(m => map.set(m.id, m));
    return map;
  }, [modules]);

  const modePhases = useMemo(() => {
    return phases.filter(phase => {
      if (mode === 'client') {
        return phase.sourceFile === 'Client' || Boolean(phase.clientDate);
      } else {
        return phase.sourceFile === 'Internal' || Boolean(phase.internalStartDate || phase.internalEndDate);
      }
    });
  }, [phases, mode]);

  const filteredPhases = useMemo(() => {
    return filterPhasesByDateRange(modePhases, mode, preset, startDate, endDate);
  }, [modePhases, mode, preset, startDate, endDate]);

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);

      // 1. Group filtered phases by moduleId
      const modulePhaseMap = new Map<string, Map<string, Phase>>();
      const allPhaseNamesSet = new Set<string>();

      modePhases.forEach(phase => {
        allPhaseNamesSet.add(phase.phaseName);
      });

      filteredPhases.forEach(phase => {
        if (!modulePhaseMap.has(phase.moduleId)) {
          modulePhaseMap.set(phase.moduleId, new Map());
        }
        modulePhaseMap.get(phase.moduleId)!.set(phase.phaseName, phase);
      });

      const uniquePhaseNames = Array.from(allPhaseNamesSet);

      // 2. Identify target modules
      const targetModules = modules.length > 0
        ? modules
        : Array.from(new Set(phases.map(p => p.moduleId)))
            .map(id => moduleMap.get(id))
            .filter((m): m is Module => m !== undefined);

      // 3. Extract custom metadata keys across target modules
      const metadataKeysSet = new Set<string>();
      targetModules.forEach(m => {
        if (m.metadata && typeof m.metadata === 'object') {
          Object.keys(m.metadata).forEach(k => metadataKeysSet.add(k));
        }
      });
      const metadataKeys = Array.from(metadataKeysSet);

      // 4. Construct matrix rows (1 row per module matching sample layout)
      let serialNo = 1;
      const rowsForExport = targetModules.map(mod => {
        const crs = courseMap.get(mod.courseId);
        const modPhases = modulePhaseMap.get(mod.id) || new Map<string, Phase>();

        let talentName = '-';
        for (const ph of modPhases.values()) {
          if (ph.assignedTo) {
            const empName = employeeMap.get(ph.assignedTo);
            if (empName) {
              talentName = empName;
              break;
            }
          }
        }

        const rowObj: Record<string, any> = {
          'Module No': serialNo++,
          'Course': crs?.name || crs?.code || 'N/A',
          'Module': mod.name || mod.code,
          'Language': mod.language || 'English'
        };

        metadataKeys.forEach(key => {
          rowObj[key] = mod.metadata?.[key] ?? '-';
        });

        if (mode === 'internal') {
          rowObj['Talent (ID)'] = talentName;
        }

        if (mode === 'client') {
          uniquePhaseNames.forEach(pName => {
            const ph = modPhases.get(pName);
            rowObj[pName] = ph?.clientDate || '-';
          });
        } else {
          uniquePhaseNames.forEach(pName => {
            const ph = modPhases.get(pName);
            rowObj[`${pName} Start Date`] = ph?.internalStartDate || '-';
            rowObj[`${pName} End Date`] = ph?.internalEndDate || '-';
          });
        }

        return rowObj;
      });

      if (rowsForExport.length === 0) {
        setIsExporting(false);
        return;
      }

      // 5. Build styled ExcelJS workbook matching uploaded sample formatting
      const workbook = new ExcelJS.Workbook();
      const sheetName = mode === 'client' ? 'Client Summary' : 'Internal Summary';
      const worksheet = workbook.addWorksheet(sheetName, {
        views: [{ showGridLines: true }]
      });

      const headers = Object.keys(rowsForExport[0]);
      
      // Calculate column widths
      worksheet.columns = headers.map(key => {
        let maxLen = key.length;
        rowsForExport.forEach(r => {
          const valStr = String(r[key] ?? '');
          if (valStr.length > maxLen) {
            maxLen = valStr.length;
          }
        });
        return {
          header: key,
          key: key,
          width: Math.min(Math.max(maxLen + 4, 12), 42)
        };
      });

      // Style Header Row (Row 1): Dark Forest Green (#1E6B27), Bold White Text
      const headerRow = worksheet.getRow(1);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E6B27' }
        };
        cell.font = {
          name: 'Calibri',
          size: 11,
          bold: true,
          color: { argb: 'FFFFFFFF' }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
          right: { style: 'thin', color: { argb: 'FFBFBFBF' } }
        };
      });

      // Add & Style Data Rows with thin gridlines & alignments
      rowsForExport.forEach((rowObj) => {
        const row = worksheet.addRow(rowObj);
        row.height = 22;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.font = { name: 'Calibri', size: 10 };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
            left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
            bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
            right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
          };

          const headerKey = headers[colNumber - 1];
          if (headerKey === 'Course' || headerKey === 'Module') {
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
        });
      });

      // Write buffer and trigger browser download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `BRAN_${mode === 'client' ? 'Client' : 'Internal'}_Summary_${dateStr}.xlsx`;
      link.download = filename;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setTimeout(() => {
        setIsExporting(false);
        onClose();
      }, 300);
    } catch (err) {
      console.error('Export Excel Error:', err);
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className={`w-full max-w-lg rounded-xl border ${cardBg} shadow-2xl overflow-hidden flex flex-col`}>
        
        {/* Modal Header */}
        <div className="p-5 border-b border-[#B1B7C3]/20 flex items-center justify-between bg-gradient-to-r from-[#193661] to-[#00669B] text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#2484C6]/20 text-[#2484C6]">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">
                Export {mode === 'client' ? 'Client Deliverables' : 'Internal Operating'} Report
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Generate formatted Excel workbook (.xlsx) directly in-browser.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          
          {/* Active Project Banner */}
          <div className="p-3.5 rounded-lg bg-[#2484C6]/10 border border-[#2484C6]/20 text-xs flex items-center justify-between">
            <span className="text-neutral-400 font-medium">Target Project:</span>
            <span className="font-bold text-[#2484C6]">{projectName}</span>
          </div>

          {/* Preset Options */}
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#2484C6]" />
              <span>Date Filter Preset</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {([
                { id: 'all', label: 'All Dates' },
                { id: '7days', label: 'Last 7 Days' },
                { id: '15days', label: 'Last 15 Days' },
                { id: 'month', label: 'Last 30 Days' },
                { id: 'custom', label: 'Custom Range' }
              ] as const).map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPreset(item.id)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center justify-between ${
                    preset === item.id
                      ? 'bg-[#2484C6] border-[#2484C6] text-white shadow-md'
                      : isDark
                      ? 'bg-neutral-900 border-neutral-750 text-neutral-300 hover:bg-neutral-800'
                      : 'bg-neutral-50 border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <span>{item.label}</span>
                  {preset === item.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Pickers */}
          {preset === 'custom' && (
            <div className="p-4 rounded-lg border border-neutral-500/20 space-y-3 bg-neutral-500/5 animate-in slide-in-from-top-2 duration-150">
              <span className="text-[10px] font-bold uppercase text-neutral-400 block mb-1">
                Custom Range Parameters
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-semibold text-neutral-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className={`w-full px-3 py-1.5 rounded-md border text-xs focus:ring-1 focus:ring-[#2484C6] ${inputBg}`}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-neutral-400 mb-1">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className={`w-full px-3 py-1.5 rounded-md border text-xs focus:ring-1 focus:ring-[#2484C6] ${inputBg}`}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Export Metrics Preview */}
          <div className="p-3.5 rounded-lg border border-neutral-500/10 bg-neutral-900/30 text-xs flex items-center justify-between">
            <span className="text-neutral-400">Phases Matching Criteria:</span>
            <span className="font-bold font-mono text-[#1DAA58]">{filteredPhases.length} rows</span>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-neutral-500/10 bg-neutral-900/60 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExporting || filteredPhases.length === 0}
            className="px-5 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-[#1DAA58] to-[#2484C6] hover:brightness-110 text-white transition-all shadow-md active:scale-98 disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Generating Excel...' : 'Download Excel Report'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}
