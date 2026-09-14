import { addWorkingDays, workingDaysBetween, isWorkingDay, calculateInclusiveDuration } from './workingDays';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEquals<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, but got ${actual}. ${message || ''}`);
  }
}

export function runWorkingDaysTests() {
  const holidays = ['2026-07-27', '2026-07-28']; // Mon & Tue holiday

  // Test 1: isWorkingDay
  assertEquals(isWorkingDay('2026-07-24', holidays), true, 'Friday is working day');
  assertEquals(isWorkingDay('2026-07-25', holidays), false, 'Saturday is weekend');
  assertEquals(isWorkingDay('2026-07-26', holidays), false, 'Sunday is weekend');
  assertEquals(isWorkingDay('2026-07-27', holidays), false, 'Monday is configured holiday');

  // Test 2: 3-day shift skipping weekends
  const resultWithoutHolidays = addWorkingDays('2026-07-24', 3, []);
  assertEquals(resultWithoutHolidays, '2026-07-29', '3-day shift from Fri skips Sat/Sun');

  // Test 3: 3-day shift skipping weekends AND holidays
  const resultWithHolidays = addWorkingDays('2026-07-24', 3, holidays);
  assertEquals(resultWithHolidays, '2026-07-31', '3-day shift from Fri skips Sat/Sun + Mon/Tue holidays');

  // Test 4: workingDaysBetween (shift delta)
  const delta = workingDaysBetween('2026-07-24', '2026-07-31', holidays);
  assertEquals(delta, 3, 'Calculates 3 working days delta');

  // Test 5: calculateInclusiveDuration (capacity and allocation working days)
  assertEquals(calculateInclusiveDuration('2026-07-24', '2026-07-24', holidays), 1, 'Single working day task counts as 1 day');
  assertEquals(calculateInclusiveDuration('2026-07-25', '2026-07-26', holidays), 0, 'Weekend only task counts as 0 working days');
  assertEquals(calculateInclusiveDuration('2026-07-20', '2026-07-24', []), 5, 'Full standard work week Mon-Fri is 5 working days');
  assertEquals(calculateInclusiveDuration('2026-07-24', '2026-07-31', holidays), 4, 'Jul 24 (Fri) to Jul 31 (Fri) with Mon/Tue holidays is 4 working days');

  console.log('✅ All working days calculation tests passed successfully.');
}

// Execute tests if invoked directly
runWorkingDaysTests();

