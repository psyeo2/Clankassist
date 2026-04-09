import './styles/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useSessionState } from './stores/sessionState'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

const sessionState = useSessionState(pinia)

router.beforeEach(async (to) => {
  await sessionState.ensureInitialized()

  if (to.meta.requiresAuth && !sessionState.hasAccess) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    }
  }

  if (to.name === 'login' && sessionState.hasAccess) {
    return typeof to.query.redirect === 'string' ? to.query.redirect : '/'
  }

  return true
})

router.afterEach((to) => {
  document.title = typeof to.meta.title === 'string' ? `${to.meta.title} | Clankassist` : 'Clankassist'
})

app.use(router)

void sessionState.ensureInitialized()

app.mount('#app')
