import React from 'react';

interface ConsolidatedViewSkeletonProps {
  theme?: 'dark' | 'light';
  mode?: 'client' | 'internal';
}

export const ConsolidatedViewSkeleton: React.FC<ConsolidatedViewSkeletonProps> = ({
  theme = 'dark',
  mode = 'client',
}) => {
  const isDark = theme === 'dark';
  const bgCard = isDark ? 'bg-[#0D0D0D] border-neutral-800/80' : 'bg-white border-neutral-200';
  const pulseBg = isDark ? 'bg-neutral-800/70' : 'bg-neutral-200';
  const inputBg = isDark ? 'bg-[#121212] border-neutral-800/60' : 'bg-slate-100 border-neutral-200';
  const borderColor = isDark ? 'border-neutral-800/60' : 'border-neutral-200';

  const title = mode === 'client' ? 'Delivery Progress' : 'Development Progress';

  return (
    <div className="-mt-6 space-y-6 bg-[var(--bg-page)] text-[var(--text-main)] animate-pulse">
      {/* 1. Page Header Bar */}
      <div className="min-h-[52px] py-2 flex flex-wrap items-center justify-between border-b border-[var(--border-subtle)] px-0 gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white/90">
            {title}
          </h1>

          {/* Time Horizon Pills Skeleton */}
          <div className={`flex items-center gap-1.5 p-1 rounded-lg border ${inputBg}`}>
            {['All Timelines', 'Overdue', 'Today', 'This Week', 'Next Week', 'Future', 'Unassigned'].map((h, i) => (
              <div
                key={i}
                className={`h-6 rounded-md ${pulseBg}`}
                style={{ width: `${h.length * 7 + 12}px` }}
              />
            ))}
          </div>

          <div className={`h-8 w-20 rounded-md ${inputBg}`} />
        </div>

        <div className={`h-8 w-24 rounded-lg ${inputBg}`} />
      </div>

      {/* 2. Top Analytics Cards Grid (3 Cards matching exact layout) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Card 1: Concentric Time Horizon Radial */}
        <div className={`h-[320px] p-5 rounded-xl border ${bgCard} shadow-lg flex items-center justify-between gap-4`}>
          <div className="space-y-4 flex-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${pulseBg}`} />
                <div className={`h-3 rounded-md ${pulseBg}`} style={{ width: `${50 + (i * 12) % 40}%` }} />
              </div>
            ))}
          </div>

          {/* Radial Donut Ring Placeholder */}
          <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
            <div className={`w-40 h-40 rounded-full border-8 border-t-emerald-500/30 border-r-amber-500/30 border-b-cyan-500/30 border-l-rose-500/30 ${pulseBg} flex items-center justify-center`}>
              <div className={`w-24 h-24 rounded-full ${bgCard} flex flex-col items-center justify-center space-y-1`}>
                <div className={`h-2 w-10 rounded-md ${pulseBg}`} />
                <div className={`h-5 w-8 rounded-md ${pulseBg}`} />
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: All Projects Status List */}
        <div className={`h-[320px] p-5 rounded-xl border ${bgCard} shadow-lg flex flex-col justify-between`}>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`p-3 rounded-lg border ${inputBg} space-y-2`}>
                <div className="flex justify-between items-center">
                  <div className={`h-3.5 w-24 rounded-md ${pulseBg}`} />
                  <div className={`h-4 w-10 rounded-full ${pulseBg}`} />
                </div>
                <div className={`h-2 w-full rounded-full ${pulseBg}`} />
              </div>
            ))}
          </div>

          <div className={`pt-2 border-t ${borderColor} flex justify-between items-center`}>
            <div className={`h-3 w-32 rounded-md ${pulseBg}`} />
            <div className={`h-4 w-12 rounded-md ${pulseBg}`} />
          </div>
        </div>

        {/* Card 3: Donut Status Ring & Breakdown */}
        <div className={`h-[320px] p-5 rounded-xl border ${bgCard} shadow-lg flex items-center gap-5`}>
          <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
            <div className={`w-32 h-32 rounded-full border-6 ${borderColor} ${pulseBg} flex flex-col items-center justify-center space-y-1`}>
              <div className={`h-2 w-12 rounded-md ${pulseBg}`} />
              <div className={`h-6 w-8 rounded-md ${pulseBg}`} />
            </div>
          </div>

          <div className="flex-1 space-y-3">
            {['Completed', 'In Review', 'In Progress', 'Pending', 'Overdue'].map((label, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between items-center">
                  <div className={`h-2.5 w-16 rounded-md ${pulseBg}`} />
                  <div className={`h-2.5 w-6 rounded-md ${pulseBg}`} />
                </div>
                <div className={`h-1.5 w-full rounded-full ${pulseBg}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Detailed Data Table Skeleton (9 Columns) */}
      <div className={`rounded-xl border ${bgCard} shadow-xl overflow-hidden`}>
        {/* Table Header Row */}
        <div className={`p-4 border-b ${borderColor} grid grid-cols-9 gap-4 items-center ${inputBg}`}>
          {['OWNER', 'DUE DATE', 'SCHEDULE', 'PROJECT', 'COURSE', 'MODULE', 'TYPE', 'PHASE', 'STATUS'].map((col, i) => (
            <div key={i} className={`h-3 rounded-md ${pulseBg}`} style={{ width: '80%' }} />
          ))}
        </div>

        {/* Table Rows (8 Rows) */}
        <div className={`divide-y ${borderColor}`}>
          {Array.from({ length: 8 }).map((_, rIdx) => (
            <div key={rIdx} className="p-4 grid grid-cols-9 gap-4 items-center">
              {/* Owner */}
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full ${pulseBg} shrink-0`} />
                <div className={`h-3 w-16 rounded-md ${pulseBg}`} />
              </div>
              {/* Due Date */}
              <div className={`h-3 w-20 rounded-md ${pulseBg}`} />
              {/* Schedule */}
              <div className={`h-5 w-16 rounded-md ${pulseBg}`} />
              {/* Project */}
              <div className={`h-3 w-14 rounded-md ${pulseBg}`} />
              {/* Course */}
              <div className={`h-3 w-24 rounded-md ${pulseBg}`} />
              {/* Module */}
              <div className={`h-3 w-28 rounded-md ${pulseBg}`} />
              {/* Type */}
              <div className={`h-3 w-12 rounded-md ${pulseBg}`} />
              {/* Phase */}
              <div className={`h-3 w-8 rounded-md ${pulseBg}`} />
              {/* Status */}
              <div className={`h-6 w-20 rounded-full ${pulseBg}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ConsolidatedViewSkeleton;
