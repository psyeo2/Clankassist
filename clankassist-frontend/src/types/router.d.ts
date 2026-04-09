// Route meta type augmentation for Vue Router
import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    title?: string
    hideHeader?: boolean
  }
}
