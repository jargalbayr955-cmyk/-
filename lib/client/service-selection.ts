import { isServiceType, type ServiceType } from '@/lib/service-types'

export const CUSTOMER_SERVICE_KEY = 'achilt_selected_service'
let memoryService: ServiceType | null = null

export function readSelectedService(): ServiceType | null {
  try {
    const value = sessionStorage.getItem(CUSTOMER_SERVICE_KEY)
    if (isServiceType(value)) {
      memoryService = value
      return value
    }
  } catch {}
  return memoryService
}

export function saveSelectedService(value: ServiceType) {
  memoryService = value
  try { sessionStorage.setItem(CUSTOMER_SERVICE_KEY, value) } catch {}
}

export function clearSelectedService() {
  memoryService = null
  try { sessionStorage.removeItem(CUSTOMER_SERVICE_KEY) } catch {}
}
