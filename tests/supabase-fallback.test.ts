/**
 * Supabase graceful fallback tests — verifies the app handles missing or
 * empty Supabase credentials without errors, and that all auth functions
 * return safe defaults when the client is null.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'

// Mock useRuntimeConfig as a global (Nuxt auto-import) with empty credentials
vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    supabaseUrl: '',
    supabaseKey: '',
  },
}))

import {
  useSupabase,
  _resetClientForTesting,
  ensureSession,
  signInWithGitHub,
  signUpWithEmail,
  signInWithEmail,
  resetPassword,
  signOut,
  getCurrentUser,
  isGitHubUser,
  isAuthenticated,
  validatePassword,
} from '../app/composables/useSupabase'

// Reset the singleton before all tests so our empty-config mock takes effect
beforeAll(() => {
  _resetClientForTesting()
})

describe('Supabase client with missing credentials', () => {
  it('useSupabase() returns null when URL and key are empty', () => {
    const client = useSupabase()
    expect(client).toBeNull()
  })

  it('useSupabase() returns null consistently on repeated calls', () => {
    expect(useSupabase()).toBeNull()
    expect(useSupabase()).toBeNull()
  })
})

describe('Auth functions return safe defaults when Supabase is null', () => {
  it('ensureSession() returns null', async () => {
    const userId = await ensureSession()
    expect(userId).toBeNull()
  })

  it('signInWithGitHub() completes without throwing', async () => {
    await expect(signInWithGitHub()).resolves.toBeUndefined()
  })

  it('signUpWithEmail() returns failure with descriptive error', async () => {
    const result = await signUpWithEmail('test@example.com', 'Password1')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Supabase not configured')
  })

  it('signInWithEmail() returns failure with descriptive error', async () => {
    const result = await signInWithEmail('test@example.com', 'Password1')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Supabase not configured')
  })

  it('resetPassword() returns failure with descriptive error', async () => {
    const result = await resetPassword('test@example.com')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Supabase not configured')
  })

  it('signOut() completes without throwing', async () => {
    await expect(signOut()).resolves.toBeUndefined()
  })

  it('getCurrentUser() returns null', async () => {
    const user = await getCurrentUser()
    expect(user).toBeNull()
  })

  it('isGitHubUser() returns false', async () => {
    const result = await isGitHubUser()
    expect(result).toBe(false)
  })

  it('isAuthenticated() returns false', async () => {
    const result = await isAuthenticated()
    expect(result).toBe(false)
  })
})

describe('Password validation works independently of Supabase', () => {
  it('rejects short passwords', () => {
    expect(validatePassword('Abc1').valid).toBe(false)
  })

  it('rejects passwords without uppercase', () => {
    expect(validatePassword('abcdefg1').valid).toBe(false)
  })

  it('rejects passwords without lowercase', () => {
    expect(validatePassword('ABCDEFG1').valid).toBe(false)
  })

  it('rejects passwords without numbers', () => {
    expect(validatePassword('Abcdefgh').valid).toBe(false)
  })

  it('accepts strong passwords', () => {
    expect(validatePassword('Abcdefg1').valid).toBe(true)
  })
})
