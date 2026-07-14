<!-- app/components/AppHubLink.vue -->
<!-- The suite's exit door: back to the floor at metaincognita.com, where every
     Metaincognita game lives. Identical chrome in every app (guidelines §5), so
     it stays gold here even though this app's accent is felt-green.

     Four things here are load-bearing, not stylistic:
       - A real <a href>, never a NuxtLink — it leaves the SPA entirely.
       - No `target` — this is an exit, not a side trip. A new tab would leave
         the simulator running behind it.
       - Never hidden and never confirmed. It destroys nothing (the career
         store persists), and the whole point is that you can always get out.
         It is NOT the "Leave table" button, which settles a career session and
         stays exactly as it is.
       - The aria-label must CONTAIN the visible wordmark verbatim, or it fails
         WCAG 2.5.3 Label in Name — "Meta Incognita" would break on the space. -->
<template>
  <a
    href="https://metaincognita.com"
    aria-label="METAINCOGNITA — exit the simulator, back to all the games"
    data-test="hub-link"
    class="flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-amber-400 transition-colors hover:border-amber-400/60 hover:bg-amber-500/10 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
  >
    <UIcon
      name="i-lucide-log-out"
      class="w-3.5 h-3.5"
      aria-hidden="true"
    />
    <span class="text-[10px] font-semibold tracking-[0.12em]">METAINCOGNITA</span>
  </a>
</template>
