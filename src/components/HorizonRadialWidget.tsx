import { motion } from 'motion/react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HorizonStats {
  overdue: number;
  today: number;
  thisWeek: number;
  nextWeek: number;
  futureIndex: number;
  totalPhases: number;
}

type BucketKey = 'overdue' | 'today' | 'this-week' | 'next-week' | 'future';

export interface HorizonRadialWidgetProps {
  stats: HorizonStats;
  title: string;
  activePreset: string;
  onPresetSelect: (p: BucketKey) => void;
}

// ── Ring config: outermost = highest urgency ──────────────────────────────────

const BUCKETS: {
  key: BucketKey;
  label: string;
  color: string;
  r: number;
  strokeWidth: number;
}[] = [
  { key: 'overdue',   label: 'Overdue',   color: '#F43F5E', r: 118, strokeWidth: 14 },
  { key: 'today',     label: 'Today',     color: '#F59E0B', r: 98, strokeWidth: 14 },
  { key: 'this-week', label: 'This Week', color: '#10B981', r: 78, strokeWidth: 14 },
  { key: 'next-week', label: 'Next Week', color: '#38BDF8', r: 58, strokeWidth: 14 },
  { key: 'future',    label: 'Future',    color: '#A78BFA', r: 38, strokeWidth: 14 },
];

function getCount(stats: HorizonStats, key: BucketKey): number {
  switch (key) {
    case 'overdue':   return stats.overdue;
    case 'today':     return stats.today;
    case 'this-week': return stats.thisWeek;
    case 'next-week': return stats.nextWeek;
    case 'future':    return stats.futureIndex;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HorizonRadialWidget({
  stats,
  title,
  activePreset,
  onPresetSelect,
}: HorizonRadialWidgetProps) {
  const total   = stats.totalPhases;
  const isEmpty = total === 0;

  return (
    <div className="p-4 sm:p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] flex flex-col gap-3 sm:gap-4 h-full min-h-[320px] overflow-hidden transition-colors">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      {title ? (
        <div className="flex items-center justify-between shrink-0">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] truncate pr-2">
            {title}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--input-bg)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-semibold tabular-nums shrink-0">
            {total} phases
          </span>
        </div>
      ) : (
        <div className="flex justify-end shrink-0 -mb-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--input-bg)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-semibold tabular-nums shrink-0">
            {total} phases
          </span>
        </div>
      )}

      {/* ── Body: Legend + SVG ─────────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row items-center justify-between gap-3 flex-1 min-h-0 overflow-y-auto xl:overflow-hidden">

        {/* Stacked legend ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-1 w-full flex-1 min-w-0">
          {BUCKETS.map(({ key, label, color }) => {
            const count  = getCount(stats, key);
            const pct    = total > 0 ? Math.round((count / total) * 100) : 0;
            const active = activePreset === key;

            return (
              <button
                key={key}
                onClick={() => onPresetSelect(key)}
                className={`relative w-full text-left px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg transition-colors cursor-pointer ${
                  active ? 'font-bold' : 'hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="radial-legend-active-pill"
                    className="absolute inset-0 rounded-lg bg-[var(--bg-card-hover)] border-l-2"
                    style={{ borderLeftColor: color }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <div className="relative z-10">
                  {/* Label + count */}
                  <div className="flex items-center justify-between gap-1.5 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[10px] sm:text-[11px] font-semibold text-[var(--text-muted)] truncate">
                        {label}
                      </span>
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-black text-[var(--text-main)] shrink-0 tabular-nums">
                      {count}
                    </span>
                  </div>

                  {/* Mini percent bar */}
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-[3px] rounded-full bg-[var(--input-bg)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: color,
                          opacity: active ? 1 : 0.65,
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-[var(--text-muted)] font-bold w-6 text-right tabular-nums">
                      {pct}%
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* SVG concentric rings ──────────────────────────────────── */}
        <div className="relative shrink-0 flex items-center justify-center p-1 w-[160px] h-[160px] xs:w-[180px] xs:h-[180px] sm:w-[200px] sm:h-[200px] xl:w-[210px] xl:h-[210px]">
          <svg viewBox="0 0 260 260" className="w-full h-full" preserveAspectRatio="xMidYMid meet">

            {BUCKETS.map(({ key, color, r, strokeWidth }) => {
              const count  = getCount(stats, key);
              const frac   = total > 0 && count > 0 ? count / total : 0;
              const circ   = 2 * Math.PI * r;
              const dash   = frac * circ;
              const active = activePreset === key;
              const sw     = active ? strokeWidth + 2 : strokeWidth;

              return (
                <g
                  key={key}
                  onClick={() => onPresetSelect(key)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Dimmed background track */}
                  <circle
                    cx="130" cy="130" r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={sw}
                    strokeOpacity={active ? 0.20 : 0.10}
                    className="transition-all duration-300"
                  />

                  {/* Filled arc proportional to bucket % */}
                  {!isEmpty && frac > 0 && (
                    <circle
                      cx="130" cy="130" r={r}
                      fill="none"
                      stroke={color}
                      strokeWidth={sw}
                      strokeLinecap="round"
                      strokeDasharray={`${dash} ${circ}`}
                      transform="rotate(-90 130 130)"
                      strokeOpacity={active ? 1 : 0.80}
                      className="transition-all duration-500"
                    />
                  )}
                </g>
              );
            })}

          </svg>

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[8px] sm:text-[9px] uppercase tracking-[0.18em] text-[var(--text-muted)] font-semibold">
              TOTAL
            </span>
            <span className="text-[16px] sm:text-[18px] font-black text-[var(--text-main)] leading-none mt-0.5">
              {total}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
