import React from 'react';

interface OverviewSkeletonProps {
  theme?: 'dark' | 'light';
}

export const OverviewSkeleton: React.FC<OverviewSkeletonProps> = ({
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';
  const bgCard = isDark ? 'bg-[#0D0D0D] border-neutral-800/80' : 'bg-white border-neutral-200';
  const pulseBg = isDark ? 'bg-neutral-800/70' : 'bg-neutral-200';
  const inputBg = isDark ? 'bg-[#121212] border-neutral-800/60' : 'bg-slate-100 border-neutral-200';
  const borderColor = isDark ? 'border-neutral-800/60' : 'border-neutral-200';

  return (
    <div className="-mt-6 space-y-6 bg-[var(--bg-page)] text-[var(--text-main)] animate-pulse">
      {/* Header Bar */}
      <div className="h-[52px] flex items-center justify-between border-b border-[var(--border-subtle)] px-0">
        <div className="h-7 w-32 rounded-md bg-neutral-800/70" />
        <div className={`h-8 w-48 rounded-lg ${inputBg}`} />
      </div>

      {/* 4 KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Projects', iconBg: 'bg-emerald-500/10' },
          { label: 'Deliverables Due', iconBg: 'bg-cyan-500/10' },
          { label: 'High Risk / Overdue', iconBg: 'bg-rose-500/10' },
          { label: 'Blackout Windows', iconBg: 'bg-amber-500/10' },
        ].map((item, i) => (
          <div key={i} className={`p-4 rounded-xl border ${bgCard} shadow-lg space-y-3`}>
            <div className="flex justify-between items-center">
              <span className="text-xs text-neutral-400 font-semibold">{item.label}</span>
              <div className={`w-7 h-7 rounded-lg ${pulseBg}`} />
            </div>
            <div className={`h-8 w-16 rounded-md ${pulseBg}`} />
            <div className={`h-2 w-full rounded-full ${pulseBg}`} />
          </div>
        ))}
      </div>

      {/* Main Dashboard Layout (2 Columns: Left 2/3 Portfolio Card + Right 1/3 Summary Card) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Portfolio Health / Scope Card */}
        <div className={`lg:col-span-2 p-6 rounded-xl border ${bgCard} shadow-xl space-y-4`}>
          <div className="flex justify-between items-center">
            <div className={`h-5 w-40 rounded-md ${pulseBg}`} />
            <div className={`h-7 w-28 rounded-lg ${inputBg}`} />
          </div>
          <div className="space-y-3 pt-2">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className={`p-3.5 rounded-xl border ${borderColor} flex justify-between items-center ${inputBg}`}>
                <div className="space-y-1.5 flex-1">
                  <div className={`h-4 w-36 rounded-md ${pulseBg}`} />
                  <div className={`h-3 w-24 rounded-md ${pulseBg}`} />
                </div>
                <div className={`h-6 w-16 rounded-full ${pulseBg}`} />
              </div>
            ))}
          </div>
        </div>

        {/* Right Status Summary Ring Card */}
        <div className={`p-6 rounded-xl border ${bgCard} shadow-xl flex flex-col justify-between space-y-6`}>
          <div className="space-y-4">
            <div className={`h-5 w-32 rounded-md ${pulseBg}`} />
            <div className="relative w-44 h-44 mx-auto flex items-center justify-center pt-2">
              <div className={`w-40 h-40 rounded-full border-8 ${borderColor} ${pulseBg} flex flex-col items-center justify-center space-y-1`}>
                <div className={`h-3 w-12 rounded-md ${pulseBg}`} />
                <div className={`h-7 w-12 rounded-md ${pulseBg}`} />
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex justify-between items-center">
              <div className={`h-3 w-24 rounded-md ${pulseBg}`} />
              <div className={`h-3 w-12 rounded-md ${pulseBg}`} />
            </div>
            <div className="flex justify-between items-center">
              <div className={`h-3 w-28 rounded-md ${pulseBg}`} />
              <div className={`h-3 w-10 rounded-md ${pulseBg}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewSkeleton;
