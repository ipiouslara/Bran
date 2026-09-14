import React from 'react';
import TableSkeleton from './TableSkeleton';
import ConsolidatedViewSkeleton from './ConsolidatedViewSkeleton';
import OverviewSkeleton from './OverviewSkeleton';

interface PageSkeletonProps {
  theme?: 'dark' | 'light';
  activePage?: string;
}

export const PageSkeleton: React.FC<PageSkeletonProps> = ({
  theme = 'dark',
  activePage,
}) => {
  // 1. Executive Dashboard (Overview)
  if (activePage === 'dashboard') {
    return <OverviewSkeleton theme={theme} />;
  }

  // 2. Timeline Views (Client / Development / Tracker)
  if (activePage === 'client' || activePage === 'internal' || activePage === 'tracker') {
    return (
      <ConsolidatedViewSkeleton
        theme={theme}
        mode={activePage === 'client' ? 'client' : 'internal'}
      />
    );
  }

  // 3. Projects Page (Status pills, Search, Actions, 6-col Project Directory table; NO metric cards)
  if (activePage === 'projects') {
    return (
      <div className="w-full space-y-6 animate-fade-up">
        {/* Header Bar */}
        <div className="h-[52px] flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="h-7 w-28 rounded-lg placeholder" />
            <div className="flex items-center gap-1 p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--input-bg)]">
              <div className="h-6 w-20 rounded-md placeholder" />
              <div className="h-6 w-14 rounded-md placeholder" />
              <div className="h-6 w-18 rounded-md placeholder" />
              <div className="h-6 w-16 rounded-md placeholder" />
            </div>
            <div className="h-8 w-52 rounded-lg placeholder" />
          </div>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-28 rounded-lg placeholder" />
            <div className="h-8 w-36 rounded-lg placeholder" />
            <div className="h-8 w-20 rounded-lg placeholder" />
          </div>
        </div>

        {/* 6-Column Projects Directory Table */}
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xl overflow-hidden">
          <div className="bg-[var(--input-bg)] border-b border-[var(--border-subtle)] p-4 flex items-center justify-between">
            <div className="h-3.5 w-28 rounded placeholder" />
            <div className="h-3.5 w-20 rounded placeholder" />
            <div className="h-3.5 w-32 rounded placeholder" />
            <div className="h-3.5 w-16 rounded placeholder" />
            <div className="h-3.5 w-20 rounded placeholder" />
            <div className="h-3.5 w-16 rounded placeholder" />
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-4 flex items-center justify-between">
                <div className="h-4 w-44 rounded placeholder" />
                <div className="h-4 w-24 rounded placeholder" />
                <div className="h-4 w-36 rounded placeholder" />
                <div className="h-5 w-20 rounded-full placeholder" />
                <div className="h-4 w-16 rounded placeholder" />
                <div className="h-7 w-14 rounded-lg placeholder" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 4. Project Editor (Gantt Spreadsheet Matrix with Track/View controls; NO metric cards)
  if (activePage === 'project_editor') {
    return (
      <div className="w-full space-y-4 animate-fade-up">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-7 w-48 rounded-lg placeholder" />
            <div className="flex items-center gap-1 p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--input-bg)]">
              <div className="h-6 w-24 rounded-md placeholder" />
              <div className="h-6 w-20 rounded-md placeholder" />
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--input-bg)]">
              <div className="h-6 w-24 rounded-md placeholder" />
              <div className="h-6 w-28 rounded-md placeholder" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-24 rounded-lg placeholder" />
            <div className="h-8 w-28 rounded-lg placeholder" />
            <div className="h-8 w-20 rounded-lg placeholder" />
          </div>
        </div>

        {/* Spreadsheet Matrix Grid */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl overflow-x-auto">
          <div className="bg-[var(--input-bg)] border-b border-[var(--border-subtle)] p-3 flex items-center gap-4 min-w-[850px]">
            <div className="h-4 w-6 rounded placeholder shrink-0" />
            <div className="h-4 w-32 rounded placeholder shrink-0" />
            <div className="h-4 w-40 rounded placeholder shrink-0" />
            <div className="h-4 w-16 rounded placeholder shrink-0" />
            <div className="h-4 w-28 rounded placeholder shrink-0" />
            <div className="h-4 w-28 rounded placeholder shrink-0" />
            <div className="h-4 w-28 rounded placeholder shrink-0" />
            <div className="h-4 w-12 rounded placeholder ml-auto shrink-0" />
          </div>
          <div className="divide-y divide-[var(--border-subtle)] min-w-[850px]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-3 flex items-center gap-4">
                <div className="h-4 w-6 rounded placeholder shrink-0" />
                <div className="h-4 w-32 rounded placeholder shrink-0" />
                <div className="h-4 w-40 rounded placeholder shrink-0" />
                <div className="h-4 w-16 rounded placeholder shrink-0" />
                <div className="h-6 w-28 rounded placeholder shrink-0" />
                <div className="h-6 w-28 rounded placeholder shrink-0" />
                <div className="h-6 w-28 rounded placeholder shrink-0" />
                <div className="h-6 w-12 rounded placeholder ml-auto shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 5. Directory & Credentials (Search, Target Project dropdown, Action buttons, 7-col Employee table; NO metric cards)
  if (activePage === 'directory' || activePage === 'employee-directory' || activePage === 'employees') {
    return (
      <div className="w-full space-y-6 animate-fade-up">
        {/* Header Bar */}
        <div className="h-[52px] flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="h-7 w-48 rounded-lg placeholder" />
            <div className="h-8 w-52 rounded-lg placeholder" />
            <div className="h-8 w-36 rounded-lg placeholder" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-28 rounded-lg placeholder" />
            <div className="h-8 w-36 rounded-lg placeholder" />
            <div className="h-8 w-28 rounded-lg placeholder" />
            <div className="h-8 w-18 rounded-lg placeholder" />
          </div>
        </div>

        {/* 7-Column Employee Directory Table */}
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xl overflow-hidden">
          <div className="bg-[var(--input-bg)] border-b border-[var(--border-subtle)] p-4 flex items-center justify-between">
            <div className="h-4 w-6 rounded placeholder" />
            <div className="h-3.5 w-20 rounded placeholder" />
            <div className="h-3.5 w-32 rounded placeholder" />
            <div className="h-3.5 w-16 rounded placeholder" />
            <div className="h-3.5 w-28 rounded placeholder" />
            <div className="h-3.5 w-36 rounded placeholder" />
            <div className="h-3.5 w-16 rounded placeholder" />
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-4 flex items-center justify-between">
                <div className="h-4 w-6 rounded placeholder" />
                <div className="h-4 w-20 rounded placeholder" />
                <div className="h-4 w-36 rounded placeholder" />
                <div className="h-5 w-18 rounded-full placeholder" />
                <div className="h-4 w-24 rounded placeholder" />
                <div className="h-4 w-32 rounded placeholder" />
                <div className="h-6 w-14 rounded-lg placeholder" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 6. Capacity & Allocation (Horizon presets, 5 KPI cards, Employee workload card list with progress bars)
  if (activePage === 'capacity-allocation' || activePage === 'allocations') {
    return (
      <div className="w-full space-y-6 animate-fade-up">
        {/* Header Bar */}
        <div className="h-[52px] flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="h-7 w-52 rounded-lg placeholder" />
            <div className="flex items-center gap-1 p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--input-bg)]">
              <div className="h-6 w-16 rounded-md placeholder" />
              <div className="h-6 w-16 rounded-md placeholder" />
              <div className="h-6 w-16 rounded-md placeholder" />
            </div>
            <div className="h-7 w-20 rounded-lg placeholder" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-52 rounded-lg placeholder" />
            <div className="h-8 w-20 rounded-lg placeholder" />
          </div>
        </div>

        {/* 5 KPI Metric Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl flex items-center justify-between shadow-lg">
              <div className="space-y-2">
                <div className="h-3 w-16 rounded placeholder" />
                <div className="h-6 w-12 rounded placeholder" />
              </div>
              <div className="w-6 h-6 rounded-full placeholder opacity-60" />
            </div>
          ))}
        </div>

        {/* Workload Allocation Card List (Matching real progress-bar layout, NOT a table!) */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-xl overflow-hidden divide-y divide-[var(--border-subtle)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full placeholder shrink-0" />
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-32 rounded placeholder" />
                    <div className="h-4 w-20 rounded-full placeholder" />
                  </div>
                  <div className="h-3 w-40 rounded placeholder" />
                </div>
              </div>
              <div className="flex items-center gap-4 min-w-[280px]">
                <div className="flex-1 space-y-1.5">
                  <div className="flex justify-between">
                    <div className="h-3 w-28 rounded placeholder" />
                    <div className="h-3 w-8 rounded placeholder" />
                  </div>
                  <div className="w-full h-2 rounded-full placeholder" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 7. Audit Log (Date pills, Action category dropdown, Search, Export, 6-col Audit Trail table; NO metric cards)
  if (activePage === 'audit-log' || activePage === 'activity_log') {
    return (
      <div className="w-full space-y-6 animate-fade-up">
        {/* Header Bar */}
        <div className="h-[52px] flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 flex-wrap gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="h-7 w-32 rounded-lg placeholder" />
            <div className="flex items-center gap-1 p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--input-bg)]">
              <div className="h-6 w-14 rounded-md placeholder" />
              <div className="h-6 w-20 rounded-md placeholder" />
              <div className="h-6 w-20 rounded-md placeholder" />
              <div className="h-6 w-16 rounded-md placeholder" />
            </div>
            <div className="h-8 w-32 rounded-lg placeholder" />
            <div className="h-8 w-52 rounded-lg placeholder" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-24 rounded-lg placeholder" />
            <div className="h-8 w-20 rounded-lg placeholder" />
          </div>
        </div>

        {/* 6-Column Audit Trail Table */}
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-xl overflow-hidden">
          <div className="bg-[var(--input-bg)] border-b border-[var(--border-subtle)] p-3.5 flex items-center justify-between">
            <div className="h-3.5 w-24 rounded placeholder" />
            <div className="h-3.5 w-14 rounded placeholder" />
            <div className="h-3.5 w-28 rounded placeholder" />
            <div className="h-3.5 w-32 rounded placeholder" />
            <div className="h-3.5 w-44 rounded placeholder" />
            <div className="h-3.5 w-20 rounded placeholder" />
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-3.5 flex items-center justify-between">
                <div className="h-4 w-28 rounded placeholder" />
                <div className="h-5 w-16 rounded-full placeholder" />
                <div className="h-4 w-24 rounded placeholder" />
                <div className="h-4 w-36 rounded placeholder" />
                <div className="h-4 w-52 rounded placeholder" />
                <div className="h-4 w-24 rounded placeholder" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 8. Clean Default Fallback (Header + 5-column Table; NO unrelated metric cards!)
  return (
    <div className="w-full space-y-6 animate-fade-up">
      <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-3">
        <div className="h-7 w-48 rounded-lg placeholder" />
        <div className="flex gap-2">
          <div className="h-8 w-28 rounded-lg placeholder" />
          <div className="h-8 w-20 rounded-lg placeholder" />
        </div>
      </div>
      <TableSkeleton theme={theme} rows={6} cols={5} />
    </div>
  );
};

export default PageSkeleton;
