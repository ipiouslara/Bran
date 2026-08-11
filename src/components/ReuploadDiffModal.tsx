/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Re-upload Diff & Confirmation Modal Component
 */

import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Info,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ShieldAlert,
  CheckSquare,
  Square
} from 'lucide-react';
import { ChangedRowItem, NewRowItem, MissingRowItem, UploadDiffResult } from '../utils/diffEngine';
import { formatDateDDMMYYYY } from '../utils/dateFormatter';

interface ReuploadDiffModalProps {
  theme: 'dark' | 'light';
  sourceFile: 'Client' | 'Internal';
  clientFilename?: string;
  internalFilename?: string;
  projectName?: string;
  diffResult: UploadDiffResult;
  onCancel: () => void;
  onConfirm: (confirmedChanges: ChangedRowItem[], confirmedNewRows: NewRowItem[]) => void;
  isSubmitting?: boolean;
  submissionError?: string | null;
}

const ROWS_PER_PAGE = 50;

const renderMetadataCell = (
  metadata?: Record<string, any>,
  moduleMetadata?: Record<string, any>,
  clientCustomMetadata?: Record<string, any>,
  internalCustomMetadata?: Record<string, any>
) => {
  const combined = { ...(moduleMetadata || {}), ...(metadata || {}) };
  const clientObj = clientCustomMetadata || {};
  const internalObj = internalCustomMetadata || {};

  const combinedKeys = Object.keys(combined);
  const clientKeys = Object.keys(clientObj);
  const internalKeys = Object.keys(internalObj);

  if (combinedKeys.length === 0 && clientKeys.length === 0 && internalKeys.length === 0) {
    return <span className="text-neutral-500 font-normal font-sans">-</span>;
  }

  return (
    <div className="flex flex-col gap-1 max-w-[240px]">
      {clientKeys.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {clientKeys.map(key => (
            <span
              key={`cli-${key}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-950/80 text-sky-200 border border-sky-700/50"
              title={`Client Metadata - ${key}: ${clientObj[key]}`}
            >
              <span className="text-sky-400 font-medium">client:{key}:</span>
              <span className="text-sky-100 font-bold">{String(clientObj[key])}</span>
            </span>
          ))}
        </div>
      )}
      {internalKeys.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {internalKeys.map(key => (
            <span
              key={`int-${key}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-950/80 text-amber-200 border border-amber-700/50"
              title={`Internal Metadata - ${key}: ${internalObj[key]}`}
            >
              <span className="text-amber-400 font-medium">internal:{key}:</span>
              <span className="text-amber-100 font-bold">{String(internalObj[key])}</span>
            </span>
          ))}
        </div>
      )}
      {clientKeys.length === 0 && internalKeys.length === 0 && combinedKeys.map(key => {
        const val = combined[key];
        const displayVal = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
        const isClientKey = key.toLowerCase().startsWith('client:');
        const isInternalKey = key.toLowerCase().startsWith('internal:');

        const badgeStyle = isClientKey
          ? 'bg-sky-950/80 text-sky-200 border-sky-700/50'
          : (isInternalKey ? 'bg-amber-950/80 text-amber-200 border-amber-700/50' : 'bg-neutral-800/80 text-neutral-300 border-neutral-700/60');
        const labelStyle = isClientKey ? 'text-sky-400' : (isInternalKey ? 'text-amber-400' : 'text-neutral-400');

        return (
          <span
            key={key}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${badgeStyle}`}
            title={`${key}: ${displayVal}`}
          >
            <span className={`${labelStyle} font-medium`}>{key}:</span>
            <span className="font-bold">{displayVal}</span>
          </span>
        );
      })}
    </div>
  );
};

const renderTargetTableBadge = (row: any) => {
  const origin = row?.origin || row?.rawRow?.origin;
  const source = row?.sourceFile || row?.source_file || row?.rawRow?.sourceFile || row?.rawRow?.source_file;

  const hasClient = Boolean(
    origin === 'delivery_sheet' ||
    source === 'Client' ||
    row?.clientDate ||
    row?.client_date ||
    row?.newClientDate ||
    row?.rawRow?.clientDate
  );

  const hasInternal = Boolean(
    origin === 'development_sheet' ||
    source === 'Internal' ||
    row?.internalStartDate ||
    row?.internalEndDate ||
    row?.internalStart ||
    row?.internalEnd ||
    row?.newInternalStart ||
    row?.newInternalEnd ||
    row?.rawRow?.internalStartDate ||
    row?.rawRow?.internalEndDate
  );

  if (origin === 'delivery_sheet' || source === 'Client') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
        client_phases
      </span>
    );
  }

  if (origin === 'development_sheet' || source === 'Internal') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        internal_phases
      </span>
    );
  }

  if (hasClient && hasInternal) {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
          client_phases
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          internal_phases
        </span>
      </div>
    );
  }

  if (hasClient) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
        client_phases
      </span>
    );
  }

  if (hasInternal) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        internal_phases
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
      client_phases
    </span>
  );
};

function ReuploadDiffModalComponent({
  theme,
  sourceFile,
  clientFilename,
  internalFilename,
  projectName,
  diffResult,
  onCancel,
  onConfirm,
  isSubmitting = false,
  submissionError = null
}: ReuploadDiffModalProps) {
  const { changedRows, newRows, missingRows } = diffResult;

  const [selectedChangedIds, setSelectedChangedIds] = useState<Set<string>>(() => {
    return new Set(changedRows.map(r => r.id));
  });

  const [selectedNewRowIndex, setSelectedNewRowIndex] = useState<Set<number>>(() => {
    return new Set(newRows.map((_, idx) => idx));
  });

  const [validationError, setValidationError] = useState<string | null>(null);

  const [changedPage, setChangedPage] = useState(1);
  const totalChangedPages = Math.ceil(changedRows.length / ROWS_PER_PAGE) || 1;

  const currentChangedRows = useMemo(() => {
    const start = (changedPage - 1) * ROWS_PER_PAGE;
    return changedRows.slice(start, start + ROWS_PER_PAGE);
  }, [changedRows, changedPage]);

  const toggleChangedRow = useCallback((id: string) => {
    setValidationError(null);
    setSelectedChangedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAllChangedRows = useCallback(() => {
    setValidationError(null);
    if (selectedChangedIds.size === changedRows.length) {
      setSelectedChangedIds(new Set());
    } else {
      setSelectedChangedIds(new Set(changedRows.map(r => r.id)));
    }
  }, [changedRows, selectedChangedIds.size]);

  const toggleNewRow = useCallback((index: number) => {
    setValidationError(null);
    setSelectedNewRowIndex(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const toggleAllNewRows = useCallback(() => {
    setValidationError(null);
    if (selectedNewRowIndex.size === newRows.length) {
      setSelectedNewRowIndex(new Set());
    } else {
      setSelectedNewRowIndex(new Set(newRows.map((_, idx) => idx)));
    }
  }, [newRows, selectedNewRowIndex.size]);

  const handleConfirmSelected = useCallback(() => {
    const filteredChanges = changedRows.filter(r => selectedChangedIds.has(r.id));
    const filteredNewRows = newRows.filter((_, idx) => selectedNewRowIndex.has(idx));

    if (filteredChanges.length === 0 && filteredNewRows.length === 0) {
      setValidationError('Nothing selected to apply. Please select at least one change or new row.');
      return;
    }

    setValidationError(null);
    onConfirm(filteredChanges, filteredNewRows);
  }, [changedRows, newRows, selectedChangedIds, selectedNewRowIndex, onConfirm]);

  const handleConfirmAll = useCallback(() => {
    setValidationError(null);
    onConfirm(changedRows, newRows);
  }, [changedRows, newRows, onConfirm]);

  const isDark = theme === 'dark';
  const cardBg = isDark ? 'bg-neutral-900 text-white border-neutral-800' : 'bg-white text-neutral-900 border-neutral-200';
  const borderCol = isDark ? 'border-neutral-800' : 'border-neutral-200';

  const activeFilename = clientFilename || internalFilename || '';
  const titleText = 'Plan Import & Confirmation';
  const subText = activeFilename
    ? `Uploading "${activeFilename}" ${projectName ? `to project "${projectName}"` : ''}`
    : `Review ${sourceFile} Timeline Updates`;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className={`w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl border ${cardBg} shadow-2xl overflow-hidden`}>
        
        <div className={`p-5 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-card)] text-[var(--text-main)]`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#1DAA58]/15 text-[#1DAA58]">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-main)]">{titleText}</h2>
              <p className="text-xs text-[var(--text-muted)]">
                {subText}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--input-bg)] transition-colors self-end sm:self-center disabled:opacity-40 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {(validationError || submissionError) && (
          <div className="p-3.5 bg-rose-500/15 border-b border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span className="truncate">{validationError || submissionError}</span>
            </div>
            <button onClick={() => setValidationError(null)} className="text-rose-400 hover:text-rose-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-6 max-h-[600px]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xs">
              <div className="text-xs font-semibold text-amber-500">Modified Rows</div>
              <div className="text-xl font-bold text-[var(--text-main)] mt-1">{changedRows.length}</div>
            </div>
            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xs">
              <div className="text-xs font-semibold text-emerald-500">New Rows</div>
              <div className="text-xl font-bold text-[var(--text-main)] mt-1">{newRows.length}</div>
            </div>
            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xs">
              <div className="text-xs font-semibold text-[var(--text-muted)]">Unchanged Rows</div>
              <div className="text-xl font-bold text-[var(--text-main)] mt-1">{diffResult.unchangedRows?.length || 0}</div>
            </div>
            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xs">
              <div className="text-xs font-semibold text-rose-500">Missing Flagged</div>
              <div className="text-xl font-bold text-[var(--text-main)] mt-1">{missingRows.length}</div>
            </div>
          </div>

          {changedRows.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 overflow-hidden bg-amber-500/5">
              <div className="p-3 bg-amber-500/15 border-b border-amber-500/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <h3 className="text-sm font-semibold text-amber-300">
                    Modified Rows ({selectedChangedIds.size} of {changedRows.length} selected)
                  </h3>
                </div>
                {totalChangedPages > 1 && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      disabled={changedPage === 1}
                      onClick={() => setChangedPage(p => p - 1)}
                      className="p-1 rounded hover:bg-amber-500/20 disabled:opacity-40"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span>Page {changedPage} of {totalChangedPages}</span>
                    <button
                      disabled={changedPage === totalChangedPages}
                      onClick={() => setChangedPage(p => p + 1)}
                      className="p-1 rounded hover:bg-amber-500/20 disabled:opacity-40"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto max-h-[400px] overflow-y-auto overscroll-contain">
                <table className="w-full text-xs text-left">
                  <thead className={`border-b ${borderCol} bg-neutral-900/40 text-neutral-400 sticky top-0 z-10`}>
                    <tr>
                      <th className="p-2.5 w-10 text-center">
                        <button
                          onClick={toggleAllChangedRows}
                          className="text-amber-400 hover:text-amber-300"
                          title="Select / Unselect All Modified Rows"
                        >
                          {selectedChangedIds.size === changedRows.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                      </th>
                      <th className="p-2.5 font-medium">Course</th>
                      <th className="p-2.5 font-medium">Module</th>
                      <th className="p-2.5 font-medium">Language</th>
                      <th className="p-2.5 font-medium">Phase</th>
                      <th className="p-2.5 font-medium">Metadata</th>
                      <th className="p-2.5 font-medium">Changed Fields</th>
                      <th className="p-2.5 font-medium">Date Delta (Old → New)</th>
                      <th className="p-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-neutral-800' : 'divide-neutral-200'}`}>
                    {currentChangedRows.map((row, idx) => {
                      const isSelected = selectedChangedIds.has(row.id);
                      const isCompleted = row.status === 'Completed';
                      const rowKey = `${row.course}-${row.module}-${row.phase}-${row.id || idx}`;
                      return (
                        <tr key={rowKey} className={`transition-colors ${isSelected ? (isDark ? 'bg-amber-500/10' : 'bg-amber-50') : 'hover:bg-neutral-800/30'}`}>
                          <td className="p-2.5 text-center">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleChangedRow(row.id)} className="rounded border-neutral-700 text-amber-500 focus:ring-amber-500 cursor-pointer" />
                          </td>
                          <td className="p-2.5 font-semibold text-neutral-200">{row.course}</td>
                          <td className="p-2.5">{row.module}</td>
                          <td className="p-2.5">{row.language || '-'}</td>
                          <td className="p-2.5 font-medium text-amber-300">{row.phase}</td>
                          <td className="p-2.5">{renderMetadataCell(row.metadata, row.moduleMetadata)}</td>
                          <td className="p-2.5">{row.changes.map(c => c.field).join(', ')}</td>
                          <td className="p-2.5">
                            {row.changes.map((c, i) => (
                              <div key={i} className="flex items-center gap-1.5 my-0.5">
                                <span className="line-through text-neutral-400">{c.oldValue ? formatDateDDMMYYYY(c.oldValue) : '(Empty)'}</span>
                                <ArrowRight className="w-3 h-3 text-neutral-500 shrink-0" />
                                <span className="font-bold text-[#38bdf8]">{c.newValue ? formatDateDDMMYYYY(c.newValue) : '-'}</span>
                              </div>
                            ))}
                          </td>
                          <td className="p-2.5">{isCompleted ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30"><ShieldAlert className="w-3 h-3" /> Done</span> : <span className="text-neutral-400">{row.status}</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {newRows.length > 0 && (
            <div className="rounded-lg border border-emerald-500/30 overflow-hidden bg-emerald-500/5">
              <div className="p-3 bg-emerald-500/15 border-b border-emerald-500/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <h3 className="text-sm font-semibold text-emerald-300">
                    New Rows ({selectedNewRowIndex.size} of {newRows.length} selected)
                  </h3>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto overscroll-contain">
                <table className="w-full text-xs text-left">
                  <thead className={`border-b ${borderCol} bg-neutral-900/40 text-neutral-400 sticky top-0 z-10`}>
                    <tr>
                      <th className="p-2.5 w-10 text-center">
                        <button onClick={toggleAllNewRows} className="text-emerald-400 hover:text-emerald-300" title="Select / Unselect All New Rows">
                          {selectedNewRowIndex.size === newRows.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                      </th>
                      <th className="p-2.5 font-medium">Course</th>
                      <th className="p-2.5 font-medium">Module</th>
                      <th className="p-2.5 font-medium">Language</th>
                      <th className="p-2.5 font-medium">Phase</th>
                      <th className="p-2.5 font-medium">Metadata</th>
                      <th className="p-2.5 font-medium">Target Dates</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-neutral-800' : 'divide-neutral-200'}`}>
                    {newRows.map((row, idx) => {
                      const isSelected = selectedNewRowIndex.has(idx);
                      const newRowKey = `${row.courseCode}-${row.moduleCode}-${row.phaseName}-${idx}`;
                      return (
                        <tr key={newRowKey} className={`transition-colors ${isSelected ? (isDark ? 'bg-emerald-500/10' : 'bg-emerald-50') : 'hover:bg-neutral-800/30'}`}>
                          <td className="p-2.5 text-center">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleNewRow(idx)} className="rounded border-neutral-700 text-emerald-500 focus:ring-emerald-500 cursor-pointer" />
                          </td>
                          <td className="p-2.5 font-semibold text-neutral-200">{row.courseCode}</td>
                          <td className="p-2.5">{row.moduleName || row.moduleCode}</td>
                          <td className="p-2.5">{row.language || '-'}</td>
                          <td className="p-2.5 font-medium text-emerald-300">{row.phaseName}</td>
                          <td className="p-2.5">{renderMetadataCell(row.metadata, row.moduleMetadata)}</td>
                          <td className="p-2.5">
                            <div className="flex flex-col text-xs gap-0.5 font-mono">
                              {(row.start_date || row.internalStartDate) && (row.end_date || row.internalEndDate) ? (
                                <span className="text-emerald-400 font-semibold">
                                  Internal: {formatDateDDMMYYYY(row.start_date || row.internalStartDate)} → {formatDateDDMMYYYY(row.end_date || row.internalEndDate)}
                                </span>
                              ) : (row.start_date || row.internalStartDate || row.end_date || row.internalEndDate) ? (
                                <span className="text-emerald-400 font-semibold">
                                  Internal: Start: {formatDateDDMMYYYY(row.start_date || row.internalStartDate)} | End: {formatDateDDMMYYYY(row.end_date || row.internalEndDate)}
                                </span>
                              ) : null}
                              {(row.client_date || row.clientDate) && (
                                <span className="text-sky-400 font-semibold">
                                  Client Date: {formatDateDDMMYYYY(row.client_date || row.clientDate)}
                                </span>
                              )}
                              {!(row.start_date || row.internalStartDate) && !(row.end_date || row.internalEndDate) && !(row.client_date || row.clientDate) && (
                                <span className="text-neutral-500 font-normal font-sans">No dates specified</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {missingRows.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 overflow-hidden bg-amber-500/10">
              <div className="p-3 bg-amber-500/20 border-b border-amber-500/30 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <h3 className="text-sm font-semibold text-amber-300">Missing Rows Flagged ({missingRows.length})</h3>
              </div>
              <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-200/90 flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-amber-400" />
                <span>These rows exist in the database but are absent from the new file. They will <strong>NOT</strong> be deleted automatically.</span>
              </div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto overscroll-contain">
                <table className="w-full text-xs text-left">
                  <thead className={`border-b ${borderCol} bg-neutral-900/40 text-neutral-400 sticky top-0 z-10`}>
                    <tr>
                      <th className="p-2.5 font-medium">Course</th>
                      <th className="p-2.5 font-medium">Module</th>
                      <th className="p-2.5 font-medium">Language</th>
                      <th className="p-2.5 font-medium">Phase</th>
                      <th className="p-2.5 font-medium">Metadata</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-neutral-800' : 'divide-neutral-200'}`}>
                    {missingRows.map((row, idx) => (
                      <tr key={`${row.course}-${row.module}-${row.phase}-${row.id || idx}`} className="hover:bg-neutral-800/30">
                        <td className="p-2.5 font-semibold text-neutral-300">{row.course}</td>
                        <td className="p-2.5">{row.module}</td>
                        <td className="p-2.5">{row.language || '-'}</td>
                        <td className="p-2.5 font-medium text-amber-300">{row.phase}</td>
                        <td className="p-2.5">{renderMetadataCell(row.metadata)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className={`p-4 border-t ${borderCol} bg-neutral-900/80 flex flex-col sm:flex-row items-center justify-between gap-3`}>
          <div className="text-xs text-neutral-300 flex items-center gap-3">
            <span className="font-semibold text-amber-400">{selectedChangedIds.size} changes</span>
            <span>•</span>
            <span className="font-semibold text-emerald-400">{selectedNewRowIndex.size} new</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onCancel} disabled={isSubmitting} className="px-4 py-2 rounded-lg text-xs font-semibold hover:bg-neutral-800 disabled:opacity-40">Cancel</button>
            <button onClick={handleConfirmSelected} disabled={isSubmitting} className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#2484C6] hover:bg-blue-600 text-white disabled:opacity-40 flex items-center gap-1.5 cursor-pointer">
              {isSubmitting ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Applying...</span>
                </>
              ) : (
                <span>Apply Selected</span>
              )}
            </button>
            <button onClick={handleConfirmAll} disabled={isSubmitting} className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 flex items-center gap-1.5 cursor-pointer">
              {isSubmitting ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Applying...</span>
                </>
              ) : (
                <span>Apply All</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default React.memo(ReuploadDiffModalComponent);
