<template>
  <section class="panel api-unavailable-panel">
    <p class="page__lede">
      {{ message || 'The admin API could not be reached.' }}
    </p>

    <div class="action-row">
      <button class="action-button action-button--primary" type="button" @click="reloadPage">
        Retry connection
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  message: string
}>()

function reloadPage() {
  window.location.reload()
}
</script>

<style scoped>
.api-unavailable-panel {
  display: grid;
  gap: 1rem;
  justify-items: start;
}
</style>
