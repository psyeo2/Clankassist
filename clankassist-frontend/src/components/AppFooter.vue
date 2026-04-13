<template>
  <footer class="app-footer">
    <div class="app-footer__inner">
      <div class="app-footer__palette-anchor">
        <AppIconButton
          :action="togglePaletteTray"
          :active="isPaletteTrayOpen"
          color="var(--color-accent)"
          icon="palette-line"
          label="Select palette"
          title="Select palette"
        />

        <div v-if="isPaletteTrayOpen" class="app-footer__palette-tray">
          <p class="app-footer__palette-label">Palettes</p>

          <button
            v-for="palette in sessionState.palettes"
            :key="palette.id"
            class="app-footer__palette-option"
            :class="{ 'is-active': sessionState.paletteId === palette.id }"
            type="button"
            @click="selectPalette(palette.id)"
          >
            <span class="app-footer__palette-name">{{ palette.name }}</span>

            <span class="app-footer__palette-swatches">
              <span
                class="app-footer__palette-swatch"
                :style="{ backgroundColor: palette.colors.primary }"
              ></span>
              <span
                class="app-footer__palette-swatch"
                :style="{ backgroundColor: palette.colors.secondary }"
              ></span>
              <span
                class="app-footer__palette-swatch"
                :style="{ backgroundColor: palette.colors.accent }"
              ></span>
              <span
                class="app-footer__palette-swatch"
                :style="{ backgroundColor: palette.colors.surfaceStrong }"
              ></span>
            </span>
          </button>
        </div>
      </div>

      <div class="app-footer__brand">Clankassist - 0.0.1</div>

      <div class="app-footer__status">{{ sessionState.currentPalette.name }}</div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import AppIconButton from '@/components/AppIconButton.vue'
import { useSessionState } from '@/stores/sessionState'

const sessionState = useSessionState()
const isPaletteTrayOpen = ref(false)

function togglePaletteTray() {
  isPaletteTrayOpen.value = !isPaletteTrayOpen.value
}

function selectPalette(paletteId: string) {
  sessionState.setPalette(paletteId)
}
</script>

<style scoped>
.app-footer {
  margin-top: auto;
  padding: 0 1rem 1rem;
  position: relative;
  z-index: 10;
}

.app-footer__inner {
  align-items: center;
  backdrop-filter: blur(14px);
  background: rgba(0, 0, 0, 0.12);
  border: 1px solid var(--color-border);
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  margin: 0 auto;
  min-height: 4.5rem;
  padding: 0.8rem 1rem;
  position: relative;
  width: min(1400px, 100%);
}

.app-footer__palette-anchor {
  justify-self: start;
  position: relative;
}

.app-footer__palette-tray {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  bottom: calc(100% + 0.75rem);
  display: grid;
  gap: 0.55rem;
  left: 0;
  min-width: 17rem;
  padding: 0.85rem;
  position: absolute;
}

.app-footer__palette-label {
  color: var(--color-muted);
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  margin: 0;
  text-transform: uppercase;
}

.app-footer__palette-option {
  align-items: center;
  background: transparent;
  border: 1px solid var(--color-border);
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 0.65rem;
  grid-template-columns: 1fr auto;
  padding: 0.7rem 0.8rem;
  text-align: left;
}

.app-footer__palette-option.is-active,
.app-footer__palette-option:hover {
  border-color: var(--color-primary);
}

.app-footer__palette-name {
  font-size: 0.92rem;
  font-weight: 600;
}

.app-footer__palette-swatches {
  display: inline-flex;
  gap: 0.3rem;
}

.app-footer__palette-swatch {
  border: 1px solid rgba(255, 255, 255, 0.15);
  display: inline-flex;
  height: 0.95rem;
  width: 0.95rem;
}

.app-footer__brand {
  font-family: "Bahnschrift", "Trebuchet MS", sans-serif;
  font-size: 0.94rem;
  justify-self: center;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.app-footer__status {
  color: var(--color-muted);
  font-size: 0.78rem;
  justify-self: end;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

@media (max-width: 720px) {
  .app-footer__inner {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .app-footer__palette-anchor,
  .app-footer__status {
    justify-self: center;
  }

  .app-footer__palette-tray {
    left: 50%;
    transform: translateX(-50%);
  }
}
</style>
