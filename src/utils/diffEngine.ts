/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Re-upload Diff & Confirm Engine
 */

import { getSupabase, getCurrentUserId, saveResultToSupabase, getModuleMatchKey } from '../lib/db';
import { JoinResultRow } from '../types';

export interface DiffChangeItem {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  isClearing?: boolean;
}

export interface ChangedRowItem {
  id: string;
  course: string;
  module: string;
  language?: string;
  phase: string;
  status?: string;
  changes: DiffChangeItem[];
  newClientDate?: string | null;
  newInternalStart?: string | null;
  newInternalEnd?: string | null;
  label?: string;
  isClearingOnly?: boolean;
  metadata?: Record<string, any>;
  moduleMetadata?: Record<string, any>;
  rawRow: any;
}

export interface NewRowItem {
  courseCode: string;
  courseName: string;
  moduleCode: string;
  moduleName: string;
  language?: string;
  phaseName: string;
  phaseType?: string;
  phaseTypePhase?: string;
  clientDate?: string | null;
  internalStartDate?: string | null;
  internalEndDate?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  client_date?: string | null;
  metadata?: Record<string, any>;
  moduleMetadata?: Record<string, any>;
  rawRow: any;
}

export interface MissingRowItem {
  id: string;
  course: string;
  module: string;
  language?: string;
  phase: string;
  lastSeen?: string;
  metadata?: Record<string, any>;
  moduleMetadata?: Record<string, any>;
}

export interface UnchangedRowItem {
  id: string;
  course: string;
  module: string;
  language?: string;
  phase: string;
  clientDate?: string | null;
  internalStart?: string | null;
  internalEnd?: string | null;
  metadata?: Record<string, any>;
  moduleMetadata?: Record<string, any>;
}

export interface UploadDiffResult {
  changedRows: ChangedRowItem[];
  newRows: NewRowItem[];
  missingRows: MissingRowItem[];
  unchangedRows: UnchangedRowItem[];
}

export interface SpreadsheetDiffSummary {
  added: NewRowItem[];
  modified: ChangedRowItem[];
  unchanged: UnchangedRowItem[];
  removed: MissingRowItem[];
}

/**
 * Helper to normalize date strings for comparison
 */
function normalizeDate(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'unassigned') {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.substring(0, 10);
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return s;
}

/**
 * Executes a diff check comparing parsed spreadsheet rows against existing DB phases.
 */
