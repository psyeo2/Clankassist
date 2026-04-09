<template>
  <div class="app-shell">
    <div class="app-shell__backdrop" aria-hidden="true">
      <div class="app-shell__flare app-shell__flare--left"></div>
      <div class="app-shell__flare app-shell__flare--right"></div>
      <div class="app-shell__grid"></div>
    </div>

    <AppNavbar v-if="!route.meta.hideHeader" />

    <main class="app-shell__content">
      <RouterView />
    </main>

    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'

import AppFooter from '@/components/AppFooter.vue'
import AppNavbar from '@/components/AppNavbar.vue'

const route = useRoute()
</script>
