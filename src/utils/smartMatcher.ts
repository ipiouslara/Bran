/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BRAN Smart Ingestion & Fuzzy Matcher Engine (100% Token-Free)
 * High-performance string distance, token matching, synonym resolution,
 * and data-type sniffing for automated spreadsheet header mapping.
 */

export type TargetFieldType = 
  | 'courseCode' 
  | 'courseName' 
  | 'moduleCode' 
  | 'moduleName' 
  | 'language' 
  | 'clientDate' 
  | 'internalStartDate' 
  | 'internalEndDate'
  | 'phaseName'
  | 'phaseType';

export interface ColumnMatchSuggestion {
  header: string;
  targetField: TargetFieldType | string;
  confidence: number; // 0 to 100
  matchReason: string;
  detectedType?: 'date' | 'string' | 'number';
}

// Enterprise synonym and alias dictionary for BRAN
const ALIAS_DICTIONARY: Record<TargetFieldType, string[]> = {
  courseCode: ['course code', 'course_code', 'course id', 'crse code', 'subject code', 'c_code', 'course_no', 'course #', 'curriculum code'],
  courseName: ['course name', 'course_name', 'course title', 'course', 'subject name', 'curriculum name', 'program name'],
  moduleCode: ['module code', 'module_code', 'mod code', 'module id', 'unit code', 'topic code', 'lesson code', 'm_code', 'module #'],
  moduleName: ['module name', 'module_name', 'module title', 'module', 'unit name', 'topic name', 'lesson name'],
  language: ['language', 'lang', 'locale', 'translation', 'target language', 'src lang', 'tgt lang'],
  clientDate: [
    'client date', 'client_date', 'client deadline', 'client due date', 'client target', 
    'client delivery', 'client completion', 'handover date', 'client eta', 'due date', 
    'target date', 'delivery date', 'contract date', 'external date', 'client end date'
  ],
  internalStartDate: [
    'internal start date', 'internal_start', 'internal start', 'start date', 'start_date', 
    'prod start', 'production start', 'dev start', 'begin date', 'eta start', 'commence date'
  ],
  internalEndDate: [
    'internal end date', 'internal_end', 'internal end', 'end date', 'end_date', 
    'internal due date', 'internal deadline', 'prod end', 'production end', 'dev end', 
    'internal completion', 'target finish', 'finish date'
  ],
  phaseName: ['phase', 'phase name', 'phase_name', 'stage', 'milestone', 'step', 'task phase'],
  phaseType: ['phase type', 'phase_type', 'type', 'category', 'sub phase', 'tier']
};

/**
 * Standardize text string by lowercasing, trimming, and replacing non-alphanumeric chars with single space
 */
export function normalizeText(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Calculate Levenshtein Edit Distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  if (normA === normB) return 0;
  if (!normA.length) return normB.length;
  if (!normB.length) return normA.length;

  const row: number[] = [];
  for (let i = 0; i <= normA.length; i++) {
    row[i] = i;
  }

  for (let i = 1; i <= normB.length; i++) {
    let prev = i;
    for (let j = 1; j <= normA.length; j++) {
      const val = normB[i - 1] === normA[j - 1] ? row[j - 1] : Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
      row[j - 1] = prev;
      prev = val;
    }
    row[normA.length] = prev;
  }
  return row[normA.length];
}

/**
 * Calculate similarity percentage (0 - 1.0)
 */
export function stringSimilarity(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  const distance = levenshteinDistance(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  return 1 - distance / maxLen;
}

/**
 * Calculate Jaccard Token Overlap Similarity (0 - 1.0)
 */
export function tokenJaccardSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeText(a).split(' ').filter(Boolean));
  const tokensB = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) intersection++;
  });

  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Auto-sniff data type from a sample of column values
 */
export function sniffColumnDataType(values: any[]): 'date' | 'number' | 'string' {
  const nonNulls = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (nonNulls.length === 0) return 'string';

  let dateCount = 0;
  let numberCount = 0;

  for (const val of nonNulls.slice(0, 10)) {
    if (val instanceof Date && !isNaN(val.getTime())) {
      dateCount++;
      continue;
    }

    if (typeof val === 'number') {
      // Check if Excel date serial number (e.g. 44000 to 46000)
      if (val > 35000 && val < 60000) {
        dateCount++;
      } else {
        numberCount++;
      }
      continue;
    }

    if (typeof val === 'string') {
      const trimmed = val.trim();
      // Date format check
      if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(trimmed) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(trimmed) || /^[A-Z][a-z]{2}\s\d{1,2},\s\d{4}/.test(trimmed)) {
        const parsed = Date.parse(trimmed);
        if (!isNaN(parsed)) dateCount++;
      } else if (!isNaN(Number(trimmed))) {
        numberCount++;
      }
    }
  }

  const sampleSize = Math.min(nonNulls.length, 10);
  if (dateCount / sampleSize >= 0.5) return 'date';
  if (numberCount / sampleSize >= 0.7) return 'number';
  return 'string';
}

/**
 * Auto-detect and rank best matches for a list of header strings and sample rows
 */
export function suggestHeaderMappings(
  headers: string[],
  rowsSample: Record<string, any>[] = [],
  fileRole: 'client' | 'internal' = 'client'
): Record<string, ColumnMatchSuggestion> {
  const suggestions: Record<string, ColumnMatchSuggestion> = {};

  // Extract column values for data type sniffing
  const columnValues: Record<string, any[]> = {};
  headers.forEach((h) => {
    columnValues[h] = rowsSample.map((r) => r[h]);
  });

  headers.forEach((header) => {
    const normHeader = normalizeText(header);
    const detectedType = sniffColumnDataType(columnValues[header] || []);
    let bestMatchField: TargetFieldType | string = '';
    let highestScore = 0;
    let matchReason = 'No confident match found';

    // Target fields relevant for the file role
    const candidateFields: TargetFieldType[] = [
      'courseCode',
      'courseName',
      'moduleCode',
      'moduleName',
      'language',
      ...(fileRole === 'client' ? (['clientDate'] as TargetFieldType[]) : (['internalStartDate', 'internalEndDate'] as TargetFieldType[])),
      'phaseName',
      'phaseType'
    ];

    candidateFields.forEach((field) => {
      const aliases = ALIAS_DICTIONARY[field] || [];
      
      // 1. Exact alias match
      if (aliases.some((alias) => normalizeText(alias) === normHeader)) {
        const score = 98;
        if (score > highestScore) {
          highestScore = score;
          bestMatchField = field;
          matchReason = 'Exact alias match in dictionary';
        }
        return;
      }

      // 2. Token Jaccard similarity & Levenshtein
      aliases.forEach((alias) => {
        const jaccard = tokenJaccardSimilarity(alias, normHeader);
        const lev = stringSimilarity(alias, normHeader);
        let combined = Math.max(jaccard * 90, lev * 85);

        // Boost date fields if column data type sniffed is a date
        if ((field === 'clientDate' || field === 'internalStartDate' || field === 'internalEndDate') && detectedType === 'date') {
          combined += 15;
        }

        if (combined > highestScore) {
          highestScore = Math.min(Math.round(combined), 95);
          bestMatchField = field;
          matchReason = `High string similarity to "${alias}"`;
        }
      });
    });

    suggestions[header] = {
      header,
      targetField: bestMatchField,
      confidence: highestScore,
      matchReason,
      detectedType
    };
  });

  return suggestions;
}
