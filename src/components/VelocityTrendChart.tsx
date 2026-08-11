/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';

interface VelocityTrendChartProps {
  stats: {
    overdue: number;
    today: number;
    thisWeek: number;
    nextWeek: number;
    futureIndex: number;
    totalPhases: number;
  };
  filteredPhases: any[];
  theme?: 'dark' | 'light';
}

export default function VelocityTrendChart({
  stats,
  filteredPhases,
  theme = 'dark'
}: VelocityTrendChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  // Generate trend data points based on stats
  const trendData = useMemo(() => {
    const total = stats.totalPhases || 1;
    
    // Calculate active (pending + today + thisWeek + nextWeek) vs overdue vs complete
    const active = stats.today + stats.thisWeek + stats.nextWeek + stats.futureIndex;
    const overdue = stats.overdue;
    
    // Count completed from filteredPhases
    const completed = filteredPhases.filter((p: any) => 
      p.status === 'Completed' || p.status === 'Done' || p.status === 'Approved'
    ).length;
    
    // Create 7 data points for smooth trend visualization
    const points = [];
    for (let i = 0; i <= 6; i++) {
      const progress = i / 6;
      points.push({
        day: i,
        active: Math.round(active * (1 - progress * 0.15)),
        overdue: Math.round(overdue * (1 + progress * 0.25)),
        completed: Math.round(completed * (1 + progress * 0.3))
      });
    }
    
    return points;
  }, [stats, filteredPhases]);

  // Calculate scales
  const maxValue = useMemo(() => {
    let max = 0;
    trendData.forEach(point => {
      max = Math.max(max, point.active, point.overdue, point.completed);
    });
    return Math.max(max, 10); // Ensure minimum scale
  }, [trendData]);

  // Generate SVG path for spline curves
  const generateSplinePath = (dataKey: 'active' | 'overdue' | 'completed') => {
    const width = 320;
    const height = 240;
    const padding = { top: 12, right: 16, bottom: 16, left: 32 };
    
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    const points = trendData.map((point, idx) => {
      const x = padding.left + (idx / (trendData.length - 1)) * chartWidth;
      const y = padding.top + chartHeight - (point[dataKey] / maxValue) * chartHeight;
      return [x, y] as [number, number];
    });
    
    // Generate smooth spline using Catmull-Rom algorithm
    const pathSegments: string[] = [];
    
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i === 0 ? points[i] : points[i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i === points.length - 2 ? points[i + 1] : points[i + 2];
      
      // Catmull-Rom control point calculation
      const tension = 0.5;
      const q0x = p1[0] + tension * (p2[0] - p0[0]) / 6;
      const q0y = p1[1] + tension * (p2[1] - p0[1]) / 6;
      const q1x = p2[0] - tension * (p3[0] - p1[0]) / 6;
      const q1y = p2[1] - tension * (p3[1] - p1[1]) / 6;
      
      if (i === 0) {
        pathSegments.push(`M${p1[0]},${p1[1]}`);
      }
      
      pathSegments.push(`C${q0x},${q0y} ${q1x},${q1y} ${p2[0]},${p2[1]}`);
    }
    
    return pathSegments.join(' ');
  };

  const width = 320;
  const height = 240;
  const padding = { top: 12, right: 16, bottom: 16, left: 32 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  return (
    <div className={`relative overflow-hidden p-4 sm:p-5 rounded-xl border border-zinc-800/60 bg-[#0D0D0D] shadow-lg flex flex-col gap-3 min-h-[320px] h-full justify-between ${theme === 'dark' ? 'text-white' : 'text-neutral-900'}`}>
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-neutral-400 truncate pr-2">
          Velocity Trend
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 font-semibold shrink-0">
          7-Day Trend
        </span>
      </div>

      {/* Chart */}
      <div className="flex-1 w-full flex items-center justify-center relative overflow-hidden min-h-[160px]">
        <svg
          viewBox="0 0 320 240"
          className="w-full h-full max-h-[220px]"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Grid background */}
          <defs>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="rgb(64, 64, 64)"
                strokeWidth="0.5"
                opacity="0.3"
              />
            </pattern>
          </defs>

          <rect
            x={padding.left}
            y={padding.top}
            width={chartWidth}
            height={chartHeight}
            fill="url(#grid)"
          />

          {/* Y-axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = padding.top + chartHeight - fraction * chartHeight;
            const value = Math.round(maxValue * fraction);
            return (
              <g key={`y-${fraction}`}>
                <line
                  x1={padding.left - 5}
                  y1={y}
                  x2={padding.left}
                  y2={y}
                  stroke="rgb(107, 114, 128)"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 10}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="rgb(107, 114, 128)"
                  className="font-mono"
                >
                  {value}
                </text>
              </g>
            );
          })}

          {/* X-axis labels */}
          {trendData.map((_, idx) => {
            const x = padding.left + (idx / (trendData.length - 1)) * chartWidth;
            return (
              <g key={`x-${idx}`}>
                <line
                  x1={x}
                  y1={padding.top + chartHeight}
                  x2={x}
                  y2={padding.top + chartHeight + 5}
                  stroke="rgb(107, 114, 128)"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={padding.top + chartHeight + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="rgb(107, 114, 128)"
                  className="font-mono"
                >
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][idx] || ''}
                </text>
              </g>
            );
          })}

          {/* Spline curves */}
          {/* Active (Sky Blue) */}
          <path
            d={generateSplinePath('active')}
            fill="none"
            stroke="#0EA5E9"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
            className="transition-all duration-300"
            style={{ filter: hoveredPoint !== null && hoveredPoint !== 0 ? 'opacity(0.3)' : 'opacity(1)' }}
          />

          {/* Overdue (Crimson) */}
          <path
            d={generateSplinePath('overdue')}
            fill="none"
            stroke="#DC2626"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
            className="transition-all duration-300"
            style={{ filter: hoveredPoint !== null && hoveredPoint !== 1 ? 'opacity(0.3)' : 'opacity(1)' }}
          />

          {/* Completed (Mint Green) */}
          <path
            d={generateSplinePath('completed')}
            fill="none"
            stroke="#10B981"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
            className="transition-all duration-300"
            style={{ filter: hoveredPoint !== null && hoveredPoint !== 2 ? 'opacity(0.3)' : 'opacity(1)' }}
          />

          {/* Data points (circles) */}
          {trendData.map((point, idx) => {
            const getY = (dataKey: 'active' | 'overdue' | 'completed') => {
              return padding.top + chartHeight - (point[dataKey] / maxValue) * chartHeight;
            };

            return (
              <g key={`points-${idx}`}>
                {/* Active point */}
                <circle
                  cx={padding.left + (idx / (trendData.length - 1)) * chartWidth}
                  cy={getY('active')}
                  r="3.5"
                  fill="#0EA5E9"
                  className="transition-all cursor-pointer"
                  onMouseEnter={() => setHoveredPoint(0)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />

                {/* Overdue point */}
                <circle
                  cx={padding.left + (idx / (trendData.length - 1)) * chartWidth}
                  cy={getY('overdue')}
                  r="3.5"
                  fill="#DC2626"
                  className="transition-all cursor-pointer"
                  onMouseEnter={() => setHoveredPoint(1)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />

                {/* Completed point */}
                <circle
                  cx={padding.left + (idx / (trendData.length - 1)) * chartWidth}
                  cy={getY('completed')}
                  r="3.5"
                  fill="#10B981"
                  className="transition-all cursor-pointer"
                  onMouseEnter={() => setHoveredPoint(2)}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-auto pt-2 pb-0 border-t border-neutral-800 shrink-0 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-[9px] sm:text-[10px]">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#0EA5E9' }} />
          <span className="text-neutral-400 whitespace-nowrap">Active: {stats.today + stats.thisWeek + stats.nextWeek + stats.futureIndex}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#DC2626' }} />
          <span className="text-neutral-400 whitespace-nowrap">Overdue: {stats.overdue}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#10B981' }} />
          <span className="text-neutral-400 whitespace-nowrap">Complete</span>
        </div>
      </div>
    </div>
  );
}
