/**
 * Supabase client composable — singleton per app lifecycle.
 * Uses anonymous auth (auto-creates a user per browser).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function useSupabase(): SupabaseClient | null {
  if (client) return client

  const config = useRuntimeConfig()
  const url = config.public.supabaseUrl as string
  const key = config.public.supabaseKey as string

  if (!url || !key) {
    console.warn('Supabase not configured — stats will only persist in localStorage')
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
 * Ensures an anonymous session exists. Call once at app startup.
 */
export async function ensureAnonSession(): Promise<string | null> {
  const sb = useSupabase()
  if (!sb) return null

  const { data: { session } } = await sb.auth.getSession()
  if (session?.user) return session.user.id

  const { data, error } = await sb.auth.signInAnonymously()
  if (error) {
    console.warn('Anonymous sign-in failed:', error.message)
    return null
  }

  return data.user?.id || null
}
