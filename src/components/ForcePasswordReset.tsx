/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Eye, EyeOff, CheckCircle2, Circle, AlertCircle, KeyRound, ArrowRight, ChevronLeft } from 'lucide-react';
import { getSupabase } from '../lib/db';
import {
  validatePassword,
  getDefaultPasswordsForEmployee,
  hashPassword,
} from '../utils/passwordValidator';

interface ForcePasswordResetProps {
  isDark: boolean;
  pendingUser: any;
  pendingProfile: any;
  onSuccess: (email: string, role: string, id: string, name?: string) => void;
  onBackToLogin: () => void;
}

export default function ForcePasswordReset({
  isDark,
  pendingUser,
  pendingProfile,
  onSuccess,
  onBackToLogin,
}: ForcePasswordResetProps) {
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive known default passwords for this employee
  const defaultPasswords = useMemo(() => {
    const empId = pendingProfile?.employee_id || pendingProfile?.employeeId || '';
    return getDefaultPasswordsForEmployee(empId);
  }, [pendingProfile]);

  // Live validation calculation
  const validation = useMemo(() => {
    return validatePassword(newPass, defaultPasswords);
  }, [newPass, defaultPasswords]);

  const passwordsMatch = newPass.length > 0 && confirmPass.length > 0 && newPass === confirmPass;
  const isFormValid = validation.isValid && passwordsMatch && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.isValid) {
      setError('Please satisfy all password security criteria before continuing.');
      return;
    }
    if (newPass !== confirmPass) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    const sb = getSupabase();
    if (!sb) {
      setError('Database connection unavailable. Please check your network.');
      setLoading(false);
      return;
    }

    try {
      // 1. Hash the new password with enterprise salt
      const newHash = await hashPassword(newPass);

      const targetId = pendingProfile?.id || pendingUser?.id;
      if (!targetId) {
        throw new Error('Unable to identify employee profile record.');
      }

      // 2. Try server-side RPC first
      let rpcSuccess = false;
      try {
        const { data: rpcRes, error: rpcErr } = await sb.rpc('set_employee_password', {
          p_id: targetId,
          p_new_hash: newHash,
        });
        if (!rpcErr && rpcRes?.success) {
          rpcSuccess = true;
        }
      } catch {
        rpcSuccess = false;
      }

      // 3. Direct table update on public.employees (Zero-config Supabase)
      if (!rpcSuccess) {
        const { error: updateErr } = await sb
          .from('employees')
          .update({
            password_hash: newHash,
            must_change_password: false,
          })
          .eq('id', targetId);

        if (updateErr) {
          if (updateErr.message?.includes('password_hash') || updateErr.code === '42703') {
            throw new Error(
              "Database column 'password_hash' is missing. Run in Supabase SQL Editor: ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash TEXT;"
            );
          }
          throw new Error(`Failed to update password: ${updateErr.message}`);
        }
      }

      // 4. Also try updating Supabase Auth in background if an active session exists
      try {
        await sb.auth.updateUser({
          password: newPass,
          data: { must_change_password: false },
        });
      } catch {
        // Safe to ignore for directory fallback accounts
      }

      const finalEmail =
        pendingProfile?.email ||
        pendingUser?.email ||
        `${(pendingProfile?.employee_id || '').toLowerCase()}@mediantlabs.com`;
      const finalRole = pendingProfile?.role || 'Employee';
      const finalName = pendingProfile?.name || finalEmail.split('@')[0];

      onSuccess(finalEmail, finalRole, targetId, finalName);
    } catch (err: any) {
      setError(err.message || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = isDark
    ? 'w-full px-4 py-3 text-sm rounded-xl text-white outline-none transition-all duration-200 placeholder-white/25 bg-white/[0.06] border border-white/[0.10] focus:border-[#1DAA58]/60 focus:ring-1 focus:ring-[#1DAA58]/25'
    : 'w-full px-4 py-3 text-sm rounded-xl text-slate-900 outline-none transition-all duration-200 placeholder-slate-400 bg-slate-50/90 hover:bg-white border border-slate-200 focus:border-[#1DAA58] focus:ring-2 focus:ring-[#1DAA58]/20 focus:bg-white';

  const checklistItems = [
    { label: 'Minimum 8 characters', met: validation.criteria.minLength },
    { label: 'At least 1 uppercase letter (A–Z)', met: validation.criteria.hasUpper },
    { label: 'At least 1 lowercase letter (a–z)', met: validation.criteria.hasLower },
    { label: 'At least 1 number (0–9)', met: validation.criteria.hasNumber },
    { label: 'At least 1 special symbol (!@#$%^&*)', met: validation.criteria.hasSpecial },
    { label: 'Does not match default password', met: validation.criteria.notDefault },
  ];

  return (
    <motion.div
      key="force_password_reset"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.45, ease: [0.25, 0.4, 0.25, 1] }}
      className="max-w-md mx-auto space-y-4"
    >
      {/* Header Banner */}
      <div className="flex flex-col items-center gap-1.5 mb-1 text-center">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-105"
          style={{
            background: isDark
              ? 'linear-gradient(135deg, rgba(29,170,88,0.2) 0%, rgba(36,132,198,0.2) 100%)'
              : 'linear-gradient(135deg, rgba(29,170,88,0.15) 0%, rgba(36,132,198,0.15) 100%)',
            border: isDark ? '1px solid rgba(29,170,88,0.35)' : '1px solid rgba(29,170,88,0.30)',
          }}
        >
          <KeyRound className="w-5 h-5" style={{ color: '#1DAA58' }} />
        </div>
        <h2 className={`font-black text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
          Set your new password
        </h2>
        <p className={`text-[11px] leading-relaxed max-w-xs ${isDark ? 'text-white/40' : 'text-slate-500'}`}>
          Please set a personalized, enterprise-standard password to secure your account and proceed.
        </p>
      </div>

      {/* Main Card */}
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
        {/* Error Alert */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-start gap-2 overflow-hidden"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Password Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={`text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/45' : 'text-slate-600'}`}>
                New Password
              </label>
              {newPass.length > 0 && (
                <span
                  className="text-[10px] font-bold uppercase tracking-wider transition-colors duration-200"
                  style={{ color: validation.strengthColor }}
                >
                  Strength: {validation.strengthLabel}
                </span>
              )}
            </div>

            <div className="relative">
              <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${isDark ? 'text-white/25' : 'text-slate-400'}`} />
              <input
                type={showPass ? 'text' : 'password'}
                required
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="Enter strong password"
                className={`${inputClass} pl-10 pr-10`}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className={`absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer ${isDark ? 'text-white/25 hover:text-white/60' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Segmented 4-Bar Strength Meter */}
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {[1, 2, 3, 4].map((barIdx) => {
                const isFilled = newPass.length > 0 && validation.score >= barIdx;
                return (
                  <div
                    key={barIdx}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      isFilled
                        ? ''
                        : isDark
                        ? 'bg-white/[0.08]'
                        : 'bg-slate-200'
                    }`}
                    style={{
                      backgroundColor: isFilled ? validation.strengthColor : undefined,
                      boxShadow: isFilled ? `0 0 8px ${validation.strengthColor}40` : undefined,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Live Dynamic Checklist */}
          <div
            className={`p-3 rounded-xl space-y-1.5 border transition-colors duration-200 ${
              isDark
                ? 'bg-white/[0.02] border-white/[0.06]'
                : 'bg-slate-50/75 border-slate-200/80'
            }`}
          >
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-white/40' : 'text-slate-500'}`}>
              Password Requirements
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-1.5">
              {checklistItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-[11px] transition-colors duration-200">
                  {item.met ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#1DAA58] shrink-0" />
                  ) : (
                    <Circle className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-white/20' : 'text-slate-300'}`} />
                  )}
                  <span
                    className={`${
                      item.met
                        ? isDark
                          ? 'text-white/90 font-medium'
                          : 'text-slate-800 font-medium'
                        : isDark
                        ? 'text-white/30'
                        : 'text-slate-400'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Confirm Password Input */}
          <div>
            <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-white/45' : 'text-slate-600'}`}>
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${isDark ? 'text-white/25' : 'text-slate-400'}`} />
              <input
                type={showConfirmPass ? 'text' : 'password'}
                required
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="Repeat your new password"
                className={`${inputClass} pl-10 pr-10`}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPass(!showConfirmPass)}
                className={`absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer ${isDark ? 'text-white/25 hover:text-white/60' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Match Status indicator */}
            {confirmPass.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5">
                {passwordsMatch ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#1DAA58]" />
                    <span className="text-[10px] text-[#1DAA58] font-medium">Passwords match</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-[10px] text-rose-400 font-medium">Passwords do not match</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            id="force-password-submit-btn"
            disabled={!isFormValid}
            className="w-full py-3 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100 cursor-pointer mt-2"
            style={{
              background: 'linear-gradient(135deg, #1DAA58 0%, #2484C6 100%)',
              boxShadow: isFormValid ? '0 4px 20px rgba(29,170,88,0.28)' : 'none',
            }}
          >
            {loading ? (
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

      {/* Back to login option */}
      <button
        type="button"
        onClick={onBackToLogin}
        className={`flex items-center gap-1.5 text-[11px] transition-colors cursor-pointer mx-auto ${
          isDark ? 'text-white/35 hover:text-white/70' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Back to Login
      </button>
    </motion.div>
  );
}
