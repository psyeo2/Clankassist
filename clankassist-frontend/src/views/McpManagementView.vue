<template>
  <section class="page page-mcp">
    <header class="page__header">
      <div>
        <p class="page__eyebrow">MCP management</p>
        <h1 class="page__title">Catalog</h1>
        <p class="page__lede">
          Stage tool and resource versions, then publish active catalog entries to the
          orchestrator database.
        </p>
      </div>

      <div v-if="!showApiUnavailable && !isLoading" class="metric-strip page-mcp__summary">
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

    <section v-if="!showApiUnavailable" class="panel">
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

    <p v-if="errorMessage && !showApiUnavailable" class="inline-message inline-message--danger">
      {{ errorMessage }}
    </p>
    <p v-if="successMessage" class="inline-message inline-message--success">{{ successMessage }}</p>

    <div v-if="isLoading" class="panel">
      <p class="muted-copy">Loading catalog workspace.</p>
    </div>

    <ApiUnavailablePanel v-else-if="showApiUnavailable" :message="apiAvailability.message" />

    <template v-else>
      <section v-if="activeTab === 'tools'" class="page-mcp__workspace">
        <aside v-if="tools.length > 0" class="panel">
          <div class="section-heading">
            <AppIcon icon="database-2-line" />
            <span class="section-heading__title">Current tools</span>
          </div>

          <div class="stack-list">
            <button
              class="page-mcp__selection-button page-mcp__selection-button--new"
              :class="{ 'is-active': selectedToolId === null }"
              type="button"
              @click="selectNewTool"
            >
              <span class="page-mcp__selection-header">
                <span class="page-mcp__new-tool-title">
                  <AppIcon icon="add-line" size="15" />
                  <strong>New tool</strong>
                </span>
                <span class="page-mcp__new-tool-pill">Draft</span>
              </span>
              <span class="muted-copy">Create a tool with version-owned execution</span>
            </button>
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
                <span class="page-mcp__selection-pills">
                  <span
                    v-for="pill in getToolPills(tool)"
                    :key="`${tool.id}-${pill.label}`"
                    class="status-pill"
                    :class="pill.className"
                  >
                    {{ pill.label }}
                  </span>
                </span>
              </span>
              <span class="muted-copy">Tool definition</span>
            </button>
          </div>
        </aside>

        <div class="page-mcp__column">
          <section class="panel page-mcp__restart-panel">
            <div class="section-heading">
              <AppIcon icon="loop-right-line" />
              <span class="section-heading__title">Runtime reload</span>
            </div>

            <p class="muted-copy">
              Published tool changes do not take effect in the MCP server until it is restarted.
            </p>

            <div class="action-row">
              <button
                class="action-button action-button--primary"
                :disabled="isBusy"
                type="button"
                @click="handleRestartMcpServer"
              >
                Restart MCP server
              </button>
            </div>
          </section>

          <section v-if="selectedToolId === null" class="panel">
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
              </div>

              <button class="action-button action-button--primary" :disabled="isBusy" type="submit">
                Create tool
              </button>
            </form>
          </section>

          <section v-else class="panel">
            <div class="section-heading">
              <AppIcon icon="settings-3-line" />
              <span class="section-heading__title">Selected tool</span>
            </div>

            <div v-if="selectedTool" class="field-grid">
              <div class="field">
                <span class="field__label">Tool name</span>
                <div class="field-value">{{ selectedTool.name }}</div>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="section-heading">
              <AppIcon icon="settings-line" />
              <span class="section-heading__title">Selected tool versions</span>
            </div>

            <template v-if="selectedTool && selectedToolId !== null">
              <p class="muted-copy page-mcp__section-copy">
                Select a version to inspect its current configuration. The editor below always creates
                the next version.
              </p>

              <div class="stack-list page-mcp__version-list">
                <article
                  v-for="version in toolVersions"
                  :key="version.id"
                  class="stack-list__item page-mcp__version-card"
                  :class="{ 'is-selected': selectedToolVersionId === version.id }"
                >
                  <div class="stack-list__title-row">
                    <div class="page-mcp__version-heading">
                      <button class="page-mcp__version-select" type="button" @click="selectToolVersion(version.id)">
                        v{{ version.version_number }}
                      </button>
                      <span :class="statusClass(version.status)">{{ version.status }}</span>
                      <span
                        v-if="selectedTool.current_published_version_id === version.id"
                        class="status-pill status-pill--success"
                      >
                        current
                      </span>
                    </div>

                    <div class="action-row">
                      <button
                        v-if="version.status !== 'published'"
                        class="action-button"
                        :disabled="isBusy"
                        type="button"
                        @click="handlePublishToolVersion(version.version_number)"
                      >
                        Publish version
                      </button>
                    </div>
                  </div>
                  <p class="muted-copy">{{ version.description }}</p>
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

                  <label class="field field--span-2 page-mcp__toggle-field">
                    <span class="field__label">Editor mode</span>
                    <span class="toggle-row">
                      <input v-model="isEasyMode" type="checkbox" />
                      <span>Helper mode</span>
                    </span>
                    <span class="muted-copy">
                      Helper mode covers the common schema and HTTP execution fields. Switch back to raw
                      JSON for advanced structures.
                    </span>
                  </label>
                </div>

                <template v-if="isEasyMode">
                  <div class="page-mcp__helper-section">
                    <div class="section-heading">
                      <AppIcon icon="settings-3-line" />
                      <span class="section-heading__title">Schema helper</span>
                    </div>

                    <div class="field-grid">
                      <label class="field">
                        <span class="field__label">Input type</span>
                        <select v-model="inputSchemaHelper.type" class="select-input">
                          <option v-for="type in schemaTypes" :key="`input-${type}`" :value="type">
                            {{ type }}
                          </option>
                        </select>
                      </label>

                      <label v-if="inputSchemaHelper.type === 'array'" class="field">
                        <span class="field__label">Input item type</span>
                        <select v-model="inputSchemaHelper.itemsType" class="select-input">
                          <option v-for="type in schemaTypes" :key="`input-item-${type}`" :value="type">
                            {{ type }}
                          </option>
                        </select>
                      </label>

                      <label v-if="inputSchemaHelper.type === 'object'" class="field field--span-2">
                        <span class="field__label">Input extra keys</span>
                        <span class="toggle-row">
                          <input v-model="inputSchemaHelper.additionalProperties" type="checkbox" />
                          <span>Allow additional properties</span>
                        </span>
                      </label>

                      <div v-if="inputSchemaHelper.type === 'object'" class="field field--span-2">
                        <span class="field__label">Input properties</span>
                        <div class="page-mcp__property-list">
                          <article
                            v-for="(property, index) in inputSchemaHelper.properties"
                            :key="`input-${index}`"
                            class="page-mcp__property-card"
                          >
                            <div class="field-grid">
                              <label class="field">
                                <span class="field__label">Name</span>
                                <input v-model="property.name" class="text-input" type="text" />
                              </label>

                              <label class="field">
                                <span class="field__label">Type</span>
                                <select v-model="property.type" class="select-input">
                                  <option v-for="type in schemaTypes" :key="`input-${index}-${type}`" :value="type">
                                    {{ type }}
                                  </option>
                                </select>
                              </label>

                              <label class="field field--span-2">
                                <span class="field__label">Description</span>
                                <input v-model="property.description" class="text-input" type="text" />
                              </label>

                              <label class="field">
                                <span class="field__label">Required</span>
                                <span class="toggle-row">
                                  <input v-model="property.required" type="checkbox" />
                                  <span>Required</span>
                                </span>
                              </label>

                              <div class="field page-mcp__property-actions">
                                <span class="field__label">Actions</span>
                                <button class="action-button" type="button" @click="removeSchemaProperty('input', index)">
                                  Remove
                                </button>
                              </div>
                            </div>
                          </article>

                          <button class="action-button" type="button" @click="addSchemaProperty('input')">
                            Add input property
                          </button>
                        </div>
                      </div>

                      <label class="field">
                        <span class="field__label">Result type</span>
                        <select v-model="resultSchemaHelper.type" class="select-input">
                          <option v-for="type in schemaTypes" :key="`result-${type}`" :value="type">
                            {{ type }}
                          </option>
                        </select>
                      </label>

                      <label v-if="resultSchemaHelper.type === 'array'" class="field">
                        <span class="field__label">Result item type</span>
                        <select v-model="resultSchemaHelper.itemsType" class="select-input">
                          <option v-for="type in schemaTypes" :key="`result-item-${type}`" :value="type">
                            {{ type }}
                          </option>
                        </select>
                      </label>

                      <label v-if="resultSchemaHelper.type === 'object'" class="field field--span-2">
                        <span class="field__label">Result extra keys</span>
                        <span class="toggle-row">
                          <input v-model="resultSchemaHelper.additionalProperties" type="checkbox" />
                          <span>Allow additional properties</span>
                        </span>
                      </label>

                      <div v-if="resultSchemaHelper.type === 'object'" class="field field--span-2">
                        <span class="field__label">Result properties</span>
                        <div class="page-mcp__property-list">
                          <article
                            v-for="(property, index) in resultSchemaHelper.properties"
                            :key="`result-${index}`"
                            class="page-mcp__property-card"
                          >
                            <div class="field-grid">
                              <label class="field">
                                <span class="field__label">Name</span>
                                <input v-model="property.name" class="text-input" type="text" />
                              </label>

                              <label class="field">
                                <span class="field__label">Type</span>
                                <select v-model="property.type" class="select-input">
                                  <option v-for="type in schemaTypes" :key="`result-${index}-${type}`" :value="type">
                                    {{ type }}
                                  </option>
                                </select>
                              </label>

                              <label class="field field--span-2">
                                <span class="field__label">Description</span>
                                <input v-model="property.description" class="text-input" type="text" />
                              </label>

                              <label class="field">
                                <span class="field__label">Required</span>
                                <span class="toggle-row">
                                  <input v-model="property.required" type="checkbox" />
                                  <span>Required</span>
                                </span>
                              </label>

                              <div class="field page-mcp__property-actions">
                                <span class="field__label">Actions</span>
                                <button class="action-button" type="button" @click="removeSchemaProperty('result', index)">
                                  Remove
                                </button>
                              </div>
                            </div>
                          </article>

                          <button class="action-button" type="button" @click="addSchemaProperty('result')">
                            Add result property
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="page-mcp__helper-section">
                    <div class="section-heading">
                      <AppIcon icon="cloud-line" />
                      <span class="section-heading__title">Execution helper</span>
                    </div>

                    <div class="field-grid">
                      <label class="field">
                        <span class="field__label">Base URL</span>
                        <input v-model="executionHelper.baseUrl" class="text-input" type="text" />
                      </label>

                      <label class="field">
                        <span class="field__label">Timeout (ms)</span>
                        <input v-model="executionHelper.timeoutMs" class="text-input" type="number" min="1" />
                      </label>

                      <label class="field field--span-2">
                        <span class="field__label">Allowed hosts</span>
                        <textarea v-model="executionHelper.allowedHosts" class="text-area"></textarea>
                      </label>

                      <label class="field">
                        <span class="field__label">Auth</span>
                        <select v-model="executionHelper.authStrategy" class="select-input">
                          <option value="none">none</option>
                          <option value="bearer_env">bearer_env</option>
                          <option value="api_key_header_env">api_key_header_env</option>
                          <option value="api_key_query_env">api_key_query_env</option>
                          <option value="basic_env">basic_env</option>
                        </select>
                      </label>

                      <label v-if="executionHelper.authStrategy === 'bearer_env'" class="field">
                        <span class="field__label">Token env var</span>
                        <input v-model="executionHelper.authTokenEnvVar" class="text-input" type="text" />
                      </label>

                      <label v-if="executionHelper.authStrategy === 'api_key_header_env'" class="field">
                        <span class="field__label">API key env var</span>
                        <input v-model="executionHelper.apiKeyEnvVar" class="text-input" type="text" />
                      </label>

                      <label v-if="executionHelper.authStrategy === 'api_key_header_env'" class="field">
                        <span class="field__label">Header name</span>
                        <input v-model="executionHelper.apiKeyHeaderName" class="text-input" type="text" />
                      </label>

                      <label v-if="executionHelper.authStrategy === 'api_key_query_env'" class="field">
                        <span class="field__label">API key env var</span>
                        <input v-model="executionHelper.apiKeyEnvVar" class="text-input" type="text" />
                      </label>

                      <label v-if="executionHelper.authStrategy === 'api_key_query_env'" class="field">
                        <span class="field__label">Query parameter</span>
                        <input v-model="executionHelper.apiKeyQueryParamName" class="text-input" type="text" />
                      </label>

                      <label v-if="executionHelper.authStrategy === 'basic_env'" class="field">
                        <span class="field__label">Username env var</span>
                        <input v-model="executionHelper.basicUsernameEnvVar" class="text-input" type="text" />
                      </label>

                      <label v-if="executionHelper.authStrategy === 'basic_env'" class="field">
                        <span class="field__label">Password env var</span>
                        <input v-model="executionHelper.basicPasswordEnvVar" class="text-input" type="text" />
                      </label>

                      <label class="field">
                        <span class="field__label">Request method</span>
                        <input v-model="executionHelper.requestMethod" class="text-input" type="text" />
                      </label>

                      <label class="field">
                        <span class="field__label">Request path</span>
                        <input v-model="executionHelper.requestPath" class="text-input" type="text" />
                      </label>

                      <label class="field field--span-2">
                        <span class="field__label">Request query (JSON object)</span>
                        <textarea v-model="executionHelper.requestQuery" class="text-area"></textarea>
                      </label>

                      <label class="field field--span-2">
                        <span class="field__label">Request headers (JSON object)</span>
                        <textarea v-model="executionHelper.requestHeaders" class="text-area"></textarea>
                      </label>

                      <label class="field">
                        <span class="field__label">Request body mode</span>
                        <select v-model="executionHelper.requestBodyMode" class="select-input">
                          <option value="json">json</option>
                          <option value="text">text</option>
                        </select>
                      </label>

                      <label class="field field--span-2">
                        <span class="field__label">Request body</span>
                        <textarea v-model="executionHelper.requestBody" class="text-area"></textarea>
                      </label>

                      <label class="field">
                        <span class="field__label">Response extractor</span>
                        <select v-model="executionHelper.responseExtractor" class="select-input">
                          <option value="json_path">json_path</option>
                          <option value="text">text</option>
                          <option value="prometheus_metric">prometheus_metric</option>
                        </select>
                      </label>

                      <label v-if="executionHelper.responseExtractor === 'json_path'" class="field">
                        <span class="field__label">Extract path</span>
                        <input v-model="executionHelper.responsePath" class="text-input" type="text" />
                      </label>

                      <label v-if="executionHelper.responseExtractor === 'prometheus_metric'" class="field">
                        <span class="field__label">Metric name</span>
                        <input v-model="executionHelper.responseMetricName" class="text-input" type="text" />
                      </label>

                      <label
                        v-if="executionHelper.responseExtractor === 'prometheus_metric'"
                        class="field field--span-2"
                      >
                        <span class="field__label">Metric labels (JSON object)</span>
                        <textarea v-model="executionHelper.responseLabels" class="text-area"></textarea>
                      </label>

                      <label class="field field--span-2">
                        <span class="field__label">Structured content (JSON object)</span>
                        <textarea v-model="executionHelper.responseStructuredContent" class="text-area"></textarea>
                      </label>

                      <label class="field field--span-2">
                        <span class="field__label">Content template</span>
                        <textarea v-model="executionHelper.responseContentText" class="text-area"></textarea>
                      </label>
                    </div>
                  </div>
                </template>

                <template v-else>
                  <div class="field-grid">
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
                  </div>

                  <div class="action-row">
                    <button class="action-button" type="button" @click="formatToolJsonFields">
                      Format JSON
                    </button>
                  </div>
                </template>

                <div class="field-grid">
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
import { computed, onMounted, reactive, ref, watch } from 'vue'

