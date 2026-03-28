<script setup lang="ts">
/**
 * Connection status indicator — two pills showing:
 *   1. Database status (Supabase green / Local Only red)
 *   2. Auth method (GitHub / Email / Anonymous / None)
 * Clicking opens a dropdown with sign-in/out actions.
 */
import {
  ensureSession,
  useSupabase,
  isSupabaseConnectionFailed,
  signInWithGitHub,
  signOut,
  getCurrentUser,
} from '~/composables/useSupabase'
import type { User } from '@supabase/supabase-js'

const connected = ref(false)
const checking = ref(true)
const supabaseConfigured = ref(true)
const user = ref<User | null>(null)
const showMenu = ref(false)

const isGitHub = computed(() => user.value && !user.value.is_anonymous)
const authProvider = computed(() => {
  if (!user.value) return null
  if (user.value.app_metadata?.provider === 'github') return 'GitHub'
  if (user.value.email && !user.value.is_anonymous) return 'Email'
  if (user.value.is_anonymous) return 'Anonymous'
  return null
})
const displayName = computed(() => {
  if (!user.value) return null
  if (isGitHub.value) {
    return user.value.user_metadata?.user_name
      || user.value.user_metadata?.preferred_username
      || user.value.email?.split('@')[0]
      || 'GitHub User'
  }
  if (user.value.email) return user.value.email.split('@')[0]
  return null
})

// Database status
const dbStatus = computed<'connected' | 'failed' | 'local' | 'checking'>(() => {
  if (checking.value) return 'checking'
  if (!supabaseConfigured.value) {
    return isSupabaseConnectionFailed() ? 'failed' : 'local'
  }
  return connected.value ? 'connected' : 'local'
})

const dbLabel = computed(() => {
  switch (dbStatus.value) {
    case 'checking': return 'Checking...'
    case 'connected': return 'Supabase'
    case 'failed': return 'DB Failed'
    case 'local': return 'Local Only'
  }
})

const dbColor = computed(() => {
  switch (dbStatus.value) {
    case 'checking': return 'yellow'
    case 'connected': return 'green'
    case 'failed': return 'red'
    case 'local': return 'gray'
  }
})

onMounted(async () => {
  const sb = useSupabase()
  if (!sb) { supabaseConfigured.value = false; checking.value = false; return }

  sb.auth.onAuthStateChange(async (_event, session) => {
    user.value = session?.user || null
    connected.value = !!session?.user
  })

  try {
    const userId = await ensureSession()
    connected.value = !!userId
    if (isSupabaseConnectionFailed()) {
      supabaseConfigured.value = false
      connected.value = false
    } else {
      user.value = await getCurrentUser()
    }
  } catch {
    connected.value = false
    supabaseConfigured.value = false
  }
  checking.value = false
})

async function handleLogin() {
  await signInWithGitHub()
}

async function handleLogout() {
  await signOut()
  user.value = await getCurrentUser()
  showMenu.value = false
}
</script>

<template>
  <div class="relative">
    <button
      class="flex items-center gap-2 bg-gray-900/80 border border-gray-700/50 rounded-full px-3 py-1.5 hover:bg-gray-800/80 transition-colors"
      @click="showMenu = !showMenu"
    >
      <!-- Database status dot + label -->
      <div class="flex items-center gap-1">
        <div
          class="w-2 h-2 rounded-full shrink-0"
          :class="{
            'bg-green-500': dbColor === 'green',
            'bg-red-500': dbColor === 'red',
            'bg-yellow-500 animate-pulse': dbColor === 'yellow',
            'bg-gray-500': dbColor === 'gray',
          }"
        />
        <span
          class="text-[0.6rem] font-medium"
          :class="{
            'text-green-400': dbColor === 'green',
            'text-red-400': dbColor === 'red',
            'text-yellow-400': dbColor === 'yellow',
            'text-gray-400': dbColor === 'gray',
          }"
        >
          {{ dbLabel }}
        </span>
      </div>

      <!-- Separator -->
      <div v-if="authProvider || isGitHub" class="w-px h-3 bg-gray-700" />

      <!-- Auth method dot + label -->
      <div v-if="isGitHub" class="flex items-center gap-1">
        <div class="w-2 h-2 rounded-full bg-green-500 shrink-0" />
        <span class="text-[0.6rem] font-medium text-green-400">{{ displayName }}</span>
      </div>
      <div v-else-if="authProvider === 'Email'" class="flex items-center gap-1">
        <div class="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
        <span class="text-[0.6rem] font-medium text-blue-400">{{ displayName }}</span>
      </div>
      <div v-else-if="authProvider === 'Anonymous' && supabaseConfigured" class="flex items-center gap-1">
        <div class="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
        <span class="text-[0.6rem] font-medium text-yellow-400">Not signed in</span>
      </div>
    </button>

    <!-- Dropdown -->
    <div
      v-if="showMenu && !checking"
      class="absolute right-0 top-full mt-1 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden"
    >
      <!-- Status summary -->
      <div class="p-3 border-b border-gray-800 space-y-2">
        <!-- Database row -->
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full shrink-0" :class="dbColor === 'green' ? 'bg-green-500' : dbColor === 'red' ? 'bg-red-500' : 'bg-gray-500'" />
          <div class="flex-1">
            <div class="text-xs" :class="dbColor === 'green' ? 'text-green-400' : dbColor === 'red' ? 'text-red-400' : 'text-gray-400'">
              {{ dbStatus === 'connected' ? 'Supabase connected' : dbStatus === 'failed' ? 'Supabase connection failed' : 'No database — local storage only' }}
            </div>
            <div class="text-[0.55rem] text-gray-600">
              {{ dbStatus === 'connected' ? 'Lifetime stats saved across sessions' : dbStatus === 'failed' ? 'Check .env credentials' : 'Session stats only — cleared on browser reset' }}
            </div>
          </div>
        </div>

        <!-- Auth row -->
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full shrink-0" :class="isGitHub ? 'bg-green-500' : authProvider === 'Email' ? 'bg-blue-500' : authProvider === 'Anonymous' ? 'bg-yellow-500' : 'bg-gray-500'" />
          <div class="flex-1">
            <div class="text-xs" :class="isGitHub ? 'text-green-400' : authProvider === 'Email' ? 'text-blue-400' : 'text-gray-400'">
              {{ isGitHub ? `Signed in as ${displayName}` : authProvider === 'Email' ? `Signed in as ${displayName}` : authProvider === 'Anonymous' ? 'Anonymous session' : 'Not authenticated' }}
            </div>
            <div class="text-[0.55rem] text-gray-600">
              {{ isGitHub || authProvider === 'Email' ? 'Stats sync across devices' : supabaseConfigured ? 'Sign in to sync across devices' : 'Auth unavailable without database' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="p-1.5">
        <button
          v-if="isGitHub || authProvider === 'Email'"
          class="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 rounded-md transition-colors"
          @click="handleLogout"
        >
          Sign out
        </button>
        <button
          v-else-if="supabaseConfigured && connected"
          class="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-200 hover:bg-gray-800 rounded-md transition-colors"
          @click="handleLogin"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          Sign in with GitHub
        </button>
        <NuxtLink to="/stats" @click="showMenu = false">
          <div class="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 rounded-md transition-colors">
            View Stats
          </div>
        </NuxtLink>
      </div>
    </div>
    <div v-if="showMenu" class="fixed inset-0 z-40" @click="showMenu = false" />
  </div>
</template>
