<template>
  <section class="page page-mcp">
    <header class="page__header">
      <div>
        <p class="page__eyebrow">MCP management</p>
        <h1 class="page__title">Tool fabric</h1>
        <p class="page__lede">View, create, and tune the tools exposed through the shell.</p>
      </div>

      <div class="metric-strip page-mcp__summary">
        <article class="metric-block">
          <p class="metric-block__label">Total</p>
          <p class="metric-block__value">{{ summary.total }}</p>
        </article>
        <article class="metric-block">
          <p class="metric-block__label">Ready</p>
          <p class="metric-block__value">{{ summary.ready }}</p>
        </article>
        <article class="metric-block">
          <p class="metric-block__label">Drafts</p>
          <p class="metric-block__value">{{ summary.drafts }}</p>
        </article>
      </div>
    </header>

    <section class="panel">
      <div class="segmented-control">
        <button
          class="segmented-control__button"
          :class="{ 'is-active': activeTab === 'view' }"
          type="button"
          @click="activeTab = 'view'"
        >
          View tools
        </button>
        <button
          class="segmented-control__button"
          :class="{ 'is-active': activeTab === 'create' }"
          type="button"
          @click="activeTab = 'create'"
        >
          Create tool
        </button>
      </div>
    </section>

    <div v-if="isLoading" class="panel">
      <p class="muted-copy">Loading MCP workspace.</p>
    </div>

    <template v-else-if="workspace">
      <p v-if="saveMessage" class="inline-message inline-message--success">{{ saveMessage }}</p>

      <div v-if="activeTab === 'view'" class="page-mcp__workspace">
        <aside class="panel">
          <div class="section-heading">
            <AppIcon icon="database-2-line" />
            <span class="section-heading__title">Tools</span>
          </div>

          <div class="stack-list">
            <button
              v-for="tool in workspace.tools"
              :key="tool.id"
              class="page-mcp__tool-button"
              :class="{ 'is-active': selectedToolId === tool.id }"
              type="button"
              @click="selectTool(tool.id)"
            >
              <span class="page-mcp__tool-button-header">
                <strong>{{ tool.name }}</strong>
                <span :class="statusClass(tool.status)">{{ tool.status }}</span>
              </span>
              <span class="muted-copy">{{ tool.tool }} · {{ tool.transport.toUpperCase() }} · {{ tool.scope }}</span>
            </button>
          </div>
        </aside>

        <section class="panel">
          <div class="section-heading">
            <AppIcon icon="settings-line" />
            <span class="section-heading__title">Edit selected tool</span>
          </div>

          <form v-if="selectedTool" class="page-mcp__form" @submit.prevent="handleSaveTool">
            <div class="field-grid">
              <label class="field">
                <span class="field__label">Name</span>
                <input v-model="editForm.name" class="text-input" type="text" />
              </label>

              <label class="field">
                <span class="field__label">Tool label</span>
                <input v-model="editForm.tool" class="text-input" type="text" />
              </label>

              <label class="field">
                <span class="field__label">Transport</span>
                <select v-model="editForm.transport" class="select-input">
                  <option value="stdio">STDIO</option>
                  <option value="http">HTTP</option>
                  <option value="ws">WebSocket</option>
                </select>
              </label>

              <label class="field">
                <span class="field__label">Scope</span>
                <select v-model="editForm.scope" class="select-input">
                  <option value="local">Local</option>
                  <option value="team">Team</option>
                  <option value="sandbox">Sandbox</option>
                </select>
              </label>

              <label class="field">
                <span class="field__label">Status</span>
                <select v-model="editForm.status" class="select-input">
                  <option value="ready">Ready</option>
                  <option value="draft">Draft</option>
                  <option value="error">Error</option>
                </select>
              </label>

              <label class="field">
                <span class="field__label">Command</span>
                <input v-model="editForm.command" class="text-input" type="text" />
              </label>

              <label class="field field--span-2">
                <span class="field__label">Endpoint</span>
                <input v-model="editForm.endpoint" class="text-input" type="text" />
              </label>

              <label class="field field--span-2">
                <span class="field__label">Notes</span>
                <textarea v-model="editForm.notes" class="text-area"></textarea>
              </label>
            </div>

            <div class="action-row">
              <button class="action-button action-button--primary" :disabled="isSaving" type="submit">
                Save changes
              </button>
              <p class="muted-copy">Last edited {{ selectedTool.lastEdited }}</p>
            </div>
          </form>
        </section>
      </div>

      <section v-else class="panel">
        <div class="section-heading">
          <AppIcon icon="add-circle-line" />
          <span class="section-heading__title">Create tool</span>
        </div>

        <div class="stack-list page-mcp__template-list">
          <button
            v-for="template in workspace.templates"
            :key="template.id"
            class="page-mcp__template-button"
            type="button"
            @click="applyTemplate(template.id)"
          >
            <strong>{{ template.label }}</strong>
            <span class="muted-copy">{{ template.description }}</span>
          </button>
        </div>

        <form class="page-mcp__form" @submit.prevent="handleCreateTool">
          <div class="field-grid">
            <label class="field">
              <span class="field__label">Name</span>
              <input v-model="createForm.name" class="text-input" type="text" />
            </label>

            <label class="field">
              <span class="field__label">Tool label</span>
              <input v-model="createForm.tool" class="text-input" type="text" />
            </label>

            <label class="field">
              <span class="field__label">Transport</span>
              <select v-model="createForm.transport" class="select-input">
                <option value="stdio">STDIO</option>
                <option value="http">HTTP</option>
                <option value="ws">WebSocket</option>
              </select>
            </label>

            <label class="field">
              <span class="field__label">Scope</span>
              <select v-model="createForm.scope" class="select-input">
                <option value="local">Local</option>
                <option value="team">Team</option>
                <option value="sandbox">Sandbox</option>
              </select>
            </label>

            <label class="field">
              <span class="field__label">Status</span>
              <select v-model="createForm.status" class="select-input">
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
                <option value="error">Error</option>
              </select>
            </label>

            <label class="field">
              <span class="field__label">Command</span>
              <input v-model="createForm.command" class="text-input" type="text" />
            </label>

            <label class="field field--span-2">
              <span class="field__label">Endpoint</span>
              <input v-model="createForm.endpoint" class="text-input" type="text" />
            </label>

            <label class="field field--span-2">
              <span class="field__label">Notes</span>
              <textarea v-model="createForm.notes" class="text-area"></textarea>
            </label>
          </div>

          <button class="action-button action-button--primary" :disabled="isSaving" type="submit">
            Create tool
          </button>
        </form>
      </section>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import {
  createMcpTool,
  getMcpWorkspace,
  updateMcpTool,
  type McpStatus,
  type McpToolRecord,
  type McpWorkspace,
} from '@/lib/api'

