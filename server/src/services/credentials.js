import { z } from 'zod';
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,32}$/, 'Use 3–32 letters, numbers, or underscores for your username.');
export const oldPassword = z
  .string()
  .min(1)
  .max(256)
  .refine((s) => Buffer.byteLength(s) <= 72, 'Password exceeds the supported length.');
export const password = oldPassword.refine(
  (s) => s.length >= 12 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s),
  'Use at least 12 characters, uppercase and lowercase letters, and a number.',
);
