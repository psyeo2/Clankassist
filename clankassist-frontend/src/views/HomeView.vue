<template>
  <section class="page page-home">
    <div v-if="isLoading" class="panel">
      <p class="page__eyebrow">Overview</p>
      <h1 class="page__title">Clankassist</h1>
      <p class="page__lede">Loading the local command deck.</p>
    </div>

    <template v-else-if="dashboard">
      <div class="page-home__mast">
        <section class="panel page-home__title-panel">
          <p class="page__eyebrow">Operator overview</p>
          <h1 class="page__title">Clankassist</h1>
          <p class="page__lede">
            Devices, MCP tooling, and recent shell activity tracked in one local surface.
          </p>

          <div class="metric-strip">
            <article v-for="metric in metrics" :key="metric.label" class="metric-block">
              <p class="metric-block__label">{{ metric.label }}</p>
              <p class="metric-block__value">{{ metric.value }}</p>
            </article>
          </div>

          <div class="action-row">
            <RouterLink class="action-button action-button--primary" to="/devices">
              <AppIcon icon="battery-2-line" />
              <span>Open devices</span>
            </RouterLink>

            <RouterLink class="action-button" to="/mcp">
              <AppIcon icon="database-2-line" />
              <span>Open MCP fabric</span>
            </RouterLink>
          </div>
        </section>

        <section class="panel page-home__api-panel">
          <div class="section-heading">
            <AppIcon icon="cloud-line" />
            <span class="section-heading__title">API status</span>
          </div>

          <div class="page-home__api-status-row">
            <span class="status-pill" :class="`status-pill--${dashboard.api.status}`">
              {{ dashboard.api.status }}
            </span>
            <strong>{{ dashboard.api.endpoint }}</strong>
          </div>

          <div class="page-home__detail-grid">
            <div>
              <p class="metric-block__label">Latency</p>
              <p class="page-home__detail-value">{{ dashboard.api.latencyMs }} ms</p>
            </div>
            <div>
              <p class="metric-block__label">Last sync</p>
              <p class="page-home__detail-value">{{ dashboard.api.lastSync }}</p>
            </div>
          </div>

          <p class="muted-copy">
            Remote calls are still mocked, but the shell is structured so every live request can
            stay behind <code>lib/api.ts</code>.
          </p>
        </section>
      </div>

      <div class="page-home__grid">
        <section class="panel">
          <div class="section-heading">
            <AppIcon icon="battery-charge-line" />
            <span class="section-heading__title">Device board</span>
          </div>

          <div class="stack-list">
            <article
              v-for="device in dashboard.devices"
              :key="device.id"
              class="stack-list__item page-home__device-card"
            >
              <div class="stack-list__title-row">
                <h2 class="stack-list__title">{{ device.name }}</h2>
                <span :class="deviceStatusClass(device.status)">{{ device.status }}</span>
              </div>

              <p class="muted-copy">{{ device.category }} · {{ device.connection }} · {{ device.location }}</p>
              <p class="muted-copy">Battery {{ device.battery }}% · Seen {{ device.lastSeen }}</p>
            </article>
          </div>
        </section>

        <section class="panel">
          <div class="section-heading">
            <AppIcon icon="database-2-line" />
            <span class="section-heading__title">MCP options</span>
          </div>

          <div class="metric-strip page-home__tool-metrics">
            <article class="metric-block">
              <p class="metric-block__label">Ready</p>
              <p class="metric-block__value">{{ dashboard.toolSummary.ready }}</p>
            </article>
            <article class="metric-block">
              <p class="metric-block__label">Draft</p>
              <p class="metric-block__value">{{ dashboard.toolSummary.draft }}</p>
            </article>
            <article class="metric-block">
              <p class="metric-block__label">Error</p>
              <p class="metric-block__value">{{ dashboard.toolSummary.error }}</p>
            </article>
          </div>

          <div class="stack-list">
            <article v-for="tool in dashboard.tools" :key="tool.id" class="stack-list__item">
              <div class="stack-list__title-row">
                <h2 class="stack-list__title">{{ tool.name }}</h2>
                <span :class="toolStatusClass(tool.status)">{{ tool.status }}</span>
              </div>

              <p class="muted-copy">{{ tool.tool }} · {{ tool.transport.toUpperCase() }} · {{ tool.scope }}</p>
              <p class="muted-copy">{{ tool.notes }}</p>
            </article>
          </div>
        </section>

        <section class="panel">
          <div class="section-heading">
            <AppIcon icon="record-circle-line" />
            <span class="section-heading__title">Recent interactions</span>
          </div>

          <div class="stack-list">
            <article
              v-for="interaction in dashboard.recentInteractions"
              :key="interaction.id"
              class="stack-list__item"
            >
              <div class="stack-list__title-row">
                <h2 class="stack-list__title">{{ interaction.title }}</h2>
                <span :class="interactionToneClass(interaction.tone)">{{ interaction.tone }}</span>
              </div>

              <p class="muted-copy">{{ interaction.detail }}</p>
              <p class="muted-copy">{{ interaction.time }}</p>
            </article>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import { getDashboardData, type DashboardData, type DeviceStatus, type McpStatus } from '@/lib/api'

const dashboard = ref<DashboardData | null>(null)
const isLoading = ref(true)

const metrics = computed(() => {
  if (!dashboard.value) {
    return []
  }

  const onlineDevices = dashboard.value.devices.filter((device) => device.status === 'online').length

  return [
    { label: 'Devices online', value: `${onlineDevices}/${dashboard.value.devices.length}` },
    { label: 'API latency', value: `${dashboard.value.api.latencyMs} ms` },
    { label: 'MCP tools', value: `${dashboard.value.tools.length}` },
    { label: 'Recent events', value: `${dashboard.value.recentInteractions.length}` },
  ]
})

function deviceStatusClass(status: DeviceStatus) {
  return `status-pill status-pill--${status}`
}

function toolStatusClass(status: McpStatus) {
  return `status-pill status-pill--${status}`
}

function interactionToneClass(tone: DashboardData['recentInteractions'][number]['tone']) {
  const classMap = {
    success: 'status-pill status-pill--success',
    warning: 'status-pill status-pill--warning',
    error: 'status-pill status-pill--error',
    info: 'status-pill status-pill--info',
  }

  return classMap[tone]
}

onMounted(async () => {
  dashboard.value = await getDashboardData()
  isLoading.value = false
})
</script>

<style scoped>
.page-home__mast {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: minmax(0, 1.85fr) minmax(18rem, 1fr);
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

.page-home__detail-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.page-home__detail-value {
  font-family: "Bahnschrift", "Trebuchet MS", sans-serif;
  font-size: 1.3rem;
  margin: 0;
}

.page-home__grid {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.page-home__tool-metrics {
  margin-bottom: 1rem;
}

.page-home__device-card {
  background: rgba(0, 0, 0, 0.08);
}

@media (max-width: 1080px) {
  .page-home__mast,
  .page-home__grid {
    grid-template-columns: 1fr;
  }
}
</style>
