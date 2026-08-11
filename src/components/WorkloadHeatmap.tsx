/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Calendar, User, AlertTriangle, CheckCircle } from 'lucide-react';
import { Employee, Phase } from '../types';

interface WorkloadHeatmapProps {
  employees: Employee[];
  phases: Phase[];
  startDate?: string;
  endDate?: string;
  onEmployeeSelect?: (employee: Employee) => void;
}

export const WorkloadHeatmap: React.FC<WorkloadHeatmapProps> = ({
  employees,
  phases,
  onEmployeeSelect
}) => {
  // Compute workload density per employee
  const employeeWorkload = useMemo(() => {
    const map = new Map<
      string,
      {
        totalAssigned: number;
        completed: number;
        pending: number;
        overdue: number;
        phases: Phase[];
      }
    >();

    employees.forEach((emp) => {
      map.set(emp.id, {
        totalAssigned: 0,
        completed: 0,
        pending: 0,
        overdue: 0,
        phases: []
      });
    });

    const now = new Date();

    phases.forEach((p) => {
      if (p.assignedTo && map.has(p.assignedTo)) {
        const stats = map.get(p.assignedTo)!;
        stats.totalAssigned++;
        stats.phases.push(p);

        if (p.status === 'Completed') {
          stats.completed++;
        } else {
          stats.pending++;
          if (p.internalEndDate && new Date(p.internalEndDate) < now) {
            stats.overdue++;
          }
        }
      }
    });

    return map;
  }, [employees, phases]);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 backdrop-blur-md shadow-xl">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-semibold text-slate-100">Team Resource Workload Heatmap</h3>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Optimal (&le;5)
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> High (6-10)
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Over-allocated (&gt;10)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {employees.map((employee) => {
          const stats = employeeWorkload.get(employee.id) || {
            totalAssigned: 0,
            completed: 0,
            pending: 0,
            overdue: 0,
            phases: []
          };

          const isOverloaded = stats.totalAssigned > 10;
          const isHigh = stats.totalAssigned > 5 && stats.totalAssigned <= 10;

          const healthColor = isOverloaded
            ? 'border-rose-500/40 bg-rose-500/5'
            : isHigh
            ? 'border-amber-500/40 bg-amber-500/5'
            : 'border-slate-800 bg-slate-950/40';

          const badgeBg = isOverloaded
            ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
            : isHigh
            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';

          return (
            <div
              key={employee.id}
              onClick={() => onEmployeeSelect && onEmployeeSelect(employee)}
              className={`p-4 rounded-lg border ${healthColor} transition-all duration-200 hover:scale-[1.01] cursor-pointer`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-semibold text-sm">
                    {employee.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-200">{employee.name}</h4>
                    <p className="text-xs text-slate-400">{employee.designation}</p>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${badgeBg}`}>
                  {stats.totalAssigned} Phases
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-3">
                <div
                  className="bg-indigo-500 h-full transition-all duration-500"
                  style={{
                    width: `${stats.totalAssigned > 0 ? (stats.completed / stats.totalAssigned) * 100 : 0}%`
                  }}
                ></div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1 border-t border-slate-800/60">
                <div>
                  <span className="text-slate-500 block">Pending</span>
                  <span className="font-medium text-slate-300">{stats.pending}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Done</span>
                  <span className="font-medium text-emerald-400">{stats.completed}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Overdue</span>
                  <span className={`font-medium ${stats.overdue > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                    {stats.overdue}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WorkloadHeatmap;
