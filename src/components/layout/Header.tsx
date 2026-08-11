/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Bell,
  Sun,
  Moon,
  User,
  LogOut,
  History,
  CheckCircle2,
  Shield,
  ChevronDown
} from 'lucide-react';
import { Notification } from '../../types';

interface HeaderProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  currentUser: { email?: string; role?: string; id?: string; name?: string } | null;
  notifications: Notification[];
  onMarkAllNotificationsRead: () => void;
  onNotificationClick: (n: Notification) => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  onToggleTheme,
  searchQuery,
  onSearchChange,
  currentUser,
  notifications,
  onMarkAllNotificationsRead,
  onNotificationClick,
  onLogout
}) => {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Handle Command/Ctrl + K shortcut to focus global search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Left / Center Section: Wide Global Search Bar with ⌘K trigger */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search projects, modules, deliverables..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-14 py-2 text-xs bg-slate-950/70 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-all"
          />
          <kbd className="absolute right-3 top-2.5 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700 rounded shadow-xs">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right Section: Theme Toggle, Notifications, User Profile Menu */}
      <div className="flex items-center gap-3">
        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className="p-2 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setIsNotifOpen(!isNotifOpen);
              setIsUserMenuOpen(false);
            }}
            title="Notifications"
            className="p-2 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-all relative cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center shadow-md animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-800 bg-slate-900 shadow-2xl z-50 text-xs py-1 divide-y divide-slate-800">
              <div className="px-4 py-2.5 flex items-center justify-between font-semibold">
                <span className="text-white font-bold">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    onClick={onMarkAllNotificationsRead}
                    className="text-[11px] text-blue-400 hover:underline cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/60">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 italic">No unread alerts</div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => {
                        onNotificationClick(n);
                        setIsNotifOpen(false);
                      }}
                      className={`p-3 hover:bg-slate-800/50 transition-colors flex flex-col gap-1 cursor-pointer ${
                        !n.isRead ? 'bg-blue-500/10' : ''
                      }`}
                    >
                      <p className="text-[11px] text-slate-200 leading-snug">{n.message}</p>
                      <span className="text-[9px] text-slate-400">{new Date(n.createdAt).toLocaleTimeString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Avatar & Role Tag Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setIsUserMenuOpen(!isUserMenuOpen);
              setIsNotifOpen(false);
            }}
            className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 transition-all flex items-center gap-2.5 cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-300 font-bold text-xs">
              {currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'U'}
            </div>
            <div className="hidden sm:flex flex-col text-left leading-tight">
              <span className="text-xs font-semibold text-white truncate max-w-[120px]">{currentUser?.name || 'User'}</span>
              <span className="text-[10px] text-blue-400 font-bold">{currentUser?.role || 'Employee'}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-800 bg-slate-900 shadow-2xl z-50 text-xs py-1 divide-y divide-slate-800">
              <div className="px-4 py-3 space-y-0.5">
                <p className="font-bold text-white truncate">{currentUser?.name || 'User'}</p>
                <p className="text-[11px] text-slate-400 truncate">{currentUser?.email}</p>
                <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {currentUser?.role || 'Employee'}
                </span>
              </div>
              <div className="py-1">
                <button
                  onClick={onLogout}
                  className="w-full text-left px-4 py-2 hover:bg-rose-500/10 text-rose-400 font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
