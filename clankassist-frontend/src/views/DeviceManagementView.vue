<template>
  <section class="page page-devices">
    <header class="page__header">
      <div>
        <p class="page__eyebrow">Device management</p>
        <h1 class="page__title">Field roster</h1>
        <p class="page__lede">Monitor active units, update their labels, and run discovery sweeps.</p>
      </div>

      <div class="page-devices__header-actions">
        <AppIconButton
          color="var(--color-accent)"
          icon="loop-right-line"
          :action="runDiscoverySweep"
          :disabled="isBusy"
          label="Run discovery"
          title="Run discovery"
        />
        <span class="muted-copy">Discovery queue: {{ workspace?.discoveryPool.length ?? 0 }}</span>
      </div>
    </header>

    <div class="metric-strip">
      <article class="metric-block">
        <p class="metric-block__label">Total devices</p>
        <p class="metric-block__value">{{ deviceStats.total }}</p>
      </article>
      <article class="metric-block">
        <p class="metric-block__label">Online</p>
        <p class="metric-block__value">{{ deviceStats.online }}</p>
      </article>
      <article class="metric-block">
        <p class="metric-block__label">Warnings</p>
        <p class="metric-block__value">{{ deviceStats.warnings }}</p>
      </article>
    </div>

    <p v-if="saveMessage" class="inline-message inline-message--success">{{ saveMessage }}</p>

    <div v-if="isLoading" class="panel">
      <p class="muted-copy">Loading device roster.</p>
    </div>

    <template v-else-if="workspace">
      <div class="page-devices__workspace">
        <aside class="panel">
          <div class="section-heading">
            <AppIcon icon="battery-line" />
            <span class="section-heading__title">Inventory</span>
          </div>

          <div class="stack-list">
            <button
              v-for="device in workspace.devices"
              :key="device.id"
              class="page-devices__device-button"
              :class="{ 'is-active': selectedDeviceId === device.id }"
              type="button"
              @click="selectDevice(device.id)"
            >
              <span class="page-devices__device-button-header">
                <strong>{{ device.name }}</strong>
                <span :class="statusClass(device.status)">{{ device.status }}</span>
              </span>
              <span class="muted-copy">{{ device.category }} · {{ device.connection }}</span>
            </button>
          </div>
        </aside>

        <section class="panel">
          <div class="section-heading">
            <AppIcon icon="settings-5-line" />
            <span class="section-heading__title">Edit device</span>
          </div>

          <form v-if="selectedDevice" class="page-devices__form" @submit.prevent="handleSaveDevice">
            <div class="field-grid">
              <label class="field">
                <span class="field__label">Name</span>
                <input v-model="deviceEditor.name" class="text-input" type="text" />
              </label>

              <label class="field">
                <span class="field__label">Location</span>
                <input v-model="deviceEditor.location" class="text-input" type="text" />
              </label>

              <label class="field">
                <span class="field__label">Status</span>
                <select v-model="deviceEditor.status" class="select-input">
                  <option value="online">Online</option>
                  <option value="idle">Idle</option>
                  <option value="warning">Warning</option>
                  <option value="offline">Offline</option>
                </select>
              </label>

              <div class="field">
                <span class="field__label">Signal</span>
                <p class="muted-copy page-devices__readout">
                  {{ selectedDevice.connection }} · {{ selectedDevice.battery }}%
                </p>
              </div>

              <label class="field field--span-2">
                <span class="field__label">Notes</span>
                <textarea v-model="deviceEditor.notes" class="text-area"></textarea>
              </label>
            </div>

            <div class="action-row">
              <button class="action-button action-button--primary" :disabled="isBusy" type="submit">
                Save device
              </button>
              <p class="muted-copy">Last seen {{ selectedDevice.lastSeen }}</p>
            </div>
          </form>
        </section>
      </div>

      <section class="panel">
        <div class="section-heading">
          <AppIcon icon="download-line" />
          <span class="section-heading__title">Discovery queue</span>
        </div>

        <div class="stack-list">
          <article
            v-for="candidate in workspace.discoveryPool"
            :key="candidate.id"
            class="stack-list__item"
          >
            <div class="stack-list__title-row">
              <h2 class="stack-list__title">{{ candidate.name }}</h2>
              <span :class="statusClass(candidate.status)">{{ candidate.status }}</span>
            </div>
            <p class="muted-copy">{{ candidate.category }} · {{ candidate.location }}</p>
            <p class="muted-copy">{{ candidate.notes }}</p>
          </article>

          <article v-if="workspace.discoveryPool.length === 0" class="stack-list__item">
            <h2 class="stack-list__title">No pending candidates</h2>
            <p class="muted-copy">The last sweep consumed everything in the discovery queue.</p>
          </article>
        </div>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import AppIconButton from '@/components/AppIconButton.vue'
