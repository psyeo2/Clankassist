<template>
  <section class="page page-mcp">
    <header class="page__header">
      <div>
        <p class="page__eyebrow">MCP management</p>
        <h1 class="page__title">Tool fabric</h1>
        <p class="page__lede">
          Create integrations, stage tool and resource versions, and publish catalog entries to
          the orchestrator database.
        </p>
      </div>

      <div class="metric-strip page-mcp__summary">
        <article class="metric-block">
          <p class="metric-block__label">Integrations</p>
          <p class="metric-block__value">{{ integrations.length }}</p>
        </article>
        <article class="metric-block">
          <p class="metric-block__label">Tools</p>
          <p class="metric-block__value">{{ tools.length }}</p>
        </article>
        <article class="metric-block">
          <p class="metric-block__label">Resources</p>
          <p class="metric-block__value">{{ resources.length }}</p>
        </article>
      </div>
    </header>

    <section class="panel">
      <div class="segmented-control">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="segmented-control__button"
          :class="{ 'is-active': activeTab === tab.id }"
          type="button"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
    </section>

    <p v-if="errorMessage" class="inline-message inline-message--danger">{{ errorMessage }}</p>
    <p v-if="successMessage" class="inline-message inline-message--success">{{ successMessage }}</p>

    <div v-if="isLoading" class="panel">
      <p class="muted-copy">Loading catalog workspace.</p>
    </div>

    <template v-else>
      <section v-if="activeTab === 'integrations'" class="page-mcp__workspace">
        <aside class="panel">
          <div class="section-heading">
            <AppIcon icon="cloud-line" />
            <span class="section-heading__title">Current integrations</span>
          </div>

          <div class="stack-list">
            <article v-for="integration in integrations" :key="integration.id" class="stack-list__item">
              <div class="stack-list__title-row">
                <h2 class="stack-list__title">{{ integration.display_name }}</h2>
                <span class="status-pill" :class="integration.enabled ? 'status-pill--success' : 'status-pill--danger'">
                  {{ integration.enabled ? 'enabled' : 'disabled' }}
                </span>
              </div>
              <p class="muted-copy">{{ integration.key }} · {{ integration.base_url_env_var }}</p>
              <p class="muted-copy">{{ integration.description || 'No description.' }}</p>
            </article>
          </div>
        </aside>

        <section class="panel">
          <div class="section-heading">
            <AppIcon icon="add-circle-line" />
            <span class="section-heading__title">Create integration</span>
          </div>

          <form class="page-mcp__form" @submit.prevent="handleCreateIntegration">
            <div class="field-grid">
              <label class="field">
                <span class="field__label">Key</span>
                <input v-model="integrationForm.key" class="text-input" type="text" />
              </label>

              <label class="field">
                <span class="field__label">Display name</span>
                <input v-model="integrationForm.displayName" class="text-input" type="text" />
              </label>

              <label class="field">
                <span class="field__label">Base URL env var</span>
                <input v-model="integrationForm.baseUrlEnvVar" class="text-input" type="text" />
              </label>

              <label class="field">
                <span class="field__label">Auth strategy</span>
                <select v-model="integrationForm.authStrategy" class="select-input">
                  <option value="none">none</option>
                  <option value="bearer_env">bearer_env</option>
                  <option value="api_key_header_env">api_key_header_env</option>
                  <option value="api_key_query_env">api_key_query_env</option>
                  <option value="basic_env">basic_env</option>
                </select>
              </label>

              <label class="field">
                <span class="field__label">Allowed hosts</span>
                <input
                  v-model="integrationForm.allowedHosts"
                  class="text-input"
                  placeholder="192.168.1.161:9400"
                  type="text"
                />
              </label>

              <label class="field">
                <span class="field__label">Timeout ms</span>
                <input v-model.number="integrationForm.timeoutMs" class="text-input" type="number" />
              </label>

              <label class="field field--span-2">
                <span class="field__label">Description</span>
                <textarea v-model="integrationForm.description" class="text-area"></textarea>
              </label>

              <label class="field field--span-2">
                <span class="field__label">Auth config (JSON)</span>
                <textarea v-model="integrationForm.authConfig" class="text-area"></textarea>
              </label>
            </div>

            <button class="action-button action-button--primary" :disabled="isBusy" type="submit">
              Create integration
            </button>
          </form>
        </section>
      </section>

      <section v-else-if="activeTab === 'tools'" class="page-mcp__workspace">
        <aside class="panel">
          <div class="section-heading">
            <AppIcon icon="database-2-line" />
            <span class="section-heading__title">Current tools</span>
          </div>

          <div class="stack-list">
            <button
              v-for="tool in tools"
              :key="tool.id"
              class="page-mcp__selection-button"
              :class="{ 'is-active': selectedToolId === tool.id }"
              type="button"
              @click="selectTool(tool.id)"
            >
              <span class="page-mcp__selection-header">
                <strong>{{ tool.name }}</strong>
                <span
                  class="status-pill"
                  :class="tool.published_version_number ? 'status-pill--success' : 'status-pill--warning'"
                >
                  {{ tool.published_version_number ? `v${tool.published_version_number}` : 'unpublished' }}
                </span>
              </span>
              <span class="muted-copy">{{ tool.integration_display_name }}</span>
            </button>
          </div>
        </aside>

        <div class="page-mcp__column">
          <section class="panel">
            <div class="section-heading">
              <AppIcon icon="add-circle-line" />
              <span class="section-heading__title">Create tool</span>
            </div>

            <form class="page-mcp__form" @submit.prevent="handleCreateTool">
              <div class="field-grid">
                <label class="field">
                  <span class="field__label">Tool name</span>
                  <input v-model="toolForm.name" class="text-input" type="text" />
                </label>

                <label class="field">
                  <span class="field__label">Integration</span>
                  <select v-model="toolForm.integrationId" class="select-input">
                    <option value="">Select integration</option>
                    <option v-for="integration in integrations" :key="integration.id" :value="integration.id">
                      {{ integration.display_name }}
                    </option>
                  </select>
                </label>
              </div>

              <button class="action-button action-button--primary" :disabled="isBusy" type="submit">
                Create tool
              </button>
            </form>
          </section>

          <section class="panel">
            <div class="section-heading">
              <AppIcon icon="settings-line" />
              <span class="section-heading__title">Selected tool versions</span>
            </div>

            <template v-if="selectedTool">
              <div class="stack-list page-mcp__version-list">
                <article v-for="version in toolVersions" :key="version.id" class="stack-list__item">
                  <div class="stack-list__title-row">
                    <h2 class="stack-list__title">v{{ version.version_number }}</h2>
                    <span :class="statusClass(version.status)">{{ version.status }}</span>
                  </div>
                  <p class="muted-copy">{{ version.description }}</p>
                  <div class="action-row">
                    <button
                      class="action-button"
                      :disabled="isBusy"
                      type="button"
                      @click="handlePublishToolVersion(version.version_number)"
                    >
                      Publish version
                    </button>
                  </div>
                </article>

                <article v-if="toolVersions.length === 0" class="stack-list__item">
                  <h2 class="stack-list__title">No versions yet</h2>
                  <p class="muted-copy">Create the first tool version below.</p>
                </article>
              </div>

              <form class="page-mcp__form" @submit.prevent="handleCreateToolVersion">
                <div class="field-grid">
                  <label class="field field--span-2">
                    <span class="field__label">Description</span>
                    <textarea v-model="toolVersionForm.description" class="text-area"></textarea>
                  </label>

                  <label class="field field--span-2">
                    <span class="field__label">Execution summary</span>
                    <textarea v-model="toolVersionForm.executionSummary" class="text-area"></textarea>
                  </label>

                  <label class="field field--span-2">
                    <span class="field__label">Input schema (JSON)</span>
                    <textarea v-model="toolVersionForm.inputSchema" class="text-area"></textarea>
                  </label>

                  <label class="field field--span-2">
                    <span class="field__label">Result schema (JSON)</span>
                    <textarea v-model="toolVersionForm.resultSchema" class="text-area"></textarea>
                  </label>

                  <label class="field field--span-2">
                    <span class="field__label">Execution spec (JSON)</span>
                    <textarea v-model="toolVersionForm.executionSpec" class="text-area"></textarea>
                  </label>

                  <label class="field">
                    <span class="field__label">Status</span>
                    <select v-model="toolVersionForm.status" class="select-input">
                      <option value="draft">draft</option>
                      <option value="validated">validated</option>
                      <option value="archived">archived</option>
                    </select>
                  </label>
                </div>

                <button class="action-button action-button--primary" :disabled="isBusy" type="submit">
                  Create tool version
                </button>
              </form>
            </template>

            <article v-else class="stack-list__item">
              <h2 class="stack-list__title">No tool selected</h2>
              <p class="muted-copy">Select a tool from the left to inspect and publish versions.</p>
            </article>
          </section>
        </div>
      </section>

      <section v-else class="page-mcp__workspace">
        <aside class="panel">
          <div class="section-heading">
            <AppIcon icon="download-line" />
            <span class="section-heading__title">Current resources</span>
          </div>

          <div class="stack-list">
            <button
              v-for="resource in resources"
              :key="resource.id"
              class="page-mcp__selection-button"
              :class="{ 'is-active': selectedResourceId === resource.id }"
              type="button"
              @click="selectResource(resource.id)"
            >
              <span class="page-mcp__selection-header">
                <strong>{{ resource.name }}</strong>
                <span
                  class="status-pill"
                  :class="resource.published_version_number ? 'status-pill--success' : 'status-pill--warning'"
                >
                  {{ resource.published_version_number ? `v${resource.published_version_number}` : 'unpublished' }}
                </span>
              </span>
              <span class="muted-copy">{{ resource.uri }}</span>
            </button>
          </div>
        </aside>

        <div class="page-mcp__column">
          <section class="panel">
            <div class="section-heading">
              <AppIcon icon="add-circle-line" />
              <span class="section-heading__title">Create resource</span>
            </div>

            <form class="page-mcp__form" @submit.prevent="handleCreateResource">
              <div class="field-grid">
                <label class="field">
                  <span class="field__label">Name</span>
                  <input v-model="resourceForm.name" class="text-input" type="text" />
                </label>

                <label class="field">
                  <span class="field__label">URI</span>
                  <input v-model="resourceForm.uri" class="text-input" type="text" />
                </label>

                <label class="field field--span-2">
                  <span class="field__label">Description</span>
                  <textarea v-model="resourceForm.description" class="text-area"></textarea>
                </label>
              </div>

              <button class="action-button action-button--primary" :disabled="isBusy" type="submit">
                Create resource
              </button>
            </form>
          </section>

          <section class="panel">
            <div class="section-heading">
              <AppIcon icon="settings-line" />
              <span class="section-heading__title">Selected resource versions</span>
            </div>

            <template v-if="selectedResource">
              <div class="stack-list page-mcp__version-list">
                <article v-for="version in resourceVersions" :key="version.id" class="stack-list__item">
                  <div class="stack-list__title-row">
                    <h2 class="stack-list__title">v{{ version.version_number }}</h2>
                    <span :class="statusClass(version.status)">{{ version.status }}</span>
                  </div>
                  <p class="muted-copy">{{ version.load_mode }} load</p>
                  <div class="action-row">
                    <button
                      class="action-button"
                      :disabled="isBusy"
                      type="button"
                      @click="handlePublishResourceVersion(version.version_number)"
                    >
                      Publish version
                    </button>
                  </div>
                </article>

                <article v-if="resourceVersions.length === 0" class="stack-list__item">
                  <h2 class="stack-list__title">No versions yet</h2>
                  <p class="muted-copy">Create the first resource version below.</p>
                </article>
              </div>

              <form class="page-mcp__form" @submit.prevent="handleCreateResourceVersion">
                <div class="field-grid">
                  <label class="field">
                    <span class="field__label">Load mode</span>
                    <select v-model="resourceVersionForm.loadMode" class="select-input">
                      <option value="static">static</option>
                      <option value="http">http</option>
                    </select>
                  </label>

                  <label class="field">
                    <span class="field__label">Status</span>
                    <select v-model="resourceVersionForm.status" class="select-input">
                      <option value="draft">draft</option>
                      <option value="validated">validated</option>
                      <option value="archived">archived</option>
                    </select>
                  </label>

                  <label class="field field--span-2">
                    <span class="field__label">Text content</span>
                    <textarea v-model="resourceVersionForm.textContent" class="text-area"></textarea>
                  </label>

                  <label class="field field--span-2">
                    <span class="field__label">Load spec (JSON)</span>
                    <textarea v-model="resourceVersionForm.loadSpec" class="text-area"></textarea>
                  </label>
                </div>

                <button class="action-button action-button--primary" :disabled="isBusy" type="submit">
                  Create resource version
                </button>
              </form>
            </template>

            <article v-else class="stack-list__item">
              <h2 class="stack-list__title">No resource selected</h2>
              <p class="muted-copy">Select a resource from the left to inspect and publish versions.</p>
            </article>
          </section>
        </div>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import {
  createIntegration,
  createResource,
  createResourceVersion,
  createTool,
  createToolVersion,
  listIntegrations,
  listResources,
  listResourceVersions,
  listTools,
  listToolVersions,
  publishResourceVersion,
  publishToolVersion,
  type IntegrationRecord,
  type ResourceRecord,
  type ResourceVersionRecord,
  type ToolRecord,
  type ToolVersionRecord,
} from '@/lib/api'

