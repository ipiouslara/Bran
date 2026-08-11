/**
 * Bidirectional Cascading Engine for BRAN v2.0
 * Handles forward and backward date propagation across internal & client phases,
 * respecting zero-lag gaps, phase durations, and completed phase exclusions.
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

/**
 * Recalculate dates bidirectionally starting from a modified phase date.
 */
export function runBidirectionalCascade({
  modifiedPhaseId,
  modifiedField,
  newDate,
  allPhases,
  phaseGaps,
  clientMappings,
  holidays
}: {
  modifiedPhaseId: string;
  modifiedField: 'internalStartDate' | 'internalEndDate' | 'clientDate';
  newDate: string;
  allPhases: Phase[];
  phaseGaps: PhaseGap[];
  clientMappings: ClientInternalMapping[];
  holidays: string[];
}): CascadeResult {
  const phaseMap = new Map<string, Phase>(allPhases.map(p => [p.id, { ...p }]));
  const targetPhase = phaseMap.get(modifiedPhaseId);

  if (!targetPhase) {
    return { updatedPhases: allPhases, updatedGaps: phaseGaps, skippedCompletedPhases: [] };
  }

  const skippedCompleted: Set<string> = new Set();
  const modifiedPhaseIds: Set<string> = new Set([modifiedPhaseId]);

  const moduleId = targetPhase.moduleId;
  const modulePhases = Array.from(phaseMap.values()).filter(p => p.moduleId === moduleId);

  const internalPhases = modulePhases
    .filter(p => p.internalPhaseId || p.internalStartDate || p.internalEndDate)
    .sort((a, b) => getWorkflowIndex(a.phaseName) - getWorkflowIndex(b.phaseName));

  const clientPhases = modulePhases
    .filter(p => p.clientPhaseId || p.clientDate)
    .sort((a, b) => getWorkflowIndex(a.phaseName) - getWorkflowIndex(b.phaseName));

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
        if (anchorInternal.status !== 'Completed') {
          const gapRecord = phaseGaps.find(
            g => (g.earlierPhaseId === anchorInternal.id || g.earlierPhaseId === anchorInternal.internalPhaseId) &&
                 (g.laterPhaseId === targetPhase.id || g.laterPhaseId === targetPhase.clientPhaseId)
          );
          const gapDays = gapRecord ? gapRecord.workingDaysGap : 0;
          const newAnchorDate = gapDays > 0 ? addZeroLagGap(newDate, -gapDays, holidays) : newDate;
          const duration = calculateInclusiveDuration(
            anchorInternal.internalStartDate || newAnchorDate,
            anchorInternal.internalEndDate || newAnchorDate,
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
          if (nxt.status === 'Completed') {
            skippedCompleted.add(nxt.phaseName || nxt.id);
            continue;
          }
          const gapRecord = phaseGaps.find(
            g => (g.earlierPhaseId === cur.id || g.earlierPhaseId === cur.clientPhaseId) &&
                 (g.laterPhaseId === nxt.id || g.laterPhaseId === nxt.clientPhaseId)
          );
          const gapDays = gapRecord ? gapRecord.workingDaysGap : 0;
          if (cur.clientDate) {
            const nextClientDate = addZeroLagGap(cur.clientDate, gapDays, holidays);
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
          if (prv.status === 'Completed') {
            skippedCompleted.add(prv.phaseName || prv.id);
            continue;
          }
          const gapRecord = phaseGaps.find(
            g => (g.earlierPhaseId === prv.id || g.earlierPhaseId === prv.clientPhaseId) &&
                 (g.laterPhaseId === cur.id || g.laterPhaseId === cur.clientPhaseId)
          );
          const gapDays = gapRecord ? gapRecord.workingDaysGap : 0;
          if (cur.clientDate) {
            const prevClientDate = addZeroLagGap(cur.clientDate, -(gapDays + 1), holidays);
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
      targetPhase.internalStartDate || newDate,
      targetPhase.internalEndDate || newDate,
      holidays
    ) || 1;
    targetPhase.internalStartDate = newDate;
    // Adjust end date preserving inclusive duration
    targetPhase.internalEndDate = addWorkingDays(newDate, Math.max(0, oldDuration - 1), holidays);
  } else if (modifiedField === 'internalEndDate') {
    const oldDuration = calculateInclusiveDuration(
      targetPhase.internalStartDate || newDate,
      targetPhase.internalEndDate || newDate,
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

      // Skip completed next phase (immovable anchor)
      if (nextPhase.status === 'Completed') {
        skippedCompleted.add(nextPhase.phaseName || nextPhase.id);
        continue;
      }

      const gapRecord = phaseGaps.find(
        g => (g.earlierPhaseId === currentPhase.id || g.earlierPhaseId === currentPhase.internalPhaseId) &&
             (g.laterPhaseId === nextPhase.id || g.laterPhaseId === nextPhase.internalPhaseId)
      );

      const gapDays = gapRecord ? gapRecord.workingDaysGap : 0;
      const currentEndDate = currentPhase.internalEndDate || currentPhase.internalStartDate;

      if (currentEndDate) {
        const nextNewStartDate = addZeroLagGap(currentEndDate, gapDays, holidays);
        const duration = calculateInclusiveDuration(
          nextPhase.internalStartDate || nextNewStartDate,
          nextPhase.internalEndDate || nextNewStartDate,
          holidays
        ) || 1;

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

      // Skip completed previous phase (immovable anchor)
      if (prevPhase.status === 'Completed') {
        skippedCompleted.add(prevPhase.phaseName || prevPhase.id);
        continue;
      }

      const gapRecord = phaseGaps.find(
        g => (g.earlierPhaseId === prevPhase.id || g.earlierPhaseId === prevPhase.internalPhaseId) &&
             (g.laterPhaseId === currentPhase.id || g.laterPhaseId === currentPhase.internalPhaseId)
      );

      const gapDays = gapRecord ? gapRecord.workingDaysGap : 0;
      const currentStartDate = currentPhase.internalStartDate;

      if (currentStartDate) {
        // Step backward from currentStartDate by gapDays + 1 working day to find prev end date
        const prevNewEndDate = addZeroLagGap(currentStartDate, -(gapDays + 1), holidays);
        const duration = calculateInclusiveDuration(
          prevPhase.internalStartDate || prevNewEndDate,
          prevPhase.internalEndDate || prevNewEndDate,
          holidays
        ) || 1;

        if (prevPhase.internalEndDate !== prevNewEndDate) {
          prevPhase.internalEndDate = prevNewEndDate;
          prevPhase.internalStartDate = addWorkingDays(prevNewEndDate, -Math.max(0, duration - 1), holidays);
          modifiedPhaseIds.add(prevPhase.id);
        }
      }
    }
  }

  // 3. CLIENT PHASE PROPAGATION
  // Re-align all client phase dates linked to internal anchors (before and after)
  if (internalPhases.length > 0) {
    clientPhases.forEach(cp => {
      if (cp.status === 'Completed') {
        skippedCompleted.add(cp.phaseName || cp.id);
        return;
      }

      if (modifiedField === 'clientDate' && (cp.id === modifiedPhaseId || cp.clientPhaseId === modifiedPhaseId)) {
        // Do not overwrite the explicitly edited client date
        return;
      }

      const { anchorInternal, anchorPoint } = findAnchorForClientPhase(cp);

      if (anchorInternal) {
        const anchorBaseDate = anchorPoint === 'Start'
          ? (anchorInternal.internalStartDate || anchorInternal.internalEndDate)
          : (anchorInternal.internalEndDate || anchorInternal.internalStartDate);

        if (anchorBaseDate) {
          const gapRecord = phaseGaps.find(
            g => (g.earlierPhaseId === anchorInternal.id || g.earlierPhaseId === anchorInternal.internalPhaseId) &&
                 (g.laterPhaseId === cp.id || g.laterPhaseId === cp.clientPhaseId)
          );

          const targetGap = gapRecord ? gapRecord.workingDaysGap : 0;
          const newClientDate = targetGap > 0 ? addZeroLagGap(anchorBaseDate, targetGap, holidays) : anchorBaseDate;

          if (cp.clientDate !== newClientDate) {
            cp.clientDate = newClientDate;
            modifiedPhaseIds.add(cp.id);
          }
        }
      }
    });
  }

  // Recompute updated gaps for all adjacent internal phases and client-anchor links
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
