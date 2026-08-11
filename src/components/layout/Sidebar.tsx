/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Briefcase,
  Settings,
  CheckCircle2,
  Layers,
  Users,
  History,
  FileSpreadsheet,
  Calendar,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  User,
  Eye,
  Sun,
  Moon,
  Bell,
  SlidersHorizontal,
  LayoutDashboard,
  PackageCheck,
  TrendingUp,
  FolderKanban,
  Table,
  UploadCloud,
  ShieldCheck,
  Clock
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Notification } from '../../types';

// ─── Company colour tokens ────────────────────────────────────────────────────
const BRAND = {
  green:  '#1DAA58',
  blue:   '#2484C6',
  teal:   '#008DA5',
  navy:   '#00669B',
  dark:   '#193661',
  grey:   '#B1B7C3',
  greyDk: '#1B1D21',
};

const BRAND_GRADIENT = `linear-gradient(135deg, ${BRAND.green} 0%, ${BRAND.blue} 100%)`;

function getRoleColour(role: string) {
  switch (role) {
    case 'Admin':           return BRAND.blue;
    case 'Project Manager': return BRAND.navy;
    case 'Lead':            return BRAND.teal;
    default:                return BRAND.green;
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SidebarProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  activePage: string;
  onNavigate: (page: string) => void;
  currentUser: { email?: string; role?: string; id?: string; name?: string } | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onLogout: () => void;
  activeProjectsCount?: number;
  notifications?: Notification[];
  onMarkAllNotificationsRead?: () => void;
  onNotificationClick?: (n: Notification) => void;
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export const Sidebar: React.FC<SidebarProps> = ({
  theme,
  onToggleTheme,
  activePage,
  onNavigate,
  currentUser,
  expanded,
  onToggleExpand,
  onLogout,
  activeProjectsCount = 0,
  notifications = [],
  onMarkAllNotificationsRead,
  onNotificationClick,
}) => {
  const [isNotifOpen,        setIsNotifOpen]        = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [opsCollapsed,       setOpsCollapsed]       = useState(false);
  const [calCollapsed,       setCalCollapsed]       = useState(false);
  const [notifPos,           setNotifPos]           = useState({ bottom: 0, left: 0 });

  const bellRef  = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleBellClick = () => {
    if (!isNotifOpen && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setNotifPos({
        bottom: Math.max(16, window.innerHeight - rect.bottom),
        left: rect.right + 12,
      });
    }
    setIsNotifOpen(prev => !prev);
  };

  useEffect(() => {
    if (!isNotifOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        bellRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      ) return;
      setIsNotifOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isNotifOpen]);

  const role         = currentUser?.role || 'Employee';
  const isAdminOrPM  = role === 'Admin' || role === 'Project Manager';
  const isLead       = role === 'Lead';
  const unreadCount  = notifications.filter((n) => !n.isRead).length;
  const roleColour   = getRoleColour(role);
  const initials     = currentUser?.name
    ? currentUser.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  // ── Nav item renderer ──────────────────────────────────────────────────────

  const renderNavItem = (
    id: string,
    pageKey: string,
    label: string,
    icon: React.ReactNode,
    badgeCount?: number
  ) => {
    const isActive = activePage === pageKey;

    return (
      <button
        key={id}
        id={id}
        onClick={() => onNavigate(pageKey)}
        title={!expanded ? label : ''}
        className={`w-full py-2.5 ${!expanded ? 'px-0 justify-center' : 'px-3 justify-between'} rounded-lg flex items-center text-xs transition-colors relative cursor-pointer ${
          isActive ? 'text-[var(--text-main)] font-bold shadow-xs' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card-hover)] font-medium'
        }`}
      >
        {isActive && (
          <motion.div
            layoutId="sidebar-active-pill"
            className="absolute inset-0 rounded-lg"
            style={{
              background: `linear-gradient(90deg, rgba(29,170,88,0.18) 0%, rgba(36,132,198,0.12) 100%)`,
              borderLeft: `3px solid ${BRAND.green}`,
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
        <div className={`flex items-center gap-3 min-w-0 relative z-10 ${!expanded ? 'justify-center w-full' : ''}`}>
          <span
            className="w-4 h-4 shrink-0 flex items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--text-main)]"
            style={isActive ? { color: BRAND.green } : {}}
          >
            {icon}
          </span>
          {expanded && <span className="truncate">{label}</span>}
        </div>

        {expanded && badgeCount !== undefined && badgeCount > 0 && (
          <span className="relative z-10 text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-[var(--bg-card-hover)] text-[var(--text-main)] border border-[var(--border-subtle)]">
            {badgeCount}
          </span>
        )}
      </button>
    );
  };

  // ── Relative time helper ───────────────────────────────────────────────────

  const getRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <aside
      className={`shrink-0 h-screen sticky top-0 bg-[var(--sidebar-bg)] border-r border-[var(--border-subtle)] flex flex-col justify-between transition-all duration-300 z-30 ${
        expanded ? 'w-64' : 'w-14'
      }`}
    >
      {/* ── 1. Brand Header — locked to h-[52px] to align with dashboard overview header ── */}
      <div className="h-[52px] px-2 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        {expanded ? (
          <>
            <div className="flex items-center gap-2.5 overflow-hidden">
              {/* Mediant Labs logo */}
              <div className="w-8 h-8 flex items-center justify-center shrink-0">
                <img src="/logo.png" alt="Mediant Labs" className="w-7 h-7 object-contain" />
              </div>
              <div className="leading-tight min-w-0">
                <span className="text-xs font-extrabold tracking-tight block truncate text-[var(--text-main)]">MEDIANT LABS</span>
                <span className="text-[9px] text-[var(--text-muted)] font-semibold uppercase tracking-wider block">BRAN v2.0</span>
              </div>
            </div>

            <button
              onClick={onToggleExpand}
              className="p-1 rounded-md border border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all cursor-pointer shrink-0"
              title="Collapse Sidebar"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <button
            onClick={onToggleExpand}
            className="w-full flex items-center justify-center rounded-lg hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer group"
            title="Expand Sidebar"
          >
            <div className="w-7 h-7 flex items-center justify-center relative">
              <img src="/logo.png" alt="Mediant Labs" className="w-6 h-6 object-contain" />
              <ChevronRight className="w-3 h-3 text-[var(--text-muted)] absolute -right-2 bg-[var(--sidebar-bg)] rounded-full border border-[var(--border-subtle)] transition-all group-hover:text-[var(--text-main)]" />
            </div>
          </button>
        )}
      </div>

      {/* ── 2. Scrollable Navigation ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-1.5 py-3 space-y-4">

        {/* Analytics & Progress */}
        <div className="space-y-1">
          {expanded && (
            <span className="text-[9px] uppercase font-bold tracking-widest text-neutral-500 px-3 block mb-1">
              Analytics &amp; Progress
            </span>
          )}
          {isAdminOrPM && renderNavItem('nav-exec-dash', 'dashboard', 'Overview', <LayoutDashboard className="w-4 h-4" />)}
          {isAdminOrPM && renderNavItem('nav-client-delivery', 'client', 'Delivery Progress', <PackageCheck className="w-4 h-4" />)}
          {(isAdminOrPM || isLead) && renderNavItem('nav-internal-phases', 'internal', 'Development Progress', <TrendingUp className="w-4 h-4" />)}
          {(isLead || role === 'Employee') && renderNavItem('nav-emp-dash', 'employee_dashboard', 'My Workstation', <User className="w-4 h-4" />)}
          {(isLead || role === 'Employee') && renderNavItem('nav-shared-tracker', 'tracker', 'Shared Tracker', <Eye className="w-4 h-4" />)}
        </div>

        {/* Operations */}
        <div className="space-y-1">
          {expanded && (
            <button
              onClick={() => setOpsCollapsed(!opsCollapsed)}
              className="w-full flex items-center justify-between text-[9px] uppercase font-bold tracking-widest text-neutral-500 px-3 py-1 hover:text-neutral-300 cursor-pointer"
            >
              <span>Operations</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${opsCollapsed ? '-rotate-90' : ''}`} />
            </button>
          )}
          {!opsCollapsed && (
            <div className="space-y-1">
              {isAdminOrPM && renderNavItem('nav-projects-mgt', 'projects', 'Projects', <FolderKanban className="w-4 h-4" />, activeProjectsCount)}
              {isAdminOrPM && renderNavItem('nav-project-editor', 'project_editor', 'Project Editor', <Table className="w-4 h-4" />)}
              {isAdminOrPM && renderNavItem('nav-ingestion', 'ingestion', 'Add Project', <UploadCloud className="w-4 h-4" />)}
            </div>
          )}
        </div>

        {/* Governance */}
        <div className="space-y-1">
          {expanded && (
            <button
              onClick={() => setCalCollapsed(!calCollapsed)}
              className="w-full flex items-center justify-between text-[9px] uppercase font-bold tracking-widest text-neutral-500 px-3 py-1 hover:text-neutral-300 cursor-pointer"
            >
              <span>Governance</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${calCollapsed ? '-rotate-90' : ''}`} />
            </button>
          )}
          {!calCollapsed && (
            <div className="space-y-1">
              {renderNavItem('nav-directory', 'employee-directory', 'Directory & Credentials', <Users className="w-4 h-4" />)}
              {renderNavItem('nav-capacity', 'capacity-allocation', 'Capacity & Allocation', <Clock className="w-4 h-4" />)}
              {isAdminOrPM && renderNavItem('nav-activity-log', 'audit-log', 'Audit Log', <ShieldCheck className="w-4 h-4" />)}
            </div>
          )}
        </div>
      </div>

      {/* ── 3. Bottom: Notifications → Theme → Account → Sign Out ──────── */}
      <div className={`p-2.5 border-t ${theme === 'light' ? 'border-[var(--border-subtle)]' : 'border-neutral-900'} space-y-1`}>

        {/* Notifications */}
        <div className="relative">
          <button
            ref={bellRef}
            onClick={handleBellClick}
            title={!expanded ? 'Notifications' : ''}
            className={`w-full py-2.5 ${!expanded ? 'px-0 justify-center' : 'px-3 justify-between'} rounded-lg flex items-center text-xs text-neutral-400 hover:text-white hover:bg-neutral-900/60 transition-all cursor-pointer font-medium`}
          >
            <div className={`flex items-center gap-3 min-w-0 ${!expanded ? 'justify-center w-full' : ''}`}>
              <div className="relative w-4 h-4 shrink-0 flex items-center justify-center">
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500" />
                )}
              </div>
              {expanded && <span>Notifications</span>}
            </div>
            {expanded && unreadCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Panel — Portal renders into document.body, escaping sidebar clipping */}
          {createPortal(
            <AnimatePresence>
              {isNotifOpen && (
                <motion.div
                  ref={panelRef}
                  initial={{ opacity: 0, scale: 0.9, x: -12, y: 12 }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, x: -12, y: 12 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  style={{ position: 'fixed', bottom: notifPos.bottom, left: notifPos.left, zIndex: 9999 }}
                  className="w-80 rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl text-xs py-1 flex flex-col justify-end max-h-96 divide-y divide-neutral-900"
                >
                  <div className="px-3 py-2 flex items-center justify-between font-semibold">
                    <span className="text-white font-bold">Notifications</span>
                    {unreadCount > 0 && onMarkAllNotificationsRead && (
                      <button
                        onClick={onMarkAllNotificationsRead}
                        className="text-[10px] text-neutral-400 hover:text-white hover:underline cursor-pointer"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-neutral-900">
                    {notifications.length === 0 ? (
                      <div className="p-3 text-center text-neutral-500 italic text-[11px]">No unread alerts</div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            if (onNotificationClick) onNotificationClick(n);
                            setIsNotifOpen(false);
                          }}
                          className={`p-2.5 hover:bg-neutral-900 transition-colors flex flex-col gap-0.5 cursor-pointer ${
                            !n.isRead ? 'bg-neutral-900/60' : ''
                          }`}
                        >
                          <p className="text-[11px] text-neutral-200 leading-snug">{n.message}</p>
                          <span className="text-[9px] text-neutral-500">{getRelativeTime(n.createdAt)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>,
            document.body
          )}
        </div>

        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          title={!expanded ? (theme === 'dark' ? 'Light Theme' : 'Dark Theme') : ''}
          className={`w-full py-2.5 ${!expanded ? 'px-0 justify-center' : 'px-3 gap-3'} rounded-lg flex items-center text-xs text-neutral-400 hover:text-white hover:bg-neutral-900/60 transition-all cursor-pointer font-medium`}
        >
          <span className={`w-4 h-4 shrink-0 flex items-center justify-center ${!expanded ? 'mx-auto' : ''}`}>
            {theme === 'dark'
              ? <Sun className="w-4 h-4 text-amber-400" />
              : <Moon className="w-4 h-4 text-neutral-400" />}
          </span>
          {expanded && <span>{theme === 'dark' ? 'Dark Theme' : 'Light Theme'}</span>}
        </button>

        {/* Account card — click to open settings modal (no border-t separator above) */}
        <div>
          {expanded ? (
            <button
              onClick={() => setIsAccountModalOpen(true)}
              className="w-full p-2.5 rounded-xl bg-[var(--input-bg)] border border-[var(--border-subtle)] flex items-center gap-3 hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer group"
              title="Account Settings"
            >
              {/* Avatar with company-colour ring */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                style={{
                  background: BRAND_GRADIENT,
                  boxShadow: `0 0 0 2px var(--sidebar-bg), 0 0 0 3.5px ${roleColour}55`,
                }}
              >
                {initials}
              </div>
              <div className="leading-tight min-w-0 flex-1 text-left">
                <span className="text-xs font-bold text-[var(--text-main)] block truncate">{currentUser?.name || 'User'}</span>
                <span className="text-[10px] text-[var(--text-muted)] block truncate">{role}</span>
              </div>
              <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-main)] shrink-0 transition-colors" />
            </button>
          ) : (
            <div className="flex flex-col items-center py-1">
              <button
                onClick={() => setIsAccountModalOpen(true)}
                title={`${currentUser?.name || 'User'} (${role}) — Account Settings`}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs hover:opacity-85 transition-all cursor-pointer"
                style={{
                  background: BRAND_GRADIENT,
                  boxShadow: `0 0 0 2px var(--sidebar-bg), 0 0 0 3.5px ${roleColour}55`,
                }}
              >
                {initials}
              </button>
            </div>
          )}
        </div>

        {/* Sign Out */}
        {expanded ? (
          <button
            onClick={onLogout}
            className="w-full py-2 px-3 rounded-lg flex items-center gap-3 text-xs font-medium transition-all cursor-pointer text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10"
          >
            <LogOut className="w-4 h-4 shrink-0 text-rose-500/60" />
            <span>Sign Out</span>
          </button>
        ) : (
          <div className="flex justify-center pt-0.5">
            <button
              onClick={onLogout}
              title="Sign Out"
              className="p-2 rounded-lg hover:bg-rose-500/10 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-rose-500/60 hover:text-rose-400" />
            </button>
          </div>
        )}
      </div>

      {/* ── Account Settings Modal ───────────────────────────────────────── */}
      {isAccountModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={() => setIsAccountModalOpen(false)}
        >
          <div
            className="w-full max-w-sm p-5 rounded-xl border border-neutral-800 bg-neutral-950 shadow-2xl space-y-4 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4" style={{ color: BRAND.green }} />
                Account Settings
              </h3>
              <button
                onClick={() => setIsAccountModalOpen(false)}
                className="text-neutral-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Profile Card */}
            <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{
                  background: BRAND_GRADIENT,
                  boxShadow: `0 0 0 2px #1a1a1a, 0 0 0 3.5px ${roleColour}55`,
                }}
              >
                {initials}
              </div>
              <div className="leading-tight min-w-0">
                <p className="font-bold text-white text-sm truncate">{currentUser?.name || 'User Profile'}</p>
                <p className="text-neutral-400 text-xs truncate">{currentUser?.email || 'No email attached'}</p>
              </div>
            </div>

            {/* Role */}
            <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">System Role</p>
                <p className="text-[10px] text-neutral-400">Permissions tier assigned by admin</p>
              </div>
              <span
                className="px-2.5 py-1 rounded-full text-[10px] font-bold"
                style={{
                  background: `${roleColour}18`,
                  color: roleColour,
                  border: `1px solid ${roleColour}40`,
                }}
              >
                {role}
              </span>
            </div>

            {/* Close */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsAccountModalOpen(false)}
                className="px-4 py-2 rounded-lg font-bold text-xs text-white transition-all hover:brightness-110 cursor-pointer"
                style={{ background: BRAND_GRADIENT }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
