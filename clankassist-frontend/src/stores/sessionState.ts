import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { isDevAuthBypassEnabled } from '@/lib/env'
import { createPassword, getAuthState, loginWithPassword, logoutSession } from '@/lib/api'
import { defaultPaletteId, paletteMap, palettes } from '@/lib/palettes'

const PALETTE_STORAGE_KEY = 'clankassist.palette'
const fallbackPalette = palettes.find((palette) => palette.id === defaultPaletteId) ?? palettes[0]!

function getStoredPaletteId() {
  if (typeof window === 'undefined') {
    return defaultPaletteId
  }

  return window.localStorage.getItem(PALETTE_STORAGE_KEY) ?? defaultPaletteId
}

function toCssToken(token: string) {
  return token.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)
}

function getPaletteDefinition(paletteId: string) {
  return paletteMap[paletteId] ?? fallbackPalette
}

function applyPaletteVariables(paletteId: string) {
  if (typeof document === 'undefined') {
    return
  }

  const palette = getPaletteDefinition(paletteId)

  document.documentElement.dataset.palette = palette.id

  Object.entries(palette.colors).forEach(([token, value]) => {
    document.documentElement.style.setProperty(`--color-${toCssToken(token)}`, value)
  })
}

export const useSessionState = defineStore('sessionState', () => {
  const isInitialized = ref(false)
  const isAuthenticated = ref(false)
  const requiresPasswordSetup = ref(false)
  const paletteId = ref(getStoredPaletteId())
  const isDevBypassEnabled = isDevAuthBypassEnabled()

  const currentPalette = computed(() => getPaletteDefinition(paletteId.value))
  const hasAccess = computed(() => isDevBypassEnabled || isAuthenticated.value)

  function setPalette(nextPaletteId: string) {
    paletteId.value = paletteMap[nextPaletteId] ? nextPaletteId : defaultPaletteId

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, paletteId.value)
    }

    applyPaletteVariables(paletteId.value)
  }

  async function ensureInitialized() {
    applyPaletteVariables(paletteId.value)

    if (isInitialized.value) {
      return
    }

    if (isDevBypassEnabled) {
      isAuthenticated.value = true
      requiresPasswordSetup.value = false
      isInitialized.value = true
      return
    }

    const authState = await getAuthState()

    isAuthenticated.value = authState.isAuthenticated
    requiresPasswordSetup.value = authState.requiresPasswordSetup
    isInitialized.value = true
  }

  async function setPassword(password: string) {
    if (isDevBypassEnabled) {
      isAuthenticated.value = true
      requiresPasswordSetup.value = false
      return
    }

    const authState = await createPassword(password)

    isAuthenticated.value = authState.isAuthenticated
    requiresPasswordSetup.value = authState.requiresPasswordSetup
  }

  async function login(password: string) {
    if (isDevBypassEnabled) {
      isAuthenticated.value = true
      requiresPasswordSetup.value = false
      return
    }

    const authState = await loginWithPassword(password)

    isAuthenticated.value = authState.isAuthenticated
    requiresPasswordSetup.value = authState.requiresPasswordSetup
  }

  async function logout() {
    if (isDevBypassEnabled) {
      isAuthenticated.value = true
      return
    }

    await logoutSession()
    isAuthenticated.value = false
  }

  applyPaletteVariables(paletteId.value)

  return {
    currentPalette,
    ensureInitialized,
    hasAccess,
    isDevBypassEnabled,
    isAuthenticated,
    isInitialized,
    login,
    logout,
    paletteId,
    palettes,
    requiresPasswordSetup,
    setPalette,
    setPassword,
  }
})
