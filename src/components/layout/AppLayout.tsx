/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { Notification } from '../../types';

interface AppLayoutProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  activePage: string;
  onNavigate: (page: string) => void;
  currentUser: { email?: string; role?: string; id?: string; name?: string } | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  notifications: Notification[];
  onMarkAllNotificationsRead: () => void;
  onNotificationClick: (n: Notification) => void;
  onLogout: () => void;
  activeProjectsCount?: number;
  children: React.ReactNode;
}

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

  const handleToggleSidebar = () => {
    const next = !sidebarExpanded;
    setSidebarExpanded(next);
    localStorage.setItem('sidebar_expanded', JSON.stringify(next));
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-main)] flex font-sans antialiased overflow-hidden transition-colors duration-150">
      {/* Left Pure-Black Vertical Sidebar Column */}
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
      />

      {/* Main Full-Height Viewport Container (Top Header Completely Removed) */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden bg-[var(--bg-page)]">
        {/* Scrollable Viewport Area */}
        <main className="flex-1 overflow-y-auto px-6 pt-8 pb-6 space-y-6 bg-[var(--bg-page)]">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
