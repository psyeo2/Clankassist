import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import AppFooter from './components/AppFooter.vue'
import AppNavbar from './components/AppNavbar.vue'
import router from './router'

const app = createApp(App)

app.component('AppNavbar', AppNavbar)
app.component('AppFooter', AppFooter)
app.use(createPinia())
app.use(router)

app.mount('#app')
