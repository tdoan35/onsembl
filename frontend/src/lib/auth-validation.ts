/**
 * Auth Validation Rules
 * Centralized validation rules that match Supabase and database constraints
 */

import { z } from 'zod';

/**
 * Supabase Auth Requirements
 * - Email: Valid email format, case-insensitive
 * - Password: Minimum 6 characters (Supabase default), max 72 (bcrypt limit)
 *
 * Database Constraints (user_profiles table)
 * - Username: 3-30 characters, alphanumeric + underscore only
 */

// Email validation - used for both login and signup
export const emailSchema = z.string()
  .email('Please enter a valid email address')
  .max(255, 'Email must be at most 255 characters');

// Username validation - matches database CHECK constraint
export const usernameSchema = z.string()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(
    /^[a-zA-Z0-9_]+$/,
    'Username can only contain letters, numbers, and underscores'
  );

// Password validation - matches Supabase requirements
export const passwordSchema = z.string()
  .min(6, 'Password must be at least 6 characters')
  .max(72, 'Password must be at most 72 characters');

// Strong password validation (optional, for enhanced security)
export const strongPasswordSchema = passwordSchema
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    'Password must contain at least one uppercase letter, one lowercase letter, and one number'
  );

// Login form schema
export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

// Signup form schema
export const signupSchema = z.object({
  email: emailSchema,
  username: z.string().optional(),
  password: passwordSchema,
  passwordConfirm: z.string(),
}).refine((data) => data.password === data.passwordConfirm, {
  message: "Passwords don't match",
  path: ["passwordConfirm"],
});

// Password reset schema
export const passwordResetSchema = z.object({
  email: emailSchema,
});

// Change password schema
export const changePasswordSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: "New password must be different from current password",
  path: ["newPassword"],
});

// Profile update schema
export const profileUpdateSchema = z.object({
  username: usernameSchema.optional(),
  full_name: z.string().max(255, 'Name must be at most 255 characters').optional(),
  bio: z.string().max(1000, 'Bio must be at most 1000 characters').optional(),
  avatar_url: z.string().url('Invalid avatar URL').optional().or(z.literal('')),
});

// Export types
export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof signupSchema>;
export type PasswordResetFormData = z.infer<typeof passwordResetSchema>;
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
export type ProfileUpdateFormData = z.infer<typeof profileUpdateSchema>;

/**
 * Validation utilities
 */

// Check if email is valid without throwing
export function isValidEmail(email: string): boolean {
  try {
    emailSchema.parse(email);
    return true;
  } catch {
    return false;
  }
}

// Check if username is valid without throwing
export function isValidUsername(username: string): boolean {
  try {
    usernameSchema.parse(username);
    return true;
  } catch {
    return false;
  }
}

// Check if password meets requirements
export function isValidPassword(password: string, strong = false): boolean {
  try {
    const schema = strong ? strongPasswordSchema : passwordSchema;
    schema.parse(password);
    return true;
  } catch {
    return false;
  }
}

// Get password strength (0-4)
export function getPasswordStrength(password: string): number {
  let strength = 0;

  if (password.length >= 6) strength++;
  if (password.length >= 10) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) strength++;

  return strength;
}

// Get password strength label
export function getPasswordStrengthLabel(strength: number): string {
  switch (strength) {
    case 0: return 'Very Weak';
    case 1: return 'Weak';
    case 2: return 'Fair';
    case 3: return 'Good';
    case 4: return 'Strong';
    default: return 'Unknown';
  }
}

// Get password strength color
export function getPasswordStrengthColor(strength: number): string {
  switch (strength) {
    case 0: return 'text-red-500';
    case 1: return 'text-orange-500';
    case 2: return 'text-yellow-500';
    case 3: return 'text-blue-500';
    case 4: return 'text-green-500';
    default: return 'text-gray-500';
  }
}
