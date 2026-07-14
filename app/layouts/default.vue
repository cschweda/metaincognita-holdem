<template>
  <!--
    The app shell. This repo had no layout at all — `app.vue` mounted `<NuxtPage>`
    directly and every page rolled its own header — so the hub exit had nowhere
    universal to live. This is that universal place: one slim bar above every
    route, so the way out of the simulator is in the same spot on every page.

    Deliberately thin. The per-page headers ("Back", "Leave table", "Setup") are
    untouched and keep doing their own jobs; this bar adds nothing that competes
    with them.
  -->
  <div class="flex flex-col min-h-screen bg-gray-950 text-white">
    <nav
      aria-label="App"
      class="sticky top-0 z-40 h-9 shrink-0 flex items-center gap-2 px-3 bg-gray-900 border-b border-gray-800"
    >
      <!--
        Out of the simulator entirely, back to the hub floor. Distinct from the
        in-app "Back"/"Leave table" affordances beside it on each page, which
        only move you around inside Hold'em. Never gated, never hidden: it is
        the one control that is on literally every route.
      -->
      <AppHubLink />

      <span
        class="h-4 w-px bg-gray-800"
        aria-hidden="true"
      />

      <!--
        Lower-value than the exit, so at 390px it is the thing that gives way.
        sr-only, not hidden — the app's name stays in the accessibility tree.
      -->
      <span class="text-xs text-gray-400 max-sm:sr-only">Hold'em Simulator</span>
    </nav>

    <!--
      `app-main` is the hook for the one CSS rule in main.css that rebases the
      pages' `min-h-screen` onto the space under the bar. Without it every route
      would sit 100vh tall beneath a 36px bar and scroll by exactly the bar's
      height. See app/assets/css/main.css.
    -->
    <div class="app-main flex-1">
      <slot />
    </div>
  </div>
</template>
