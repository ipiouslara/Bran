/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';
import { getSupabase } from '../lib/db';

export interface RemotePresenceUser {
  userId: string;
  userName: string;
  focusedCell: { phaseId: string; field: 'internalStartDate' | 'internalEndDate' | 'clientDate' } | null;
}

interface UseTimelineRealtimeOptions {
  courseId: string;
  activeModuleIds: string[];
  currentUser?: { id?: string; name?: string; email?: string } | null;
  focusedCell: { phaseId: string; field: 'internalStartDate' | 'internalEndDate' | 'clientDate' } | null;
  onPhaseUpdated: (updatedPhase: any) => void;
  onPhaseInserted?: (insertedPhase: any) => void;
  onPhaseDeleted?: (deletedPhaseId: string) => void;
}

export function useTimelineRealtime({
  courseId,
  activeModuleIds,
  currentUser,
  focusedCell,
  onPhaseUpdated,
  onPhaseInserted,
  onPhaseDeleted
}: UseTimelineRealtimeOptions) {
  const [remotePresences, setRemotePresences] = useState<RemotePresenceUser[]>([]);
  const channelRef = useRef<any>(null);

  // Keep references to callbacks to avoid unnecessary subscription tearing
  const onUpdatedRef = useRef(onPhaseUpdated);
  const onInsertedRef = useRef(onPhaseInserted);
  const onDeletedRef = useRef(onPhaseDeleted);

  useEffect(() => {
    onUpdatedRef.current = onPhaseUpdated;
    onInsertedRef.current = onPhaseInserted;
    onDeletedRef.current = onPhaseDeleted;
  }, [onPhaseUpdated, onPhaseInserted, onPhaseDeleted]);

  useEffect(() => {
    if (!courseId || activeModuleIds.length === 0) {
      setRemotePresences([]);
      return;
    }

    const sb = getSupabase();
    if (!sb) return;

    const channelName = `project_editor_${courseId}`;
    const myUserId = currentUser?.id || `user_${Math.random().toString(36).substring(2, 9)}`;

    // Build filter string for postgres_changes
    // e.g. module_id=in.(uuid1,uuid2,uuid3)
    const filter = activeModuleIds.length > 0 
      ? `module_id=in.(${activeModuleIds.join(',')})` 
      : undefined;

    const channel = sb.channel(channelName, {
      config: {
        presence: { key: myUserId }
      }
    });

    channelRef.current = channel;

    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'phases',
          filter: filter
        },
        (payload: any) => {
          if (payload.eventType === 'UPDATE' && payload.new) {
            onUpdatedRef.current(payload.new);
          } else if (payload.eventType === 'INSERT' && payload.new) {
            if (onInsertedRef.current) onInsertedRef.current(payload.new);
          } else if (payload.eventType === 'DELETE' && payload.old) {
            if (onDeletedRef.current) onDeletedRef.current(payload.old.id);
          }
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const parsed: RemotePresenceUser[] = [];

        Object.keys(state).forEach(key => {
          const presences = state[key] as any[];
          presences.forEach(p => {
            if (p.user_id && p.user_id !== myUserId) {
              parsed.push({
                userId: p.user_id,
                userName: p.user_name || p.user_email || 'Co-worker',
                focusedCell: p.focused_cell || null
              });
            }
          });
        });

        setRemotePresences(parsed);
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          channel.track({
            user_id: myUserId,
            user_name: currentUser?.name || currentUser?.email || 'Active User',
            focused_cell: focusedCell
          });
        }
      });

    return () => {
      if (channelRef.current) {
        sb.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [courseId, JSON.stringify(activeModuleIds), currentUser?.id]);

  // Update presence track when focusedCell changes
  useEffect(() => {
    if (channelRef.current && currentUser?.id) {
      const myUserId = currentUser.id;
      channelRef.current.track({
        user_id: myUserId,
        user_name: currentUser?.name || currentUser?.email || 'Active User',
        focused_cell: focusedCell
      });
    }
  }, [focusedCell, currentUser?.id, currentUser?.name, currentUser?.email]);

  return {
    remotePresences
  };
}
