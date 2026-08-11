import React from 'react';

interface TableSkeletonProps {
  theme?: 'dark' | 'light';
  rows?: number;
  cols?: number;
  className?: string;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  theme = 'dark',
  rows = 6,
  cols = 5,
  className = '',
}) => {
  const isDark = theme === 'dark';
  const bgCard = isDark ? 'bg-[#0D0D0D] border-neutral-800/80' : 'bg-white border-neutral-200';
  const pulseBg = isDark ? 'bg-neutral-800/60' : 'bg-neutral-200';
  const borderColor = isDark ? 'border-neutral-800/60' : 'border-neutral-200/80';

  return (
    <div className={`rounded-xl border ${bgCard} shadow-xl overflow-hidden animate-pulse transition-colors ${className}`}>
      {/* Table Header Placeholder */}
      <div className={`p-4 border-b ${borderColor} flex items-center justify-between gap-4 bg-neutral-500/5`}>
        <div className={`h-4 w-1/4 rounded-md ${pulseBg}`} />
        <div className="flex gap-2">
          <div className={`h-8 w-20 rounded-lg ${pulseBg}`} />
          <div className={`h-8 w-24 rounded-lg ${pulseBg}`} />
        </div>
      </div>

      {/* Table Rows Placeholder */}
      <div className={`divide-y ${borderColor}`}>
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="p-4 flex items-center gap-4">
            <div className={`w-4 h-4 rounded ${pulseBg} shrink-0`} />
            <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4 items-center">
              {Array.from({ length: cols }).map((_, cIdx) => (
                <div
                  key={cIdx}
                  className={`h-3.5 rounded-md ${pulseBg}`}
                  style={{ width: `${60 + ((cIdx * 17) % 35)}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TableSkeleton;
