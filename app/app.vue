<script setup lang="ts">
import { useSupabase, ensureAnonSession } from '~/composables/useSupabase'

const connected = ref(false)
const checking = ref(true)

onMounted(async () => {
  const sb = useSupabase()
  if (!sb) {
    checking.value = false
    return
  }

  try {
    const userId = await ensureAnonSession()
    connected.value = !!userId
  } catch {
    connected.value = false
  }
  checking.value = false
})
</script>

<template>
  <UApp>
    <!-- Supabase connection indicator — always visible, top-right -->
    <div class="fixed top-2 right-2 z-50">
      <div
        class="flex items-center gap-1.5 bg-gray-900/90 border border-gray-700/50 rounded-full px-2.5 py-1 backdrop-blur-sm shadow-lg"
      >
        <div
          class="w-2 h-2 rounded-full transition-colors"
          :class="checking ? 'bg-yellow-500 animate-pulse' : connected ? 'bg-green-500' : 'bg-red-500'"
        />
        <span class="text-[0.6rem] font-medium" :class="checking ? 'text-yellow-400' : connected ? 'text-green-400' : 'text-red-400'">
          {{ checking ? 'Connecting...' : connected ? 'Supabase' : 'Offline' }}
        </span>
      </div>
    </div>

    <NuxtPage />
  </UApp>
</template>
