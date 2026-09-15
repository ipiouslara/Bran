/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PasswordCriteria {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  notDefault: boolean;
}

export type PasswordStrength = 'Weak' | 'Fair' | 'Good' | 'Strong';

export interface PasswordValidationResult {
  criteria: PasswordCriteria;
  isValid: boolean;
  score: number; // 0 to 4
  strengthLabel: PasswordStrength;
  strengthColor: string; // hex code
  accentClass: string;
}

const SALT = 'bran_enterprise_auth_salt_2026';

/**
 * Standard corporate default passwords that cannot be reused.
 */
export function getDefaultPasswordsForEmployee(employeeId?: string): string[] {
  const defaults = ['password123', 'admin123', 'password', 'welcome123', 'mediant123'];
  if (employeeId) {
    const clean = employeeId.trim().toLowerCase();
    defaults.push(`${clean}@123`);
    defaults.push(`${clean}123`);
    defaults.push(`${clean}@2026`);
  }
  return defaults;
}

/**
 * Validates a password against enterprise standards and computes an entropy/strength score (0 to 4).
 */
export function validatePassword(
  password: string,
  defaultPasswords: string[] = []
): PasswordValidationResult {
  const pwd = password || '';

  const minLength = pwd.length >= 8;
  const hasUpper = /[A-Z]/.test(pwd);
  const hasLower = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(pwd);

  const lower = pwd.toLowerCase();
  const notDefault =
    pwd.length > 0 &&
    !defaultPasswords.some((d) => d.toLowerCase() === lower);

  const criteria: PasswordCriteria = {
    minLength,
    hasUpper,
    hasLower,
    hasNumber,
    hasSpecial,
    notDefault,
  };

  const isValid =
    minLength && hasUpper && hasLower && hasNumber && hasSpecial && notDefault;

  // Calculate score (0 to 4)
  let score = 0;
  if (pwd.length === 0) {
    score = 0;
  } else {
    // Count passed checks among the 4 character varieties
    const passedCount = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
    
    if (pwd.length < 8) {
      score = passedCount >= 3 ? 1 : 0;
    } else {
      if (passedCount <= 1) score = 1;
      else if (passedCount === 2) score = 2;
      else if (passedCount === 3) score = 3;
      else if (passedCount === 4) {
        score = pwd.length >= 10 ? 4 : 3;
      }
    }

    if (!notDefault) {
      score = Math.min(score, 1);
    }
  }

  let strengthLabel: PasswordStrength = 'Weak';
  let strengthColor = '#EF4444'; // Crimson Red
  let accentClass = 'bg-rose-500 text-rose-400';

  if (score === 2) {
    strengthLabel = 'Fair';
    strengthColor = '#F59E0B'; // Amber
    accentClass = 'bg-amber-500 text-amber-400';
  } else if (score === 3) {
    strengthLabel = 'Good';
    strengthColor = '#2484C6'; // Brand Blue
    accentClass = 'bg-[#2484C6] text-[#2484C6]';
  } else if (score >= 4) {
    strengthLabel = 'Strong';
    strengthColor = '#1DAA58'; // Brand Green
    accentClass = 'bg-[#1DAA58] text-[#1DAA58]';
  }

  return {
    criteria,
    isValid,
    score,
    strengthLabel,
    strengthColor,
    accentClass,
  };
}

/**
 * Browser-native salted SHA-256 password hash.
 * Uses WebCrypto API to digest the password with an enterprise application salt.
 */
export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(SALT + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
