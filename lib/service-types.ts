export const SERVICE_TYPES = [
  { id: 'achilt', label: 'Ачилт', icon: '🚛', description: 'Автомашин ачиж, чирэх үйлчилгээ' },
  { id: 'crane', label: 'Кран', icon: '🏗️', description: 'Өргөх, буулгах кран үйлчилгээ' },
  { id: 'excavator', label: 'Экскаватор', icon: '🚜', description: 'Газар шорооны экскаватор үйлчилгээ' },
  { id: 'car_start', label: 'Машин асаалт', icon: '🔋', description: 'Асахгүй автомашинд очиж туслах' },
  { id: 'bobcat', label: 'Бобкат', icon: '🛠️', description: 'Бобкат жижиг техник үйлчилгээ' },
  { id: 'loader', label: 'Ковш', icon: '🚧', description: 'Ковш, ачигч техникийн үйлчилгээ' },
] as const

export type ServiceType = typeof SERVICE_TYPES[number]['id']
export type TowType = 'butten' | 'chiregch'

const SERVICE_IDS = new Set<string>(SERVICE_TYPES.map(item => item.id))

export function isServiceType(value: unknown): value is ServiceType {
  return typeof value === 'string' && SERVICE_IDS.has(value)
}

export function serviceLabel(value: unknown) {
  return SERVICE_TYPES.find(item => item.id === value)?.label || 'Үйлчилгээ'
}

export function serviceIcon(value: unknown) {
  return SERVICE_TYPES.find(item => item.id === value)?.icon || '📍'
}

export function serviceDescription(value: unknown) {
  return SERVICE_TYPES.find(item => item.id === value)?.description || ''
}

export function isTowType(value: unknown): value is TowType {
  return value === 'butten' || value === 'chiregch'
}

export function towTypeLabel(value: unknown) {
  return value === 'butten' ? 'Бүтэн ачигч' : value === 'chiregch' ? 'Чирэгч' : 'Ачилт'
}

export function driverServiceLabel(serviceType: unknown, carType?: unknown) {
  const normalized = isServiceType(serviceType) ? serviceType : 'achilt'
  return normalized === 'achilt' ? towTypeLabel(carType) : serviceLabel(normalized)
}

export function serviceProfileIsComplete(serviceType: unknown, carType?: unknown) {
  return isServiceType(serviceType) && (serviceType !== 'achilt' || isTowType(carType))
}
