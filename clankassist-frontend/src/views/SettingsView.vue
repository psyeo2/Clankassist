<template>
  <section class="page page-settings">
    <header class="page__header">
      <div>
        <p class="page__eyebrow">Settings</p>
        <h1 class="page__title">Control surface</h1>
        <p class="page__lede">Shell-level defaults that should survive as the app grows.</p>
      </div>
    </header>

    <div v-if="isLoading" class="panel">
      <p class="muted-copy">Loading settings.</p>
    </div>

    <template v-else>
      <p v-if="saveMessage" class="inline-message inline-message--success">{{ saveMessage }}</p>

      <div class="page-settings__grid">
        <section class="panel">
          <div class="section-heading">
            <AppIcon icon="cloud-line" />
            <span class="section-heading__title">API</span>
          </div>

          <div class="field-grid">
            <label class="field field--span-2">
              <span class="field__label">Base URL</span>
              <input v-model="settings.apiBaseUrl" class="text-input" type="text" />
            </label>

            <label class="field">
              <span class="field__label">Discovery window (seconds)</span>
              <input v-model.number="settings.discoveryWindowSeconds" class="text-input" type="number" />
            </label>
          </div>
        </section>

        <section class="panel">
          <div class="section-heading">
            <AppIcon icon="settings-2-line" />
            <span class="section-heading__title">Behaviour</span>
          </div>

          <div class="stack-list">
            <label class="stack-list__item toggle-row">
              <input v-model="settings.allowRemoteMcp" type="checkbox" />
              <span>Allow remote MCP bridges</span>
            </label>
            <label class="stack-list__item toggle-row">
              <input v-model="settings.motionEnabled" type="checkbox" />
              <span>Keep interface motion enabled</span>
            </label>
          </div>
        </section>
      </div>

      <div class="action-row">
        <button class="action-button action-button--primary" :disabled="isSaving" type="button" @click="handleSave">
          Save settings
        </button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { getSettings, saveSettings, type AppSettings } from '@/lib/api'

const settings = reactive<AppSettings>({
  apiBaseUrl: '',
  discoveryWindowSeconds: 30,
  allowRemoteMcp: false,
  motionEnabled: true,
})

const isLoading = ref(true)
const isSaving = ref(false)
const saveMessage = ref('')

async function handleSave() {
  isSaving.value = true
  saveMessage.value = ''

  try {
    const savedSettings = await saveSettings({ ...settings })
    Object.assign(settings, savedSettings)
    saveMessage.value = 'Settings saved.'
  } finally {
    isSaving.value = false
  }
}

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

@media (max-width: 980px) {
  .page-settings__grid {
    grid-template-columns: 1fr;
  }
}
</style>
