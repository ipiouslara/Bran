/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  ownerId?: string;
}

export interface RawUpload {
  id: string;
  filename: string;
  fileType: 'client' | 'internal';
  rowCount: number;
  timestamp: string;
}

export interface Course {
  id: string;
  projectId: string;
  name: string;
  code: string;
}

export interface Module {
  id: string;
  courseId: string;
  name: string;
  code: string;
  language?: string;
  metadata?: Record<string, any> | null; // Dynamic custom columns metadata
  clientCustomMetadata?: Record<string, any> | null;
  internalCustomMetadata?: Record<string, any> | null;
}

export type UserRole = 'Admin' | 'Project Manager' | 'Lead' | 'Employee';

export interface Employee {
  id: string;
  employeeId: string;
  name: string;
  designation: string;
  email?: string;
  role?: UserRole;
}

export interface ClientPhase {
  id: string;
  moduleId: string;
  phaseName: string;
  phaseType?: string | null;
  phaseTypePhase?: string | null;
  phaseSequence?: number | null;
  clientDate?: string | null;
  sourceFileRef: string;
  metadata?: Record<string, any> | null;
}

export interface InternalPhase {
  id: string;
  moduleId: string;
  phaseName: string;
  phaseType?: string | null;
  phaseTypePhase?: string | null;
  phaseSequence?: number | null;
  internalStartDate?: string | null;
  internalEndDate?: string | null;
  sourceFileRef: string;
  assignedTo?: string | null;
  status?: 'Pending' | 'Completed' | 'Overdue' | 'Rejected' | 'In Review' | 'Done' | 'Approved' | 'In Progress';
  rejectionNote?: string | null;
  metadata?: Record<string, any> | null;
}

export interface Phase {
  id: string;
  moduleId: string;
  phaseName: string;
  phaseType?: string | null;    // e.g. 'Alpha', 'Beta', 'LMS', 'QA'
  phaseTypePhase?: string | null; // e.g. 'Phase 1', 'Phase 2'
  phaseSequence?: number | null;
  clientDate?: string | null;
  internalStartDate?: string | null;
  internalEndDate?: string | null;
  sourceFileRef: string;
  sourceFile?: 'Client' | 'Internal' | null;
  assignedTo?: string | null; // Employee UUID (or id)
  status?: 'Pending' | 'Completed' | 'Overdue' | 'Rejected' | 'In Review' | 'Done' | 'Approved' | 'In Progress';
  rejectionNote?: string | null;
  clientPhaseId?: string | null;
  internalPhaseId?: string | null;
  metadata?: Record<string, any> | null; // Dynamic custom columns metadata
}

export interface ScheduleBaseline {
  id: string;
  projectId: string;
  versionName: string;
  description?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface PhaseGap {
  id?: string;
  projectId: string;
  earlierPhaseId: string;
  laterPhaseId: string;
  workingDaysGap: number;
  gapType?: 'internal_to_internal' | 'client_to_internal' | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientInternalMapping {
  id?: string;
  projectId: string;
  clientPhaseName: string;
  anchorInternalPhaseName: string;
  anchorPoint: 'Start' | 'End';
  createdAt?: string;
  updatedAt?: string;
}


export interface ScheduleBaselineItem {
  id: string;
  baselineId: string;
  moduleId: string;
  phaseName: string;
  phaseType?: string | null;
  baselineClientDate?: string | null;
  baselineInternalStartDate?: string | null;
  baselineInternalEndDate?: string | null;
}

export interface ScheduleVariance {
  varianceDays: number;
  isDelayed: boolean;
  isAhead: boolean;
  baselineDate: string;
  currentDate: string;
}


export type FileRole = 'client' | 'internal';

export interface PhaseColumnMapping {
  phaseName: string;
  phaseType?: string;            // User-typed type label (e.g. Alpha, Beta, QA)
  phaseTypePhase?: string;       // User-typed type phase label (e.g. Phase 1)
  // If Client role
  clientDateCol?: string;
  anchorInternalPhase?: string;  // e.g. SBSMEVS
  anchorPoint?: 'Start' | 'End'; // Start Date vs End Date
  // If Internal role
  internalStartDateCol?: string;
  internalEndDateCol?: string;
}

export interface CustomColumnMapping {
  displayName: string;
  spreadsheetCol: string;
  targetEntity: 'module' | 'phase';
  phaseName?: string; // if targetEntity is phase, which phase does it apply to?
}

export interface ColumnMappingConfig {
  fileRole: FileRole;
  courseCol: string;
  moduleCol: string;
  languageCol?: string; // Optional
  phases: PhaseColumnMapping[];
  customMappings?: CustomColumnMapping[]; // Dynamic custom column mapping definitions
}

export interface SheetPreviewData {
  sheetName: string;
  headers: string[];
  rows: Record<string, any>[];
}

export interface UploadedFileState {
  filename: string;
  sheets: SheetPreviewData[];
  selectedSheetName: string;
  origin?: 'delivery_sheet' | 'development_sheet';
  mappingConfig?: ColumnMappingConfig;
}

export interface JoinResultRow {
  courseCode: string;
  courseName: string;
  moduleCode: string;
  moduleName: string;
  language?: string;
  status: 'matched' | 'client-only' | 'internal-only';
  moduleMetadata?: Record<string, any> | null; // Dynamic module custom metadata
  clientCustomMetadata?: Record<string, any> | null;
  internalCustomMetadata?: Record<string, any> | null;
  
  // Clean, unified phases lists
  phases: {
    phaseName: string;
    phaseType?: string | null;  // type label from mapping configuration
    phaseTypePhase?: string | null; // type phase label from mapping configuration
    phaseSequence?: number | null;
    sourceFile?: 'Client' | 'Internal' | null;
    origin?: 'delivery_sheet' | 'development_sheet';
    clientDate?: string | null;
    internalStartDate?: string | null;
    internalEndDate?: string | null;
    metadata?: Record<string, any> | null; // Dynamic custom columns metadata
    clientMetadata?: Record<string, any> | null;
    internalMetadata?: Record<string, any> | null;
  }[];
}

export interface Notification {
  id: string;
  recipientId: string;
  phaseId?: string | null;
  moduleId?: string | null;
  eventId?: string | null;
  type: 'new_assignment' | 'due_soon' | 'overdue' | 'date_changed';
  message: string;
  metadata?: Record<string, any> | null;
  isRead: boolean;
  createdAt: string;
}

