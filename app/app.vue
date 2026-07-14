<template>
  <UApp>
    <!--
      NuxtLayout wraps every route in layouts/default.vue, which carries the
      hub exit. No page sets `definePageMeta({ layout })`, so there is exactly
      one layout and no route can opt out of it.
    -->
    <NuxtLayout>
      <NuxtPage :keepalive="{ include: ['index'] }" />
    </NuxtLayout>
  </UApp>
</template>
