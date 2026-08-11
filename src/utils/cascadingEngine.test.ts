import { calculateInclusiveDuration, calculateZeroLagGap, addZeroLagGap, getNonWorkingDayReason } from './workingDays';
import { runBidirectionalCascade } from './cascadingEngine';
import { Phase, PhaseGap, ClientInternalMapping } from '../types';

function assertEquals<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, but got ${actual}. ${message || ''}`);
  }
}

export function runCascadingEngineTests() {
  const holidays = ['2026-07-27']; // Monday holiday

  // Test 0: Non-working day date picker guardrail
  assertEquals(getNonWorkingDayReason('2026-07-25', holidays), 'Saturday', 'Saturday weekend detection');
  assertEquals(getNonWorkingDayReason('2026-07-26', holidays), 'Sunday', 'Sunday weekend detection');
  assertEquals(getNonWorkingDayReason('2026-07-27', holidays), 'Configured Project/Global Holiday (2026-07-27)', 'Holiday detection');
  assertEquals(getNonWorkingDayReason('2026-07-28', holidays), null, 'Working day detection');

  // Test 1: Inclusive phase duration (Start Thu 23-07-26 to End Tue 28-07-26 with Mon 27 holiday)
  // Thu 23 (1), Fri 24 (2), Sat/Sun (weekend), Mon 27 (holiday), Tue 28 (3) = 3 working days
  const duration = calculateInclusiveDuration('2026-07-23', '2026-07-28', holidays);
  assertEquals(duration, 3, 'Inclusive duration Thu 23 to Tue 28 with Mon holiday');

  // Test 2: 0-Lag inter-phase gap (End Tue 28th, Start Wed 29th)
  const gapZero = calculateZeroLagGap('2026-07-28', '2026-07-29', holidays);
  assertEquals(gapZero, 0, 'Zero-lag gap between Tue 28th end and Wed 29th start');

  // Test 3: Add zero-lag gap
  const nextStart = addZeroLagGap('2026-07-28', 0, holidays);
  assertEquals(nextStart, '2026-07-29', 'Immediate next working day after Tue 28th');

  // Test 4: Bidirectional cascading with completed phase exclusion
  const testPhases: Phase[] = [
    {
      id: 'p1',
      moduleId: 'mod1',
      phaseName: 'SB',
      internalStartDate: '2026-07-20',
      internalEndDate: '2026-07-22',
      sourceFileRef: 'test',
      status: 'Completed' // IMMOVABLE ANCHOR
    },
    {
      id: 'p2',
      moduleId: 'mod1',
      phaseName: 'SBSMEVS',
      internalStartDate: '2026-07-23',
      internalEndDate: '2026-07-24',
      sourceFileRef: 'test',
      status: 'Pending'
    },
    {
      id: 'p3',
      moduleId: 'mod1',
      phaseName: 'ALPHA',
      internalStartDate: '2026-07-28',
      internalEndDate: '2026-07-29',
      sourceFileRef: 'test',
      status: 'Pending'
    }
  ];

  const testGaps: PhaseGap[] = [
    { projectId: 'proj1', earlierPhaseId: 'p1', laterPhaseId: 'p2', workingDaysGap: 0, gapType: 'internal_to_internal' },
    { projectId: 'proj1', earlierPhaseId: 'p2', laterPhaseId: 'p3', workingDaysGap: 1, gapType: 'internal_to_internal' }
  ];

  const testMappings: ClientInternalMapping[] = [];

  // Shift SBSMEVS start date forward
  const result = runBidirectionalCascade({
    modifiedPhaseId: 'p2',
    modifiedField: 'internalStartDate',
    newDate: '2026-07-28',
    allPhases: testPhases,
    phaseGaps: testGaps,
    clientMappings: testMappings,
    holidays
  });

  // Verify p1 (Completed) was skipped and dates remained untouched
  const updatedP1 = result.updatedPhases.find(p => p.id === 'p1');
  assertEquals(updatedP1?.internalStartDate, '2026-07-20', 'Completed phase start date untouched');
  assertEquals(updatedP1?.internalEndDate, '2026-07-22', 'Completed phase end date untouched');
  assertEquals(result.skippedCompletedPhases.includes('SB'), true, 'Completed phase SB listed in skipped list');

  // Verify p3 shifted forward
  const updatedP3 = result.updatedPhases.find(p => p.id === 'p3');
  assertEquals(updatedP3?.internalStartDate !== '2026-07-28', true, 'Downstream phase ALPHA shifted');

  // Test 5: Client date edit cascades forward and backward through all internal phases
  const fullPhases: Phase[] = [
    { id: 'ip1', moduleId: 'm1', phaseName: 'P1', internalStartDate: '2026-08-03', internalEndDate: '2026-08-04', sourceFileRef: 'test', status: 'Pending' },
    { id: 'ip2', moduleId: 'm1', phaseName: 'P2', internalStartDate: '2026-08-05', internalEndDate: '2026-08-06', sourceFileRef: 'test', status: 'Pending' },
    { id: 'ip3', moduleId: 'm1', phaseName: 'P3', internalStartDate: '2026-08-07', internalEndDate: '2026-08-10', sourceFileRef: 'test', status: 'Pending' },
    { id: 'cp2', moduleId: 'm1', phaseName: 'P2', clientDate: '2026-08-06', sourceFileRef: 'test', status: 'Pending' }
  ];

  const fullGaps: PhaseGap[] = [
    { projectId: 'p1', earlierPhaseId: 'ip1', laterPhaseId: 'ip2', workingDaysGap: 0, gapType: 'internal_to_internal' },
    { projectId: 'p1', earlierPhaseId: 'ip2', laterPhaseId: 'ip3', workingDaysGap: 0, gapType: 'internal_to_internal' },
    { projectId: 'p1', earlierPhaseId: 'ip2', laterPhaseId: 'cp2', workingDaysGap: 0, gapType: 'internal_to_client' }
  ];

  const fullMappings: ClientInternalMapping[] = [
    { id: 'm1', projectId: 'p1', clientPhaseName: 'P2', anchorInternalPhaseName: 'P2', anchorPoint: 'End' }
  ];

  const clientCascadeResult = runBidirectionalCascade({
    modifiedPhaseId: 'cp2',
    modifiedField: 'clientDate',
    newDate: '2026-08-12', // shifted forward
    allPhases: fullPhases,
    phaseGaps: fullGaps,
    clientMappings: fullMappings,
    holidays: []
  });

  const resIp1 = clientCascadeResult.updatedPhases.find(p => p.id === 'ip1');
  const resIp2 = clientCascadeResult.updatedPhases.find(p => p.id === 'ip2');
  const resIp3 = clientCascadeResult.updatedPhases.find(p => p.id === 'ip3');

  assertEquals(resIp2?.internalEndDate, '2026-08-12', 'Anchor internal phase P2 end date shifted');
  assertEquals(resIp3?.internalStartDate, '2026-08-13', 'Downstream internal phase P3 shifted forward');
  assertEquals(resIp1?.internalEndDate, '2026-08-10', 'Upstream internal phase P1 shifted backward from P2 start');

  console.log('✅ All cascading engine unit tests passed successfully.');
}

runCascadingEngineTests();
