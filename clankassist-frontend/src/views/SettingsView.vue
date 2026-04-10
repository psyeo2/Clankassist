<template>
  <section class="page page-settings">
    <header class="page__header">
      <div>
        <p class="page__eyebrow">Settings</p>
        <h1 class="page__title">Control surface</h1>
        <p class="page__lede">Frontend-only settings for the admin shell.</p>
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
            <label class="field field--span-2">
              <span class="field__label">Base URL</span>
              <input
                v-model="settings.apiBaseUrl"
                class="text-input text-input--disabled"
                disabled
                type="text"
              />
              <span class="field__hint">Temporarily disabled. Browser-stored API targeting will be revisited later.</span>
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
          </div>
        </section>
      </div>

      <div class="action-row">
        <button
          class="action-button action-button--primary"
          disabled
          type="button"
        >
          Save settings
        </button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { getSettings, type AppSettings } from '@/lib/api'

const settings = reactive<AppSettings>({
  apiBaseUrl: '',
})

const isLoading = ref(true)

onMounted(async () => {
  Object.assign(settings, await getSettings())
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

.text-input--disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 980px) {
  .page-settings__grid {
    grid-template-columns: 1fr;
  }
}
</style>