export async function runUploadDiff(
  parsedRows: any[],
  sourceFile: 'Client' | 'Internal',
  currentUserId?: string,
  projectId?: string
): Promise<UploadDiffResult> {
  const supabase = getSupabase();

  let existingPhases: any[] = [];

  if (supabase) {
    let query = supabase
      .from('consolidated_phases_view')
      .select(`
        id, phase_name, phase_type, phase_type_phase,
        client_date, internal_start_date, internal_end_date,
        source_file, status, created_at, updated_at, metadata,
        modules (
          id, name, code, language, metadata, client_custom_metadata, internal_custom_metadata,
          courses (
            id, name, code, project_id,
            projects (id, name, owner_id)
          )
        )
      `);

    const { data, error } = await query;
    if (!error && data) {
      existingPhases = data.filter((phase: any) => {
        if (!phase.modules?.courses?.projects) return false;
        if (projectId && phase.modules.courses.project_id !== projectId) return false;
        if (currentUserId && phase.modules.courses.projects.owner_id && phase.modules.courses.projects.owner_id !== currentUserId) return false;
        return true;
      });
    }
  }

  const changedRows: ChangedRowItem[] = [];
  const newRows: NewRowItem[] = [];
  const missingRows: MissingRowItem[] = [];
  const unchangedRows: UnchangedRowItem[] = [];

  // Build lookup map of existing DB data keyed by Course+Module+Language+PhaseName+SourceFile
  const existingMap: Record<string, any> = {};
  for (const phase of existingPhases) {
    const cCode = (phase.modules?.courses?.code || phase.courseCode || '').trim().toLowerCase();
    const cName = (phase.modules?.courses?.name || phase.courseName || '').trim().toLowerCase();
    const mCode = (phase.modules?.code || phase.moduleCode || '').trim().toLowerCase();
    const mName = (phase.modules?.name || phase.moduleName || '').trim().toLowerCase();
    const lang = (phase.modules?.language || phase.language || '').trim().toLowerCase();
    const phaseName = (phase.phase_name || phase.phaseName || '').trim().toLowerCase();
    const sFile = (phase.source_file || '').trim().toLowerCase();

    const courseVariants = Array.from(new Set([cCode, cName].filter(Boolean)));
    const moduleVariants = Array.from(new Set([mCode, mName].filter(Boolean)));

    courseVariants.forEach(cVar => {
      moduleVariants.forEach(mVar => {
        const fullKey = [cVar, mVar, lang, phaseName, sFile].join('|');
        const fallbackKey = [cVar, mVar, lang, phaseName].join('|');
        existingMap[fullKey] = phase;
        if (!existingMap[fallbackKey]) {
          existingMap[fallbackKey] = phase;
        }
      });
    });
  }

  const incomingKeys = new Set<string>();

  for (const row of parsedRows) {
    const courseCode = (row.courseCode || '').trim().toLowerCase();
    const moduleCode = (row.moduleCode || '').trim().toLowerCase();
    const lang = (row.language || '').trim().toLowerCase();
    const phaseName = row.phaseName ? String(row.phaseName).trim() : '';

    if (!phaseName) {
      continue;
    }

    const rowClientDate = normalizeDate(row.clientDate || row.client_date);
    const rowInternalStart = normalizeDate(row.internalStartDate || row.start_date || row.internal_start_date);
    const rowInternalEnd = normalizeDate(row.internalEndDate || row.end_date || row.internal_end_date);

    // Determine row source file role
    const rowRole = row.sourceFile || row.source_file || (rowClientDate && !rowInternalStart && !rowInternalEnd ? 'Client' : (rowInternalStart || rowInternalEnd ? 'Internal' : sourceFile));
    const roleKey = String(rowRole).toLowerCase();

    const specificKey = [courseCode, moduleCode, lang, phaseName.toLowerCase(), roleKey].join('|');
    const fallbackKey = [courseCode, moduleCode, lang, phaseName.toLowerCase()].join('|');

    incomingKeys.add(specificKey);
    incomingKeys.add(fallbackKey);

    const existing = existingMap[specificKey] || existingMap[fallbackKey];
    const rowMeta = row.metadata || row.phaseMetadata || row.rawRow?.metadata || existing?.metadata || {};
    const modMeta = row.moduleMetadata || row.rawRow?.moduleMetadata || existing?.modules?.metadata || {};

    if (!existing) {
      // New row — doesn't exist in DB yet
      const hasDate = rowClientDate !== null || rowInternalStart !== null || rowInternalEnd !== null;

      if (hasDate) {
        newRows.push({
          courseCode: row.courseCode,
          courseName: row.courseName || row.courseCode,
          moduleCode: row.moduleCode,
          moduleName: row.moduleName || row.moduleCode,
          language: row.language,
          phaseName: row.phaseName,
          phaseType: row.phaseType,
          phaseTypePhase: row.phaseTypePhase,
          clientDate: rowClientDate,
          internalStartDate: rowInternalStart,
          internalEndDate: rowInternalEnd,
          start_date: rowInternalStart,
          end_date: rowInternalEnd,
          client_date: rowClientDate,
          metadata: rowMeta,
          moduleMetadata: modMeta,
          rawRow: row
        });
      }
    } else {
      // Exists in DB — check if values changed or are explicitly cleared
      const changes: DiffChangeItem[] = [];
      
      if (rowClientDate !== null || row.clientDate !== undefined || row.client_date !== undefined) {
        const stClient = normalizeDate(existing.client_date || existing.clientDate);
        if (rowClientDate !== stClient) {
          changes.push({
            field: 'Client Date',
            oldValue: stClient,
            newValue: rowClientDate,
            isClearing: rowClientDate === null && stClient !== null
          });
        }
      }

      if (rowInternalStart !== null || row.internalStartDate !== undefined || row.start_date !== undefined || row.internal_start_date !== undefined) {
        const stStart = normalizeDate(existing.internal_start_date || existing.start_date || existing.internalStart);
        if (rowInternalStart !== stStart) {
          changes.push({
            field: 'Internal Start Date',
            oldValue: stStart,
            newValue: rowInternalStart,
            isClearing: rowInternalStart === null && stStart !== null
          });
        }
      }

      if (rowInternalEnd !== null || row.internalEndDate !== undefined || row.end_date !== undefined || row.internal_end_date !== undefined) {
        const stEnd = normalizeDate(existing.internal_end_date || existing.end_date || existing.internalEnd);
        if (rowInternalEnd !== stEnd) {
          changes.push({
            field: 'Internal End Date',
            oldValue: stEnd,
            newValue: rowInternalEnd,
            isClearing: rowInternalEnd === null && stEnd !== null
          });
        }
      }

      if (changes.length > 0) {
        const isClearingOnly = changes.every(c => c.isClearing);

        changedRows.push({
          id: existing.id,
          course: courseCode,
          module: row.moduleName || existing.modules?.name || moduleCode,
          language: lang,
          phase: phaseName,
          status: existing.status || 'Pending',
          changes,
          newClientDate: rowClientDate,
          newInternalStart: rowInternalStart,
          newInternalEnd: rowInternalEnd,
          label: `${courseCode} / ${moduleCode} / ${phaseName}`,
          isClearingOnly,
          metadata: rowMeta,
          moduleMetadata: modMeta,
          rawRow: row
        });
      } else {
        // Identical row — unchanged
        unchangedRows.push({
          id: existing.id,
          course: courseCode,
          module: row.moduleName || existing.modules?.name || moduleCode,
          language: lang,
          phase: phaseName,
          clientDate: normalizeDate(existing.client_date),
          internalStart: normalizeDate(existing.internal_start_date),
          internalEnd: normalizeDate(existing.internal_end_date),
          metadata: existing.metadata || rowMeta
        });
      }
    }
  }

  // Detect absent phases — exist in DB but missing from upload file
  for (const [key, phase] of Object.entries(existingMap)) {
    if (!incomingKeys.has(key)) {
      missingRows.push({
        id: phase.id,
        course: phase.modules?.courses?.code || 'N/A',
        module: phase.modules?.name || phase.modules?.code || 'N/A',
        language: phase.modules?.language || '',
        phase: phase.phase_name || 'N/A',
        lastSeen: phase.updated_at || phase.created_at || new Date().toISOString(),
        metadata: phase.metadata || {}
      });
    }
  }

  return { changedRows, newRows, missingRows, unchangedRows };
}

