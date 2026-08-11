import React from 'react';
import MetricSkeleton from './MetricSkeleton';
import TableSkeleton from './TableSkeleton';

interface AppLayoutSkeletonProps {
  theme?: 'dark' | 'light';
}

export const AppLayoutSkeleton: React.FC<AppLayoutSkeletonProps> = ({
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';
  const bgPage = isDark ? 'bg-[#030712]' : 'bg-[#F8FAFC]';
  const sidebarBg = isDark ? 'bg-[#000000] border-neutral-900' : 'bg-white border-neutral-200';
  const headerBg = isDark ? 'bg-[#000000]/80 border-neutral-900' : 'bg-white/80 border-neutral-200';
  const pulseBg = isDark ? 'bg-neutral-800/60' : 'bg-neutral-200';

  return (
    <div className={`min-h-screen flex ${bgPage} text-white font-sans transition-colors duration-150`}>
      {/* Sidebar Skeleton (collapsed w-14) */}
      <aside className={`w-14 h-screen sticky top-0 border-r ${sidebarBg} flex flex-col justify-between p-2 shrink-0 animate-pulse`}>
        <div className="space-y-4 pt-2">
          {/* Logo placeholder */}
          <div className={`w-8 h-8 rounded-full ${pulseBg} mx-auto`} />
          <div className="space-y-3 pt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`w-7 h-7 rounded-lg ${pulseBg} mx-auto`} />
            ))}
          </div>
        </div>
        <div className="space-y-3 pb-2">
          <div className={`w-7 h-7 rounded-lg ${pulseBg} mx-auto`} />
          <div className={`w-7 h-7 rounded-full ${pulseBg} mx-auto`} />
        </div>
      </aside>

      {/* Workspace Area Skeleton */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header Skeleton */}
        <header className={`h-14 px-6 border-b ${headerBg} flex items-center justify-between animate-pulse shrink-0`}>
          <div className={`h-4 w-32 rounded-md ${pulseBg}`} />
          <div className="flex items-center gap-3">
            <div className={`h-8 w-48 rounded-lg ${pulseBg}`} />
            <div className={`w-8 h-8 rounded-full ${pulseBg}`} />
          </div>
        </header>

        {/* Content Body Skeleton */}
        <main className="flex-1 p-6 space-y-6 overflow-y-auto">
          <div className="flex justify-between items-center animate-pulse">
            <div className={`h-7 w-48 rounded-lg ${pulseBg}`} />
            <div className={`h-9 w-32 rounded-lg ${pulseBg}`} />
          </div>

          <MetricSkeleton theme={theme} count={4} />
          <TableSkeleton theme={theme} rows={5} cols={5} />
        </main>
      </div>
    </div>
  );
};

export default AppLayoutSkeleton;