import ApiUnavailablePanel from '@/components/ApiUnavailablePanel.vue'
import AppIcon from '@/components/AppIcon.vue'
import { apiAvailability } from '@/lib/apiAvailability'
import {
  createResource,
  createResourceVersion,
  createTool,
  createToolVersion,
  listResources,
  listResourceVersions,
  listTools,
  listToolVersions,
  publishResourceVersion,
  publishToolVersion,
  restartMcpServer,
  type ResourceRecord,
  type ResourceVersionRecord,
  type ToolRecord,
  type ToolVersionRecord,
} from '@/lib/api'

type TabId = 'resources' | 'tools'
type SchemaKey = 'input' | 'result'
type SchemaType = 'array' | 'boolean' | 'integer' | 'number' | 'object' | 'string'
type AuthStrategy = 'api_key_header_env' | 'api_key_query_env' | 'basic_env' | 'bearer_env' | 'none'
type ResponseExtractor = 'json_path' | 'prometheus_metric' | 'text'

type SchemaPropertyDraft = {
  description: string
  name: string
  required: boolean
  type: SchemaType
}

type SchemaHelperState = {
  additionalProperties: boolean
  itemsType: SchemaType
  properties: SchemaPropertyDraft[]
  type: SchemaType
}

type ExecutionHelperState = {
  allowedHosts: string
  apiKeyEnvVar: string
  apiKeyHeaderName: string
  apiKeyQueryParamName: string
  authStrategy: AuthStrategy
  authTokenEnvVar: string
  baseUrl: string
  basicPasswordEnvVar: string
  basicUsernameEnvVar: string
  requestBody: string
  requestBodyMode: 'json' | 'text'
  requestHeaders: string
  requestMethod: string
  requestPath: string
  requestQuery: string
  responseContentText: string
  responseExtractor: ResponseExtractor
  responseLabels: string
  responseMetricName: string
  responsePath: string
  responseStructuredContent: string
  timeoutMs: string
}

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'tools', label: 'Tools' },
  { id: 'resources', label: 'Resources' },
]

