<template>
  <span
    class="app-icon"
    :class="{ 'app-icon--missing': !iconMarkup }"
    :aria-hidden="decorative ? 'true' : undefined"
    :aria-label="ariaLabel"
    :role="decorative ? undefined : 'img'"
    :style="{ '--icon-color': color, '--icon-size': iconSize }"
    :title="title"
  >
    <span v-if="iconMarkup" class="app-icon__svg" v-html="iconMarkup"></span>
    <span v-else class="app-icon__fallback">{{ icon.slice(0, 1).toUpperCase() }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  color?: string
  decorative?: boolean
  icon: string
  size?: number | string
  title?: string
}>(), {
  color: 'currentColor',
  decorative: true,
  size: 20,
  title: '',
})

const iconModules = import.meta.glob('../assets/icons/*.svg', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const iconMarkup = computed(() => iconModules[`../assets/icons/${props.icon}.svg`] ?? '')

const iconSize = computed(() => {
  return typeof props.size === 'number' ? `${props.size}px` : props.size
})

const ariaLabel = computed(() => {
  return props.decorative ? undefined : props.title || props.icon
})
</script>

<style scoped>
.app-icon {
  align-items: center;
  color: var(--icon-color);
  display: inline-flex;
  height: var(--icon-size);
  justify-content: center;
  width: var(--icon-size);
}

.app-icon__svg {
  display: contents;
}

.app-icon :deep(svg) {
  display: block;
  fill: currentColor;
  height: 100%;
  width: 100%;
}

.app-icon__fallback {
  align-items: center;
  border: 1px solid currentColor;
  display: inline-flex;
  font-size: calc(var(--icon-size) * 0.55);
  font-weight: 700;
  height: 100%;
  justify-content: center;
  width: 100%;
}

.app-icon--missing {
  opacity: 0.72;
}
</style>
