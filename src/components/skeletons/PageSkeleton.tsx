import React from 'react';
import MetricSkeleton from './MetricSkeleton';
import TableSkeleton from './TableSkeleton';

interface PageSkeletonProps {
  theme?: 'dark' | 'light';
}

export const PageSkeleton: React.FC<PageSkeletonProps> = ({
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';
  const pulseBg = isDark ? 'bg-neutral-800/60' : 'bg-neutral-200';

  return (
    <div className="w-full space-y-6 p-1 animate-pulse">
      {/* Top Title & Actions Bar Skeleton */}
      <div className="flex justify-between items-center">
        <div className={`h-7 w-48 rounded-lg ${pulseBg}`} />
        <div className="flex gap-2">
          <div className={`h-9 w-32 rounded-lg ${pulseBg}`} />
          <div className={`h-9 w-24 rounded-lg ${pulseBg}`} />
        </div>
      </div>

      {/* Metrics Row Skeleton */}
      <MetricSkeleton theme={theme} count={4} />

      {/* Main Table / Data View Skeleton */}
      <TableSkeleton theme={theme} rows={6} cols={5} />
    </div>
  );
};

export default PageSkeleton;