const schemaTypes: SchemaType[] = ['object', 'array', 'string', 'number', 'integer', 'boolean']

const isBusy = ref(false)
const isLoading = ref(true)
const isEasyMode = ref(true)
const errorMessage = ref('')
const successMessage = ref('')
const tools = ref<ToolRecord[]>([])
const toolVersions = ref<ToolVersionRecord[]>([])
const resources = ref<ResourceRecord[]>([])
const resourceVersions = ref<ResourceVersionRecord[]>([])
const activeTab = ref<TabId>('tools')
const selectedToolId = ref<string | null>(null)
const selectedToolVersionId = ref<string | null>(null)
const selectedResourceId = ref('')
const showApiUnavailable = computed(() => !apiAvailability.isReachable)

const selectedTool = computed(() => tools.value.find((tool) => tool.id === selectedToolId.value) ?? null)
const selectedResource = computed(
  () => resources.value.find((resource) => resource.id === selectedResourceId.value) ?? null,
)

const toolForm = reactive({
  name: '',
})

const toolVersionForm = reactive({
  description: '',
  executionSummary: '',
  inputSchema: '{"type":"object","properties":{},"additionalProperties":false}',
  resultSchema: '{"type":"object","properties":{},"additionalProperties":true}',
  executionSpec: '{}',
  status: 'draft' as ToolVersionRecord['status'],
})

