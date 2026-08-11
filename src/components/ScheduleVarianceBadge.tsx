/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { ScheduleVariance } from '../types';

interface ScheduleVarianceBadgeProps {
  variance?: ScheduleVariance | null;
  label?: string;
}

export const ScheduleVarianceBadge: React.FC<ScheduleVarianceBadgeProps> = ({ variance, label }) => {
  if (!variance) return null;

  const { varianceDays, isDelayed, isAhead } = variance;

  if (!isDelayed && !isAhead) {
    return (
      <span
        title={`On baseline schedule (${variance.baselineDate})`}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
      >
        <CheckCircle2 className="w-3 h-3" />
        {label ? `${label}: On Track` : 'On Track'}
      </span>
    );
  }

  if (isDelayed) {
    return (
      <span
        title={`Baseline was ${variance.baselineDate}. Current date is delayed by ${varianceDays} working day(s).`}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
      >
        <AlertCircle className="w-3 h-3" />
        {label ? `${label}: ` : ''}+{varianceDays}d delay
      </span>
    );
  }

  return (
    <span
      title={`Baseline was ${variance.baselineDate}. Current date is ${varianceDays} day(s) ahead.`}
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"
    >
      <Clock className="w-3 h-3" />
      {label ? `${label}: ` : ''}-{varianceDays}d ahead
    </span>
  );
};

export default ScheduleVarianceBadge;
