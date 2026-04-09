<template>
  <section class="page page-not-found">
    <section class="panel page-not-found__panel">
      <div class="section-heading">
        <AppIcon icon="arrow-left-wide-line" />
        <span class="section-heading__title">Route missing</span>
      </div>

      <h1 class="page__title">404</h1>
      <p class="page__lede">
        This route does not map to anything in the shell. Jump back to the command deck.
      </p>

      <RouterLink class="action-button action-button--primary" to="/">
        <AppIcon icon="home-line" />
        <span>Return home</span>
      </RouterLink>
    </section>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
</script>

<style scoped>
.page-not-found {
  align-items: center;
  display: grid;
  min-height: calc(100vh - 14rem);
}

.page-not-found__panel {
  justify-self: center;
  max-width: 34rem;
}
</style>
