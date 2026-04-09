<template>
  <section class="page page-login">
    <div class="page-login__layout">
      <section class="panel page-login__panel">
        <p class="page__eyebrow">Secure access</p>
        <h1 class="page__title">Clankassist</h1>
        <p class="page__lede">
          {{
            isFirstRun
              ? 'Set the local shell password before the command deck opens.'
              : 'Enter the shell password to reopen the local workspace.'
          }}
        </p>

        <form class="page-login__form" @submit.prevent="handleSubmit">
          <label class="field">
            <span class="field__label">{{ isFirstRun ? 'Choose password' : 'Password' }}</span>
            <input v-model="password" class="text-input" type="password" />
          </label>

          <label v-if="isFirstRun" class="field">
            <span class="field__label">Confirm password</span>
            <input v-model="confirmPassword" class="text-input" type="password" />
          </label>

          <p v-if="errorMessage" class="inline-message inline-message--danger">{{ errorMessage }}</p>

          <button
            class="action-button action-button--primary"
            :disabled="isSubmitting || !canSubmit"
            type="submit"
          >
            <AppIcon :icon="isFirstRun ? 'add-circle-line' : 'account-circle-line'" />
            <span>{{ isFirstRun ? 'Initialize access' : 'Unlock shell' }}</span>
          </button>
        </form>
      </section>

      <aside class="panel page-login__aside">
        <div class="section-heading">
          <AppIcon icon="settings-3-line" />
          <span class="section-heading__title">Entry notes</span>
        </div>

        <div class="stack-list">
          <article class="stack-list__item">
            <h2 class="stack-list__title">First-time flow</h2>
            <p class="muted-copy">Stores a local password and immediately opens the shell.</p>
          </article>
          <article class="stack-list__item">
            <h2 class="stack-list__title">Repeat access</h2>
            <p class="muted-copy">Checks the password through <code>lib/api.ts</code>.</p>
          </article>
          <article class="stack-list__item">
            <h2 class="stack-list__title">Palette access</h2>
            <p class="muted-copy">Footer palette control stays available before login.</p>
          </article>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import { useSessionState } from '@/stores/sessionState'

const route = useRoute()
const router = useRouter()
const sessionState = useSessionState()

const password = ref('')
const confirmPassword = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

const isFirstRun = computed(() => sessionState.requiresPasswordSetup)

const canSubmit = computed(() => {
  if (isFirstRun.value) {
    return password.value.trim().length >= 4 && confirmPassword.value.trim().length >= 4
  }

  return password.value.trim().length > 0
})

async function handleSubmit() {
  errorMessage.value = ''

  if (isFirstRun.value && password.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match.'
    return
  }

  isSubmitting.value = true

  try {
    if (isFirstRun.value) {
      await sessionState.setPassword(password.value)
    } else {
      await sessionState.login(password.value)
    }

    const redirectTarget = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.push(redirectTarget)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to continue.'
  } finally {
    isSubmitting.value = false
  }
}

onMounted(async () => {
  await sessionState.ensureInitialized()
})
</script>

<style scoped>
.page-login {
  align-items: center;
  display: grid;
  min-height: calc(100vh - 10rem);
}

.page-login__layout {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: minmax(0, 1.3fr) minmax(18rem, 0.8fr);
}

.page-login__panel {
  display: grid;
  gap: 1.25rem;
  min-height: 30rem;
}

.page-login__form {
  display: grid;
  gap: 1rem;
  max-width: 28rem;
}

.page-login__aside {
  align-content: start;
}

@media (max-width: 920px) {
  .page-login__layout {
    grid-template-columns: 1fr;
  }
}
</style>
