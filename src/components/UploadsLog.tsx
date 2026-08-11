/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { History, Calendar, CheckSquare, Layers, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { RawUpload } from '../types';
import { getSupabase } from '../lib/db';
import { formatDateDDMMYYYY } from '../utils/dateFormatter';

interface UploadsLogProps {
  theme: 'dark' | 'light';
  refreshTimer: number;
}

export default function UploadsLog({ theme, refreshTimer }: UploadsLogProps) {
  const [logs, setLogs] = useState<RawUpload[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    const sb = getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb.from('raw_uploads')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);
        if (error) throw error;
        
        if (data) {
          const mapped: RawUpload[] = data.map(item => ({
            id: item.id,
            filename: item.filename,
            fileType: item.file_type,
            rowCount: item.row_count,
            timestamp: item.created_at
          }));
          setLogs(mapped);
        }
      } catch (err) {
        console.error("Could not query Supabase logs:", err);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [refreshTimer]);

  return (
    <div
      id="logs-container"
      className={`p-5 rounded-lg border transition-all hover-card-glow ${
        theme === 'dark'
          ? 'bg-[#1B1D21] border-[#B1B7C3]/15 text-white'
          : 'bg-white border-neutral-200 text-neutral-800'
      }`}
    >
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#B1B7C3]/15">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-[#1DAA58]" />
          <h3 className="text-sm font-semibold">Raw Uploads Audit Log</h3>
        </div>
        
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="p-1 hover:bg-neutral-500/10 text-neutral-400 hover:text-white rounded-md transition-all"
          title="Refresh transaction history"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {logs.length > 0 ? (
        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`p-3 rounded-md flex items-center justify-between text-xs transition-colors border ${
                theme === 'dark'
                  ? 'bg-neutral-800/40 border-neutral-750/50 hover:bg-neutral-800'
                  : 'bg-neutral-50 border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate flex-1 pr-3">
                <FileSpreadsheet className="w-4.5 h-4.5 text-[#2484C6] flex-shrink-0" />
                <div className="truncate">
                  <p className="font-medium truncate text-neutral-200">{log.filename}</p>
                  <div className="flex items-center gap-2 text-[10px] text-neutral-400 mt-0.5">
                    <span className="capitalize font-semibold">{log.fileType} File</span>
                    <span>•</span>
                    <span>{log.rowCount} rows processed</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end flex-shrink-0 text-[10px] text-neutral-400">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>{formatDateDDMMYYYY(log.timestamp)}</span>
                </div>
                <span className="mt-0.5 text-neutral-500 font-mono">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 bg-neutral-500/5 rounded-md text-neutral-400 text-xs">
          No recorded uploads log events found in this project workspace yet. Commit a join transaction to generate entries.
        </div>
      )}
    </div>
  );
}
