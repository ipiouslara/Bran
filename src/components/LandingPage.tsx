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
}

// ─── Floating Pill Shape ──────────────────────────────────────────────────────

interface PillProps {
  className?: string;
  delay?: number;
  width?: number;
  height?: number;
  rotate?: number;
  gradient?: string;
}

function Pill({ className = '', delay = 0, width = 400, height = 100, rotate = 0, gradient = 'from-white/[0.08]' }: PillProps) {
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
          className={`absolute inset-0 rounded-full bg-gradient-to-r to-transparent ${gradient} backdrop-blur-[2px]`}
          style={{
            border: '2px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 32px 0 rgba(255,255,255,0.04)',
          }}
        />
      </motion.div>
    </motion.div>
  );
}

// ─── Company Logo ─────────────────────────────────────────────────────────

function CompanyLogo({ height = 80, showSlogan = false }: { height?: number; showSlogan?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src="/mediant-logo.png"
        alt="Mediant Labs"
        draggable={false}
        style={{ height, width: 'auto', objectFit: 'contain' }}
      />
      {showSlogan && (
        <p className="text-white/45 text-sm font-medium tracking-wide">
          Where solutions meet strategy
        </p>
      )}
    </div>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

export default function LandingPage({ onLoginSuccess }: LandingPageProps) {
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
    { role: 'Admin',           label: 'Admin',    color: 'text-rose-400   border-rose-500/25   bg-rose-500/10   hover:bg-rose-500/20' },
    { role: 'Project Manager', label: 'PM',       color: 'text-[#2484C6]  border-[#2484C6]/25  bg-[#2484C6]/10  hover:bg-[#2484C6]/20' },
    { role: 'Lead',            label: 'Lead',     color: 'text-[#008DA5]  border-[#008DA5]/25  bg-[#008DA5]/10  hover:bg-[#008DA5]/20' },
    { role: 'Employee',        label: 'Employee', color: 'text-[#1DAA58]  border-[#1DAA58]/25  bg-[#1DAA58]/10  hover:bg-[#1DAA58]/20' },
  ];

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
      const { data, error: authError } = await sb.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      const user = data.user;
      if (!user) throw new Error('Authentication failed. Please try again.');

      // Fetch employee profile
      const { data: profile } = await sb
        .from('employees')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      // Detect first-login / must-change-password from either user metadata or employees table
      const mustChange =
        user.user_metadata?.must_change_password === true ||
        profile?.must_change_password === true;

      if (mustChange) {
        setPendingUser(user);
        setPendingProfile(profile);
        setView('change_password');
      } else {
        onLoginSuccess(
          user.email || email,
          profile?.role || 'Employee',
          user.id,
          profile?.name
        );
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('Invalid login credentials')) {
        setError('Invalid email or password. Your default password is your Employee ID + "@123" (e.g. ml004@123).');
      } else {
        setError(msg || 'Login failed. Please check your credentials.');
      }
    } finally {
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

    setCpLoading(true);
    const sb = getSupabase();

    try {
      // Update Supabase Auth password and clear must_change_password flag
      const { error } = await sb!.auth.updateUser({
        password: newPass,
        data: { must_change_password: false },
      });
      if (error) throw error;

      // Also update employees table if the column exists
      if (pendingProfile?.id) {
        await sb!.from('employees').update({ must_change_password: false }).eq('id', pendingProfile.id);
      }

      onLoginSuccess(
        pendingUser.email || email,
        pendingProfile?.role || 'Employee',
        pendingUser.id,
        pendingProfile?.name
      );
    } catch (err: any) {
      setCpError(err.message || 'Failed to update password.');
    } finally {
      setCpLoading(false);
    }
  };

  // ── Input styles ──────────────────────────────────────────────────────────

  const inputClass =
    'w-full px-4 py-3 text-sm rounded-xl text-white outline-none transition-all duration-200 placeholder-white/25 bg-white/[0.06] border border-white/[0.10] focus:border-[#1DAA58]/60 focus:ring-1 focus:ring-[#1DAA58]/25';

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-[#030712]">

      {/* ── Background radial glow ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 20% 30%, rgba(29,170,88,0.07) 0%, transparent 70%), radial-gradient(ellipse 60% 55% at 80% 70%, rgba(36,132,198,0.09) 0%, transparent 70%)',
          }}
        />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.022]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* ── Floating background pills (always visible) ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Pill delay={0.3} width={580} height={130} rotate={12}  gradient="from-[#1DAA58]/[0.15]" className="left-[-8%] top-[18%]" />
        <Pill delay={0.5} width={500} height={115} rotate={-15} gradient="from-[#2484C6]/[0.15]" className="right-[-4%] top-[62%]" />
        <Pill delay={0.4} width={300} height={75}  rotate={-8}  gradient="from-[#008DA5]/[0.12]" className="left-[6%]  bottom-[10%]" />
        <Pill delay={0.6} width={190} height={50}  rotate={20}  gradient="from-[#1DAA58]/[0.10]" className="right-[14%] top-[8%]" />
        <Pill delay={0.7} width={150} height={40}  rotate={-25} gradient="from-[#2484C6]/[0.10]" className="left-[24%] top-[4%]" />
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
              {/* Company logo — full PNG, no background */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.7 }}
                className="flex items-center justify-center"
              >
                <CompanyLogo height={110} showSlogan={false} />
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
                className="text-base text-white/40 leading-relaxed font-light max-w-lg mx-auto"
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
                    boxShadow: '0 0 30px rgba(29,170,88,0.28), 0 0 60px rgba(36,132,198,0.14)',
                  }}
                >
                  {/* Shimmer on hover */}
                  <span
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)' }}
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
                <CompanyLogo height={68} showSlogan={false} />
              </div>

              {/* Form card */}
              <div
                className="rounded-2xl p-6 space-y-4"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                }}
              >
                <div>
                  <h2 className="text-lg font-black text-white tracking-tight">Welcome back</h2>
                  <p className="text-[11px] text-white/35 mt-0.5">Sign in with your Mediant Labs credentials</p>
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
                  {/* Email */}
                  <div>
                    <label className="block text-[11px] font-semibold text-white/45 uppercase tracking-wider mb-1.5">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="yourname@mediantlabs.com"
                        className={`${inputClass} pl-10`}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-[11px] font-semibold text-white/45 uppercase tracking-wider mb-1.5">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
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
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors cursor-pointer"
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-white/22 mt-1.5 leading-relaxed">
                      Default password: <span className="font-mono text-white/35">{'<employeeId>@123'}</span> (e.g. <span className="font-mono text-white/35">ml004@123</span>)
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
                <div className="pt-2 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setDemoOpen(!demoOpen)}
                    className="w-full flex items-center justify-between text-[11px] text-white/35 hover:text-white/60 transition-colors cursor-pointer py-1"
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
                        <p className="text-[9px] text-white/20 text-center mt-2">
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
                className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/60 transition-colors cursor-pointer mx-auto"
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
                  style={{ background: 'rgba(29,170,88,0.12)', border: '1px solid rgba(29,170,88,0.25)' }}
                >
                  <KeyRound className="w-5 h-5" style={{ color: '#1DAA58' }} />
                </div>
                <p className="text-white font-bold text-sm">Set your new password</p>
                <p className="text-white/35 text-[11px] text-center leading-relaxed px-4">
                  This is your first login. Please set a personal password to continue.
                </p>
              </div>

              <div
                className="rounded-2xl p-6 space-y-4"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
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
                    <label className="block text-[11px] font-semibold text-white/45 uppercase tracking-wider mb-1.5">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
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
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors cursor-pointer"
                      >
                        {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-[11px] font-semibold text-white/45 uppercase tracking-wider mb-1.5">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
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
        style={{ background: 'linear-gradient(to top, rgba(3,7,18,0.8) 0%, transparent 35%, rgba(3,7,18,0.5) 100%)' }}
      />

      {/* Footer */}
      <p
        className="absolute bottom-4 left-0 right-0 text-center text-[10px] font-medium"
        style={{ color: 'rgba(255,255,255,0.15)' }}
      >
        © 2026 Mediant Labs · BRAN Integrated Operational Engine
      </p>
    </div>
  );
}
