/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import { SheetPreviewData, FileRole } from '../types';
import { parseExcelFile } from '../utils/excel';

import { checkProjectHolidaysExist } from '../lib/db';

interface UploadZoneProps {
  theme: 'dark' | 'light';
  fileRole: FileRole;
  projectId?: string;
  onFileLoaded: (filename: string, sheets: SheetPreviewData[], defaultSheetName: string) => void;
  onClear: () => void;
  currentFilename: string | null;
  currentSheets: SheetPreviewData[];
  selectedSheetName: string;
  onSelectSheetName: (name: string) => void;
}

export default function UploadZone({
  theme,
  fileRole,
  projectId,
  onFileLoaded,
  onClear,
  currentFilename,
  currentSheets,
  selectedSheetName,
  onSelectSheetName
}: UploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = async (file: File) => {
    setErrorMsg(null);
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xlsm')) {
      setErrorMsg('Unsupported format. Please upload spreadsheet files ending with .xlsx or .xlsm');
      return;
    }

    setLoading(true);
    try {
      if (projectId) {
        const hasHolidays = await checkProjectHolidaysExist(projectId);
        if (!hasHolidays) {
          setErrorMsg("Please configure Global and Project Holidays before ingesting schedule spreadsheets.");
          setLoading(false);
          return;
        }
      }
      const sheetsData = await parseExcelFile(file);
      if (sheetsData.length === 0) {
        throw new Error("This workbook contains no accessible sheet tabs with rows.");
      }
      
      const defaultSheet = sheetsData[0].sheetName;
      onFileLoaded(file.name, sheetsData, defaultSheet);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error occurred while processing Excel file. Please review spreadsheet formatting.');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Find the selected sheet's values
  const activeSheet = currentSheets.find(s => s.sheetName === selectedSheetName) || currentSheets[0];
  const maxPreviewRows = 6;

  return (
    <div
      id={`upload-zone-${fileRole}`}
      className={`p-5 rounded-xl border transition-all hover-card-glow ${
        theme === 'dark'
          ? 'bg-[var(--bg-card)] border-[var(--border-subtle)] text-white shadow-xl'
          : 'bg-white border-neutral-200 text-neutral-800 shadow-md'
      }`}
    >
      {currentFilename && (
        <div className="flex justify-end mb-3">
          <button
            onClick={onClear}
            className="p-1 px-2 hover:bg-rose-500/10 hover:text-rose-400 text-neutral-400 border border-transparent hover:border-rose-500/20 text-[11px] rounded flex items-center gap-1 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Unload</span>
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/25 text-xs text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Upload Drop Zone */}
      {!currentFilename ? (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={triggerFileInput}
          className={`cursor-pointer group border-2 border-dashed py-10 px-4 rounded-lg flex flex-col items-center justify-center text-center transition-all ${
            dragActive
              ? 'border-[#1DAA58] bg-[#1DAA58]/5'
              : 'border-[#B1B7C3]/20 hover:border-[#2484C6] hover:bg-[#2484C6]/2'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={handleChange}
          />
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <span className="w-6 h-6 border-2 border-[#1DAA58]/30 border-t-[#1DAA58] rounded-full animate-spin" />
              <p className="text-xs text-neutral-400 mt-2">Uploading and indexing spreadsheets metadata...</p>
            </div>
          ) : (
            <>
              <div className="p-3 rounded-full bg-neutral-500/10 text-neutral-400 group-hover:text-[#2484C6] group-hover:bg-[#2484C6]/10 transition-all mb-3">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-xs font-medium">
                Drag and drop your <span className="text-[#2484C6] font-bold">.xlsx or .xlsm</span> file here
              </p>
              <p className="text-[10px] text-neutral-500 mt-1">or click to browse local files system</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* File state details */}
          <div className="p-3 rounded-md bg-neutral-500/10 flex items-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-[#1DAA58]" />
            <div className="truncate flex-1">
              <p className="text-xs font-semibold truncate leading-tight">{currentFilename}</p>
              <p className="text-[10px] text-neutral-400 mt-0.5">
                Loaded {currentSheets.length} sheet{currentSheets.length > 1 ? 's' : ''} containing {activeSheet?.rows.length || 0} rows total.
              </p>
            </div>
            <CheckCircle2 className="w-4 h-4 text-[#1DAA58]" />
          </div>

          {/* Worksheet sub-tabs selector */}
          {currentSheets.length > 1 && (
            <div className="space-y-1">
              <label className="text-[11px] text-neutral-400 font-medium">Select target spreadsheet tab:</label>
              <div className="flex gap-1.5 flex-wrap">
                {currentSheets.map((s) => (
                  <button
                    key={s.sheetName}
                    onClick={() => onSelectSheetName(s.sheetName)}
                    className={`px-2.5 py-1 text-[11px] rounded-md transition-all font-medium border ${
                      selectedSheetName === s.sheetName
                        ? theme === 'dark'
                          ? 'bg-[#1DAA58]/10 text-[#1DAA58] border-[#1DAA58]/30'
                          : 'bg-[#1DAA58]/10 text-emerald-700 border-[#1DAA58]/30'
                        : 'bg-neutral-500/5 hover:bg-neutral-500/10 text-neutral-400 border-transparent'
                    }`}
                  >
                    {s.sheetName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Small visual grid table preview */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] font-semibold tracking-wider uppercase text-neutral-500">Spreadsheet Preview</span>
              <span className="text-[9px] text-neutral-500">Showing first {Math.min(activeSheet?.rows.length || 0, maxPreviewRows)} lines</span>
            </div>

            {activeSheet?.rows && activeSheet.rows.length > 0 ? (
              <div className="overflow-x-auto rounded-md border border-[#B1B7C3]/15">
                <table className="w-full text-[10px] text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-500/10 border-b border-[#B1B7C3]/10">
                      {activeSheet.headers.map(h => (
                        <th key={h} className="p-2 truncate max-w-[120px] font-semibold text-slate-700 dark:text-neutral-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeSheet.rows.slice(0, maxPreviewRows).map((row, idx) => (
                      <tr
                        key={idx}
                        className={`border-b border-[#B1B7C3]/5 ${
                          idx % 2 === 0 ? 'bg-transparent' : 'bg-neutral-500/2'
                        }`}
                      >
                        {activeSheet.headers.map(h => (
                          <td key={h} className="p-2 max-w-[120px] truncate text-slate-900 dark:text-neutral-300">
                            {row[h] !== undefined ? String(row[h]) : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-4 bg-neutral-500/5 rounded-md text-xs text-neutral-400">
                Selected sheet holds empty columns registry.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