/**
 * Categorizes spreadsheet diff into ADDED, MODIFIED, UNCHANGED, and REMOVED buckets.
 */
export function calculateSpreadsheetDiff(
  existingPhases: any[],
  parsedRows: any[],
  sourceFile: 'Client' | 'Internal'
): SpreadsheetDiffSummary {
  const changedRows: ChangedRowItem[] = [];
  const newRows: NewRowItem[] = [];
  const missingRows: MissingRowItem[] = [];
  const unchangedRows: UnchangedRowItem[] = [];

  const existingMap: Record<string, any> = {};
  for (const phase of existingPhases) {
    const courseCode = (phase.modules?.courses?.code || phase.courseCode || '').trim().toLowerCase();
    const moduleCode = (phase.modules?.code || phase.moduleCode || '').trim().toLowerCase();
    const lang = (phase.modules?.language || phase.language || '').trim().toLowerCase();
    const phaseName = (phase.phase_name || phase.phaseName || '').trim().toLowerCase();

    const key = [courseCode, moduleCode, lang, phaseName].join('|');
    existingMap[key] = phase;
  }

  const incomingKeys = new Set<string>();

  for (const row of parsedRows) {
    const courseCode = (row.courseCode || '').trim().toLowerCase();
    const moduleCode = (row.moduleCode || '').trim().toLowerCase();
    const lang = (row.language || '').trim().toLowerCase();
    const phaseName = (row.phaseName ? String(row.phaseName).trim() : '').toLowerCase();

    if (!phaseName) continue;

    const key = [courseCode, moduleCode, lang, phaseName].join('|');
    incomingKeys.add(key);

    const existing = existingMap[key];

    if (!existing) {
      newRows.push({
        courseCode: row.courseCode,
        courseName: row.courseName || row.courseCode,
        moduleCode: row.moduleCode,
        moduleName: row.moduleName || row.moduleCode,
        language: row.language,
        phaseName: row.phaseName,
        phaseType: row.phaseType,
        phaseTypePhase: row.phaseTypePhase,
        clientDate: normalizeDate(row.clientDate || row.client_date),
        internalStartDate: normalizeDate(row.internalStartDate || row.start_date || row.internal_start_date),
        internalEndDate: normalizeDate(row.internalEndDate || row.end_date || row.internal_end_date),
        start_date: normalizeDate(row.start_date || row.internalStartDate),
        end_date: normalizeDate(row.end_date || row.internalEndDate),
        client_date: normalizeDate(row.client_date || row.clientDate),
        rawRow: row
      });
    } else {
      const changes: DiffChangeItem[] = [];
      const incClient = normalizeDate(row.clientDate || row.client_date);
      const stClient = normalizeDate(existing.client_date || existing.clientDate);

      if (incClient !== stClient) {
        changes.push({
          field: 'Client Date',
          oldValue: stClient,
          newValue: incClient
        });
      }

      if (changes.length > 0) {
        changedRows.push({
          id: existing.id,
          course: courseCode,
          module: row.moduleName || existing.modules?.name || moduleCode,
          language: lang,
          phase: row.phaseName || phaseName,
          status: existing.status || 'Pending',
          changes,
          newClientDate: incClient,
          newInternalStart: normalizeDate(row.internalStartDate),
          newInternalEnd: normalizeDate(row.internalEndDate),
          label: `${courseCode} / ${moduleCode} / ${phaseName}`,
          rawRow: row
        });
      } else {
        unchangedRows.push({
          id: existing.id,
          course: courseCode,
          module: row.moduleName || existing.modules?.name || moduleCode,
          language: lang,
          phase: row.phaseName || existing.phase_name || existing.phaseName || phaseName,
          clientDate: stClient,
          internalStart: normalizeDate(existing.internal_start_date),
          internalEnd: normalizeDate(existing.internal_end_date)
        });
      }
    }
  }

  for (const [key, phase] of Object.entries(existingMap)) {
    if (!incomingKeys.has(key)) {
      missingRows.push({
        id: phase.id,
        course: phase.modules?.courses?.code || phase.courseCode || 'N/A',
        module: phase.modules?.name || phase.modules?.code || phase.moduleCode || 'N/A',
        language: phase.modules?.language || phase.language || '',
        phase: phase.phase_name || phase.phaseName || 'N/A'
      });
    }
  }

  return {
    added: newRows,
    modified: changedRows,
    unchanged: unchangedRows,
    removed: missingRows
  };
}

