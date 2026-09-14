/**
 * Bidirectional Cascading Engine for BRAN v2.0
 * Handles forward and backward date propagation across internal & client phases,
 * respecting dynamically computed in-memory zero-lag gaps, phase durations,
 * and completed phase firewalls.
 */

import { Phase, ClientPhase, InternalPhase, PhaseGap, ClientInternalMapping } from '../types';
import {
  parseDateLocal,
  formatDateLocal,
  isWorkingDay,
  addWorkingDays,
  calculateInclusiveDuration,
  calculateZeroLagGap,
  addZeroLagGap
} from './workingDays';

/**
 * Dynamic workflow index helper (relying on dynamic phase order or explicit index)
 */
export function getWorkflowIndex(_phaseName: string): number {
  return 999;
}

export interface CascadeResult {
  updatedPhases: Phase[];
  updatedGaps: PhaseGap[];
  skippedCompletedPhases: string[];
}

export interface SequenceConflict {
  phaseId: string;
  phaseName: string;
  predecessorId?: string;
  predecessorName?: string;
  reason: string;
  message?: string;
  gap: number;
}

/**
 * Detect sequence conflicts (inverted start/end or negative gap between consecutive phases).
 */
export function detectSequenceConflicts(
  phases: Phase[],
  holidays: string[] = []
): SequenceConflict[] {
  const conflicts: SequenceConflict[] = [];

  // Group phases by module or course entity
  const entityGroups = new Map<string, Phase[]>();
  phases.forEach(p => {
    const key = p.moduleId || p.courseId || 'default';
    const list = entityGroups.get(key) || [];
    list.push(p);
    entityGroups.set(key, list);
  });

  entityGroups.forEach((groupPhases) => {
    const internalPhases = groupPhases
      .filter(p => p.sourceFile === 'Internal' || !p.sourceFile || p.sourceFile !== 'Client' || !!p.internalStartDate || !!p.internalEndDate)
      .sort((a, b) => (a.phaseSequence ?? 999) - (b.phaseSequence ?? 999));

    // 1. Check intra-phase conflict (start date > end date)
    internalPhases.forEach(p => {
      if (p.internalStartDate && p.internalEndDate) {
        if (p.internalStartDate > p.internalEndDate) {
          const reason = `Sequence Conflict: "${p.phaseName}" start date (${p.internalStartDate}) is after its end date (${p.internalEndDate}).`;
          conflicts.push({
            phaseId: p.id,
            phaseName: p.phaseName,
            reason,
            message: reason,
            gap: -1
          });
        }
      }
    });

    // 2. Check inter-phase conflict (successor starts before predecessor ends)
    for (let i = 0; i < internalPhases.length - 1; i++) {
      const pred = internalPhases[i];
      const succ = internalPhases[i + 1];

      if (pred.internalEndDate && succ.internalStartDate) {
        const gap = calculateZeroLagGap(pred.internalEndDate, succ.internalStartDate, holidays);
        if (gap < 0 || succ.internalStartDate < pred.internalEndDate) {
          const reason = `Sequence Conflict: "${succ.phaseName}" starts before predecessor "${pred.phaseName}" finishes. Adjust dates to establish a valid positive sequence.`;
          conflicts.push({
            phaseId: succ.id,
            phaseName: succ.phaseName,
            predecessorId: pred.id,
            predecessorName: pred.phaseName,
            reason,
            message: reason,
            gap
          });
        }
      }
    }
  });

  return conflicts;
}

/**
 * Recalculate dates bidirectionally starting from a modified phase date using in-memory dynamic gaps.
 */
