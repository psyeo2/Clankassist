<template>
  <section class="page page-devices">
    <header class="page__header">
      <div>
        <p class="page__eyebrow">Device management</p>
        <h1 class="page__title">Field roster</h1>
        <p class="page__lede">
          Create managed devices, inspect their state, and issue bearer tokens for edge access.
        </p>
      </div>
    </header>

    <p v-if="errorMessage && !showApiUnavailable" class="inline-message inline-message--danger">
      {{ errorMessage }}
    </p>
    <p v-if="successMessage" class="inline-message inline-message--success">{{ successMessage }}</p>

    <ApiUnavailablePanel v-if="showApiUnavailable" :message="apiAvailability.message" />

    <div v-else class="page-devices__workspace">
      <aside class="panel">
        <div class="section-heading">
          <AppIcon icon="battery-line" />
          <span class="section-heading__title">Managed devices</span>
        </div>

        <div v-if="isLoading" class="stack-list">
          <article class="stack-list__item">
            <p class="muted-copy">Loading devices.</p>
          </article>
        </div>

        <div v-else class="stack-list">
          <button
            v-for="device in devices"
            :key="device.id"
            class="page-devices__device-button"
            :class="{ 'is-active': selectedDeviceId === device.id }"
            type="button"
            @click="selectedDeviceId = device.id"
          >
            <span class="page-devices__device-button-header">
              <strong>{{ device.name }}</strong>
              <span :class="statusClass(device.status)">{{ device.status }}</span>
            </span>
            <span class="muted-copy">{{ device.device_key }}</span>
          </button>

          <article v-if="devices.length === 0" class="stack-list__item">
            <h2 class="stack-list__title">No devices yet</h2>
            <p class="muted-copy">Create the first managed device using the form on the right.</p>
          </article>
        </div>
      </aside>

      <div class="page-devices__column">
        <section class="panel">
          <div class="section-heading">
            <AppIcon icon="add-circle-line" />
            <span class="section-heading__title">Create device</span>
          </div>

          <form class="page-devices__form" @submit.prevent="handleCreateDevice">
            <div class="field-grid">
              <label class="field">
                <span class="field__label">Name</span>
                <input v-model="createForm.name" class="text-input" type="text" />
              </label>

              <label class="field">
                <span class="field__label">Device key</span>
                <input v-model="createForm.deviceKey" class="text-input" type="text" />
              </label>

              <label class="field">
                <span class="field__label">Status</span>
                <select v-model="createForm.status" class="select-input">
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                  <option value="revoked">Revoked</option>
                </select>
              </label>

              <label class="field">
                <span class="field__label">Capabilities</span>
                <input
                  v-model="createForm.capabilities"
                  class="text-input"
                  placeholder="mic,speaker"
                  type="text"
                />
              </label>

              <label class="field field--span-2">
                <span class="field__label">Metadata (JSON)</span>
                <textarea
                  v-model="createForm.metadata"
                  class="text-area"
                  placeholder='{"room":"kitchen"}'
                ></textarea>
              </label>
            </div>

            <button class="action-button action-button--primary" :disabled="isBusy" type="submit">
              Create device
            </button>
          </form>
        </section>

        <section class="panel">
          <div class="section-heading">
            <AppIcon icon="settings-5-line" />
            <span class="section-heading__title">Selected device</span>
          </div>

          <template v-if="selectedDevice">
            <div class="stack-list page-devices__detail-list">
              <article class="stack-list__item">
                <h2 class="stack-list__title">{{ selectedDevice.name }}</h2>
                <p class="muted-copy">{{ selectedDevice.device_key }}</p>
              </article>
              <article class="stack-list__item">
                <h2 class="stack-list__title">Capabilities</h2>
                <p class="muted-copy">{{ formatCapabilities(selectedDevice.capabilities) }}</p>
              </article>
              <article class="stack-list__item">
                <h2 class="stack-list__title">Metadata</h2>
                <pre class="code-block">{{ formatJson(selectedDevice.metadata) }}</pre>
              </article>
            </div>

            <div class="action-row">
              <button
                class="action-button action-button--primary"
                :disabled="isBusy"
                type="button"
                @click="handleIssueToken"
              >
                Create device API key
              </button>
            </div>

            <article v-if="createdToken" class="stack-list__item page-devices__token-card">
              <h2 class="stack-list__title">Latest bearer token</h2>
              <p class="muted-copy">Copy this now. It will not be shown again.</p>
              <textarea class="text-area page-devices__token-output" readonly :value="createdToken"></textarea>
            </article>
          </template>

          <article v-else class="stack-list__item">
            <h2 class="stack-list__title">No device selected</h2>
            <p class="muted-copy">Choose a device from the left to issue tokens and inspect details.</p>
          </article>
        </section>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import ApiUnavailablePanel from '@/components/ApiUnavailablePanel.vue'
