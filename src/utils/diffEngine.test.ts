import { calculateSpreadsheetDiff } from './diffEngine';

function assertEquals<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, but got ${actual}. ${message || ''}`);
  }
}

export function runDiffEngineTests() {
  const existingPhases = [
    {
      id: 'phase-1',
      courseCode: 'CS101',
      moduleCode: 'MOD-A',
      language: 'English',
      phaseName: 'Alpha Phase',
      clientDate: '2026-08-01',
      internalStartDate: '2026-07-20',
      internalEndDate: '2026-07-25',
      status: 'Pending'
    },
    {
      id: 'phase-2',
      courseCode: 'CS101',
      moduleCode: 'MOD-A',
      language: 'English',
      phaseName: 'Beta Phase',
      clientDate: '2026-08-15',
      internalStartDate: '2026-07-26',
      internalEndDate: '2026-08-05',
      status: 'Pending'
    },
    {
      id: 'phase-3',
      courseCode: 'CS101',
      moduleCode: 'MOD-B',
      language: 'English',
      phaseName: 'Final Delivery',
      clientDate: '2026-09-01',
      internalStartDate: '2026-08-10',
      internalEndDate: '2026-08-20',
      status: 'Pending'
    }
  ];

  const incomingParsedRows = [
    // 1. Unchanged row (Alpha Phase - identical date)
    {
      courseCode: 'CS101',
      moduleCode: 'MOD-A',
      language: 'English',
      phaseName: 'Alpha Phase',
      clientDate: '2026-08-01'
    },
    // 2. Modified row (Beta Phase - date changed to 2026-08-20)
    {
      courseCode: 'CS101',
      moduleCode: 'MOD-A',
      language: 'English',
      phaseName: 'Beta Phase',
      clientDate: '2026-08-20'
    },
    // 3. Added row (New Gamma Phase)
    {
      courseCode: 'CS101',
      moduleCode: 'MOD-C',
      language: 'English',
      phaseName: 'Gamma Phase',
      clientDate: '2026-09-15'
    }
    // Note: phase-3 (Final Delivery) is omitted -> REMOVED / MISSING
  ];

  const diff = calculateSpreadsheetDiff(existingPhases, incomingParsedRows, 'Client');

  assertEquals(diff.added.length, 1, '1 new row added (Gamma Phase)');
  assertEquals(diff.added[0].phaseName, 'Gamma Phase', 'Added phase name match');

  assertEquals(diff.modified.length, 1, '1 row modified (Beta Phase date changed)');
  assertEquals(diff.modified[0].phase, 'Beta Phase', 'Modified phase name match');
  assertEquals(diff.modified[0].changes[0].newValue, '2026-08-20', 'Modified new date match');

  assertEquals(diff.unchanged.length, 1, '1 row unchanged (Alpha Phase)');
  assertEquals(diff.unchanged[0].phase, 'Alpha Phase', 'Unchanged phase match');

  assertEquals(diff.removed.length, 1, '1 row removed/missing (Final Delivery)');
  assertEquals(diff.removed[0].phase, 'Final Delivery', 'Removed phase name match');

  console.log('✅ All diff Engine 4-way categorization tests passed successfully.');
}

// Execute tests if invoked directly
runDiffEngineTests();
