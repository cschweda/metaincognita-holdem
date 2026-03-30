<script setup lang="ts">
import { ensureAnonSession, useSupabase } from '~/composables/useSupabase'

const connected = ref(false)
const checking = ref(true)

onMounted(async () => {
  const sb = useSupabase()
  if (!sb) { checking.value = false; return }
  try {
    connected.value = !!(await ensureAnonSession())
  } catch {
    connected.value = false
  }
  checking.value = false
})
</script>

<template>
  <div class="flex items-center gap-1.5 bg-gray-900/80 border border-gray-700/50 rounded-full px-2.5 py-1">
    <div
      class="w-2 h-2 rounded-full transition-colors"
      :class="checking ? 'bg-yellow-500 animate-pulse' : connected ? 'bg-green-500' : 'bg-red-500'"
    />
    <span class="text-[0.6rem] font-medium" :class="checking ? 'text-yellow-400' : connected ? 'text-green-400' : 'text-red-400'">
      {{ checking ? 'Connecting...' : connected ? 'Supabase' : 'Offline' }}
    </span>
  </div>
</template>
