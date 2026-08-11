/**
 * Global Date Formatting Utilities
 * Enforces strict DD-MM-YYYY (e.g. 24-07-2026) display formatting across UI components.
 * ISO YYYY-MM-DD format is maintained for database storage.
 */

export function formatDateDDMMYYYY(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';
  
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return '-';
    const dd = String(dateInput.getDate()).padStart(2, '0');
    const mm = String(dateInput.getMonth() + 1).padStart(2, '0');
    const yyyy = dateInput.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  const s = String(dateInput).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'unassigned' || s === '-') {
    return '-';
  }

  // Already DD-MM-YYYY format
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    return s;
  }

  // ISO YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [yyyy, mm, dd] = s.split('-');
    return `${dd}-${mm}-${yyyy}`;
  }

  // ISO Timestamp YYYY-MM-DDTHH:mm:ss...
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const [yyyy, mm, dd] = s.substring(0, 10).split('-');
    return `${dd}-${mm}-${yyyy}`;
  }

  // MM/DD/YYYY or M/D/YYYY format
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const parts = s.split('/');
    const mm = parts[0].padStart(2, '0');
    const dd = parts[1].padStart(2, '0');
    const yyyy = parts[2];
    return `${dd}-${mm}-${yyyy}`;
  }

  // Fallback parsing via Date object
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  return s;
}

export function parseToISODate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  if (!s || s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') {
    return null;
  }

  // DD-MM-YYYY format -> YYYY-MM-DD
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('-');
    return `${yyyy}-${mm}-${dd}`;
  }

  // YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  // MM/DD/YYYY format -> YYYY-MM-DD
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const parts = s.split('/');
    const mm = parts[0].padStart(2, '0');
    const dd = parts[1].padStart(2, '0');
    const yyyy = parts[2];
    return `${yyyy}-${mm}-${dd}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}
