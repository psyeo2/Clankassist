import type { RouteRecordRaw } from 'vue-router'

const DeviceManagementView = () => import('@/views/DeviceManagementView.vue')
const HomeView = () => import('@/views/HomeView.vue')
const LoginView = () => import('@/views/LoginView.vue')
const McpManagementView = () => import('@/views/McpManagementView.vue')
const NotFoundView = () => import('@/views/NotFoundView.vue')
const SettingsView = () => import('@/views/SettingsView.vue')

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: { requiresAuth: true, title: 'Overview' },
  },
  {
    path: '/devices',
    name: 'devices',
    component: DeviceManagementView,
    meta: { requiresAuth: true, title: 'Devices' },
  },
  {
    path: '/mcp',
    name: 'mcp',
    component: McpManagementView,
    meta: { requiresAuth: true, title: 'MCP' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsView,
    meta: { requiresAuth: true, title: 'Settings' },
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { title: 'Access', hideHeader: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundView,
    meta: { title: 'Not Found' },
  },
]
