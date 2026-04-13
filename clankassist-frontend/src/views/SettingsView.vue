<template>
  <section class="page page-settings">
    <header class="page__header">
      <div>
        <p class="page__eyebrow">Settings</p>
        <h1 class="page__title">Settings</h1>
        <p class="page__lede">Reference information for the admin workspace.</p>
      </div>
    </header>

    <div v-if="isLoading" class="panel">
      <p class="muted-copy">Loading settings.</p>
    </div>

    <template v-else>
      <div class="page-settings__grid">
        <section class="panel">
          <div class="section-heading">
            <AppIcon icon="cloud-line" />
            <span class="section-heading__title">API target</span>
          </div>

          <div class="field-grid">
            <label class="field field--span-2 field--static">
              <span class="field__label">Base URL</span>
              <div class="static-value">{{ apiBaseUrl }}</div>
              <span class="field__hint">Set by <code>VITE_API_BASE_URL</code> in the frontend environment.</span>
            </label>
          </div>
        </section>

        <section class="panel">
          <div class="section-heading">
            <AppIcon icon="settings-2-line" />
            <span class="section-heading__title">Notes</span>
          </div>

          <div class="stack-list">
            <article class="stack-list__item">
              <h2 class="stack-list__title">Admin auth</h2>
              <p class="muted-copy">This frontend uses admin bearer session tokens from the orchestrator.</p>
            </article>
            <article class="stack-list__item">
              <h2 class="stack-list__title">Device auth</h2>
              <p class="muted-copy">Device tokens are created through the Devices or Manual API pages.</p>
            </article>
            <article class="stack-list__item">
              <h2 class="stack-list__title">Local storage</h2>
              <p class="muted-copy">Only the color palette and admin session tokens are persisted locally.</p>
            </article>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { getApiBaseUrl } from '@/lib/api'

const apiBaseUrl = ref('')
const isLoading = ref(true)

onMounted(async () => {
  apiBaseUrl.value = await getApiBaseUrl()
  isLoading.value = false
})
</script>

<style scoped>
.page-settings__grid {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field__hint {
  color: var(--color-muted);
  font-size: 0.82rem;
}

.field--static {
  align-content: start;
}

.static-value {
  background: rgba(0, 0, 0, 0.12);
  border: 1px solid var(--color-border);
  min-height: 3rem;
  padding: 0.75rem 0.85rem;
  word-break: break-word;
}

@media (max-width: 980px) {
  .page-settings__grid {
    grid-template-columns: 1fr;
  }
}
</style>
