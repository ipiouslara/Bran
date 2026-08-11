/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { memo } from 'react';
import { Phase } from '../types';
import { RemotePresenceUser } from '../hooks/useTimelineRealtime';
import { User } from 'lucide-react';
import { formatDateDDMMYYYY } from '../utils/dateFormatter';

interface MemoizedDateCellProps {
  phaseId: string;
  field: 'internalStartDate' | 'internalEndDate' | 'clientDate';
  phase: Phase | undefined;
  pendingValue: string | null | undefined;
  hasConflict?: boolean;
  isEditing: boolean;
  remoteUsersEditing: RemotePresenceUser[];
  theme: 'dark' | 'light';
  bgClass: string;
  onClick: () => void;
  onChange: (val: string | null) => void;
  onSaveInline: (val: string | null) => void;
  onCancel: () => void;
}

function arePropsEqual(prevProps: MemoizedDateCellProps, nextProps: MemoizedDateCellProps) {
  return (
    prevProps.phaseId === nextProps.phaseId &&
    prevProps.field === nextProps.field &&
    prevProps.isEditing === nextProps.isEditing &&
    prevProps.pendingValue === nextProps.pendingValue &&
    prevProps.hasConflict === nextProps.hasConflict &&
    prevProps.theme === nextProps.theme &&
    prevProps.bgClass === nextProps.bgClass &&
    prevProps.phase?.internalStartDate === nextProps.phase?.internalStartDate &&
    prevProps.phase?.internalEndDate === nextProps.phase?.internalEndDate &&
    prevProps.phase?.clientDate === nextProps.phase?.clientDate &&
    prevProps.phase?.status === nextProps.phase?.status &&
    prevProps.remoteUsersEditing.length === nextProps.remoteUsersEditing.length &&
    prevProps.remoteUsersEditing.every((u, idx) => u.userId === nextProps.remoteUsersEditing[idx]?.userId)
  );
}

export const MemoizedDateCell = memo(function MemoizedDateCell({
  phaseId,
  field,
  phase,
  pendingValue,
  hasConflict,
  isEditing,
  remoteUsersEditing,
  theme,
  bgClass,
  onClick,
  onChange,
  onSaveInline,
  onCancel
}: MemoizedDateCellProps) {
  const value = pendingValue !== undefined
    ? pendingValue
    : (phase ? (field === 'internalStartDate' ? phase.internalStartDate : field === 'internalEndDate' ? phase.internalEndDate : phase.clientDate) : '') || '';

  const isCompleted = phase?.status === 'Completed' || phase?.status === 'Approved' || phase?.status === 'Done';
  const isRemoteLocked = remoteUsersEditing.length > 0;
  const lockUser = remoteUsersEditing[0];

  return (
    <td
      className={`py-3 px-4 border-r border-neutral-500/10 text-center relative ${bgClass} ${
        isRemoteLocked ? 'ring-2 ring-amber-400/80 ring-inset' : ''
      } ${isCompleted ? 'cursor-not-allowed opacity-75' : ''}`}
      onClick={() => {
        if (!isCompleted && !isRemoteLocked) {
          onClick();
        }
      }}
    >
      {/* Remote Presence / Cell Locking Indicator */}
      {isRemoteLocked && (
        <div 
          className="absolute -top-2 -right-1 z-20 bg-amber-500 text-neutral-950 font-extrabold text-[9px] px-1 py-0.2 rounded-full shadow-md flex items-center gap-0.5 pointer-events-none"
          title={`Currently focused by ${lockUser?.userName || 'Co-worker'}`}
        >
          <User className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate max-w-[50px]">{lockUser?.userName?.split(' ')[0] || 'Editing'}</span>
        </div>
      )}

      {isEditing ? (
        <input
          type="date"
          value={value || ''}
          autoFocus
          onChange={e => onChange(e.target.value)}
          onBlur={e => onSaveInline(e.target.value || null)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              onCancel();
            }
          }}
          className={`w-full p-1 text-xs rounded outline-hidden border ${
            theme === 'dark' ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-black'
          }`}
        />
      ) : (
        <div className="min-h-5 flex flex-col justify-center items-center cursor-pointer relative group">
          <span>{formatDateDDMMYYYY(value)}</span>
          {pendingValue !== undefined && (
            <span className="text-[8px] font-bold text-amber-500 mt-0.5">Unsaved</span>
          )}
          {hasConflict && (
            <span className="text-[8px] font-bold text-sky-400 mt-0.5 underline title='Remote update received for other fields'">
              Remote Update
            </span>
          )}
        </div>
      )}
    </td>
  );
}, arePropsEqual);
