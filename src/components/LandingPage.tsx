/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Mail, Lock, Eye, EyeOff, AlertCircle, ChevronLeft, KeyRound, CheckCircle2, ChevronDown } from 'lucide-react';
import { getSupabase, getEmployees } from '../lib/db';
import { Employee } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewState = 'landing' | 'login' | 'change_password';

interface LandingPageProps {
  onLoginSuccess: (email: string, role: string, employeeId?: string, name?: string) => void;
  theme?: 'dark' | 'light';
}

// ─── Floating Pill Shape ──────────────────────────────────────────────────────

interface PillProps {
  className?: string;
  delay?: number;
  width?: number;
  height?: number;
  rotate?: number;
  gradient?: string;
  isDark?: boolean;
}

function Pill({ className = '', delay = 0, width = 400, height = 100, rotate = 0, gradient = 'from-white/[0.08]', isDark = false }: PillProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -150, rotate: rotate - 15 }}
      animate={{ opacity: 1, y: 0, rotate }}
      transition={{ duration: 2.4, delay, ease: [0.23, 0.86, 0.39, 0.96], opacity: { duration: 1.2 } }}
      className={`absolute ${className}`}
    >
      <motion.div
        animate={{ y: [0, 15, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        style={{ width, height }}
      >
        <div
          className={`absolute inset-0 rounded-full bg-gradient-to-r to-transparent ${gradient} ${isDark ? 'backdrop-blur-[2px]' : 'backdrop-blur-xs'}`}
          style={{
            border: isDark ? '2px solid rgba(255,255,255,0.08)' : '1.5px solid rgba(255,255,255,0.85)',
            boxShadow: isDark
              ? '0 8px 32px 0 rgba(255,255,255,0.04)'
              : '0 12px 36px -4px rgba(15,23,42,0.06), 0 0 0 1px rgba(226,232,240,0.6) inset',
          }}
        />
      </motion.div>
    </motion.div>
  );
}

// ─── Company Logo ─────────────────────────────────────────────────────────

function CompanyLogo({ height = 80, showSlogan = false, isDark = false }: { height?: number; showSlogan?: boolean; isDark?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src="/mediant-logo.png"
        alt="Mediant Labs"
        draggable={false}
        className={!isDark ? 'mix-blend-multiply' : ''}
        style={{ height, width: 'auto', objectFit: 'contain' }}
      />
      {showSlogan && (
        <p className={`${isDark ? 'text-white/45' : 'text-slate-500'} text-sm font-medium tracking-wide`}>
          Where solutions meet strategy
        </p>
      )}
    </div>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

export default function LandingPage({ onLoginSuccess, theme = 'light' }: LandingPageProps) {
  const isDark = theme === 'dark';
  const [view, setView]         = useState<ViewState>('landing');

  // Login form
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Demo accounts
  const [demoOpen,    setDemoOpen]    = useState(false);
  const [employees,   setEmployees]   = useState<Employee[]>([]);
  const [demoLoading, setDemoLoading] = useState(false);

  // Load employees for demo quick-login
  useEffect(() => {
    if (view === 'login') {
      getEmployees().then(setEmployees).catch(() => {});
    }
  }, [view]);

  // Pending user data (held between login and password change)
  const [pendingUser,    setPendingUser]    = useState<any>(null);
  const [pendingProfile, setPendingProfile] = useState<any>(null);

  // Change password form
  const [newPass,     setNewPass]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [cpLoading,   setCpLoading]   = useState(false);
  const [cpError,     setCpError]     = useState<string | null>(null);

  // ── Demo quick-login ─────────────────────────────────────────────────────

  const handleQuickLogin = async (role: 'Admin' | 'Project Manager' | 'Lead' | 'Employee') => {
    const found = employees.find((e) => e.role === role);
    if (!found) { setError(`No employee with role "${role}" found in directory.`); return; }
    setDemoLoading(true);
    setError(null);
    const sb = getSupabase();
    const empEmail = found.email || `${found.employeeId.toLowerCase()}@mediantlabs.com`;
    if (sb) {
      try {
        const { data, err2 }: any = await sb.auth.signInWithPassword({ email: empEmail, password: 'password123' });
        if (err2) throw err2;
        if (data?.user) {
          onLoginSuccess(empEmail, found.role || role, data.user.id, found.name);
          return;
        }
      } catch {
        // fall through to simulated session
      }
    }
    onLoginSuccess(empEmail, found.role || role, found.id, found.name);
    setDemoLoading(false);
  };

  const demoRoles: { role: 'Admin' | 'Project Manager' | 'Lead' | 'Employee'; label: string; color: string }[] = [
    {
      role: 'Admin',
      label: 'Admin',
      color: isDark
        ? 'text-rose-400 border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/20'
        : 'text-rose-600 border-rose-200 bg-rose-50/80 hover:bg-rose-100',
    },
    {
      role: 'Project Manager',
      label: 'PM',
      color: isDark
        ? 'text-[#2484C6] border-[#2484C6]/25 bg-[#2484C6]/10 hover:bg-[#2484C6]/20'
        : 'text-sky-700 border-sky-200 bg-sky-50/80 hover:bg-sky-100',
    },
    {
      role: 'Lead',
      label: 'Lead',
      color: isDark
        ? 'text-[#008DA5] border-[#008DA5]/25 bg-[#008DA5]/10 hover:bg-[#008DA5]/20'
        : 'text-teal-700 border-teal-200 bg-teal-50/80 hover:bg-teal-100',
    },
    {
      role: 'Employee',
      label: 'Employee',
      color: isDark
        ? 'text-[#1DAA58] border-[#1DAA58]/25 bg-[#1DAA58]/10 hover:bg-[#1DAA58]/20'
        : 'text-emerald-700 border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100',
    },
  ];

  // ── Password hashing helper ───────────────────────────────────────────────

  /**
   * Browser-native salted SHA-256 password hash.
   * Securely hashes passwords before saving or verifying against public.employees.
   */
  const hashPassword = async (pwd: string): Promise<string> => {
    const salt = 'bran_enterprise_auth_salt_2026';
    const data = new TextEncoder().encode(salt + pwd);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  // ── Login handler ────────────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const sb = getSupabase();
    if (!sb) {
      setError('Database connection unavailable. Contact your administrator.');
      setLoading(false);
      return;
    }

    try {
      const rawInput = email.trim();
      if (!rawInput) {
        setError('Please enter your email or Employee ID.');
        setLoading(false);
        return;
      }

      const enteredHash = await hashPassword(password);

      // 1. Try Server-Side RPC Verification (Prevents sending password_hash to the frontend)
      try {
        const { data: rpcRes, error: rpcErr } = await sb.rpc('verify_employee_login', {
          p_identifier: rawInput,
          p_password_hash: enteredHash,
        });

        if (!rpcErr && rpcRes) {
          if (rpcRes.success) {
            const profile = rpcRes.profile;
            if (rpcRes.is_default_pending) {
              const empIdClean = String(profile?.employeeId || profile?.employee_id || '').toLowerCase();
              const isDefaultMatch =
                password === 'password123' ||
                password === 'admin123' ||
                password.toLowerCase() === `${empIdClean}@123` ||
                password.toLowerCase() === `${empIdClean}123`;

              if (isDefaultMatch) {
                setPendingUser({ id: profile.id, email: profile.email });
                setPendingProfile(profile);
                setView('change_password');
                setLoading(false);
                return;
              } else {
                setError('Invalid email/Employee ID or password. Default password is your Employee ID + "@123" (e.g. EMP001@123) or password123.');
                setLoading(false);
                return;
              }
            }

            if (rpcRes.must_change_password) {
              setPendingUser({ id: profile.id, email: profile.email });
              setPendingProfile(profile);
              setView('change_password');
              setLoading(false);
              return;
            }

            onLoginSuccess(
              profile.email,
              profile.role || 'Employee',
              profile.id,
              profile.name
            );
            setLoading(false);
            return;
          } else if (rpcRes.error) {
            setError(rpcRes.error);
            setLoading(false);
            return;
          }
        }
      } catch (rpcCatch) {
        console.warn('verify_employee_login RPC fallback:', rpcCatch);
      }

      let targetEmail = rawInput;
      let targetProfile: any = null;

      // 2. Check if user typed an Employee ID or an email
      if (!rawInput.includes('@')) {
        // Look up employee by employee_id (case-insensitive)
        const { data: empMatch } = await sb
          .from('employees')
          .select('*')
          .ilike('employee_id', rawInput)
          .maybeSingle();

        if (empMatch) {
          targetProfile = empMatch;
          targetEmail = empMatch.email || `${(empMatch.employee_id || empMatch.employeeId || '').toLowerCase()}@mediantlabs.com`;
        } else {
          setError(`No employee found with Employee ID "${rawInput}".`);
          setLoading(false);
          return;
        }
      } else {
        // Look up employee profile by email
        const { data: empMatch } = await sb
          .from('employees')
          .select('*')
          .ilike('email', targetEmail)
          .maybeSingle();
        if (empMatch) {
          targetProfile = empMatch;
        }
      }

      // 3. Profile found in directory (Fallback if RPC not installed)
      if (targetProfile) {
        // Case A: User has a custom password set
        if (targetProfile.password_hash) {
          if (enteredHash !== targetProfile.password_hash) {
            setError('Invalid email/Employee ID or password.');
            setLoading(false);
            return;
          }

          // Password matches! Check if must_change_password is required
          if (targetProfile.must_change_password === true) {
            setPendingUser({ id: targetProfile.id, email: targetEmail });
            setPendingProfile(targetProfile);
            setView('change_password');
            setLoading(false);
            return;
          }

          onLoginSuccess(
            targetEmail,
            targetProfile.role || 'Employee',
            targetProfile.id,
            targetProfile.name
          );
          setLoading(false);
          return;
        }

        // Case B: User has not set a custom password yet -> Verify default password
        const empIdClean = String(targetProfile.employee_id || targetProfile.employeeId || '').toLowerCase();
        const isDefaultMatch =
          password === 'password123' ||
          password === 'admin123' ||
          password.toLowerCase() === `${empIdClean}@123` ||
          password.toLowerCase() === `${empIdClean}123`;

        if (isDefaultMatch) {
          const mustChange = targetProfile.must_change_password !== false;
          if (mustChange) {
            setPendingUser({ id: targetProfile.id, email: targetEmail });
            setPendingProfile(targetProfile);
            setView('change_password');
            setLoading(false);
            return;
          }

          onLoginSuccess(
            targetEmail,
            targetProfile.role || 'Employee',
            targetProfile.id,
            targetProfile.name
          );
          setLoading(false);
          return;
        }

        // Also check Supabase Auth native login in case an auth user exists
        try {
          const { data: authData, error: authErr } = await sb.auth.signInWithPassword({ email: targetEmail, password });
          if (!authErr && authData?.user) {
            const mustChange = authData.user.user_metadata?.must_change_password === true || targetProfile.must_change_password === true;
            if (mustChange) {
              setPendingUser(authData.user);
              setPendingProfile(targetProfile);
              setView('change_password');
              setLoading(false);
              return;
            }
            onLoginSuccess(targetEmail, targetProfile.role || 'Employee', authData.user.id, targetProfile.name);
            setLoading(false);
            return;
          }
        } catch {
          // ignore
        }

        setError('Invalid email/Employee ID or password. Default password is your Employee ID + "@123" (e.g. EMP001@123) or password123.');
        setLoading(false);
        return;
      }

      // 3. Fallback: If not found in employees table, attempt native Supabase Auth
      const { data: authData, error: authErr } = await sb.auth.signInWithPassword({ email: targetEmail, password });
      if (authErr || !authData?.user) {
        setError('Invalid email/Employee ID or password.');
        setLoading(false);
        return;
      }

      const { data: profile } = await sb
        .from('employees')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();

      const mustChange = authData.user.user_metadata?.must_change_password === true || profile?.must_change_password === true;
      if (mustChange) {
        setPendingUser(authData.user);
        setPendingProfile(profile || { id: authData.user.id, email: targetEmail, role: 'Employee' });
        setView('change_password');
        setLoading(false);
        return;
      }

      const resolvedRole = profile?.role || (targetEmail.includes('admin') ? 'Admin' : targetEmail.includes('pm') ? 'Project Manager' : 'Employee');
      onLoginSuccess(
        authData.user.email || targetEmail,
        resolvedRole,
        authData.user.id,
        profile?.name
      );
      setLoading(false);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('Invalid login credentials')) {
        setError('Invalid email/Employee ID or password. Default password is your Employee ID + "@123" (e.g. EMP001@123) or password123.');
      } else {
        setError(msg || 'Login failed. Please check your credentials.');
      }
      setLoading(false);
    }
  };

  // ── Change password handler ───────────────────────────────────────────────

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setCpError(null);

    if (newPass !== confirmPass) {
      setCpError('Passwords do not match.');
      return;
    }
    if (newPass.length < 8) {
      setCpError('Password must be at least 8 characters.');
      return;
    }

    const empIdClean = String(pendingProfile?.employee_id || pendingProfile?.employeeId || '').toLowerCase();
    if (newPass === 'password123' || newPass === 'admin123' || newPass.toLowerCase() === `${empIdClean}@123`) {
      setCpError('New password cannot be the default password. Please choose a different, secure password.');
      return;
    }

    setCpLoading(true);
    const sb = getSupabase();
    if (!sb) {
      setCpError('Database connection unavailable.');
      setCpLoading(false);
      return;
    }

    try {
      const newHash = await hashPassword(newPass);

      // 1. Try server-side RPC to update password securely
      let rpcUpdated = false;
      try {
        const { data: rpcRes, error: rpcErr } = await sb.rpc('set_employee_password', {
          p_id: pendingProfile.id,
          p_new_hash: newHash,
        });
        if (!rpcErr && rpcRes?.success) {
          rpcUpdated = true;
        }
      } catch {
        rpcUpdated = false;
      }

      // Fallback: Direct table update if RPC is not yet installed in database
      if (!rpcUpdated && pendingProfile?.id) {
        const { error: updateErr } = await sb
          .from('employees')
          .update({
            password_hash: newHash,
            must_change_password: false,
          })
          .eq('id', pendingProfile.id);

        if (updateErr) {
          console.error('Failed to update employee password hash:', updateErr);
          if (updateErr.message?.includes('password_hash') || updateErr.code === '42703') {
            throw new Error("Database column 'password_hash' missing. Please run in Supabase SQL Editor: ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash TEXT;");
          }
          throw new Error(`Failed to save new password: ${updateErr.message}`);
        }
      }

      // 2. Try updating Supabase Auth in case session is active
      try {
        await sb.auth.updateUser({
          password: newPass,
          data: { must_change_password: false },
        });
      } catch {
        // Safe to ignore if auth session is not active
      }

      const finalEmail = pendingUser?.email || pendingProfile?.email || email;
      const finalRole = pendingProfile?.role || 'Employee';
      const finalId = pendingUser?.id || pendingProfile?.id;
      const finalName = pendingProfile?.name || finalEmail.split('@')[0];

      // Clear state
      setNewPass('');
      setConfirmPass('');
      setPendingUser(null);
      setPendingProfile(null);

      onLoginSuccess(
        finalEmail,
        finalRole,
        finalId,
        finalName
      );
    } catch (err: any) {
      setCpError(err.message || 'Failed to update password.');
    } finally {
      setCpLoading(false);
    }
  };

  // ── Input styles ──────────────────────────────────────────────────────────

  const inputClass = isDark
    ? 'w-full px-4 py-3 text-sm rounded-xl text-white outline-none transition-all duration-200 placeholder-white/25 bg-white/[0.06] border border-white/[0.10] focus:border-[#1DAA58]/60 focus:ring-1 focus:ring-[#1DAA58]/25'
    : 'w-full px-4 py-3 text-sm rounded-xl text-slate-900 outline-none transition-all duration-200 placeholder-slate-400 bg-slate-50/90 hover:bg-white border border-slate-200 focus:border-[#1DAA58] focus:ring-2 focus:ring-[#1DAA58]/20 focus:bg-white';

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={`relative min-h-screen w-full flex items-center justify-center overflow-hidden transition-colors duration-300 ${isDark ? 'bg-[#030712]' : 'bg-[#F8FAFC]'}`}>

      {/* ── Background radial glow ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background: isDark
              ? 'radial-gradient(ellipse 70% 60% at 20% 30%, rgba(29,170,88,0.07) 0%, transparent 70%), radial-gradient(ellipse 60% 55% at 80% 70%, rgba(36,132,198,0.09) 0%, transparent 70%)'
              : 'radial-gradient(ellipse 75% 65% at 20% 25%, rgba(29,170,88,0.09) 0%, transparent 65%), radial-gradient(ellipse 70% 60% at 80% 75%, rgba(36,132,198,0.11) 0%, transparent 65%), radial-gradient(ellipse 50% 45% at 50% 50%, rgba(0,141,165,0.05) 0%, transparent 70%)',
          }}
        />
        {/* Subtle grid */}
        <div
          className="absolute inset-0"
          style={{
            opacity: isDark ? 0.022 : 0.045,
            backgroundImage: isDark
              ? 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)'
              : 'linear-gradient(rgba(15,23,42,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.4) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* ── Floating background pills (always visible) ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Pill delay={0.3} width={580} height={130} rotate={12}  isDark={isDark} gradient={isDark ? "from-[#1DAA58]/[0.15]" : "from-[#1DAA58]/[0.20]"} className="left-[-8%] top-[18%]" />
        <Pill delay={0.5} width={500} height={115} rotate={-15} isDark={isDark} gradient={isDark ? "from-[#2484C6]/[0.15]" : "from-[#2484C6]/[0.20]"} className="right-[-4%] top-[62%]" />
        <Pill delay={0.4} width={300} height={75}  rotate={-8}  isDark={isDark} gradient={isDark ? "from-[#008DA5]/[0.12]" : "from-[#008DA5]/[0.18]"} className="left-[6%]  bottom-[10%]" />
        <Pill delay={0.6} width={190} height={50}  rotate={20}  isDark={isDark} gradient={isDark ? "from-[#1DAA58]/[0.10]" : "from-[#1DAA58]/[0.16]"} className="right-[14%] top-[8%]" />
        <Pill delay={0.7} width={150} height={40}  rotate={-25} isDark={isDark} gradient={isDark ? "from-[#2484C6]/[0.10]" : "from-[#2484C6]/[0.16]"} className="left-[24%] top-[4%]" />
      </div>

      {/* ── Content (animated view swap) ── */}
      <div className="relative z-10 w-full px-6">
        <AnimatePresence mode="wait">

          {/* ════════════════════════════════ LANDING VIEW ════════════════════════════════ */}
          {view === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -80 }}
              transition={{ duration: 0.55, ease: [0.25, 0.4, 0.25, 1] }}
              className="max-w-2xl mx-auto text-center space-y-8"
            >
              {/* Company logo */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.7 }}
                className="flex items-center justify-center"
              >
                <CompanyLogo height={110} showSlogan={false} isDark={isDark} />
              </motion.div>

              {/* BRAN — gradient wordmark */}
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25, duration: 0.8, ease: [0.25, 0.4, 0.25, 1] }}
                style={{ overflow: 'visible' }}
              >
                <h1
                  className="font-black leading-none select-none"
                  style={{
                    fontSize: 'clamp(7rem, 18vw, 13rem)',
                    backgroundImage: 'linear-gradient(135deg, #1DAA58 0%, #008DA5 50%, #2484C6 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    letterSpacing: '-0.02em',
                    filter: isDark ? 'none' : 'drop-shadow(0 8px 24px rgba(29,170,88,0.15))',
                  }}
                >
                  BRAN
                </h1>
              </motion.div>

              {/* Short description */}
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.38, duration: 0.7 }}
                className={`text-base leading-relaxed max-w-lg mx-auto ${
                  isDark ? 'text-white/40 font-light' : 'text-slate-600 font-normal'
                }`}
              >
                The integrated operational engine for enterprise delivery timelines, team assignments,
                and multi-region working-day schedule management.
              </motion.p>

              {/* Log In button */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.6 }}
              >
                <button
                  id="landing-login-btn"
                  onClick={() => setView('login')}
                  className="group relative inline-flex items-center gap-2.5 px-8 py-3.5 rounded-full font-bold text-sm text-white overflow-hidden transition-all duration-300 hover:scale-[1.04] active:scale-[0.97] cursor-pointer"
                  style={{
                    background: 'linear-gradient(135deg, #1DAA58 0%, #2484C6 100%)',
                    boxShadow: isDark
                      ? '0 0 30px rgba(29,170,88,0.28), 0 0 60px rgba(36,132,198,0.14)'
                      : '0 10px 28px -3px rgba(29,170,88,0.38), 0 4px 14px rgba(36,132,198,0.28)',
                  }}
                >
                  {/* Shimmer on hover */}
                  <span
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{
                      background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.28) 50%, transparent 70%)',
                    }}
                  />
                  <span>Log In</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </button>
              </motion.div>
            </motion.div>
          )}

          {/* ════════════════════════════════ LOGIN VIEW ════════════════════════════════ */}
          {view === 'login' && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 80 }}
              transition={{ duration: 0.55, ease: [0.25, 0.4, 0.25, 1] }}
              className="max-w-md mx-auto space-y-5"
            >
              {/* Logo above form */}
              <div className="flex justify-center mb-3">
                <CompanyLogo height={68} showSlogan={false} isDark={isDark} />
              </div>

              {/* Form card */}
              <div
                className="rounded-2xl p-6 space-y-4"
                style={{
                  background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.92)',
                  backdropFilter: 'blur(16px)',
                  border: isDark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(226,232,240,0.85)',
                  boxShadow: isDark
                    ? '0 20px 60px rgba(0,0,0,0.6)'
                    : '0 20px 50px -10px rgba(15,23,42,0.10), 0 1px 3px rgba(15,23,42,0.05)',
                }}
              >
                <div>
                  <h2 className={`text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Welcome back</h2>
                  <p className={`text-[11px] mt-0.5 ${isDark ? 'text-white/35' : 'text-slate-500'}`}>Sign in with your Mediant Labs credentials</p>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2 overflow-hidden"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="leading-snug">{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleLogin} className="space-y-3">
                  {/* Email or Employee ID */}
                  <div>
                    <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-white/45' : 'text-slate-600'}`}>Email Address or Employee ID</label>
                    <div className="relative">
                      <Mail className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${isDark ? 'text-white/25' : 'text-slate-400'}`} />
                      <input
                        type="text"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@mediantlabs.com or Employee ID"
                        className={`${inputClass} pl-10`}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-white/45' : 'text-slate-600'}`}>Password</label>
                    <div className="relative">
                      <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${isDark ? 'text-white/25' : 'text-slate-400'}`} />
                      <input
                        type={showPass ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className={`${inputClass} pl-10 pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className={`absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer ${isDark ? 'text-white/25 hover:text-white/60' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className={`text-[10px] mt-1.5 leading-relaxed ${isDark ? 'text-white/22' : 'text-slate-500'}`}>
                      Default password: <span className={`font-mono ${isDark ? 'text-white/35' : 'text-slate-700 bg-slate-100 px-1 py-0.5 rounded'}`}>{'<employeeId>@123'}</span> (e.g. <span className={`font-mono ${isDark ? 'text-white/35' : 'text-slate-700 bg-slate-100 px-1 py-0.5 rounded'}`}>ml004@123</span>)
                    </p>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 cursor-pointer mt-1"
                    style={{
                      background: 'linear-gradient(135deg, #1DAA58 0%, #2484C6 100%)',
                      boxShadow: '0 4px 20px rgba(29,170,88,0.22)',
                    }}
                  >
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* Demo Quick Login */}
                <div className={`pt-2 border-t ${isDark ? 'border-white/[0.06]' : 'border-slate-200'}`}>
                  <button
                    type="button"
                    onClick={() => setDemoOpen(!demoOpen)}
                    className={`w-full flex items-center justify-between text-[11px] transition-colors cursor-pointer py-1 ${isDark ? 'text-white/35 hover:text-white/60' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <span className="font-semibold tracking-wide">Demo Quick Login</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${demoOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {demoOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="grid grid-cols-2 gap-2 pt-2">
                          {demoRoles.map(({ role, label, color }) => (
                            <button
                              key={role}
                              type="button"
                              disabled={demoLoading}
                              onClick={() => handleQuickLogin(role)}
                              className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${color}`}
                            >
                              {demoLoading ? '...' : label}
                            </button>
                          ))}
                        </div>
                        <p className={`text-[9px] text-center mt-2 ${isDark ? 'text-white/20' : 'text-slate-400'}`}>
                          Uses <span className="font-mono">password123</span> or simulates a session
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Back to landing */}
              <button
                onClick={() => { setView('landing'); setError(null); }}
                className={`flex items-center gap-1.5 text-[11px] transition-colors cursor-pointer mx-auto ${isDark ? 'text-white/30 hover:text-white/60' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            </motion.div>
          )}

          {/* ══════════════════════════ CHANGE PASSWORD VIEW ══════════════════════════ */}
          {view === 'change_password' && (
            <motion.div
              key="change_password"
              initial={{ opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -80 }}
              transition={{ duration: 0.55, ease: [0.25, 0.4, 0.25, 1] }}
              className="max-w-md mx-auto space-y-5"
            >
              <div className="flex flex-col items-center gap-1.5 mb-2">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{
                    background: isDark ? 'rgba(29,170,88,0.12)' : 'rgba(29,170,88,0.10)',
                    border: isDark ? '1px solid rgba(29,170,88,0.25)' : '1px solid rgba(29,170,88,0.30)',
                  }}
                >
                  <KeyRound className="w-5 h-5" style={{ color: '#1DAA58' }} />
                </div>
                <p className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>Set your new password</p>
                <p className={`text-[11px] text-center leading-relaxed px-4 ${isDark ? 'text-white/35' : 'text-slate-500'}`}>
                  This is your first login. Please set a personal password to continue.
                </p>
              </div>

              <div
                className="rounded-2xl p-6 space-y-4"
                style={{
                  background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.92)',
                  backdropFilter: 'blur(16px)',
                  border: isDark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(226,232,240,0.85)',
                  boxShadow: isDark
                    ? '0 20px 60px rgba(0,0,0,0.6)'
                    : '0 20px 50px -10px rgba(15,23,42,0.10), 0 1px 3px rgba(15,23,42,0.05)',
                }}
              >
                {/* Error */}
                <AnimatePresence>
                  {cpError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2 overflow-hidden"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="leading-snug">{cpError}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleChangePassword} className="space-y-3">
                  {/* New Password */}
                  <div>
                    <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-white/45' : 'text-slate-600'}`}>New Password</label>
                    <div className="relative">
                      <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${isDark ? 'text-white/25' : 'text-slate-400'}`} />
                      <input
                        type={showNewPass ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={newPass}
                        onChange={(e) => setNewPass(e.target.value)}
                        placeholder="Min. 8 characters"
                        className={`${inputClass} pl-10 pr-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass(!showNewPass)}
                        className={`absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer ${isDark ? 'text-white/25 hover:text-white/60' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-white/45' : 'text-slate-600'}`}>Confirm Password</label>
                    <div className="relative">
                      <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${isDark ? 'text-white/25' : 'text-slate-400'}`} />
                      <input
                        type={showNewPass ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={confirmPass}
                        onChange={(e) => setConfirmPass(e.target.value)}
                        placeholder="Repeat your new password"
                        className={`${inputClass} pl-10`}
                      />
                    </div>

                    {/* Password match indicator */}
                    {confirmPass.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {newPass === confirmPass ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#1DAA58]" />
                            <span className="text-[10px] text-[#1DAA58]">Passwords match</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                            <span className="text-[10px] text-rose-400">Passwords do not match</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={cpLoading || newPass !== confirmPass || newPass.length < 8}
                    className="w-full py-3 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-40 cursor-pointer mt-1"
                    style={{
                      background: 'linear-gradient(135deg, #1DAA58 0%, #2484C6 100%)',
                      boxShadow: '0 4px 20px rgba(29,170,88,0.22)',
                    }}
                  >
                    {cpLoading ? (
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Set Password & Enter BRAN</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Bottom edge vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isDark
            ? 'linear-gradient(to top, rgba(3,7,18,0.8) 0%, transparent 35%, rgba(3,7,18,0.5) 100%)'
            : 'linear-gradient(to top, rgba(248,250,252,0.85) 0%, transparent 35%, rgba(248,250,252,0.4) 100%)',
        }}
      />

      {/* Footer */}
      <p
        className="absolute bottom-4 left-0 right-0 text-center text-[10px] font-medium"
        style={{ color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(100,116,139,0.5)' }}
      >
        © 2026 Mediant Labs · BRAN Integrated Operational Engine
      </p>
    </div>
  );
}
