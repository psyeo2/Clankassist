export function isDevAuthBypassEnabled() {
  return import.meta.env.VITE_DEV === 'true'
}

export function getDefaultApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim()

  if (configured) {
    return configured.replace(/\/+$/, '')
  }

  return 'http://localhost:3000'
}
