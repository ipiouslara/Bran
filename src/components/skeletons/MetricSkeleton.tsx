import React from 'react';

interface MetricSkeletonProps {
  theme?: 'dark' | 'light';
  count?: number;
  className?: string;
}

export const MetricSkeleton: React.FC<MetricSkeletonProps> = ({
  theme = 'dark',
  count = 4,
  className = '',
}) => {
  const isDark = theme === 'dark';
  const bgCard = isDark ? 'bg-[#0D0D0D] border-neutral-800/80' : 'bg-white border-neutral-200';
  const pulseBg = isDark ? 'bg-neutral-800/60' : 'bg-neutral-200';

  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`p-4 rounded-xl border ${bgCard} shadow-lg space-y-3 transition-colors`}
        >
          <div className="flex justify-between items-center">
            <div className={`h-3 w-24 rounded-md ${pulseBg}`} />
            <div className={`w-6 h-6 rounded-md ${pulseBg}`} />
          </div>
          <div className={`h-7 w-16 rounded-md ${pulseBg}`} />
          <div className={`h-2 w-full rounded-full ${pulseBg} opacity-50`} />
        </div>
      ))}
    </div>
  );
};

export default MetricSkeleton;
