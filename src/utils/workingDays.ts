/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Helper to parse date strings locally without timezone shifts
export const parseDateLocal = (dateInput: string | Date): Date => {
  if (dateInput instanceof Date) return new Date(dateInput.getTime());
  const parts = dateInput.split('-');
  if (parts.length !== 3) return new Date(dateInput);
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
};

// Helper to format date objects back to local YYYY-MM-DD
export const formatDateLocal = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const isWorkingDay = (dateInput: Date | string, holidays?: (string | { date: string })[]): boolean => {
  const date = parseDateLocal(dateInput);
  if (isNaN(date.getTime())) return false;
  
  const day = date.getDay();
  if (day === 0 || day === 6) return false; // Sunday or Saturday
  
  if (!holidays || !Array.isArray(holidays) || holidays.length === 0) return true;
  
  const key = formatDateLocal(date);
  const holidaySet = new Set(holidays.map(h => (typeof h === 'string' ? h : h.date)));
  return !holidaySet.has(key);
};

export const getNonWorkingDayReason = (dateInput: Date | string, holidays?: (string | { date: string })[]): string | null => {
  const date = parseDateLocal(dateInput);
  if (isNaN(date.getTime())) return 'Invalid Date Format';
  
  const day = date.getDay();
  if (day === 0) return 'Sunday';
  if (day === 6) return 'Saturday';
  
  if (holidays && Array.isArray(holidays) && holidays.length > 0) {
    const key = formatDateLocal(date);
    const isHoliday = holidays.some(h => (typeof h === 'string' ? h : h.date) === key);
    if (isHoliday) return `Configured Project/Global Holiday (${key})`;
  }
  
  return null;
};

export const workingDaysBetween = (
  startDateInput: string | Date, 
  endDateInput: string | Date, 
  holidays?: (string | { date: string })[]
): number => {
  const start = parseDateLocal(startDateInput);
  const end = parseDateLocal(endDateInput);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  let delta = 0;
  const direction = startMidnight <= endMidnight ? 1 : -1;
  const current = new Date(startMidnight);

  while (current.toDateString() !== endMidnight.toDateString()) {
    current.setDate(current.getDate() + direction);
    if (isWorkingDay(current, holidays)) {
      delta += direction;
    }
  }
  return delta;
};

// Map legacy name for backward compatibility
export const getWorkingDaysDifference = workingDaysBetween;

export const addWorkingDays = (
  dateInput: string | Date, 
  workingDaysDelta: number, 
  holidays?: (string | { date: string })[]
): string => {
  const start = parseDateLocal(dateInput);
  if (isNaN(start.getTime())) return '';

  let remaining = Math.abs(workingDaysDelta);
  const direction = workingDaysDelta >= 0 ? 1 : -1;
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  while (remaining > 0) {
    current.setDate(current.getDate() + direction);
    if (isWorkingDay(current, holidays)) {
      remaining--;
    }
  }

  // Snap to nearest working day in the shift direction if result lands on weekend/holiday
  while (!isWorkingDay(current, holidays)) {
    current.setDate(current.getDate() + direction);
  }

  return formatDateLocal(current);
};

export const calculatePhaseWorkingDaysGap = (
  earlierEndDateInput: string | Date,
  laterStartDateInput: string | Date,
  holidays?: (string | { date: string })[]
): number => {
  if (!earlierEndDateInput || !laterStartDateInput) return 0;
  return calculateZeroLagGap(earlierEndDateInput, laterStartDateInput, holidays);
};

/**
 * Calculate working days inclusively (e.g. Start 23-07-26 to End 28-07-26).
 * Counts every working day from startDate to endDate inclusive.
 */
export const calculateInclusiveDuration = (
  startDateInput: string | Date,
  endDateInput: string | Date,
  holidays?: (string | { date: string })[]
): number => {
  const start = parseDateLocal(startDateInput);
  const end = parseDateLocal(endDateInput);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  if (startMidnight > endMidnight) return 0;

  let count = 0;
  const current = new Date(startMidnight);
  while (current <= endMidnight) {
    if (isWorkingDay(current, holidays)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
};

/**
 * Inter-Phase Gap Storage (0-Lag Convention):
 * Calculates working days strictly between earlierDate (e.g. Phase 1 End Date)
 * and laterDate (e.g. Phase 2 Start Date).
 * If Phase 1 ends on Tue 28th and Phase 2 starts on Wed 29th, gap = 0 working days.
 */
export const calculateZeroLagGap = (
  earlierDateInput: string | Date,
  laterDateInput: string | Date,
  holidays?: (string | { date: string })[]
): number => {
  const start = parseDateLocal(earlierDateInput);
  const end = parseDateLocal(laterDateInput);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  if (startMidnight.getTime() === endMidnight.getTime()) return 0;

  if (startMidnight < endMidnight) {
    let gap = 0;
    const current = new Date(startMidnight);
    current.setDate(current.getDate() + 1);
    while (current < endMidnight) {
      if (isWorkingDay(current, holidays)) {
        gap++;
      }
      current.setDate(current.getDate() + 1);
    }
    return gap;
  } else {
    // Reverse direction (negative gap)
    let gap = 0;
    const current = new Date(startMidnight);
    current.setDate(current.getDate() - 1);
    while (current > endMidnight) {
      if (isWorkingDay(current, holidays)) {
        gap--;
      }
      current.setDate(current.getDate() - 1);
    }
    return gap;
  }
};

/**
 * Add zero-lag working day gap to a base date.
 * If gap = 0, returns the immediate next working day.
 * If gap > 0, steps gap working days beyond the immediate next working day.
 */
export const addZeroLagGap = (
  baseDateInput: string | Date,
  gapWorkingDays: number,
  holidays?: (string | { date: string })[]
): string => {
  const base = parseDateLocal(baseDateInput);
  if (isNaN(base.getTime())) return '';

  const current = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  
  if (gapWorkingDays >= 0) {
    // First step to immediate next working day
    current.setDate(current.getDate() + 1);
    while (!isWorkingDay(current, holidays)) {
      current.setDate(current.getDate() + 1);
    }

    // Now step remaining gap working days
    let remaining = gapWorkingDays;
    while (remaining > 0) {
      current.setDate(current.getDate() + 1);
      if (isWorkingDay(current, holidays)) {
        remaining--;
      }
    }
    return formatDateLocal(current);
  } else {
    // Reverse direction: step |gapWorkingDays| working days backward
    let remaining = Math.abs(gapWorkingDays);
    while (remaining > 0) {
      current.setDate(current.getDate() - 1);
      if (isWorkingDay(current, holidays)) {
        remaining--;
      }
    }
    return formatDateLocal(current);
  }
};