import {
  discoverDevices,
  getDeviceWorkspace,
  updateDevice,
  type DeviceRecord,
  type DeviceStatus,
  type DeviceWorkspace,
} from '@/lib/api'

type DeviceEditorState = Pick<DeviceRecord, 'location' | 'name' | 'notes' | 'status'>

const workspace = ref<DeviceWorkspace | null>(null)
const isLoading = ref(true)
const isBusy = ref(false)
const saveMessage = ref('')
const selectedDeviceId = ref('')

function createEmptyDeviceEditor(): DeviceEditorState {
  return {
    name: '',
    location: '',
    notes: '',
    status: 'idle',
  }
}

const deviceEditor = reactive<DeviceEditorState>(createEmptyDeviceEditor())

const selectedDevice = computed(() => {
  return workspace.value?.devices.find((device) => device.id === selectedDeviceId.value) ?? null
})

const deviceStats = computed(() => {
  const devices = workspace.value?.devices ?? []

  return {
    total: devices.length,
    online: devices.filter((device) => device.status === 'online').length,
    warnings: devices.filter((device) => device.status === 'warning').length,
  }
})

function statusClass(status: DeviceStatus) {
  return `status-pill status-pill--${status}`
}

function hydrateEditor(device: DeviceRecord | null) {
  if (!device) {
    Object.assign(deviceEditor, createEmptyDeviceEditor())
    return
  }

  Object.assign(deviceEditor, {
    name: device.name,
    location: device.location,
    notes: device.notes,
    status: device.status,
  })
}

function selectDevice(deviceId: string) {
  selectedDeviceId.value = deviceId
  hydrateEditor(workspace.value?.devices.find((device) => device.id === deviceId) ?? null)
}

async function refreshWorkspace(selectedId?: string) {
  workspace.value = await getDeviceWorkspace()

  const fallbackId = workspace.value.devices[0]?.id ?? ''
  const nextSelectedId = selectedId && workspace.value.devices.some((device) => device.id === selectedId)
    ? selectedId
    : fallbackId

  selectedDeviceId.value = nextSelectedId
  hydrateEditor(workspace.value.devices.find((device) => device.id === nextSelectedId) ?? null)
}

async function runDiscoverySweep() {
  isBusy.value = true
  saveMessage.value = ''

  try {
    workspace.value = await discoverDevices()

    if (!selectedDeviceId.value && workspace.value.devices[0]) {
      selectDevice(workspace.value.devices[0].id)
    }

    saveMessage.value = 'Discovery sweep completed.'
  } finally {
    isBusy.value = false
  }
}

async function handleSaveDevice() {
  if (!selectedDeviceId.value) {
    return
  }

  isBusy.value = true
  saveMessage.value = ''

  try {
    await updateDevice(selectedDeviceId.value, { ...deviceEditor })
    await refreshWorkspace(selectedDeviceId.value)
    saveMessage.value = 'Device details saved.'
  } finally {
    isBusy.value = false
  }
}

onMounted(async () => {
  await refreshWorkspace()
  isLoading.value = false
})
</script>

<style scoped>
.page-devices__header-actions {
  align-items: center;
  display: inline-flex;
  gap: 0.8rem;
}

.page-devices__workspace {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: minmax(18rem, 0.85fr) minmax(0, 1.4fr);
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

.page-devices__readout {
  align-items: center;
  border: 1px solid var(--color-border);
  display: flex;
  min-height: 3rem;
  padding: 0.75rem 0.85rem;
}

@media (max-width: 1080px) {
  .page-devices__workspace {
    grid-template-columns: 1fr;
  }
}
</style>