type TabId = 'integrations' | 'resources' | 'tools'

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'integrations', label: 'Integrations' },
  { id: 'tools', label: 'Tools' },
  { id: 'resources', label: 'Resources' },
]

const integrations = ref<IntegrationRecord[]>([])
const isBusy = ref(false)
const isLoading = ref(true)
const errorMessage = ref('')
const successMessage = ref('')
const tools = ref<ToolRecord[]>([])
const toolVersions = ref<ToolVersionRecord[]>([])
const resources = ref<ResourceRecord[]>([])
const resourceVersions = ref<ResourceVersionRecord[]>([])
const activeTab = ref<TabId>('tools')
const selectedToolId = ref('')
const selectedResourceId = ref('')

const selectedTool = computed(() => tools.value.find((tool) => tool.id === selectedToolId.value) ?? null)
const selectedResource = computed(
  () => resources.value.find((resource) => resource.id === selectedResourceId.value) ?? null,
)

const integrationForm = reactive({
  key: '',
  displayName: '',
  baseUrlEnvVar: '',
  authStrategy: 'none' as IntegrationRecord['auth_strategy'],
  allowedHosts: '',
  timeoutMs: 10000,
  description: '',
  authConfig: '{}',
})

const toolForm = reactive({
  name: '',
  integrationId: '',
})

