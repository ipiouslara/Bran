import { filterPhasesByDateRange, DatePreset } from '../components/ReportExportModal';
import { Phase } from '../types';

function assertEquals<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, but got ${actual}. ${message || ''}`);
  }
}

export function runReportExporterTests() {
  const referenceNow = new Date('2026-07-24T12:00:00Z');

  const mockPhases: Phase[] = [
    {
      id: 'p1',
      moduleId: 'm1',
      phaseName: 'Alpha Phase',
      clientDate: '2026-07-22', // 2 days ago
      internalStartDate: '2026-07-21',
      internalEndDate: '2026-07-23',
      sourceFileRef: 'ref1'
    },
    {
      id: 'p2',
      moduleId: 'm1',
      phaseName: 'Beta Phase',
      clientDate: '2026-07-10', // 14 days ago
      internalStartDate: '2026-07-08',
      internalEndDate: '2026-07-12',
      sourceFileRef: 'ref2'
    },
    {
      id: 'p3',
      moduleId: 'm2',
      phaseName: 'QA Review',
      clientDate: '2026-06-20', // 34 days ago
      internalStartDate: '2026-06-15',
      internalEndDate: '2026-06-25',
      sourceFileRef: 'ref3'
    }
  ];

  // Test 1: All Dates preset
  const allRes = filterPhasesByDateRange(mockPhases, 'client', 'all', undefined, undefined, referenceNow);
  assertEquals(allRes.length, 3, 'All dates includes all 3 phases');

  // Test 2: Last 7 Days preset
  const sevenDaysRes = filterPhasesByDateRange(mockPhases, 'client', '7days', undefined, undefined, referenceNow);
  assertEquals(sevenDaysRes.length, 1, 'Last 7 days includes only 1 phase');
  assertEquals(sevenDaysRes[0].phaseName, 'Alpha Phase', 'Matched Alpha Phase');

  // Test 3: Last 15 Days preset
  const fifteenDaysRes = filterPhasesByDateRange(mockPhases, 'client', '15days', undefined, undefined, referenceNow);
  assertEquals(fifteenDaysRes.length, 2, 'Last 15 days includes 2 phases');

  // Test 4: Custom date range preset
  const customRes = filterPhasesByDateRange(mockPhases, 'client', 'custom', '2026-06-01', '2026-06-30', referenceNow);
  assertEquals(customRes.length, 1, 'Custom June range matches 1 phase');
  assertEquals(customRes[0].phaseName, 'QA Review', 'Matched QA Review');

  console.log('✅ All Report Exporter date filter tests passed successfully.');
}

// Execute tests if invoked directly
runReportExporterTests();
