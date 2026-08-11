/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { SheetPreviewData } from '../types';

/**
 * Parses an uploaded Excel file, extracts all worksheets, their columns, and rows.
 */
export async function parseExcelFile(file: File): Promise<SheetPreviewData[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          throw new Error("Could not read file data.");
        }
        
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const result: SheetPreviewData[] = [];
        
        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          // Convert sheet to json array of objects
          const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '', raw: false });
          
          if (rawRows.length > 0) {
            // Get all unique headers from all rows to avoid omission if first row is sparse
            const headersSet = new Set<string>();
            rawRows.forEach(row => {
              Object.keys(row).forEach(k => headersSet.add(k));
            });
            const headers = Array.from(headersSet);
            
            result.push({
              sheetName,
              headers,
              rows: rawRows,
            });
          } else {
            result.push({
              sheetName,
              headers: [],
              rows: [],
            });
          }
        });
        
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    
    reader.onerror = (err) => {
      reject(err);
    };
    
    reader.readAsBinaryString(file);
  });
}

/**
 * Standardizes dynamic spreadsheet date outputs to ISO format string
 */
export function formatExcelValue(val: any): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  const str = String(val).trim();
  // Simple check for standard short date patterns like MM/DD/YYYY or YYYY-MM-DD
  return str;
}
