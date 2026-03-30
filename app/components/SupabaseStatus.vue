<script setup lang="ts">
/**
 * Auth status pill — shows connection state (GitHub user, anonymous/local, or offline)
 * with a dropdown for sign-in/sign-out actions and a link to the stats page.
 */
import {
  ensureSession,
  useSupabase,
  signInWithGitHub,
  signOut,
  getCurrentUser,
} from '~/composables/useSupabase'
import type { User } from '@supabase/supabase-js'

const connected = ref(false)
const checking = ref(true)
const user = ref<User | null>(null)
const showMenu = ref(false)

const isGitHub = computed(() => user.value && !user.value.is_anonymous)
const displayName = computed(() => {
  if (!user.value) return null
  if (isGitHub.value) {
    return user.value.user_metadata?.user_name
      || user.value.user_metadata?.preferred_username
      || user.value.email?.split('@')[0]
      || 'GitHub User'
  }
  return null
})

onMounted(async () => {
  const sb = useSupabase()
  if (!sb) { checking.value = false; return }

  sb.auth.onAuthStateChange(async (_event, session) => {
    user.value = session?.user || null
    connected.value = !!session?.user
  })

  try {
    const userId = await ensureSession()
    connected.value = !!userId
    user.value = await getCurrentUser()
  } catch {
    connected.value = false
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
    <!-- GitHub user: clickable with dropdown -->
    <template v-if="isGitHub">
      <button
        class="flex items-center gap-1.5 bg-gray-900/80 border border-gray-700/50 rounded-full px-2.5 py-1 hover:bg-gray-800/80 transition-colors"
        @click="showMenu = !showMenu"
      >
        <div class="w-2 h-2 rounded-full bg-green-500" />
        <span class="text-[0.6rem] font-medium text-green-400">{{ displayName }}</span>
      </button>

      <!-- Dropdown -->
      <div
        v-if="showMenu"
        class="absolute right-0 top-full mt-1 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden"
      >
        <div class="p-3 border-b border-gray-800">
          <div class="text-xs text-gray-400">
            Signed in as <span class="text-white font-semibold">{{ displayName }}</span>
          </div>
          <div class="text-[0.6rem] text-green-500/60 mt-1">Stats sync across devices</div>
        </div>
        <div class="p-1.5">
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 rounded-md transition-colors"
            @click="handleLogout"
          >
            Sign out
          </button>
          <NuxtLink to="/stats" @click="showMenu = false">
            <div class="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 rounded-md transition-colors">
              View Stats
            </div>
          </NuxtLink>
        </div>
      </div>
      <div v-if="showMenu" class="fixed inset-0 z-40" @click="showMenu = false" />
    </template>

    <!-- Anonymous / connecting / offline: simple pill, clickable for login -->
    <template v-else>
      <button
        class="flex items-center gap-1.5 bg-gray-900/80 border border-gray-700/50 rounded-full px-2.5 py-1 hover:bg-gray-800/80 transition-colors"
        @click="showMenu = !showMenu"
      >
        <div
          class="w-2 h-2 rounded-full"
          :class="checking ? 'bg-yellow-500 animate-pulse' : connected ? 'bg-yellow-500' : 'bg-red-500'"
        />
        <span
          class="text-[0.6rem] font-medium"
          :class="checking ? 'text-yellow-400' : connected ? 'text-yellow-400' : 'text-red-400'"
        >
          {{ checking ? 'Connecting...' : connected ? 'Local' : 'Offline' }}
        </span>
      </button>

      <!-- Login prompt dropdown -->
      <div
        v-if="showMenu && !checking"
        class="absolute right-0 top-full mt-1 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden"
      >
        <div class="p-3 border-b border-gray-800">
          <div class="text-xs text-gray-400">
            {{ connected ? 'Stats saved locally to this browser.' : 'Not connected.' }}
          </div>
          <div v-if="connected" class="text-[0.6rem] text-yellow-500/60 mt-1">
            Sign in with GitHub to sync across devices
          </div>
        </div>
        <div class="p-1.5">
          <button
            v-if="connected"
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
    </template>
  </div>
</template>