import AppIcon from '@/components/AppIcon.vue'
import { apiAvailability } from '@/lib/apiAvailability'
import { createDevice, issueDeviceToken, listDevices, type AdminDeviceRecord } from '@/lib/api'

type DeviceFormState = {
  capabilities: string
  deviceKey: string
  metadata: string
  name: string
  status: AdminDeviceRecord['status']
}

const createEmptyForm = (): DeviceFormState => ({
  capabilities: '',
  deviceKey: '',
  metadata: '{}',
  name: '',
  status: 'approved',
})

const createForm = reactive<DeviceFormState>(createEmptyForm())
const createdToken = ref('')
const devices = ref<AdminDeviceRecord[]>([])
const errorMessage = ref('')
const isBusy = ref(false)
const isLoading = ref(true)
const selectedDeviceId = ref('')
const successMessage = ref('')
const showApiUnavailable = computed(() => !apiAvailability.isReachable)

const selectedDevice = computed(
  () => devices.value.find((device) => device.id === selectedDeviceId.value) ?? null,
)

function statusClass(status: AdminDeviceRecord['status']) {
  const tone =
    status === 'approved'
      ? 'success'
      : status === 'pending'
        ? 'warning'
        : 'danger'

  return `status-pill status-pill--${tone}`
}

function parseJson(text: string) {
  if (!text.trim()) {
    return {}
  }

  return JSON.parse(text) as Record<string, unknown>
}

function parseCapabilities(text: string) {
  return text
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '')
}

function formatCapabilities(value: unknown[]) {
  if (!Array.isArray(value) || value.length === 0) {
    return 'None declared'
  }

  return value.join(', ')
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

async function refreshDevices(preferredId?: string) {
  devices.value = await listDevices()
  if (preferredId && devices.value.some((device) => device.id === preferredId)) {
    selectedDeviceId.value = preferredId
    return
  }

  selectedDeviceId.value = devices.value[0]?.id ?? ''
}

async function handleCreateDevice() {
  isBusy.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const device = await createDevice({
      device_key: createForm.deviceKey.trim(),
      metadata: parseJson(createForm.metadata),
      name: createForm.name.trim(),
      status: createForm.status,
      capabilities: parseCapabilities(createForm.capabilities),
    })

    Object.assign(createForm, createEmptyForm())
    createdToken.value = ''
    await refreshDevices(device.id)
    successMessage.value = 'Device created.'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to create device.'
  } finally {
    isBusy.value = false
  }
}

async function handleIssueToken() {
  if (!selectedDevice.value) {
    return
  }

  isBusy.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const token = await issueDeviceToken(selectedDevice.value.id, {
      name: `${selectedDevice.value.name} key`,
    })

    createdToken.value = token.bearer_token
    successMessage.value = 'Device API key created.'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to create device API key.'
  } finally {
    isBusy.value = false
  }
}

onMounted(async () => {
  try {
    await refreshDevices()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load devices.'
  } finally {
    isLoading.value = false
  }
})
</script>

<style scoped>
.page-devices__workspace {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: minmax(18rem, 0.9fr) minmax(0, 1.4fr);
}

.page-devices__column {
  display: grid;
  gap: 1.25rem;
}

.page-devices__device-button {
  background: transparent;
  border: 1px solid var(--color-border);
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 0.45rem;
  padding: 0.85rem 0.95rem;
  text-align: left;
}

.page-devices__device-button.is-active,
.page-devices__device-button:hover {
  border-color: var(--color-primary);
}

.page-devices__device-button-header {
  align-items: center;
  display: flex;
  gap: 0.75rem;
  justify-content: space-between;
}

.page-devices__form {
  display: grid;
  gap: 1rem;
}

.page-devices__detail-list {
  margin-bottom: 1rem;
}

.page-devices__token-card {
  margin-top: 1rem;
}

.page-devices__token-output {
  min-height: 7rem;
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
  .page-devices__workspace {
    grid-template-columns: 1fr;
  }
}
</style>
