import { reactive } from 'vue'

export const apiAvailability = reactive({
  isReachable: true,
  message: '',
})

export function markApiReachable() {
  apiAvailability.isReachable = true
  apiAvailability.message = ''
}

export function markApiUnreachable(message: string) {
  apiAvailability.isReachable = false
  apiAvailability.message = message
}