const toolVersionForm = reactive({
  description: '',
  executionSummary: '',
  inputSchema: '{"type":"object","properties":{},"additionalProperties":false}',
  resultSchema: '{"type":"object","properties":{},"additionalProperties":true}',
  executionSpec: '{}',
  status: 'draft' as ToolVersionRecord['status'],
})

const resourceForm = reactive({
  name: '',
  uri: '',
  description: '',
})

const resourceVersionForm = reactive({
  loadMode: 'static' as ResourceVersionRecord['load_mode'],
  loadSpec: '{}',
  status: 'draft' as ResourceVersionRecord['status'],
  textContent: '',
})

function parseJson(text: string, label: string) {
  try {
    if (!text.trim()) {
      return {}
    }

    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`${label} must be valid JSON.`)
  }
}

function statusClass(status: string) {
  const tone =
    status === 'published'
      ? 'success'
      : status === 'validated'
        ? 'info'
        : status === 'draft'
          ? 'warning'
          : 'danger'

  return `status-pill status-pill--${tone}`
}

async function refreshCatalog() {
  const [nextIntegrations, nextTools, nextResources] = await Promise.all([
    listIntegrations(),
    listTools(),
    listResources(),
  ])

  integrations.value = nextIntegrations
  tools.value = nextTools
  resources.value = nextResources

  if (!selectedToolId.value && tools.value[0]) {
    selectedToolId.value = tools.value[0].id
  }

  if (!selectedResourceId.value && resources.value[0]) {
    selectedResourceId.value = resources.value[0].id
  }

  await Promise.all([refreshToolVersions(), refreshResourceVersions()])
}

