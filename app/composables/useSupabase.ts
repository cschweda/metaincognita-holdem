/**
 * Supabase client composable — singleton per app lifecycle.
 * Supports anonymous auth (default), GitHub OAuth, and email/password auth.
 * Falls back gracefully to localStorage-only mode when Supabase is not configured.
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

let client: SupabaseClient | null = null
let connectionFailed = false // true if credentials were provided but are invalid

/** Reset the singleton — only for testing. */
export function _resetClientForTesting() { client = null; connectionFailed = false }

/** Returns true if Supabase was configured but the connection/auth failed. */
export function isSupabaseConnectionFailed(): boolean { return connectionFailed }

export function useSupabase(): SupabaseClient | null {
  if (connectionFailed) return null // already tried and failed — don't retry
  if (client) return client

  const config = useRuntimeConfig()
  const url = (config.public.supabaseUrl as string || '').trim()
  const key = (config.public.supabaseKey as string || '').trim()

  // Both must be present
  if (!url || !key) {
    console.warn('Supabase not configured — stats will only persist in localStorage')
    return null
  }

  // Basic URL validation — must be a valid https URL
  if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
    console.warn('Supabase URL appears invalid (expected https://xxx.supabase.co) — falling back to localStorage')
    connectionFailed = true
    return null
  }

  // Key must be non-trivial (Supabase anon keys are 30+ chars)
  if (key.length < 20) {
    console.warn('Supabase key appears invalid (too short) — falling back to localStorage')
    connectionFailed = true
    return null
  }

  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })

  return client
}

/**
 * Ensures a session exists — either existing GitHub session or anonymous fallback.
 * If Supabase credentials are invalid (bad key, wrong project), catches the error,
 * disables the Supabase layer, and falls back to localStorage-only mode.
 */
export async function ensureSession(): Promise<string | null> {
  const sb = useSupabase()
  if (!sb) return null

  try {
    const { data: { session } } = await sb.auth.getSession()
    if (session?.user) return session.user.id

    // No existing session — sign in anonymously
    const { data, error } = await sb.auth.signInAnonymously()
    if (error) {
      console.warn('Supabase auth failed — falling back to localStorage:', error.message)
      connectionFailed = true
      client = null
      return null
    }

    return data.user?.id || null
  } catch (e: unknown) {
    // Network error, invalid credentials, wrong project URL, etc.
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('Supabase connection failed — falling back to localStorage:', msg)
    connectionFailed = true
    client = null
    return null
  }
}

// Keep the old name as alias for backward compat
export const ensureAnonSession = ensureSession

/**
 * Sign in with GitHub OAuth. Redirects to GitHub, then back to the app.
 */
export async function signInWithGitHub(): Promise<void> {
  const sb = useSupabase()
  if (!sb) return

  const { error } = await sb.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.origin,
    },
  })
  if (error) {
    console.error('GitHub sign-in failed:', error.message)
  }
}

/**
 * Sign up with email and password.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<{ success: boolean; error: string | null }> {
  const sb = useSupabase()
  if (!sb) return { success: false, error: 'Supabase not configured' }

  const { error } = await sb.auth.signUp({ email, password })
  if (error) return { success: false, error: error.message }
  return { success: true, error: null }
}

/**
 * Sign in with email and password.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ success: boolean; error: string | null }> {
  const sb = useSupabase()
  if (!sb) return { success: false, error: 'Supabase not configured' }

  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) return { success: false, error: error.message }
  return { success: true, error: null }
}

/**
 * Send a password reset email.
 */
export async function resetPassword(email: string): Promise<{ success: boolean; error: string | null }> {
  const sb = useSupabase()
  if (!sb) return { success: false, error: 'Supabase not configured' }

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/stats`,
  })
  if (error) return { success: false, error: error.message }
  return { success: true, error: null }
}

/**
 * Validate password complexity.
 * Minimum 8 chars, at least one uppercase, one lowercase, one number.
 */
export function validatePassword(password: string): { valid: boolean; message: string } {
  if (password.length < 8) return { valid: false, message: 'At least 8 characters' }
  if (!/[A-Z]/.test(password)) return { valid: false, message: 'At least one uppercase letter' }
  if (!/[a-z]/.test(password)) return { valid: false, message: 'At least one lowercase letter' }
  if (!/[0-9]/.test(password)) return { valid: false, message: 'At least one number' }
  return { valid: true, message: 'Strong password' }
}

/**
 * Sign out the current user and fall back to anonymous auth.
 */
export async function signOut(): Promise<void> {
  const sb = useSupabase()
  if (!sb) return

  await sb.auth.signOut()
  await sb.auth.signInAnonymously()
}

/**
 * Get the current user (if any).
 */
export async function getCurrentUser(): Promise<User | null> {
  const sb = useSupabase()
  if (!sb) return null

  const { data: { user } } = await sb.auth.getUser()
  return user
}

/**
 * Check if the current user is a non-anonymous authenticated user.
 * Despite the name, works for any auth method (GitHub, email, etc.).
 */
export async function isGitHubUser(): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false
  return !user.is_anonymous
}

/**
 * Check if user is signed in (any method — GitHub, email, etc.)
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser()
  return !!user && !user.is_anonymous
}