const inputSchemaHelper = reactive<SchemaHelperState>(createSchemaHelper())
const resultSchemaHelper = reactive<SchemaHelperState>(createSchemaHelper({ additionalProperties: true }))
const executionHelper = reactive<ExecutionHelperState>(createExecutionHelper())

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

function createSchemaProperty(): SchemaPropertyDraft {
  return {
    description: '',
    name: '',
    required: false,
    type: 'string',
  }
}

function createSchemaHelper(input: Partial<SchemaHelperState> = {}): SchemaHelperState {
  return {
    additionalProperties: input.additionalProperties ?? false,
    itemsType: input.itemsType ?? 'string',
    properties: input.properties?.map((property) => ({ ...property })) ?? [],
    type: input.type ?? 'object',
  }
}

function createExecutionHelper(input: Partial<ExecutionHelperState> = {}): ExecutionHelperState {
  return {
    allowedHosts: input.allowedHosts ?? '',
    apiKeyEnvVar: input.apiKeyEnvVar ?? '',
    apiKeyHeaderName: input.apiKeyHeaderName ?? 'X-API-Key',
    apiKeyQueryParamName: input.apiKeyQueryParamName ?? 'api_key',
    authStrategy: input.authStrategy ?? 'none',
    authTokenEnvVar: input.authTokenEnvVar ?? '',
    baseUrl: input.baseUrl ?? '',
    basicPasswordEnvVar: input.basicPasswordEnvVar ?? '',
    basicUsernameEnvVar: input.basicUsernameEnvVar ?? '',
    requestBody: input.requestBody ?? '',
    requestBodyMode: input.requestBodyMode ?? 'json',
    requestHeaders: input.requestHeaders ?? '',
    requestMethod: input.requestMethod ?? 'GET',
    requestPath: input.requestPath ?? '/',
    requestQuery: input.requestQuery ?? '',
    responseContentText: input.responseContentText ?? '',
    responseExtractor: input.responseExtractor ?? 'json_path',
    responseLabels: input.responseLabels ?? '',
    responseMetricName: input.responseMetricName ?? '',
    responsePath: input.responsePath ?? '',
    responseStructuredContent: input.responseStructuredContent ?? '',
    timeoutMs: input.timeoutMs ?? '10000',
  }
}