async function refreshToolVersions() {
  if (!selectedToolId.value) {
    toolVersions.value = []
    return
  }

  toolVersions.value = await listToolVersions(selectedToolId.value)
}

async function refreshResourceVersions() {
  if (!selectedResourceId.value) {
    resourceVersions.value = []
    return
  }

  resourceVersions.value = await listResourceVersions(selectedResourceId.value)
}

async function selectTool(toolId: string) {
  selectedToolId.value = toolId
  await refreshToolVersions()
}

async function selectResource(resourceId: string) {
  selectedResourceId.value = resourceId
  await refreshResourceVersions()
}

async function withAction(action: () => Promise<void>, successText: string) {
  isBusy.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    await action()
    successMessage.value = successText
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Request failed.'
  } finally {
    isBusy.value = false
  }
}

async function handleCreateIntegration() {
  await withAction(async () => {
    await createIntegration({
      key: integrationForm.key.trim(),
      display_name: integrationForm.displayName.trim(),
      description: integrationForm.description.trim(),
      base_url_env_var: integrationForm.baseUrlEnvVar.trim(),
      auth_strategy: integrationForm.authStrategy,
      auth_config: parseJson(integrationForm.authConfig, 'Auth config'),
      allowed_hosts: integrationForm.allowedHosts
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value !== ''),
      timeout_ms: integrationForm.timeoutMs,
    })

    integrationForm.key = ''
    integrationForm.displayName = ''
    integrationForm.baseUrlEnvVar = ''
    integrationForm.description = ''
    integrationForm.authConfig = '{}'
    integrationForm.allowedHosts = ''
    await refreshCatalog()
  }, 'Integration created.')
}

