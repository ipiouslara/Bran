/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import OverviewSkeleton from './skeletons/OverviewSkeleton';
import { motion } from 'motion/react';
import {
  Briefcase,
  AlertTriangle,
  Clock,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ArrowUpRight,
  Zap,
  Filter,
  RefreshCw,
  Layers,
  CalendarDays,
  Activity
} from 'lucide-react';
import {
  fetchExecutiveMetrics,
  quickShiftPhaseDate,
  ExecutiveMetrics,
  AtRiskPhaseItem,
  ProjectPortfolioItem
} from '../lib/db';
import { formatDateDDMMYYYY } from '../utils/dateFormatter';

import { getExecutiveMetricsCache, setExecutiveMetricsCache } from '../lib/dataCache';

interface ExecutiveDashboardProps {
  theme: 'dark' | 'light';
  currentUser: { email?: string; role?: string; id?: string; name?: string } | null;
  onNavigateToTimeline: (projectId: string, isInternal: boolean) => void;
  onNavigateToHolidays: (projectId: string) => void;
}

export default function ExecutiveDashboard({
  theme,
  currentUser,
  onNavigateToTimeline,
  onNavigateToHolidays
}: ExecutiveDashboardProps) {
  const [timeHorizon, setTimeHorizon] = useState<'week' | 'month' | '30days'>('month');
  const cachedMetrics = getExecutiveMetricsCache();
  const [metrics, setMetrics] = useState<ExecutiveMetrics | null>(cachedMetrics);

  const [loading, setLoading] = useState(!cachedMetrics);
  const [error, setError] = useState<string | null>(null);
  const [healthFilter, setHealthFilter] = useState<'all' | 'Green' | 'Yellow' | 'Red'>('all');

  // Quick Shift Modal state
  const [selectedShiftPhase, setSelectedShiftPhase] = useState<AtRiskPhaseItem | null>(null);
  const [shiftDays, setShiftDays] = useState<number>(3);
  const [isShifting, setIsShifting] = useState(false);

  const loadData = async (isSilent: boolean = false) => {
    try {
      if (!isSilent && !getExecutiveMetricsCache()) {
        setLoading(true);
      }
      setError(null);
      const data = await fetchExecutiveMetrics(currentUser, timeHorizon);
      setMetrics(data);
      setExecutiveMetricsCache(data);
    } catch (err: any) {
      console.error('Error loading executive metrics:', err);
      if (!getExecutiveMetricsCache()) {
        setError(err.message || 'Failed to load executive analytics.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const hasCache = !!getExecutiveMetricsCache();
    loadData(hasCache);
  }, [currentUser, timeHorizon]);

  const handleApplyQuickShift = async () => {
    if (!selectedShiftPhase) return;
    setIsShifting(true);
    try {
      const res = await quickShiftPhaseDate(selectedShiftPhase.phaseId, shiftDays);
      if (res.success) {
        setSelectedShiftPhase(null);
        await loadData();
      } else {
        alert(res.error || 'Failed to shift date.');
      }
    } catch (err: any) {
      alert(err.message || 'Error shifting date.');
    } finally {
      setIsShifting(false);
    }
  };

  const filteredPortfolio = useMemo(() => {
    if (!metrics) return [];
    return metrics.portfolio.filter((proj) => {
      const matchesHealth = healthFilter === 'all' || proj.health === healthFilter;
      return matchesHealth;
    });
  }, [metrics, healthFilter]);

  if (loading && !metrics) {
    return <OverviewSkeleton theme={theme} />;
  }

  // Calculate percentages for SVG Graphical Ring
  const totalProjects = metrics?.activeProjectsCount || 0;
  const onTrackProjects = metrics?.onTrackProjectsCount || 0;
  const onTrackPct = totalProjects > 0 ? Math.round((onTrackProjects / totalProjects) * 100) : 100;
  
  const highRiskCount = metrics?.highRiskOverdueCount || 0;
  const deliverablesCount = metrics?.deliverablesDueCount || 0;
  const blackoutCount = metrics?.blackoutWindowCount || 0;

  return (
    <div className="-mt-6 space-y-6 animate-fade-up bg-[var(--bg-page)] text-[var(--text-main)] transition-colors duration-150">
      {/* 1. Minimalist Title & Inline Time Horizon Bar */}
      <div className="h-[52px] flex items-center justify-between border-b border-[var(--border-subtle)] px-0">
        <div className="flex items-center gap-4">
          <h1 className={`text-2xl font-black tracking-tight ${theme === 'light' ? 'bg-gradient-to-r from-[#1DAA58] to-[#2484C6] bg-clip-text text-transparent' : 'text-white'}`}>Overview</h1>

          {/* Inline Time Horizon Selector */}
          <div className="flex items-center gap-1 bg-[var(--input-bg)] p-1 rounded-lg border border-[var(--border-subtle)] relative">
            {(['week', 'month', '30days'] as const).map((h) => {
              const isActive = timeHorizon === h;
              return (
                <button
                  key={h}
                  onClick={() => setTimeHorizon(h)}
                  className={`relative px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                    isActive
                      ? 'text-[var(--text-main)] font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="exec-horizon-active-pill"
                      className="absolute inset-0 rounded-md bg-[var(--bg-card)] shadow-xs border border-[var(--border-subtle)]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">
                    {h === 'week' ? 'This Week' : h === 'month' ? 'This Month' : 'Next 30 Days'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={() => loadData()}
          title="Refresh analytics"
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* 2. Side-by-Side Graphical Analytics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Active Projects with SVG Donut Progress Ring */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-lg space-y-3 hover-card-glow flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Active Projects</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20">
              {onTrackPct}% On Track
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* SVG Ring Graphic */}
            <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-[var(--border-subtle)]"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-[#1DAA58]"
                  strokeDasharray={`${onTrackPct}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="absolute text-xs font-black text-[var(--text-main)]">{totalProjects}</span>
            </div>

            <div className="leading-tight">
              <p className="text-xl font-black text-[var(--text-main)]">{totalProjects}</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {metrics?.delayedProjectsCount ? `${metrics.delayedProjectsCount} need review` : 'All projects healthy'}
              </p>
            </div>
          </div>
        </div>

        {/* Metric 2: High Risk & Overdue with SVG Gauge Graphic */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-lg space-y-3 hover-card-glow flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">High Risk & Overdue</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${highRiskCount > 0 ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/20 animate-pulse' : 'bg-[var(--input-bg)] text-[var(--text-muted)] border-[var(--border-subtle)]'}`}>
              {highRiskCount > 0 ? 'Action Needed' : 'Clear'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* SVG Risk Gauge */}
            <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-[var(--border-subtle)]"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-rose-500"
                  strokeDasharray={`${Math.min(100, highRiskCount * 25)}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <AlertTriangle className="absolute w-4 h-4 text-rose-500 dark:text-rose-400" />
            </div>

            <div className="leading-tight">
              <p className="text-xl font-black text-rose-500 dark:text-rose-400">{highRiskCount}</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Phases past milestone end dates</p>
            </div>
          </div>
        </div>

        {/* Metric 3: Deliverables Due with Mini SVG Bar Meter */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-lg space-y-3 hover-card-glow flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Deliverables Due</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[var(--input-bg)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
              {timeHorizon}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-[var(--input-bg)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6 text-[var(--text-main)]" />
            </div>

            <div className="leading-tight flex-1">
              <p className="text-xl font-black text-[var(--text-main)]">{deliverablesCount}</p>
              {/* Mini horizontal bar meter */}
              <div className="w-full bg-[var(--input-bg)] h-1.5 rounded-full overflow-hidden mt-1.5">
                <div
                  className="bg-gradient-to-r from-[#1DAA58] to-[#2484C6] h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, deliverablesCount * 10)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Metric 4: Blackout Window */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-lg space-y-3 hover-card-glow flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Blackout Window</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[var(--input-bg)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
              14 Days
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-[var(--input-bg)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6 text-[var(--text-muted)]" />
            </div>

            <div className="leading-tight">
              <p className="text-xl font-black text-[var(--text-main)]">{blackoutCount}</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Non-working company holidays</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Side-by-Side Analytics Grid: At-Risk Center + Portfolio Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): At-Risk Deliverables Center */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl space-y-4 transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400" />
              <h2 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-wider">At-Risk Deliverables & Delay Center</h2>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">Top delayed milestones</span>
          </div>

          {(!metrics?.atRiskPhases || metrics.atRiskPhases.length === 0) ? (
            <div className="p-8 text-center border border-dashed border-[var(--border-subtle)] rounded-lg bg-[var(--input-bg)]">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 dark:text-emerald-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-[var(--text-main)]">No High-Risk Deliverables</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">All active milestone phases are operating on schedule.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase text-[10px] tracking-wider font-semibold">
                    <th className="py-2 px-3">Project & Module</th>
                    <th className="py-2 px-3">Phase Name</th>
                    <th className="py-2 px-3">Target Date</th>
                    <th className="py-2 px-3 text-center">Delay</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {metrics.atRiskPhases.slice(0, 6).map((item) => (
                    <tr key={item.phaseId} className="hover:bg-[var(--bg-card-hover)] transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-[var(--text-main)]">{item.projectName}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{item.moduleName}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-[var(--text-main)]">{item.phaseName}</span>
                        <span className="text-[9px] text-[var(--text-muted)] ml-1.5 px-1.5 py-0.5 rounded bg-[var(--input-bg)] border border-[var(--border-subtle)]">
                          {item.isInternal ? 'Internal' : 'Client'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[var(--text-main)] font-medium">
                        {formatDateDDMMYYYY(item.targetDate)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/20">
                          +{item.daysDelayed}d
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => setSelectedShiftPhase(item)}
                          className="px-2 py-1 rounded text-[11px] font-bold bg-[var(--input-bg)] text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] transition-all cursor-pointer inline-flex items-center gap-1"
                        >
                          <Zap className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                          <span>Shift</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column (1 Col): Graphical Portfolio Health Distribution */}
        <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl space-y-4 transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <h2 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-wider">Portfolio Health</h2>
            <select
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value as any)}
              className="py-1 px-2 text-[11px] bg-[var(--input-bg)] border border-[var(--border-subtle)] rounded text-[var(--text-main)] focus:outline-none cursor-pointer"
            >
              <option value="all">All Scores</option>
              <option value="Green">Green</option>
              <option value="Yellow">Yellow</option>
              <option value="Red">Red</option>
            </select>
          </div>

          {filteredPortfolio.length === 0 ? (
            <div className="p-6 text-center text-[var(--text-muted)] text-xs italic border border-dashed border-[var(--border-subtle)] rounded-lg">
              No projects match health score filter.
            </div>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1 divide-y divide-[var(--border-subtle)]">
              {filteredPortfolio.map((proj) => {
                const healthBadge =
                  proj.health === 'Green'
                    ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20'
                    : proj.health === 'Yellow'
                    ? 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/20';

                return (
                  <div key={proj.id} className="pt-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--text-main)] text-xs truncate max-w-[140px]">{proj.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${healthBadge}`}>
                        {proj.health}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-[var(--input-bg)] h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-[#1DAA58] to-[#2484C6] h-full transition-all duration-500"
                          style={{ width: `${proj.progressPct}%` }}
                        ></div>
                      </div>
                      <span className="font-mono text-[10px] font-bold text-[var(--text-muted)]">{proj.progressPct}%</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                      <span className="truncate">{proj.nextMilestoneName || 'Milestone'}</span>
                      <button
                        onClick={() => onNavigateToTimeline(proj.id, true)}
                        className="text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center gap-0.5 font-semibold cursor-pointer"
                      >
                        <span>Timeline</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick Shift Modal */}
      {selectedShiftPhase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-md p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h3 className="font-bold text-[var(--text-main)] text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                Quick Date Extension
              </h3>
              <button
                onClick={() => setSelectedShiftPhase(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-neutral-300">
                Extending target date for phase <strong className="text-white">{selectedShiftPhase.phaseName}</strong> in project <strong className="text-white">{selectedShiftPhase.projectName}</strong>.
              </p>
              <div className="p-3 rounded-lg bg-[var(--input-bg)] border border-[var(--border-subtle)] space-y-1">
                <div className="flex justify-between text-[var(--text-muted)]">
                  <span>Current Target Date:</span>
                  <span className="font-mono text-amber-500 dark:text-amber-400 font-bold">{formatDateDDMMYYYY(selectedShiftPhase.targetDate)}</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="text-[var(--text-muted)] font-bold block">Extension Duration:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 3, 7].map((days) => (
                    <button
                      key={days}
                      onClick={() => setShiftDays(days)}
                      className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                        shiftDays === days
                          ? 'bg-[var(--bg-card)] text-[var(--text-main)] border-[var(--border-subtle)] shadow-xs'
                          : 'bg-[var(--input-bg)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                      }`}
                    >
                      +{days} {days === 1 ? 'Day' : 'Days'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                onClick={() => setSelectedShiftPhase(null)}
                className="px-4 py-2 rounded-lg font-bold text-neutral-400 hover:text-white bg-neutral-900 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyQuickShift}
                disabled={isShifting}
                className="px-4 py-2 rounded-lg font-bold bg-white text-black hover:bg-neutral-200 transition-all cursor-pointer disabled:opacity-50"
              >
                {isShifting ? 'Applying Shift...' : `Extend +${shiftDays} Days`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
