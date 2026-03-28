/**
 * Supabase graceful fallback tests — verifies the app handles missing,
 * empty, partial, and invalid Supabase credentials without errors.
 * All auth functions must return safe defaults when the client is null.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  useSupabase,
  _resetClientForTesting,
  isSupabaseConnectionFailed,
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

// ─── Empty credentials (no .env) ─────────────────────────────

describe('Empty credentials (no .env file)', () => {
  beforeEach(() => {
    _resetClientForTesting()
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: { supabaseUrl: '', supabaseKey: '' },
    }))
  })

  it('useSupabase() returns null', () => {
    expect(useSupabase()).toBeNull()
  })

  it('isSupabaseConnectionFailed() returns false (not configured, not failed)', () => {
    useSupabase()
    expect(isSupabaseConnectionFailed()).toBe(false)
  })

  it('returns null consistently on repeated calls', () => {
    expect(useSupabase()).toBeNull()
    expect(useSupabase()).toBeNull()
  })
})

// ─── Partial credentials (one value missing) ─────────────────

describe('Partial credentials (URL present, key missing)', () => {
  beforeEach(() => {
    _resetClientForTesting()
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: { supabaseUrl: 'https://test.supabase.co', supabaseKey: '' },
    }))
  })

  it('useSupabase() returns null', () => {
    expect(useSupabase()).toBeNull()
  })

  it('ensureSession() returns null', async () => {
    expect(await ensureSession()).toBeNull()
  })
})

describe('Partial credentials (key present, URL missing)', () => {
  beforeEach(() => {
    _resetClientForTesting()
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: { supabaseUrl: '', supabaseKey: 'sb_publishable_some-valid-looking-key-here' },
    }))
  })

  it('useSupabase() returns null', () => {
    expect(useSupabase()).toBeNull()
  })
})

// ─── Invalid URL format ──────────────────────────────────────

describe('Invalid URL format (not a Supabase URL)', () => {
  beforeEach(() => {
    _resetClientForTesting()
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: { supabaseUrl: 'http://localhost:3000', supabaseKey: 'sb_publishable_some-valid-looking-key-here' },
    }))
  })

  it('useSupabase() returns null', () => {
    expect(useSupabase()).toBeNull()
  })

  it('isSupabaseConnectionFailed() returns true (bad URL detected)', () => {
    useSupabase()
    expect(isSupabaseConnectionFailed()).toBe(true)
  })
})

describe('Invalid URL format (plain text, not https)', () => {
  beforeEach(() => {
    _resetClientForTesting()
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: { supabaseUrl: 'not-a-url', supabaseKey: 'sb_publishable_some-valid-looking-key-here' },
    }))
  })

  it('useSupabase() returns null', () => {
    expect(useSupabase()).toBeNull()
  })

  it('marks connection as failed', () => {
    useSupabase()
    expect(isSupabaseConnectionFailed()).toBe(true)
  })
})

// ─── Invalid key (too short) ─────────────────────────────────

describe('Invalid key (too short to be real)', () => {
  beforeEach(() => {
    _resetClientForTesting()
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: { supabaseUrl: 'https://test.supabase.co', supabaseKey: 'short' },
    }))
  })

  it('useSupabase() returns null', () => {
    expect(useSupabase()).toBeNull()
  })

  it('marks connection as failed', () => {
    useSupabase()
    expect(isSupabaseConnectionFailed()).toBe(true)
  })
})

// ─── Auth functions with null client ─────────────────────────

describe('Auth functions return safe defaults when client is null', () => {
  beforeEach(() => {
    _resetClientForTesting()
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: { supabaseUrl: '', supabaseKey: '' },
    }))
  })

  it('ensureSession() returns null', async () => {
    expect(await ensureSession()).toBeNull()
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
    expect(await getCurrentUser()).toBeNull()
  })

  it('isGitHubUser() returns false', async () => {
    expect(await isGitHubUser()).toBe(false)
  })

  it('isAuthenticated() returns false', async () => {
    expect(await isAuthenticated()).toBe(false)
  })
})

// ─── Whitespace-only values ──────────────────────────────────

describe('Whitespace-only credentials', () => {
  beforeEach(() => {
    _resetClientForTesting()
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: { supabaseUrl: '   ', supabaseKey: '   ' },
    }))
  })

  it('useSupabase() returns null (trimmed to empty)', () => {
    expect(useSupabase()).toBeNull()
  })

  it('isSupabaseConnectionFailed() returns false (not configured, not failed)', () => {
    useSupabase()
    expect(isSupabaseConnectionFailed()).toBe(false)
  })
})

// ─── Password validation (independent of Supabase) ──────────

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
