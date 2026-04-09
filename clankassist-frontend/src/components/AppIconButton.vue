<template>
  <button
    class="app-icon-button"
    :class="{ 'is-active': active }"
    :aria-label="label || title || icon"
    :disabled="disabled"
    :style="{ '--button-color': color, '--button-size': buttonSize }"
    :title="title || label"
    type="button"
    @click="handleClick"
  >
    <AppIcon :color="color" :icon="icon" :size="iconSize" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import AppIcon from '@/components/AppIcon.vue'

const emit = defineEmits<{
  click: []
}>()

const props = withDefaults(defineProps<{
  action?: () => void | Promise<void>
  active?: boolean
  color?: string
  disabled?: boolean
  icon: string
  iconSize?: number | string
  label?: string
  size?: number | string
  title?: string
}>(), {
  active: false,
  color: 'currentColor',
  disabled: false,
  iconSize: 20,
  label: '',
  size: 44,
  title: '',
})

const buttonSize = computed(() => {
  return typeof props.size === 'number' ? `${props.size}px` : props.size
})

async function handleClick() {
  if (props.disabled) {
    return
  }

  emit('click')
  await props.action?.()
}
</script>

<style scoped>
.app-icon-button {
  align-items: center;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 55%),
    var(--color-surface);
  border: 1px solid var(--color-border);
  clip-path: polygon(0 0, calc(100% - 0.6rem) 0, 100% 0.6rem, 100% 100%, 0.6rem 100%, 0 calc(100% - 0.6rem));
  color: var(--button-color);
  cursor: pointer;
  display: inline-flex;
  height: var(--button-size);
  justify-content: center;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease;
  width: var(--button-size);
}

.app-icon-button:hover {
  border-color: var(--color-primary);
  transform: translateY(-1px);
}

.app-icon-button.is-active {
  background: var(--color-surface-strong);
  border-color: var(--color-accent);
}

.app-icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  transform: none;
}
</style>
