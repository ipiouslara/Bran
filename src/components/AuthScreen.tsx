/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, AlertCircle, Briefcase, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { getSupabase, hasSupabaseCreds, getEmployees } from '../lib/db';
import { Employee } from '../types';

interface AuthScreenProps {
  theme: 'dark' | 'light';
  onLoginSuccess: (email: string, role: string, employeeId?: string, name?: string) => void;
  openSettings: () => void;
}

export default function AuthScreen({ theme, onLoginSuccess, openSettings }: AuthScreenProps) {
  const isDark = theme === 'dark';

  const [roleTab, setRoleTab] = useState<'PM' | 'Employee'>('PM');

  // PM login states
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('pm@mediantlabs.com');
  const [password, setPassword] = useState('password123');

  // Employee login states
  const [empIdInput, setEmpIdInput] = useState('');
  const [employeesList, setEmployeesList] = useState<Employee[]>([]);

  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);

  const hasCreds = hasSupabaseCreds();

  // Load employee directory
  useEffect(() => {
    const loadEmps = async () => {
      try {
        const list = await getEmployees();
        setEmployeesList(list);
      } catch (err) {
        console.error('Failed to pre-fetch employees:', err);
      }
    };
    loadEmps();
  }, [roleTab]);

  const handlePMAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    setLoading(true);

    const sb = getSupabase();
    if (!sb) {
      setErrMsg('Supabase failed to initialize. Please check environment configuration.');
      setLoading(false);
      return;
    }

    try {
      let authUser: any = null;
      if (isSignUp) {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          authUser = data.user;
        } else {
          setErrMsg('Signup successful! Check email for confirmation link, or simply sign in.');
          setLoading(false);
          return;
        }
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        authUser = data.user;
      }

      if (authUser) {
        const { data: profile, error: profileError } = await sb
          .from('employees')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();

        if (profileError) {
          console.warn('Failed to fetch employee profile:', profileError);
        }

        if (profile) {
          onLoginSuccess(authUser.email || email, profile.role || 'Employee', authUser.id, profile.name);
        } else {
          if (authUser.email === 'pm@mediantlabs.com') {
            const defaultRole = 'Project Manager';
            const defaultName = 'Project Manager';
            const { error: insertError } = await sb.from('employees').insert({
              id: authUser.id,
              employee_id: 'PM',
              name: defaultName,
              designation: 'Project Manager',
              email: authUser.email,
              role: defaultRole,
            });
            if (insertError) {
              console.error('Failed to auto-provision pm@mediantlabs.com profile:', insertError);
              setErrMsg('Account exists but has no assigned role — contact admin');
            } else {
              onLoginSuccess(authUser.email, defaultRole, authUser.id, defaultName);
            }
          } else {
            setErrMsg('Account exists but has no assigned role — contact admin');
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrMsg(err.message || 'Authentication error. Please double-check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeeAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg(null);
    setLoading(true);

    if (!empIdInput.trim()) {
      setErrMsg('Please enter a valid Employee ID.');
      setLoading(false);
      return;
    }

    const match = employeesList.find(
      (emp) => emp.employeeId.trim().toLowerCase() === empIdInput.trim().toLowerCase()
    );

    if (!match) {
      setErrMsg(`Employee ID "${empIdInput}" is not registered. Ask your Project Manager to add you to the employee directory.`);
      setLoading(false);
      return;
    }

    setLoading(false);
    onLoginSuccess(
      match.email || `${match.employeeId.toLowerCase()}@mediantlabs.com`,
      match.role || 'Employee',
      match.id,
      match.name
    );
  };

  const handleQuickLogin = async (role: 'Admin' | 'Project Manager' | 'Lead' | 'Employee') => {
    const found = employeesList.find((emp) => emp.role === role);
    if (found) {
      setLoading(true);
      setErrMsg(null);
      const sb = getSupabase();
      if (sb) {
        try {
          const empEmail = found.email || `${found.employeeId.toLowerCase()}@mediantlabs.com`;
          const { data, error } = await sb.auth.signInWithPassword({ email: empEmail, password: 'password123' });
          if (error) throw error;
          if (data.user) {
            onLoginSuccess(empEmail, found.role || role, data.user.id, found.name);
          }
        } catch (err: any) {
          console.warn('Supabase Auth quick login failed, falling back to simulated session:', err.message);
          onLoginSuccess(
            found.email || `${found.employeeId.toLowerCase()}@mediantlabs.com`,
            found.role || role,
            found.id,
            found.name
          );
        } finally {
          setLoading(false);
        }
      } else {
        onLoginSuccess(
          found.email || `${found.employeeId.toLowerCase()}@mediantlabs.com`,
          found.role || role,
          found.id,
          found.name
        );
        setLoading(false);
      }
    } else {
      setErrMsg(`No employee with role "${role}" found in the directory.`);
    }
  };

  const inputClass = isDark
    ? 'bg-white/[0.05] border border-white/[0.10] text-white placeholder-white/30 focus:border-[#1DAA58]/60 focus:ring-1 focus:ring-[#1DAA58]/30'
    : 'bg-black/[0.04] border border-black/[0.12] text-slate-900 placeholder-slate-400 focus:border-[#1DAA58]/70 focus:ring-1 focus:ring-[#1DAA58]/30';

  const quickLoginButtons = [
    { role: 'Admin' as const, label: 'Admin', color: 'text-rose-400 border-rose-500/20 bg-rose-500/8 hover:bg-rose-500/16' },
    { role: 'Project Manager' as const, label: 'PM', color: 'text-[#2484C6] border-[#2484C6]/20 bg-[#2484C6]/8 hover:bg-[#2484C6]/16' },
    { role: 'Lead' as const, label: 'Lead', color: 'text-amber-400 border-amber-500/20 bg-amber-500/8 hover:bg-amber-500/16' },
    { role: 'Employee' as const, label: 'Employee', color: 'text-[#1DAA58] border-[#1DAA58]/20 bg-[#1DAA58]/8 hover:bg-[#1DAA58]/16' },
  ];

  return (
    <div
      id="auth-container"
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: isDark ? '#030712' : '#F0F4F8' }}
    >
      {/* Background Glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 blur-3xl"
          style={{
            background: isDark
              ? 'radial-gradient(ellipse 60% 50% at 30% 40%, rgba(29,170,88,0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 70% 60%, rgba(36,132,198,0.10) 0%, transparent 60%)'
              : 'radial-gradient(ellipse 60% 50% at 30% 40%, rgba(29,170,88,0.06) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 70% 60%, rgba(36,132,198,0.08) 0%, transparent 60%)',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.25, 0.4, 0.25, 1] }}
          className="rounded-2xl overflow-hidden shadow-2xl flex"
          style={{
            border: isDark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(0,0,0,0.10)',
            boxShadow: isDark
              ? '0 25px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)'
              : '0 25px 80px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
          }}
        >
          {/* ── Left Brand Panel ── */}
          <div
            className="hidden md:flex flex-col justify-between w-[42%] p-10 relative overflow-hidden"
            style={{
              background: 'linear-gradient(160deg, #0A1F14 0%, #061629 60%, #030712 100%)',
            }}
          >
            {/* Subtle pattern */}
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
            {/* Glow orbs */}
            <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[70%] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(29,170,88,0.18) 0%, transparent 70%)', filter: 'blur(40px)' }} />
            <div className="absolute bottom-[-10%] right-[-15%] w-[60%] h-[60%] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(36,132,198,0.20) 0%, transparent 70%)', filter: 'blur(40px)' }} />

            {/* Logo + Brand */}
            <div className="relative">
              <div className="flex items-center gap-3 mb-8">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #1DAA58, #2484C6)', boxShadow: '0 4px 16px rgba(29,170,88,0.35)' }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <path d="M2,21 L12,3 L22,21 L14,21 L10,13 L6,21 Z" fill="white" />
                  </svg>
                </div>
                <div>
                  <span className="font-black text-xl tracking-tight text-white">Bran</span>
                  <p className="text-[10px] text-white/35 tracking-widest uppercase font-medium">Mediant Labs</p>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-white leading-tight mb-3">
                Where solutions<br />
                <span style={{ background: 'linear-gradient(135deg, #1DAA58, #2484C6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  meet strategy.
                </span>
              </h2>
              <p className="text-sm text-white/40 leading-relaxed">
                Production timelines tracked with precision. Multi-region schedule management, employee assignment, and cascading delivery intelligence.
              </p>
            </div>

            {/* Feature list */}
            <div className="relative space-y-3">
              {[
                { dot: '#1DAA58', text: 'Excel ingestion & timeline mapping' },
                { dot: '#2484C6', text: 'Multi-phase assignment engine' },
                { dot: '#008DA5', text: 'Holiday-aware schedule cascading' },
              ].map(({ dot, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
                  <span className="text-xs text-white/45">{text}</span>
                </div>
              ))}
              <p className="text-[10px] text-white/20 pt-3">© 2026 Mediant Labs · BRAN v2.0 · Stage 3</p>
            </div>
          </div>

          {/* ── Right Form Panel ── */}
          <div
            className="flex-1 p-8 md:p-10 flex flex-col justify-center"
            style={{ background: isDark ? '#0D0F14' : '#FFFFFF' }}
          >
            {/* Top gradient accent bar */}
            <div
              className="h-0.5 -mt-10 -mx-10 mb-8 md:hidden"
              style={{ background: 'linear-gradient(90deg, #1DAA58, #2484C6)' }}
            />

            {/* Mobile logo (shown when left panel hidden) */}
            <div className="flex items-center gap-2.5 mb-6 md:hidden">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #1DAA58, #2484C6)' }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <path d="M2,21 L12,3 L22,21 L14,21 L10,13 L6,21 Z" fill="white" />
                </svg>
              </div>
              <div>
                <span className="font-bold text-lg">Bran</span>
                <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(36,132,198,0.15)', color: '#2484C6' }}>Stage 3</span>
              </div>
            </div>

            {/* Role Tab Switcher */}
            <div
              className="flex p-1 rounded-xl mb-6"
              style={{
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)',
                border: isDark ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(0,0,0,0.08)',
              }}
            >
              {(['PM', 'Employee'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setRoleTab(tab); setErrMsg(null); }}
                  className="flex-1 py-2.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5"
                  style={
                    roleTab === tab
                      ? {
                          background: 'linear-gradient(135deg, #1DAA58, #2484C6)',
                          color: 'white',
                          boxShadow: '0 2px 12px rgba(29,170,88,0.30)',
                        }
                      : {
                          color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                        }
                  }
                >
                  {tab === 'PM' ? <Briefcase className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                  {tab === 'PM' ? 'Project Manager' : 'Employee Staff'}
                </button>
              ))}
            </div>

            {/* Heading */}
            <div className="mb-6">
              <h1 className={`text-base font-bold tracking-wide mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {roleTab === 'PM' ? 'PM Console Authorization' : 'Employee Workstation'}
              </h1>
              <p className={`text-xs ${isDark ? 'text-white/40' : 'text-slate-500'}`}>
                {roleTab === 'PM'
                  ? 'Sign in to ingest excel matrices, plan timelines and assign tasks'
                  : 'Sign in using Employee ID to track assigned phases & log updates'}
              </p>
            </div>

            {/* Error */}
            <AnimatePresence>
              {errMsg && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-start gap-2 overflow-hidden"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="leading-snug">{errMsg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Forms */}
            <AnimatePresence mode="wait">
              {roleTab === 'PM' ? (
                <motion.form
                  key="pm-form"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handlePMAuth}
                  className="space-y-4"
                >
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
                      PM Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="pm@mediantlabs.com"
                      className={`w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all ${inputClass}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
                      Passphrase
                    </label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all ${inputClass}`}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 cursor-pointer mt-2"
                    style={{ background: 'linear-gradient(135deg, #1DAA58 0%, #2484C6 100%)', boxShadow: '0 4px 20px rgba(29,170,88,0.25)' }}
                  >
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        {isSignUp ? 'Generate PM Account' : 'Authenticate Console'}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSignUp(!isSignUp)}
                    className={`w-full text-center text-xs transition-all hover:underline mt-1 cursor-pointer ${isDark ? 'text-white/35 hover:text-white/60' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                  </button>
                </motion.form>
              ) : (
                <motion.form
                  key="emp-form"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleEmployeeAuth}
                  className="space-y-4"
                >
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
                      Employee ID Code
                    </label>
                    <input
                      type="text"
                      required
                      value={empIdInput}
                      onChange={(e) => setEmpIdInput(e.target.value)}
                      placeholder="e.g. EMP001"
                      className={`w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all font-mono uppercase ${inputClass}`}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 cursor-pointer mt-2"
                    style={{ background: 'linear-gradient(135deg, #2484C6 0%, #008DA5 100%)', boxShadow: '0 4px 20px rgba(36,132,198,0.25)' }}
                  >
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        Access Workstation
                      </>
                    )}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Demo Quick Login (collapsible) */}
            <div className="mt-6 pt-5" style={{ borderTop: isDark ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(0,0,0,0.07)' }}>
              <button
                type="button"
                onClick={() => setDemoOpen(!demoOpen)}
                className={`w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest cursor-pointer transition-all ${isDark ? 'text-white/30 hover:text-white/50' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <span>Demo Quick Login</span>
                {demoOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              <AnimatePresence>
                {demoOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {quickLoginButtons.map(({ role, label, color }) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => handleQuickLogin(role)}
                          disabled={loading}
                          className={`px-2 py-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer disabled:opacity-50 ${color}`}
                        >
                          Login as {label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
