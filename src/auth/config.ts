/**
 * Sign-in and sync are optional and switched on by environment variables. Without them
 * (local development, preview deploys) the app is guest-only and never loads the Supabase SDK.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || undefined;
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || undefined;
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;

export const syncAvailable = !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

/** Fixed so a stored session can be detected before the SDK loads (the default key depends on the URL). */
export const AUTH_STORAGE_KEY = 'lietner-auth';

export function hasStoredSession(): boolean {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** The installed iOS home-screen app, where Google's sign-in popup is unreliable. */
export function isIosStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