export function runBidirectionalCascade({
  modifiedPhaseId,
  modifiedField,
  newDate,
  allPhases,
  phaseGaps = [],
  clientMappings = [],
  holidays = []
}: {
  modifiedPhaseId: string;
  modifiedField: 'internalStartDate' | 'internalEndDate' | 'clientDate';
  newDate: string;
  allPhases: Phase[];
  phaseGaps?: PhaseGap[];
  clientMappings?: ClientInternalMapping[];
  holidays?: string[];
}): CascadeResult {
  // Snapshot original phases to measure existing dynamic gaps before shift
  const origPhasesMap = new Map<string, Phase>(allPhases.map(p => [p.id, { ...p }]));
  const phaseMap = new Map<string, Phase>(allPhases.map(p => [p.id, { ...p }]));
  const targetPhase = phaseMap.get(modifiedPhaseId);

  if (!targetPhase) {
    return { updatedPhases: allPhases, updatedGaps: [], skippedCompletedPhases: [] };
  }

  const skippedCompleted: Set<string> = new Set();
  const modifiedPhaseIds: Set<string> = new Set([modifiedPhaseId]);

  // Support both module-level and course-level scope
  const targetParentKey = targetPhase.moduleId || targetPhase.courseId;
  const modulePhases = Array.from(phaseMap.values()).filter(p => 
    targetPhase.moduleId ? p.moduleId === targetPhase.moduleId : p.courseId === targetPhase.courseId
  );

  const isClientPhase = (p: Phase) => p.sourceFile === 'Client' || (!!p.clientDate && !p.internalStartDate && !p.internalEndDate);

  const internalPhases = modulePhases
    .filter(p => !isClientPhase(p) && (p.internalPhaseId || p.internalStartDate || p.internalEndDate || p.sourceFile === 'Internal' || !p.sourceFile))
    .sort((a, b) => (a.phaseSequence ?? 999) - (b.phaseSequence ?? 999));

  const clientPhases = modulePhases
    .filter(p => isClientPhase(p))
    .sort((a, b) => (a.phaseSequence ?? 999) - (b.phaseSequence ?? 999));

  // Helper to find internal anchor for a client phase
  const findAnchorForClientPhase = (cp: Phase): { anchorInternal: Phase | undefined; anchorPoint: 'Start' | 'End' } => {
    const mapping = clientMappings.find(m =>
      m.clientPhaseName.toLowerCase() === cp.phaseName.toLowerCase()
    );
    if (mapping?.anchorInternalPhaseName) {
      const found = internalPhases.find(ip =>
        ip.phaseName.toLowerCase().includes(mapping.anchorInternalPhaseName.toLowerCase()) ||
        mapping.anchorInternalPhaseName.toLowerCase().includes(ip.phaseName.toLowerCase())
      );
      if (found) return { anchorInternal: found, anchorPoint: mapping.anchorPoint || 'End' };
    }

    // Name match fallback
    const nameMatch = internalPhases.find(ip =>
      ip.phaseName.toLowerCase().includes(cp.phaseName.toLowerCase()) ||
      cp.phaseName.toLowerCase().includes(ip.phaseName.toLowerCase())
    );
    if (nameMatch) return { anchorInternal: nameMatch, anchorPoint: 'End' };

    // Index match fallback
    const cpIdx = clientPhases.findIndex(p => p.id === cp.id || p.clientPhaseId === cp.clientPhaseId);
    if (cpIdx !== -1 && internalPhases[cpIdx]) {
      return { anchorInternal: internalPhases[cpIdx], anchorPoint: 'End' };
    }

    return { anchorInternal: internalPhases[0], anchorPoint: 'End' };
  };

  let anchorInternalId: string | null = null;

  // Update modified target phase field
  if (modifiedField === 'clientDate') {
    targetPhase.clientDate = newDate;

    if (internalPhases.length > 0) {
      const { anchorInternal, anchorPoint } = findAnchorForClientPhase(targetPhase);

      if (anchorInternal) {
        anchorInternalId = anchorInternal.id;
        if (anchorInternal.status !== 'Completed' && anchorInternal.status !== 'Approved') {
          const origAnchor = origPhasesMap.get(anchorInternal.id);
          const origClient = origPhasesMap.get(targetPhase.id);

          const origBaseDate = anchorPoint === 'Start'
            ? (origAnchor?.internalStartDate || origAnchor?.internalEndDate)
            : (origAnchor?.internalEndDate || origAnchor?.internalStartDate);

          const dynamicGap = (origBaseDate && origClient?.clientDate)
            ? calculateZeroLagGap(origBaseDate, origClient.clientDate, holidays)
            : 0;

          const newAnchorDate = dynamicGap > 0 
            ? addZeroLagGap(newDate, -dynamicGap, holidays) 
            : newDate;

          const duration = calculateInclusiveDuration(
            origAnchor?.internalStartDate || newAnchorDate,
            origAnchor?.internalEndDate || newAnchorDate,
            holidays
          ) || 1;

          if (anchorPoint === 'Start') {
            anchorInternal.internalStartDate = newAnchorDate;
            anchorInternal.internalEndDate = addWorkingDays(newAnchorDate, Math.max(0, duration - 1), holidays);
          } else {
            anchorInternal.internalEndDate = newAnchorDate;
            anchorInternal.internalStartDate = addWorkingDays(newAnchorDate, -Math.max(0, duration - 1), holidays);
          }
          modifiedPhaseIds.add(anchorInternal.id);
        } else {
          skippedCompleted.add(anchorInternal.phaseName || anchorInternal.id);
        }
      }
    } else {
      // Direct client-to-client cascade when no internal phases exist
      const targetClientIdx = clientPhases.findIndex(p => p.id === modifiedPhaseId || p.clientPhaseId === modifiedPhaseId);
      if (targetClientIdx !== -1) {
        // Forward client cascade
        for (let i = targetClientIdx; i < clientPhases.length - 1; i++) {
          const cur = clientPhases[i];
          const nxt = clientPhases[i + 1];
          if (nxt.status === 'Completed' || nxt.status === 'Approved') {
            skippedCompleted.add(nxt.phaseName || nxt.id);
            break;
          }
          const origCur = origPhasesMap.get(cur.id);
          const origNxt = origPhasesMap.get(nxt.id);
          const dynamicGap = (origCur?.clientDate && origNxt?.clientDate)
            ? Math.max(0, calculateZeroLagGap(origCur.clientDate, origNxt.clientDate, holidays))
            : 0;

          if (cur.clientDate) {
            const nextClientDate = addZeroLagGap(cur.clientDate, dynamicGap, holidays);
            if (nxt.clientDate !== nextClientDate) {
              nxt.clientDate = nextClientDate;
              modifiedPhaseIds.add(nxt.id);
            }
          }
        }
        // Backward client cascade
        for (let i = targetClientIdx; i > 0; i--) {
          const cur = clientPhases[i];
          const prv = clientPhases[i - 1];
          if (prv.status === 'Completed' || prv.status === 'Approved') {
            skippedCompleted.add(prv.phaseName || prv.id);
            if (cur.clientDate && prv.clientDate && cur.clientDate <= prv.clientDate) {
              throw new Error(`Cannot cascade earlier: Collides with locked historical milestone "${prv.phaseName}".`);
            }
            break;
          }
          const origCur = origPhasesMap.get(cur.id);
          const origPrv = origPhasesMap.get(prv.id);
          const dynamicGap = (origPrv?.clientDate && origCur?.clientDate)
            ? Math.max(0, calculateZeroLagGap(origPrv.clientDate, origCur.clientDate, holidays))
            : 0;

          if (cur.clientDate) {
            const prevClientDate = addZeroLagGap(cur.clientDate, -(dynamicGap + 1), holidays);
            if (prv.clientDate !== prevClientDate) {
              prv.clientDate = prevClientDate;
              modifiedPhaseIds.add(prv.id);
            }
          }
        }
      }
    }
  } else if (modifiedField === 'internalStartDate') {
    const oldDuration = calculateInclusiveDuration(
      origPhasesMap.get(targetPhase.id)?.internalStartDate || newDate,
      origPhasesMap.get(targetPhase.id)?.internalEndDate || newDate,
      holidays
    ) || 1;
    targetPhase.internalStartDate = newDate;
    // Adjust end date preserving inclusive duration
    targetPhase.internalEndDate = addWorkingDays(newDate, Math.max(0, oldDuration - 1), holidays);
  } else if (modifiedField === 'internalEndDate') {
    const oldDuration = calculateInclusiveDuration(
      origPhasesMap.get(targetPhase.id)?.internalStartDate || newDate,
      origPhasesMap.get(targetPhase.id)?.internalEndDate || newDate,
      holidays
    ) || 1;
    targetPhase.internalEndDate = newDate;
    // Adjust start date preserving inclusive duration
    targetPhase.internalStartDate = addWorkingDays(newDate, -Math.max(0, oldDuration - 1), holidays);
  }

  const targetInternalId = anchorInternalId || modifiedPhaseId;
  const targetInternalIdx = internalPhases.findIndex(p => p.id === targetInternalId || p.internalPhaseId === targetInternalId);

  // 1. FORWARD PROPAGATION (Chronologically downstream internal phases)
  if (targetInternalIdx !== -1) {
    for (let i = targetInternalIdx; i < internalPhases.length - 1; i++) {
      const currentPhase = internalPhases[i];
      const nextPhase = internalPhases[i + 1];

      // Completed phase firewall: stops forward cascade
      if (nextPhase.status === 'Completed' || nextPhase.status === 'Approved') {
        skippedCompleted.add(nextPhase.phaseName || nextPhase.id);
        break;
      }

      // Compute dynamic in-memory gap from original dates before shift
      const origCurEnd = origPhasesMap.get(currentPhase.id)?.internalEndDate || origPhasesMap.get(currentPhase.id)?.internalStartDate;
      const origNextStart = origPhasesMap.get(nextPhase.id)?.internalStartDate;

      const gapDays = (origCurEnd && origNextStart)
        ? Math.max(0, calculateZeroLagGap(origCurEnd, origNextStart, holidays))
        : 0;

      const currentEndDate = currentPhase.internalEndDate || currentPhase.internalStartDate;

      if (currentEndDate) {
        const nextNewStartDate = addZeroLagGap(currentEndDate, gapDays, holidays);
        const origNextStartVal = origPhasesMap.get(nextPhase.id)?.internalStartDate;
        const origNextEndVal = origPhasesMap.get(nextPhase.id)?.internalEndDate;

        const duration = (origNextStartVal && origNextEndVal)
          ? calculateInclusiveDuration(origNextStartVal, origNextEndVal, holidays)
          : (calculateInclusiveDuration(nextPhase.internalStartDate || nextNewStartDate, nextPhase.internalEndDate || nextNewStartDate, holidays) || 1);

        if (nextPhase.internalStartDate !== nextNewStartDate) {
          nextPhase.internalStartDate = nextNewStartDate;
          nextPhase.internalEndDate = addWorkingDays(nextNewStartDate, Math.max(0, duration - 1), holidays);
          modifiedPhaseIds.add(nextPhase.id);
        }
      }
    }

    // 2. BACKWARD PROPAGATION (Chronologically upstream internal phases)
    for (let i = targetInternalIdx; i > 0; i--) {
      const currentPhase = internalPhases[i];
      const prevPhase = internalPhases[i - 1];

      // Completed phase firewall:
      // If previous phase is completed, check if shifting backward collides with it!
      if (prevPhase.status === 'Completed' || prevPhase.status === 'Approved') {
        skippedCompleted.add(prevPhase.phaseName || prevPhase.id);
        if (currentPhase.internalStartDate && prevPhase.internalEndDate) {
          const gap = calculateZeroLagGap(prevPhase.internalEndDate, currentPhase.internalStartDate, holidays);
          if (gap < 0 || currentPhase.internalStartDate <= prevPhase.internalEndDate) {
            throw new Error(`Cannot cascade earlier: Collides with locked historical milestone "${prevPhase.phaseName}".`);
          }
        }
        break;
      }

      const origCurStart = origPhasesMap.get(currentPhase.id)?.internalStartDate;
      const origPrevEnd = origPhasesMap.get(prevPhase.id)?.internalEndDate;

      const gapDays = (origPrevEnd && origCurStart)
        ? Math.max(0, calculateZeroLagGap(origPrevEnd, origCurStart, holidays))
        : 0;

      const currentStartDate = currentPhase.internalStartDate;

      if (currentStartDate) {
        // Step backward from currentStartDate by gapDays + 1 working day to find prev end date
        const prevNewEndDate = addZeroLagGap(currentStartDate, -(gapDays + 1), holidays);

        // Check if prevNewEndDate collides with any prior completed phase
        if (i > 1) {
          const priorPhase = internalPhases[i - 2];
          if ((priorPhase.status === 'Completed' || priorPhase.status === 'Approved') && priorPhase.internalEndDate) {
            if (prevNewEndDate < priorPhase.internalEndDate) {
              throw new Error(`Cannot cascade earlier: Collides with locked historical milestone "${priorPhase.phaseName}".`);
            }
          }
        }

        const origPrevStartVal = origPhasesMap.get(prevPhase.id)?.internalStartDate;
        const origPrevEndVal = origPhasesMap.get(prevPhase.id)?.internalEndDate;

        const duration = (origPrevStartVal && origPrevEndVal)
          ? calculateInclusiveDuration(origPrevStartVal, origPrevEndVal, holidays)
          : (calculateInclusiveDuration(prevPhase.internalStartDate || prevNewEndDate, prevPhase.internalEndDate || prevNewEndDate, holidays) || 1);

        if (prevPhase.internalEndDate !== prevNewEndDate) {
          prevPhase.internalEndDate = prevNewEndDate;
          prevPhase.internalStartDate = addWorkingDays(prevNewEndDate, -Math.max(0, duration - 1), holidays);
          modifiedPhaseIds.add(prevPhase.id);
        }
      }
    }
  }

  // 3. CROSS-PLAN BRIDGE (Propagate internal anchor shifts to client milestones)
  if (internalPhases.length > 0) {
    clientPhases.forEach(cp => {
      if (cp.status === 'Completed' || cp.status === 'Approved') {
        skippedCompleted.add(cp.phaseName || cp.id);
        return;
      }

      if (modifiedField === 'clientDate' && (cp.id === modifiedPhaseId || cp.clientPhaseId === modifiedPhaseId)) {
        // Do not overwrite explicitly edited client date
        return;
      }

      const { anchorInternal, anchorPoint } = findAnchorForClientPhase(cp);

      if (anchorInternal) {
        const origAnchorBase = anchorPoint === 'Start'
          ? (origPhasesMap.get(anchorInternal.id)?.internalStartDate || origPhasesMap.get(anchorInternal.id)?.internalEndDate)
          : (origPhasesMap.get(anchorInternal.id)?.internalEndDate || origPhasesMap.get(anchorInternal.id)?.internalStartDate);

        const origClientDate = origPhasesMap.get(cp.id)?.clientDate;

        const dynamicGap = (origAnchorBase && origClientDate)
          ? calculateZeroLagGap(origAnchorBase, origClientDate, holidays)
          : 0;

        const anchorBaseDate = anchorPoint === 'Start'
          ? (anchorInternal.internalStartDate || anchorInternal.internalEndDate)
          : (anchorInternal.internalEndDate || anchorInternal.internalStartDate);

        if (anchorBaseDate) {
          const newClientDate = dynamicGap > 0 
            ? addZeroLagGap(anchorBaseDate, dynamicGap, holidays) 
            : (dynamicGap < 0 ? addZeroLagGap(anchorBaseDate, -(Math.abs(dynamicGap) + 1), holidays) : anchorBaseDate);

          if (cp.clientDate !== newClientDate) {
            cp.clientDate = newClientDate;
            modifiedPhaseIds.add(cp.id);
          }
        }
      }
    });
  }

  // Dynamically compute resulting gaps across internal phases for return metadata
  const updatedGaps: PhaseGap[] = [];
  for (let i = 0; i < internalPhases.length - 1; i++) {
    const p1 = internalPhases[i];
    const p2 = internalPhases[i + 1];
    if (p1.internalEndDate && p2.internalStartDate) {
      const gap = calculateZeroLagGap(p1.internalEndDate, p2.internalStartDate, holidays);
      updatedGaps.push({
        projectId: p1.id,
        earlierPhaseId: p1.internalPhaseId || p1.id,
        laterPhaseId: p2.internalPhaseId || p2.id,
        workingDaysGap: gap,
        gapType: 'internal_to_internal'
      });
    }
  }

  const resultPhases = Array.from(phaseMap.values());

  return {
    updatedPhases: resultPhases,
    updatedGaps,
    skippedCompletedPhases: Array.from(skippedCompleted)
  };
}