async function handleCreateTool() {
  await withAction(async () => {
    const created = await createTool({
      name: toolForm.name.trim(),
      integration_id: toolForm.integrationId,
    })

    toolForm.name = ''
    await refreshCatalog()
    await selectTool(created.id)
  }, 'Tool created.')
}

async function handleCreateToolVersion() {
  if (!selectedToolId.value) {
    return
  }

  await withAction(async () => {
    await createToolVersion(selectedToolId.value, {
      description: toolVersionForm.description.trim(),
      execution_summary: toolVersionForm.executionSummary.trim(),
      input_schema: parseJson(toolVersionForm.inputSchema, 'Input schema'),
      result_schema: parseJson(toolVersionForm.resultSchema, 'Result schema'),
      execution_spec: parseJson(toolVersionForm.executionSpec, 'Execution spec'),
      status: toolVersionForm.status === 'published' ? 'draft' : toolVersionForm.status,
    })

    await refreshCatalog()
    await refreshToolVersions()
  }, 'Tool version created.')
}

async function handlePublishToolVersion(versionNumber: number) {
  if (!selectedToolId.value) {
    return
  }

  await withAction(async () => {
    await publishToolVersion(selectedToolId.value, {
      version_number: versionNumber,
    })

    await refreshCatalog()
    await refreshToolVersions()
  }, `Tool version v${versionNumber} published.`)
}

async function handleCreateResource() {
  await withAction(async () => {
    const created = await createResource({
      name: resourceForm.name.trim(),
      uri: resourceForm.uri.trim(),
      description: resourceForm.description.trim(),
    })

    resourceForm.name = ''
    resourceForm.uri = ''
    resourceForm.description = ''
    await refreshCatalog()
    await selectResource(created.id)
  }, 'Resource created.')
}

async function handleCreateResourceVersion() {
  if (!selectedResourceId.value) {
    return
  }

  await withAction(async () => {
    await createResourceVersion(selectedResourceId.value, {
      load_mode: resourceVersionForm.loadMode,
      load_spec: parseJson(resourceVersionForm.loadSpec, 'Load spec'),
      status: resourceVersionForm.status === 'published' ? 'draft' : resourceVersionForm.status,
      text_content: resourceVersionForm.textContent,
    })

    await refreshCatalog()
    await refreshResourceVersions()
  }, 'Resource version created.')
}

async function handlePublishResourceVersion(versionNumber: number) {
  if (!selectedResourceId.value) {
    return
  }

  await withAction(async () => {
    await publishResourceVersion(selectedResourceId.value, {
      version_number: versionNumber,
    })

    await refreshCatalog()
    await refreshResourceVersions()
  }, `Resource version v${versionNumber} published.`)
}

onMounted(async () => {
  try {
    await refreshCatalog()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load catalog.'
  } finally {
    isLoading.value = false
  }
})
</script>

<style scoped>
.page-mcp__summary {
  max-width: 34rem;
}

.page-mcp__workspace {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: minmax(18rem, 0.9fr) minmax(0, 1.45fr);
}

.page-mcp__column {
  display: grid;
  gap: 1.25rem;
}

.page-mcp__form {
  display: grid;
  gap: 1rem;
}

.page-mcp__selection-button {
  background: transparent;
  border: 1px solid var(--color-border);
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 0.45rem;
  padding: 0.85rem 0.95rem;
  text-align: left;
}

.page-mcp__selection-button.is-active,
.page-mcp__selection-button:hover {
  border-color: var(--color-primary);
}

.page-mcp__selection-header {
  align-items: center;
  display: flex;
  gap: 0.75rem;
  justify-content: space-between;
}

.page-mcp__version-list {
  margin-bottom: 1rem;
}

@media (max-width: 1080px) {
  .page-mcp__workspace {
    grid-template-columns: 1fr;
  }
}
</style>
