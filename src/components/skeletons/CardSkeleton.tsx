import React from 'react';

interface CardSkeletonProps {
  theme?: 'dark' | 'light';
  lines?: number;
  hasAvatar?: boolean;
  className?: string;
}

export const CardSkeleton: React.FC<CardSkeletonProps> = ({
  theme = 'dark',
  lines = 3,
  hasAvatar = false,
  className = '',
}) => {
  const isDark = theme === 'dark';
  const bgCard = isDark ? 'bg-[#0D0D0D] border-neutral-800/80' : 'bg-white border-neutral-200';
  const pulseBg = isDark ? 'bg-neutral-800/60' : 'bg-neutral-200';

  return (
    <div
      className={`p-5 rounded-xl border ${bgCard} shadow-lg space-y-4 animate-pulse transition-colors ${className}`}
    >
      <div className="flex items-center gap-3">
        {hasAvatar && (
          <div className={`w-10 h-10 rounded-full ${pulseBg} shrink-0`} />
        )}
        <div className="space-y-2 flex-1 min-w-0">
          <div className={`h-4 w-1/3 rounded-md ${pulseBg}`} />
          <div className={`h-3 w-1/4 rounded-md ${pulseBg} opacity-60`} />
        </div>
      </div>

      <div className="space-y-2 pt-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`h-3 rounded-md ${pulseBg}`}
            style={{ width: `${Math.max(40, 100 - i * 20)}%` }}
          />
        ))}
      </div>
    </div>
  );
};

export default CardSkeleton;