/**
 * Commits confirmed re-upload diff selections to Supabase.
 */
export async function commitDiffConfirm(
  confirmedChanges: ChangedRowItem[],
  confirmedNewRows: NewRowItem[],
  sourceFile: 'Client' | 'Internal',
  currentUserId?: string,
  projectId?: string,
  clientFilename?: string,
  internalFilename?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, error: 'Database connection not available.' };
  }

  try {
    let actorId = currentUserId;
    if (!actorId) {
      actorId = await getCurrentUserId() || undefined;
    }

    // Parallel batch updates for confirmed changes
    if (confirmedChanges.length > 0) {
      const updatePromises = confirmedChanges.map(async (item) => {
        const itemOrigin = (item as any).origin || item.rawRow?.origin;
        const itemSource = (item as any).sourceFile || item.rawRow?.sourceFile;
        const isClientChange = itemOrigin === 'delivery_sheet' || itemSource === 'Client' || item.newClientDate !== undefined || item.changes.some(c => c.field.toLowerCase().includes('client'));
        const targetTable = isClientChange ? 'client_phases' : 'internal_phases';

        const updatePayload: Record<string, any> = {};

        if (isClientChange) {
          updatePayload.client_date = item.newClientDate !== undefined ? item.newClientDate : null;
        } else {
          updatePayload.internal_start_date = item.newInternalStart !== undefined ? item.newInternalStart : null;
          updatePayload.internal_end_date = item.newInternalEnd !== undefined ? item.newInternalEnd : null;
        }

        if (item.metadata && Object.keys(item.metadata).length > 0) {
          let mergedMeta = item.metadata;
          try {
            const { data: existingPh } = await supabase
              .from(targetTable)
              .select('metadata')
              .eq('id', item.id)
              .maybeSingle();

            if (existingPh?.metadata) {
              mergedMeta = { ...existingPh.metadata, ...item.metadata };
            }
          } catch (e) {
            console.warn('Metadata merge fetch warning:', e);
          }
          updatePayload.metadata = mergedMeta;
        }

        const { error: updateError } = await supabase
          .from(targetTable)
          .update(updatePayload)
          .eq('id', item.id);

        if (updateError) {
          throw new Error(`Failed to update phase ${item.phase}: ${updateError.message}`);
        }

        await supabase.from('audit_log').insert({
          actor_id: actorId || null,
          action_type: 'upload',
          entity_type: 'phase',
          entity_id: item.id,
          entity_label: item.label || `${item.course} - ${item.phase}`,
          old_value: { source: 'pre-upload' },
          new_value: item.changes,
          created_at: new Date().toISOString()
        });
      });

      await Promise.all(updatePromises);
    }

    // Step 2: Insert new rows if any
    if (confirmedNewRows.length > 0 && projectId) {
      const moduleGroupMap = new Map<string, JoinResultRow>();

      for (const nr of confirmedNewRows) {
        const modKey = `${nr.courseCode}|${nr.moduleCode}|${nr.language || ''}`;
        if (!moduleGroupMap.has(modKey)) {
          moduleGroupMap.set(modKey, {
            courseCode: nr.courseCode,
            courseName: nr.courseName || nr.courseCode,
            moduleCode: nr.moduleCode,
            moduleName: nr.moduleName || nr.moduleCode,
            language: nr.language,
            status: 'matched',
            moduleMetadata: nr.moduleMetadata || nr.rawRow?.moduleMetadata || {},
            phases: []
          });
        }

        const phOrigin = (nr as any).origin || nr.rawRow?.origin;
        const phSource = (nr as any).sourceFile || nr.rawRow?.sourceFile || (nr.clientDate || nr.client_date ? 'Client' : 'Internal');

        const modGroup = moduleGroupMap.get(modKey)!;
        modGroup.phases.push({
          phaseName: nr.phaseName,
          phaseType: nr.phaseType,
          phaseTypePhase: nr.phaseTypePhase,
          origin: phOrigin || (phSource === 'Client' ? 'delivery_sheet' : 'development_sheet'),
          sourceFile: phSource,
          source_file: phSource,
          sourceFileRef: (nr as any).sourceFileRef || (phSource === 'Client' ? clientFilename : internalFilename) || '',
          clientDate: nr.clientDate || nr.client_date || null,
          internalStartDate: nr.internalStartDate || nr.start_date || null,
          internalEndDate: nr.internalEndDate || nr.end_date || null,
          metadata: nr.metadata || nr.rawRow?.metadata || {},
        } as any);
      }

      const rowsToSave = Array.from(moduleGroupMap.values());
      const confirmedKeys = rowsToSave.map(r => getModuleMatchKey(r.courseCode, r.moduleCode, r.language));
      const clientFn = clientFilename || '';
      const internalFn = internalFilename || '';
      const saveRes = await saveResultToSupabase(projectId, clientFn, internalFn, rowsToSave, confirmedKeys, actorId);
      if (!saveRes.success) {
        throw new Error(saveRes.error || 'Failed to save new rows to database.');
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('commitDiffConfirm error:', err);
    return { success: false, error: err.message || 'Error executing upload commit.' };
  }
}
