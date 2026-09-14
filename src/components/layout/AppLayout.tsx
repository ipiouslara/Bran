/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { Notification } from '../../types';
import { Menu, Sun, Moon, Bell } from 'lucide-react';

interface AppLayoutProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  activePage: string;
  onNavigate: (page: string) => void;
  currentUser: { email?: string; role?: string; id?: string; name?: string } | null;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  notifications: Notification[];
  onMarkAllNotificationsRead: () => void;
  onNotificationClick: (n: Notification) => void;
  onLogout: () => void;
  activeProjectsCount?: number;
  children: React.ReactNode;
}

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Executive Overview',
  client: 'Delivery Progress',
  internal: 'Development Progress',
  employee_dashboard: 'My Workstation',
  tracker: 'Shared Tracker',
  projects: 'Projects Directory',
  project_editor: 'Project Editor',
  calendar: 'Holiday Calendar',
  directory: 'Directory & Credentials',
  'employee-directory': 'Directory & Credentials',
  employees: 'Directory & Credentials',
  'capacity-allocation': 'Capacity & Allocation',
  allocations: 'Capacity & Allocation',
  'audit-log': 'Audit Log',
  activity_log: 'Audit Log',
  ingestion: 'Data Ingestion',
};

export const AppLayout: React.FC<AppLayoutProps> = ({
  theme,
  onToggleTheme,
  activePage,
  onNavigate,
  currentUser,
  notifications,
  onMarkAllNotificationsRead,
  onNotificationClick,
  onLogout,
  activeProjectsCount = 0,
  children
}) => {
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('sidebar_expanded');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const handleToggleSidebar = () => {
    const next = !sidebarExpanded;
    setSidebarExpanded(next);
    localStorage.setItem('sidebar_expanded', JSON.stringify(next));
  };

  const unreadCount = (notifications || []).filter(n => !n.isRead).length;

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-main)] flex font-sans antialiased overflow-hidden transition-colors duration-150">
      {/* Sidebar (Desktop Sticky + Mobile Slide-over Drawer) */}
      <Sidebar
        theme={theme}
        onToggleTheme={onToggleTheme}
        activePage={activePage}
        onNavigate={onNavigate}
        currentUser={currentUser}
        expanded={sidebarExpanded}
        onToggleExpand={handleToggleSidebar}
        onLogout={onLogout}
        activeProjectsCount={activeProjectsCount}
        notifications={notifications}
        onMarkAllNotificationsRead={onMarkAllNotificationsRead}
        onNotificationClick={onNotificationClick}
        mobileDrawerOpen={mobileDrawerOpen}
        onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
      />

      {/* Main Full-Height Viewport Container */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-[var(--bg-page)]">
        {/* Mobile-Only Top Navigation Bar (md:hidden) */}
        <header className="h-14 px-3.5 border-b border-[var(--border-subtle)] bg-[var(--sidebar-bg)] flex items-center justify-between shrink-0 md:hidden z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-main)] active:scale-95 transition-all cursor-pointer shrink-0"
              title="Open Navigation Menu"
              aria-label="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <img src="/logo.png" alt="BRAN" className="w-6 h-6 object-contain shrink-0" />
              <span className="text-xs font-black tracking-tight text-[var(--text-main)] truncate">
                {PAGE_TITLES[activePage] || 'BRAN'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onToggleTheme}
              className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-neutral-400" />}
            </button>

            {unreadCount > 0 && (
              <button
                onClick={() => {
                  const firstUnread = notifications.find(n => !n.isRead);
                  if (firstUnread) onNotificationClick(firstUnread);
                  else onMarkAllNotificationsRead();
                }}
                className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors relative cursor-pointer"
                title={`${unreadCount} unread alert${unreadCount > 1 ? 's' : ''}`}
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4 text-emerald-400" />
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Viewport Area with Responsive Padding */}
        <main className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 pt-3 md:pt-8 pb-6 space-y-6 bg-[var(--bg-page)]">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
