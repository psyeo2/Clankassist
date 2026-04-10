<template>
  <section class="page page-home">
    <div v-if="isLoading" class="panel">
      <p class="page__eyebrow">Overview</p>
      <h1 class="page__title">Clankassist</h1>
      <p class="page__lede">Loading orchestrator state.</p>
    </div>

    <template v-else-if="dashboard">
      <div class="page-home__mast">
        <section class="panel page-home__title-panel">
          <p class="page__eyebrow">Operator overview</p>
          <h1 class="page__title">Clankassist</h1>
          <p class="page__lede">
            Admin access, catalog state, and approved device inventory pulled directly from the
            orchestrator.
          </p>

          <div class="metric-strip">
            <article class="metric-block">
              <p class="metric-block__label">Integrations</p>
              <p class="metric-block__value">{{ dashboard.integrationCount }}</p>
            </article>
            <article class="metric-block">
              <p class="metric-block__label">Tools</p>
              <p class="metric-block__value">
                {{ dashboard.toolCount }}
                <span class="metric-block__suffix">/{{ dashboard.publishedToolCount }} published</span>
              </p>
            </article>
            <article class="metric-block">
              <p class="metric-block__label">Resources</p>
              <p class="metric-block__value">
                {{ dashboard.resourceCount }}
                <span class="metric-block__suffix">/{{ dashboard.publishedResourceCount }} published</span>
              </p>
            </article>
            <article class="metric-block">
              <p class="metric-block__label">Devices</p>
              <p class="metric-block__value">
                {{ dashboard.deviceCount }}
                <span class="metric-block__suffix">/{{ dashboard.approvedDeviceCount }} approved</span>
              </p>
            </article>
          </div>

          <div class="action-row">
            <RouterLink class="action-button action-button--primary" to="/mcp">
              <AppIcon icon="database-2-line" />
              <span>Open MCP</span>
            </RouterLink>
            <RouterLink class="action-button" to="/devices">
              <AppIcon icon="battery-2-line" />
              <span>Open devices</span>
            </RouterLink>
            <RouterLink class="action-button" to="/manual">
              <AppIcon icon="play-circle-line" />
              <span>Open manual API</span>
            </RouterLink>
          </div>
        </section>

        <section class="panel page-home__api-panel">
          <div class="section-heading">
            <AppIcon icon="cloud-line" />
            <span class="section-heading__title">API target</span>
          </div>

          <div class="page-home__api-status-row">
            <span class="status-pill status-pill--online">connected</span>
            <strong>{{ dashboard.apiBaseUrl }}</strong>
          </div>

          <div class="stack-list">
            <article class="stack-list__item">
              <h2 class="stack-list__title">Admin session</h2>
              <p class="muted-copy">Authenticated against the orchestrator admin API.</p>
            </article>
            <article class="stack-list__item">
              <h2 class="stack-list__title">Device testing</h2>
              <p class="muted-copy">Use the Manual API page to mint device tokens and test `/respond`.</p>
            </article>
            <article class="stack-list__item">
              <h2 class="stack-list__title">Live catalog</h2>
              <p class="muted-copy">Counts above reflect the current Postgres-backed catalog state.</p>
            </article>
          </div>
        </section>
      </div>
    </template>

    <p v-if="errorMessage" class="inline-message inline-message--danger">{{ errorMessage }}</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import { getDashboardData, type DashboardData } from '@/lib/api'

const dashboard = ref<DashboardData | null>(null)
const errorMessage = ref('')
const isLoading = ref(true)

onMounted(async () => {
  try {
    dashboard.value = await getDashboardData()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load overview.'
  } finally {
    isLoading.value = false
  }
})
</script>

<style scoped>
.page-home__mast {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: minmax(0, 1.8fr) minmax(18rem, 1fr);
}

.page-home__title-panel {
  display: grid;
  gap: 1.25rem;
}

.page-home__api-panel {
  align-content: start;
  display: grid;
  gap: 1rem;
}

.page-home__api-status-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.metric-block__suffix {
  color: var(--color-muted);
  display: block;
  font-size: 0.85rem;
  margin-top: 0.2rem;
}

@media (max-width: 1080px) {
  .page-home__mast {
    grid-template-columns: 1fr;
  }
}
</style>
