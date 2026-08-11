import { Project, Course, Module, Phase, Employee } from '../types';

export interface DashboardCacheData {
  projects: Project[];
  courses: Course[];
  modules: Module[];
  phases: Phase[];
  projectLinks: { employee_id: string; project_id: string }[];
  timestamp: number;
}

let dashboardCache: DashboardCacheData | null = null;
let executiveMetricsCache: { data: any; timestamp: number } | null = null;

export function getDashboardCache(): DashboardCacheData | null {
  return dashboardCache;
}

export function setDashboardCache(data: Omit<DashboardCacheData, 'timestamp'>): void {
  dashboardCache = {
    ...data,
    timestamp: Date.now()
  };
}

export function updatePhaseInCache(phaseId: string, updates: Partial<Phase>): void {
  if (!dashboardCache) return;
  dashboardCache.phases = dashboardCache.phases.map(ph => {
    if (ph.id === phaseId) {
      return { ...ph, ...updates };
    }
    return ph;
  });
}

export function getExecutiveMetricsCache(): any | null {
  return executiveMetricsCache ? executiveMetricsCache.data : null;
}

export function setExecutiveMetricsCache(data: any): void {
  executiveMetricsCache = {
    data,
    timestamp: Date.now()
  };
}

export function clearDashboardCache(): void {
  dashboardCache = null;
  executiveMetricsCache = null;
}
