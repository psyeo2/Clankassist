<template>
  <section class="page page-manual">
    <header class="page__header">
      <div>
        <p class="page__eyebrow">Manual API</p>
        <h1 class="page__title">Manual API</h1>
        <p class="page__lede">
          Use your current admin session to test the same orchestration path as `/respond` without
          minting a device token.
        </p>
      </div>
    </header>

    <p v-if="errorMessage && !showApiUnavailable" class="inline-message inline-message--danger">
      {{ errorMessage }}
    </p>
    <p v-if="successMessage" class="inline-message inline-message--success">{{ successMessage }}</p>

    <ApiUnavailablePanel v-if="showApiUnavailable" :message="apiAvailability.message" />

    <template v-else>
      <div class="page-manual__layout">
      <section class="panel">
        <div class="section-heading">
          <AppIcon icon="account-circle-line" />
          <span class="section-heading__title">Session mode</span>
        </div>

        <article class="stack-list__item">
          <h2 class="stack-list__title">Admin-only test route</h2>
          <p class="muted-copy">
            Requests from this page go to <code>/api/v1/admin/test/respond</code> and use your
            logged-in admin bearer session. Real edge devices should still use
            <code>/api/v1/respond</code> with device bearer tokens.
          </p>
        </article>
      </section>

      <section class="panel">
        <div class="section-heading">
          <AppIcon icon="play-circle-line" />
          <span class="section-heading__title">Call /admin/test/respond</span>
        </div>

        <div class="segmented-control">
          <button
            class="segmented-control__button"
            :class="{ 'is-active': inputMode === 'text' }"
            type="button"
            @click="inputMode = 'text'"
          >
            Text input
          </button>
          <button
            class="segmented-control__button"
            :class="{ 'is-active': inputMode === 'audio' }"
            type="button"
            @click="inputMode = 'audio'"
          >
            Audio upload
          </button>
        </div>

        <form class="page-manual__form" @submit.prevent="handleRunRequest">
          <div class="field-grid">
            <label class="field">
              <span class="field__label">Output type</span>
              <select v-model="outputType" class="select-input">
                <option value="json">json</option>
                <option value="text">text</option>
                <option value="audio">audio</option>
              </select>
            </label>

            <label v-if="inputMode === 'audio'" class="field">
              <span class="field__label">Audio file</span>
              <input
                class="text-input page-manual__file-input"
                type="file"
                accept="audio/*"
                @change="handleFileChange"
              />
            </label>

            <label v-else class="field field--span-2">
              <span class="field__label">Speech text</span>
              <textarea
                v-model="textInput"
                class="text-area"
                placeholder="what temp is my gpu?"
              ></textarea>
            </label>
          </div>

          <button class="action-button action-button--primary" :disabled="isBusy" type="submit">
            Send request
          </button>
        </form>
      </section>
      </div>

      <section class="panel">
        <div class="section-heading">
          <AppIcon icon="record-circle-line" />
          <span class="section-heading__title">Response</span>
        </div>

        <article v-if="responseState.kind === 'empty'" class="stack-list__item">
          <h2 class="stack-list__title">No response yet</h2>
          <p class="muted-copy">Run a request to inspect the orchestrator output here.</p>
        </article>

        <article v-else-if="responseState.kind === 'json'" class="stack-list__item">
          <h2 class="stack-list__title">JSON response</h2>
          <pre class="code-block">{{ responseState.value }}</pre>
        </article>

        <article v-else-if="responseState.kind === 'text'" class="stack-list__item">
          <h2 class="stack-list__title">Text response</h2>
          <pre class="code-block">{{ responseState.value }}</pre>
        </article>

        <article v-else class="stack-list__item page-manual__audio-response">
          <h2 class="stack-list__title">Audio response</h2>
          <audio class="page-manual__audio" controls :src="responseState.value"></audio>
          <a class="action-button" :href="responseState.value" download="response.wav">Download audio</a>
        </article>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import ApiUnavailablePanel from '@/components/ApiUnavailablePanel.vue'
import AppIcon from '@/components/AppIcon.vue'
import { apiAvailability } from '@/lib/apiAvailability'
import {
  callAdminTestRespondAudio,
  callAdminTestRespondText,
  type RespondResult,
} from '@/lib/api'

type InputMode = 'audio' | 'text'
type OutputType = 'audio' | 'json' | 'text'
type ResponseState =
  | { kind: 'audio'; value: string }
  | { kind: 'empty'; value: '' }
  | { kind: 'json'; value: string }
  | { kind: 'text'; value: string }

const errorMessage = ref('')
const inputMode = ref<InputMode>('text')
const isBusy = ref(false)
const outputType = ref<OutputType>('json')
const responseState = ref<ResponseState>({ kind: 'empty', value: '' })
const selectedFile = ref<File | null>(null)
const successMessage = ref('')
const textInput = ref('')
const showApiUnavailable = computed(() => !apiAvailability.isReachable)

function revokeAudioUrl() {
  if (responseState.value.kind === 'audio') {
    URL.revokeObjectURL(responseState.value.value)
  }
}

function setResponse(result: RespondResult) {
  revokeAudioUrl()

  if (result.audioUrl) {
    responseState.value = {
      kind: 'audio',
      value: result.audioUrl,
    }
    return
  }

  if (result.text !== undefined) {
    responseState.value = {
      kind: 'text',
      value: result.text,
    }
    return
  }

  responseState.value = {
    kind: 'json',
    value: JSON.stringify(result.json, null, 2),
  }
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  selectedFile.value = target.files?.[0] ?? null
}

async function handleRunRequest() {
  isBusy.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    let result: RespondResult

    if (inputMode.value === 'audio') {
      if (!selectedFile.value) {
        throw new Error('Select an audio file first.')
      }

      result = await callAdminTestRespondAudio({
        file: selectedFile.value,
        output: outputType.value,
      })
    } else {
      if (!textInput.value.trim()) {
        throw new Error('Enter some text first.')
      }

      result = await callAdminTestRespondText({
        output: outputType.value,
        text: textInput.value.trim(),
      })
    }

    setResponse(result)
    successMessage.value = 'Request completed.'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to run request.'
  } finally {
    isBusy.value = false
  }
}

onBeforeUnmount(() => {
  revokeAudioUrl()
})
</script>

<style scoped>
.page-manual__layout {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.page-manual__form {
  display: grid;
  gap: 1rem;
  margin-top: 1rem;
}

.page-manual__file-input {
  padding-block: 0.55rem;
}

.page-manual__audio {
  display: block;
  width: 100%;
}

.page-manual__audio-response {
  align-content: start;
  grid-auto-rows: max-content;
}

.code-block {
  background: rgba(0, 0, 0, 0.16);
  border: 1px solid var(--color-border);
  margin: 0;
  overflow: auto;
  padding: 0.9rem;
  white-space: pre-wrap;
}

@media (max-width: 1080px) {
  .page-manual__layout {
    grid-template-columns: 1fr;
  }
}
</style>
