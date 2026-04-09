export function isDevAuthBypassEnabled() {
  return import.meta.env.VITE_DEV === 'true'
}
