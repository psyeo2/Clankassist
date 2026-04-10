<template>
  <header class="app-navbar">
    <div class="app-navbar__inner">
      <RouterLink class="app-navbar__brand" to="/">
        <span class="app-navbar__brand-mark">CA</span>

        <div>
          <p class="app-navbar__eyebrow">Local command deck</p>
          <strong class="app-navbar__title">Clankassist</strong>
        </div>
      </RouterLink>

      <nav class="app-navbar__nav" aria-label="Primary">
        <RouterLink
          v-for="link in navLinks"
          :key="link.label"
          class="app-navbar__nav-link"
          :class="{ 'is-active': isActiveRoute(String(link.to.name)) }"
          :to="link.to"
        >
          <AppIcon :icon="link.icon" :size="18" />
          <span>{{ link.label }}</span>
        </RouterLink>
      </nav>

      <div class="app-navbar__actions">
        <button class="app-navbar__session-button" type="button" @click="handleAccessAction">
          {{
            sessionState.isDevBypassEnabled
              ? 'DEV bypass'
              : sessionState.isAuthenticated
                ? 'Lock shell'
                : 'Access shell'
          }}
        </button>

        <AppIconButton
          color="var(--color-text)"
          icon="settings-4-line"
          :action="goToSettings"
          label="Open settings"
          title="Open settings"
        />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { RouterLink, useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import AppIconButton from '@/components/AppIconButton.vue'
import { useSessionState } from '@/stores/sessionState'

const route = useRoute()
const router = useRouter()
const sessionState = useSessionState()

const navLinks = [
  { icon: 'home-2-line', label: 'Overview', to: { name: 'home' } },
  { icon: 'database-2-line', label: 'MCP', to: { name: 'mcp' } },
  { icon: 'battery-2-line', label: 'Devices', to: { name: 'devices' } },
  { icon: 'play-circle-line', label: 'Manual API', to: { name: 'manual' } },
] as const

function isActiveRoute(name: string) {
  return route.name === name
}

async function goToSettings() {
  await router.push({ name: 'settings' })
}

async function handleAccessAction() {
  if (sessionState.isDevBypassEnabled) {
    await router.push({ name: 'home' })
    return
  }

  if (sessionState.isAuthenticated) {
    await sessionState.logout()
  }

  await router.push({ name: 'login' })
}
</script>

<style scoped>
.app-navbar {
  position: sticky;
  top: 0;
  z-index: 20;
}

.app-navbar__inner {
  align-items: center;
  backdrop-filter: blur(18px);
  background: rgba(0, 0, 0, 0.14);
  border-bottom: 1px solid var(--color-border);
  display: grid;
  gap: 1rem;
  grid-template-columns: auto 1fr auto;
  margin: 0 auto;
  min-height: 5.4rem;
  padding: 0.85rem clamp(1rem, 2vw, 1.5rem);
  width: min(1400px, 100%);
}

.app-navbar__brand {
  align-items: center;
  color: inherit;
  display: inline-flex;
  gap: 0.85rem;
}

.app-navbar__brand-mark {
  align-items: center;
  background:
    linear-gradient(135deg, var(--color-primary), transparent 72%),
    var(--color-surface-strong);
  border: 1px solid var(--color-border);
  clip-path: polygon(0 0, calc(100% - 0.8rem) 0, 100% 0.8rem, 100% 100%, 0.8rem 100%, 0 calc(100% - 0.8rem));
  display: inline-flex;
  font-family: "Bahnschrift", "Trebuchet MS", sans-serif;
  font-size: 0.95rem;
  font-weight: 700;
  height: 3rem;
  justify-content: center;
  letter-spacing: 0.14em;
  width: 3rem;
}

.app-navbar__eyebrow {
  color: var(--color-muted);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  margin: 0;
  text-transform: uppercase;
}

.app-navbar__title {
  font-family: "Bahnschrift", "Trebuchet MS", sans-serif;
  font-size: 1.35rem;
  letter-spacing: 0.06em;
}

.app-navbar__nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
}

.app-navbar__nav-link {
  align-items: center;
  border-bottom: 1px solid transparent;
  color: var(--color-muted);
  display: inline-flex;
  gap: 0.55rem;
  letter-spacing: 0.04em;
  padding: 0.25rem 0.1rem;
  text-transform: uppercase;
}

.app-navbar__nav-link.is-active,
.app-navbar__nav-link:hover {
  border-bottom-color: var(--color-accent);
  color: var(--color-text);
}

.app-navbar__actions {
  align-items: center;
  display: inline-flex;
  gap: 0.75rem;
}

.app-navbar__session-button {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  cursor: pointer;
  font-size: 0.78rem;
  letter-spacing: 0.16em;
  padding: 0.7rem 0.95rem;
  text-transform: uppercase;
}

.app-navbar__session-button:hover {
  border-color: var(--color-primary);
}

@media (max-width: 980px) {
  .app-navbar__inner {
    grid-template-columns: 1fr;
    justify-items: stretch;
  }

  .app-navbar__nav {
    justify-content: flex-start;
  }

  .app-navbar__actions {
    justify-content: space-between;
  }
}
</style>