function resetToolVersionForm() {
  toolVersionForm.description = ''
  toolVersionForm.executionSummary = ''
  toolVersionForm.inputSchema = '{"type":"object","properties":{},"additionalProperties":false}'
  toolVersionForm.resultSchema = '{"type":"object","properties":{},"additionalProperties":true}'
  toolVersionForm.executionSpec = '{}'
  toolVersionForm.status = 'draft'
  applySchemaHelper(inputSchemaHelper, createSchemaHelper())
  applySchemaHelper(resultSchemaHelper, createSchemaHelper({ additionalProperties: true }))
  Object.assign(executionHelper, createExecutionHelper())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(text: string, label: string) {
  try {
    if (!text.trim()) {
      return {} as unknown
    }

    return JSON.parse(text) as unknown
  } catch {
    throw new Error(`${label} must be valid JSON.`)
  }
}

function parseObjectJson(text: string, label: string) {
  const parsed = parseJson(text, label)
  if (!isRecord(parsed)) {
    throw new Error(`${label} must be a JSON object.`)
  }

  return parsed
}

function parseOptionalJson(text: string, label: string) {
  if (!text.trim()) {
    return undefined
  }

  return parseJson(text, label)
}

function parseOptionalObjectJson(text: string, label: string) {
  if (!text.trim()) {
    return undefined
  }

  return parseObjectJson(text, label)
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readSchemaType(value: unknown, fallback: SchemaType = 'object'): SchemaType {
  return schemaTypes.includes(value as SchemaType) ? (value as SchemaType) : fallback
}

function readAuthStrategy(value: unknown): AuthStrategy {
  return ['none', 'bearer_env', 'api_key_header_env', 'api_key_query_env', 'basic_env'].includes(
    String(value),
  )
    ? (value as AuthStrategy)
    : 'none'
}

function readResponseExtractor(value: unknown): ResponseExtractor {
  return ['json_path', 'prometheus_metric', 'text'].includes(String(value))
    ? (value as ResponseExtractor)
    : 'json_path'
}

function applySchemaHelper(target: SchemaHelperState, source: SchemaHelperState) {
  target.type = source.type
  target.additionalProperties = source.additionalProperties
  target.itemsType = source.itemsType
  target.properties = source.properties.map((property) => ({ ...property }))
}

function hydrateSchemaHelper(target: SchemaHelperState, schemaText: string, label: string) {
  const schema = parseObjectJson(schemaText, label)
  const properties = isRecord(schema.properties) ? schema.properties : {}
  const required = Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === 'string')
    : []

  applySchemaHelper(target, {
    additionalProperties:
      typeof schema.additionalProperties === 'boolean' ? schema.additionalProperties : true,
    itemsType: readSchemaType(isRecord(schema.items) ? schema.items.type : undefined, 'string'),
    properties: Object.entries(properties).map(([name, value]) => {
      const property = isRecord(value) ? value : {}

      return {
        description: readString(property.description),
        name,
        required: required.includes(name),
        type: readSchemaType(property.type, 'string'),
      }
    }),
    type: readSchemaType(schema.type, 'object'),
  })
}

function buildSchemaFromHelper(helper: SchemaHelperState) {
  if (helper.type === 'array') {
    return {
      items: { type: helper.itemsType },
      type: 'array',
    }
  }

  if (helper.type !== 'object') {
    return {
      type: helper.type,
    }
  }

  const properties: Record<string, unknown> = {}
  const required: string[] = []

  helper.properties.forEach((property) => {
    const name = property.name.trim()
    if (!name) {
      return
    }

    properties[name] = {
      ...(property.description.trim() ? { description: property.description.trim() } : {}),
      type: property.type,
    }

    if (property.required) {
      required.push(name)
    }
  })

  return {
    additionalProperties: helper.additionalProperties,
    properties,
    ...(required.length > 0 ? { required } : {}),
    type: 'object',
  }
}

function hydrateExecutionHelper(specText: string) {
  const spec = parseObjectJson(specText, 'Execution spec')
  const request = isRecord(spec.request) ? spec.request : {}
  const response = isRecord(spec.response) ? spec.response : {}
  const authConfig = isRecord(spec.auth_config) ? spec.auth_config : {}

  Object.assign(
    executionHelper,
    createExecutionHelper({
      allowedHosts: Array.isArray(spec.allowed_hosts)
        ? spec.allowed_hosts.filter((value): value is string => typeof value === 'string').join('\n')
        : '',
      apiKeyEnvVar: readString(authConfig.env_var),
      apiKeyHeaderName: readString(authConfig.header_name) || 'X-API-Key',
      apiKeyQueryParamName: readString(authConfig.param_name) || 'api_key',
      authStrategy: readAuthStrategy(spec.auth_strategy),
      authTokenEnvVar: readString(authConfig.token_env_var || authConfig.env_var),
      baseUrl: readString(spec.base_url),
      basicPasswordEnvVar: readString(authConfig.password_env_var),
      basicUsernameEnvVar: readString(authConfig.username_env_var),
      requestBody:
        readString(request.body_mode) === 'text'
          ? readString(request.body)
          : request.body !== undefined
            ? formatJson(request.body)
            : '',
      requestBodyMode: readString(request.body_mode) === 'text' ? 'text' : 'json',
      requestHeaders: isRecord(request.headers) ? formatJson(request.headers) : '',
      requestMethod: readString(request.method) || 'GET',
      requestPath: readString(request.path || request.path_template) || '/',
      requestQuery: isRecord(request.query) ? formatJson(request.query) : '',
      responseContentText: readString(response.content_text),
      responseExtractor: readResponseExtractor(response.extractor || response.format),
      responseLabels: isRecord(response.labels) ? formatJson(response.labels) : '',
      responseMetricName: readString(
        response.metric_name || response.metric_name_template || response.metric_name_env_var,
      ),
      responsePath: readString(response.path || response.extract_path),
      responseStructuredContent: isRecord(response.structured_content)
        ? formatJson(response.structured_content)
        : '',
      timeoutMs:
        typeof spec.timeout_ms === 'number' || typeof spec.timeout_ms === 'string'
          ? String(spec.timeout_ms)
          : '10000',
    }),
  )
}

function buildExecutionSpecFromHelper() {
  const timeoutMs = Number.parseInt(executionHelper.timeoutMs, 10)
  if (Number.isNaN(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Timeout must be a positive integer.')
  }

  const request: Record<string, unknown> = {
    body_mode: executionHelper.requestBodyMode,
    method: executionHelper.requestMethod.trim().toUpperCase() || 'GET',
    path: executionHelper.requestPath.trim() || '/',
  }

  const requestQuery = parseOptionalObjectJson(executionHelper.requestQuery, 'Request query')
  const requestHeaders = parseOptionalObjectJson(executionHelper.requestHeaders, 'Request headers')
  const requestBody =
    executionHelper.requestBodyMode === 'json'
      ? parseOptionalJson(executionHelper.requestBody, 'Request body')
      : executionHelper.requestBody.trim() || undefined

  if (requestQuery) {
    request.query = requestQuery
  }

  if (requestHeaders) {
    request.headers = requestHeaders
  }

  if (requestBody !== undefined) {
    request.body = requestBody
  }

  const response: Record<string, unknown> = {
    extractor: executionHelper.responseExtractor,
  }

  if (executionHelper.responseExtractor === 'json_path' && executionHelper.responsePath.trim()) {
    response.path = executionHelper.responsePath.trim()
  }

  if (executionHelper.responseExtractor === 'prometheus_metric') {
    if (!executionHelper.responseMetricName.trim()) {
      throw new Error('Metric name is required for prometheus_metric extraction.')
    }

    response.metric_name = executionHelper.responseMetricName.trim()

    const labels = parseOptionalObjectJson(executionHelper.responseLabels, 'Metric labels')
    if (labels) {
      response.labels = labels
    }
  }

  const structuredContent = parseOptionalObjectJson(
    executionHelper.responseStructuredContent,
    'Structured content',
  )
  if (structuredContent) {
    response.structured_content = structuredContent
  }

  if (executionHelper.responseContentText.trim()) {
    response.content_text = executionHelper.responseContentText
  }

  const authConfig: Record<string, unknown> = {}
  if (executionHelper.authStrategy === 'bearer_env' && executionHelper.authTokenEnvVar.trim()) {
    authConfig.token_env_var = executionHelper.authTokenEnvVar.trim()
  }

  if (executionHelper.authStrategy === 'api_key_header_env') {
    if (executionHelper.apiKeyEnvVar.trim()) {
      authConfig.env_var = executionHelper.apiKeyEnvVar.trim()
    }

    if (executionHelper.apiKeyHeaderName.trim()) {
      authConfig.header_name = executionHelper.apiKeyHeaderName.trim()
    }
  }

  if (executionHelper.authStrategy === 'api_key_query_env') {
    if (executionHelper.apiKeyEnvVar.trim()) {
      authConfig.env_var = executionHelper.apiKeyEnvVar.trim()
    }

    if (executionHelper.apiKeyQueryParamName.trim()) {
      authConfig.param_name = executionHelper.apiKeyQueryParamName.trim()
    }
  }

  if (executionHelper.authStrategy === 'basic_env') {
    if (executionHelper.basicUsernameEnvVar.trim()) {
      authConfig.username_env_var = executionHelper.basicUsernameEnvVar.trim()
    }

    if (executionHelper.basicPasswordEnvVar.trim()) {
      authConfig.password_env_var = executionHelper.basicPasswordEnvVar.trim()
    }
  }

  return {
    allowed_hosts: executionHelper.allowedHosts
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter((value) => value !== ''),
    ...(Object.keys(authConfig).length > 0 ? { auth_config: authConfig } : {}),
    auth_strategy: executionHelper.authStrategy,
    base_url: executionHelper.baseUrl.trim(),
    request,
    response,
    timeout_ms: timeoutMs,
  }
}

function syncHelpersFromForm() {
  hydrateSchemaHelper(inputSchemaHelper, toolVersionForm.inputSchema, 'Input schema')
  hydrateSchemaHelper(resultSchemaHelper, toolVersionForm.resultSchema, 'Result schema')
  hydrateExecutionHelper(toolVersionForm.executionSpec)
}

function syncFormFromHelpers() {
  toolVersionForm.inputSchema = formatJson(buildSchemaFromHelper(inputSchemaHelper))
  toolVersionForm.resultSchema = formatJson(buildSchemaFromHelper(resultSchemaHelper))
  toolVersionForm.executionSpec = formatJson(buildExecutionSpecFromHelper())
}

function loadToolVersionIntoForm(version: ToolVersionRecord | null) {
  if (!version) {
    resetToolVersionForm()
    return
  }

  toolVersionForm.description = version.description
  toolVersionForm.executionSummary = version.execution_summary ?? ''
  toolVersionForm.inputSchema = formatJson(version.input_schema ?? {})
  toolVersionForm.resultSchema = formatJson(version.result_schema ?? {})
  toolVersionForm.executionSpec = formatJson(version.execution_spec ?? {})
  toolVersionForm.status = version.status === 'published' ? 'validated' : version.status

  if (isEasyMode.value) {
    syncHelpersFromForm()
  }
}

function addSchemaProperty(key: SchemaKey) {
  const target = key === 'input' ? inputSchemaHelper : resultSchemaHelper
  target.properties.push(createSchemaProperty())
}

function removeSchemaProperty(key: SchemaKey, index: number) {
  const target = key === 'input' ? inputSchemaHelper : resultSchemaHelper
  target.properties.splice(index, 1)
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

function getToolPills(tool: ToolRecord) {
  const pills: Array<{ className: string; label: string }> = []

  if (tool.in_mcp === true) {
    pills.push({ className: 'status-pill--success', label: 'available' })
  } else if (tool.published_version_number !== null) {
    pills.push({ className: 'status-pill--warning', label: 'restart needed' })
  } else {
    pills.push({ className: 'status-pill--danger', label: 'not loaded' })
  }

  if (tool.published_version_number !== null) {
    pills.push({ className: 'status-pill--info', label: `v${tool.published_version_number}` })
  }

  if (tool.immutable) {
    pills.push({ className: 'status-pill--info', label: 'default' })
  }

  return pills
}

function getPreferredToolVersion(tool: ToolRecord | null, versions: ToolVersionRecord[]) {
  if (!tool || versions.length === 0) {
    return null
  }

  return (
    versions.find((version) => version.id === tool.current_published_version_id) ??
    versions[0] ??
    null
  )
}

function formatToolJsonFields() {
  toolVersionForm.inputSchema = formatJson(parseObjectJson(toolVersionForm.inputSchema, 'Input schema'))
  toolVersionForm.resultSchema = formatJson(parseObjectJson(toolVersionForm.resultSchema, 'Result schema'))
  toolVersionForm.executionSpec = formatJson(parseObjectJson(toolVersionForm.executionSpec, 'Execution spec'))
}

async function refreshCatalog() {
  const [nextTools, nextResources] = await Promise.all([
    listTools(),
    listResources(),
  ])

  tools.value = nextTools
  resources.value = nextResources

  if (!selectedResourceId.value && resources.value[0]) {
    selectedResourceId.value = resources.value[0].id
  }

  await Promise.all([refreshToolVersions(), refreshResourceVersions()])
}

async function refreshToolVersions(preferredVersionId?: string) {
  if (!selectedToolId.value) {
    toolVersions.value = []
    selectedToolVersionId.value = null
    resetToolVersionForm()
    return
  }

  const nextVersions = await listToolVersions(selectedToolId.value)
  toolVersions.value = nextVersions

  const preferred =
    (preferredVersionId
      ? nextVersions.find((version) => version.id === preferredVersionId)
      : undefined) ?? getPreferredToolVersion(selectedTool.value, nextVersions)

  selectedToolVersionId.value = preferred?.id ?? null
  loadToolVersionIntoForm(preferred ?? null)
}

async function refreshResourceVersions() {
  if (!selectedResourceId.value) {
    resourceVersions.value = []
    return
  }

  resourceVersions.value = await listResourceVersions(selectedResourceId.value)
}

function selectNewTool() {
  selectedToolId.value = null
  selectedToolVersionId.value = null
  toolVersions.value = []
  resetToolVersionForm()
}

async function selectTool(toolId: string) {
  selectedToolId.value = toolId
  await refreshToolVersions()
}

function selectToolVersion(versionId: string) {
  selectedToolVersionId.value = versionId
  const version = toolVersions.value.find((entry) => entry.id === versionId) ?? null
  loadToolVersionIntoForm(version)
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

async function handleCreateTool() {
  await withAction(async () => {
    const created = await createTool({
      name: toolForm.name.trim(),
    })

    toolForm.name = ''
    await refreshCatalog()
    await selectTool(created.id)
  }, 'Tool created.')
}

async function handleCreateToolVersion() {
  const toolId = selectedToolId.value
  if (!toolId) {
    return
  }

  await withAction(async () => {
    if (isEasyMode.value) {
      syncFormFromHelpers()
    } else {
      formatToolJsonFields()
    }

    const created = await createToolVersion(toolId, {
      description: toolVersionForm.description.trim(),
      execution_summary: toolVersionForm.executionSummary.trim(),
      input_schema: parseObjectJson(toolVersionForm.inputSchema, 'Input schema'),
      result_schema: parseObjectJson(toolVersionForm.resultSchema, 'Result schema'),
      execution_spec: parseObjectJson(toolVersionForm.executionSpec, 'Execution spec'),
      status: toolVersionForm.status === 'published' ? 'draft' : toolVersionForm.status,
    })

    await refreshCatalog()
    await refreshToolVersions(created.id)
  }, 'Tool version created.')
}

async function handlePublishToolVersion(versionNumber: number) {
  const toolId = selectedToolId.value
  if (!toolId) {
    return
  }

  await withAction(async () => {
    const published = await publishToolVersion(toolId, {
      version_number: versionNumber,
    })

    await refreshCatalog()
    await refreshToolVersions(published.version.id)
  }, `Tool version v${versionNumber} published. Restart the MCP server to load it.`)
}

async function handleRestartMcpServer() {
  await withAction(async () => {
    await restartMcpServer()
    await refreshCatalog()
  }, 'MCP server restarted.')
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
      load_spec: parseObjectJson(resourceVersionForm.loadSpec, 'Load spec'),
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
  if (showApiUnavailable.value) {
    isLoading.value = false
    return
  }

  try {
    await refreshCatalog()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load catalog.'
  } finally {
    isLoading.value = false
  }
})

watch(isEasyMode, (enabled, previous) => {
  if (enabled === previous) {
    return
  }

  try {
    if (enabled) {
      syncHelpersFromForm()
      return
    }

    syncFormFromHelpers()
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Unable to switch editor mode.'
    isEasyMode.value = previous
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

.page-mcp__restart-panel,
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

.page-mcp__selection-button--new {
  display: grid;
}

.page-mcp__new-tool-pill {
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  display: inline-flex;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  padding: 0.22rem 0.42rem;
  text-transform: uppercase;
}

.page-mcp__new-tool-title {
  align-items: center;
  display: inline-flex;
  gap: 0.5rem;
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

.page-mcp__selection-pills {
  align-items: center;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.page-mcp__section-copy {
  margin-bottom: 1rem;
}

.page-mcp__version-list {
  margin-bottom: 1rem;
}

.page-mcp__version-card.is-selected {
  border-color: var(--color-accent);
}

.page-mcp__version-heading {
  align-items: center;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.page-mcp__version-select {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  padding: 0;
}

.page-mcp__version-select:hover {
  color: var(--color-accent);
}

.page-mcp__toggle-field {
  align-content: start;
}

.page-mcp__helper-section,
.page-mcp__property-list {
  display: grid;
  gap: 1rem;
}

.page-mcp__property-card {
  border: 1px solid var(--color-border);
  padding: 1rem;
}

.page-mcp__property-actions {
  align-content: end;
}

.field-value {
  padding: 0.625rem 0.75rem;
  background: var(--color-surface-secondary, rgba(0, 0, 0, 0.04));
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  color: var(--color-text);
}

@media (max-width: 1080px) {
  .page-mcp__workspace {
    grid-template-columns: 1fr;
  }
}
</style>