type ToolFormState = Omit<McpToolRecord, 'id' | 'lastEdited'>
type TabName = 'create' | 'view'

const workspace = ref<McpWorkspace | null>(null)
const isLoading = ref(true)
const isSaving = ref(false)
const saveMessage = ref('')
const activeTab = ref<TabName>('view')
const selectedToolId = ref('')

function createEmptyToolForm(): ToolFormState {
  return {
    name: '',
    tool: 'Command Runner',
    transport: 'stdio',
    scope: 'local',
    status: 'draft',
    command: '',
    endpoint: '',
    notes: '',
  }
}

const editForm = reactive<ToolFormState>(createEmptyToolForm())
const createForm = reactive<ToolFormState>(createEmptyToolForm())

const selectedTool = computed(() => {
  return workspace.value?.tools.find((tool) => tool.id === selectedToolId.value) ?? null
})

const summary = computed(() => {
  const tools = workspace.value?.tools ?? []

  return {
    total: tools.length,
    ready: tools.filter((tool) => tool.status === 'ready').length,
    drafts: tools.filter((tool) => tool.status === 'draft').length,
  }
})

function statusClass(status: McpStatus) {
  return `status-pill status-pill--${status}`
}

function hydrateEditForm(tool: McpToolRecord | null) {
  if (!tool) {
    Object.assign(editForm, createEmptyToolForm())
    return
  }

  Object.assign(editForm, {
    name: tool.name,
    tool: tool.tool,
    transport: tool.transport,
    scope: tool.scope,
    status: tool.status,
    command: tool.command,
    endpoint: tool.endpoint,
    notes: tool.notes,
  })
}

function selectTool(toolId: string) {
  selectedToolId.value = toolId
  hydrateEditForm(workspace.value?.tools.find((tool) => tool.id === toolId) ?? null)
}

function applyTemplate(templateId: string) {
  const template = workspace.value?.templates.find((entry) => entry.id === templateId)

  if (!template) {
    return
  }

  createForm.tool = template.label
  createForm.transport = template.transport
  createForm.command = template.recommendedCommand
  createForm.endpoint = template.endpointHint
}

async function refreshWorkspace(selectedId?: string) {
  workspace.value = await getMcpWorkspace()

  const fallbackId = workspace.value.tools[0]?.id ?? ''
  const nextSelectedId = selectedId && workspace.value.tools.some((tool) => tool.id === selectedId)
    ? selectedId
    : fallbackId

  selectedToolId.value = nextSelectedId
  hydrateEditForm(workspace.value.tools.find((tool) => tool.id === nextSelectedId) ?? null)
}

async function handleSaveTool() {
  if (!selectedToolId.value) {
    return
  }

  isSaving.value = true
  saveMessage.value = ''

  try {
    await updateMcpTool(selectedToolId.value, { ...editForm })
    await refreshWorkspace(selectedToolId.value)
    saveMessage.value = 'Tool definition saved.'
  } finally {
    isSaving.value = false
  }
}

async function handleCreateTool() {
  isSaving.value = true
  saveMessage.value = ''

  try {
    const createdTool = await createMcpTool({ ...createForm })
    Object.assign(createForm, createEmptyToolForm())
    activeTab.value = 'view'
    await refreshWorkspace(createdTool.id)
    saveMessage.value = 'Tool created and selected for editing.'
  } finally {
    isSaving.value = false
  }
}

onMounted(async () => {
  await refreshWorkspace()
  isLoading.value = false
})
</script>

<style scoped>
.page-mcp__summary {
  max-width: 34rem;
}

.page-mcp__workspace {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: minmax(18rem, 0.85fr) minmax(0, 1.4fr);
}

.page-mcp__tool-button,
.page-mcp__template-button {
  background: transparent;
  border: 1px solid var(--color-border);
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 0.45rem;
  padding: 0.85rem 0.95rem;
  text-align: left;
}

.page-mcp__tool-button.is-active,
.page-mcp__tool-button:hover,
.page-mcp__template-button:hover {
  border-color: var(--color-primary);
}

.page-mcp__tool-button-header {
  align-items: center;
  display: flex;
  gap: 0.7rem;
  justify-content: space-between;
}

.page-mcp__template-list {
  margin-bottom: 1.2rem;
}

.page-mcp__form {
  display: grid;
  gap: 1rem;
}

@media (max-width: 1080px) {
  .page-mcp__workspace {
    grid-template-columns: 1fr;
  }
}
</style>
