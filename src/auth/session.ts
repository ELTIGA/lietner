/**
 * Everything that needs the Supabase SDK. Only ever loaded with import(), when sync is configured
 * and a session is stored or someone taps Sign in, so guests never download the SDK.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';

import type { Remote } from '../sync/remote';
import { SupabaseRemote } from '../sync/supabaseRemote';
import { AUTH_STORAGE_KEY, storedSessionUser, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

export interface SessionUser {
  id: string;
  email: string;
}

export type SignInProblem = 'emailCap' | 'signupsPaused' | 'badCode' | 'badEmail' | 'offline' | 'tooMany' | 'generic';

export class SignInFailure extends Error {
  constructor(
    readonly problem: SignInProblem,
    cause?: unknown,
  ) {
    super(problem, { cause });
    this.name = 'SignInFailure';
  }
}

let client: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
    auth: {
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      // No redirect flows: codes and Google ID tokens only.
      detectSessionInUrl: false,
    },
  });
  return client;
}

/**
 * The signed-in user, without waiting on the server (sync confirms the account itself).
 * Offline with an expired access token the SDK can't refresh, so it reports no session but
 * keeps it stored; it only deletes a stored session that is definitely invalid. While one is
 * stored, this device is still signed in: use the user saved with it.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const { data } = await supabase().auth.getSession();
  const user = data.session?.user ?? storedSessionUser();
  return user ? { id: user.id, email: user.email ?? '' } : null;
}


/**
 * Turns Supabase Auth errors into what the sign-in dialog can explain. A failed send
 * (the email provider's daily cap) comes back as a server error.
 */
function problemFor(error: unknown, sending: boolean): SignInFailure {
  const status = (error as { status?: number } | null)?.status ?? 0;
  // The email provider refusing to send (its daily cap) surfaces as a plain 500 from Auth.
  if (sending && status === 500) return new SignInFailure('emailCap', error);
  if (isAuthRetryableFetchError(error)) return new SignInFailure('offline', error);
  if (isAuthApiError(error)) {
    const { code } = error;
    if (code === 'over_email_send_rate_limit') return new SignInFailure('emailCap', error);
    if (code === 'signup_disabled' || code === 'email_provider_disabled') return new SignInFailure('signupsPaused', error);
    if (code === 'otp_expired' || code === 'otp_disabled') return new SignInFailure('badCode', error);
    if (code === 'validation_failed' || code === 'email_address_invalid') return new SignInFailure('badEmail', error);
    if (code === 'over_request_rate_limit' || status === 429) return new SignInFailure('tooMany', error);
  }
  return new SignInFailure('generic', error);
}

/** Emails a 6-digit code. New addresses get an account. */
export async function sendCode(email: string): Promise<void> {
  const { error } = await supabase().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw problemFor(error, true);
}

export async function verifyCode(email: string, token: string): Promise<SessionUser> {
  const { data, error } = await supabase().auth.verifyOtp({ email, token, type: 'email' });
  if (error || !data.user) throw problemFor(error, false);
  return { id: data.user.id, email: data.user.email ?? email };
}

export async function signInWithGoogle(idToken: string, rawNonce: string): Promise<SessionUser> {
  const { data, error } = await supabase().auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: rawNonce });
  if (error || !data.user) throw problemFor(error, false);
  return { id: data.user.id, email: data.user.email ?? '' };
}

/** True if the account already holds live decks (for the one-time merge prompt). */
export async function accountHasData(): Promise<boolean> {
  const { count, error } = await supabase().from('decks').select('id', { count: 'exact', head: true }).is('deleted_at', null);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Ends this device's session only; other devices stay signed in. */
export async function signOutHere(): Promise<void> {
  const { error } = await supabase().auth.signOut({ scope: 'local' });
  if (error) console.warn('Sign-out request failed; clearing the local session anyway', error);
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Storage blocked: nothing stored to remove.
  }
}

/** Deletes the account on the server; the database cascades to every deck and card. */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase().rpc('delete_account');
  if (error) throw error;
}

export function createRemote(userId: string): Remote {
  return new SupabaseRemote(supabase(), userId);
}
