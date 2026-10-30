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
export type NonTowServiceType = Exclude<ServiceType, 'achilt'>
export type ServiceDetailField = {
  key: string
  label: string
  placeholder: string
  required: boolean
  maxLength: number
}

export const SERVICE_DETAIL_FIELDS: Record<NonTowServiceType, readonly ServiceDetailField[]> = {
  crane: [
    { key: 'cargo', label: 'ЯМАР АЧАА ВЭ?', placeholder: 'Жишээ: контейнер, төмөр хийц, тоног төхөөрөмж', required: true, maxLength: 220 },
    { key: 'weight', label: 'ОЙРОЛЦОО ЖИН', placeholder: 'Жишээ: 2 тонн, 800 кг', required: true, maxLength: 100 },
    { key: 'destination', label: 'ХААШАА ЗӨӨХ / ӨРГӨХ ВЭ?', placeholder: 'Жишээ: 5 шар → Яармаг, 3 давхарт өргөнө', required: true, maxLength: 320 },
    { key: 'notes', label: 'НЭМЭЛТ МЭДЭЭЛЭЛ · ЗААВАЛ БИШ', placeholder: 'Орц, талбай, өндөр, нэвтрэх зам гэх мэт', required: false, maxLength: 350 },
  ],
  excavator: [
    { key: 'work', label: 'ЯМАР АЖИЛ ХИЙЛГЭХ ВЭ?', placeholder: 'Жишээ: суваг ухах, суурь ухах, газар тэгшлэх', required: true, maxLength: 320 },
    { key: 'duration', label: 'ОЙРОЛЦОО ХЭР УДААН?', placeholder: 'Жишээ: 3 цаг, 1 өдөр, 2 өдөр', required: true, maxLength: 100 },
    { key: 'notes', label: 'НЭМЭЛТ МЭДЭЭЛЭЛ · ЗААВАЛ БИШ', placeholder: 'Хөрсний нөхцөл, талбайн хэмжээ, нэвтрэх зам гэх мэт', required: false, maxLength: 350 },
  ],
  car_start: [
    { key: 'issue', label: 'МАШИН ЯАГААД АСАХГҮЙ БАЙНА?', placeholder: 'Жишээ: акк суусан, дарахад асахгүй, стартер эргэхгүй', required: true, maxLength: 320 },
    { key: 'vehicle', label: 'МАШИНЫ МАРК · ЗААВАЛ БИШ', placeholder: 'Жишээ: Toyota Prius 30', required: false, maxLength: 120 },
    { key: 'notes', label: 'НЭМЭЛТ МЭДЭЭЛЭЛ · ЗААВАЛ БИШ', placeholder: 'Асаахад ямар дуу гарах, гэрэл асах эсэх гэх мэт', required: false, maxLength: 350 },
  ],
  bobcat: [
    { key: 'work', label: 'ЯМАР АЖИЛ ХИЙЛГЭХ ВЭ?', placeholder: 'Жишээ: талбай цэвэрлэх, шороо зөөх, тэгшлэх', required: true, maxLength: 320 },
    { key: 'duration', label: 'ОЙРОЛЦОО ХЭР УДААН?', placeholder: 'Жишээ: 2 цаг, хагас өдөр, 1 өдөр', required: true, maxLength: 100 },
    { key: 'notes', label: 'НЭМЭЛТ МЭДЭЭЛЭЛ · ЗААВАЛ БИШ', placeholder: 'Талбайн хэмжээ, материал, нэвтрэх зам гэх мэт', required: false, maxLength: 350 },
  ],
  loader: [
    { key: 'work', label: 'ЯМАР АЖИЛ ХИЙЛГЭХ ВЭ?', placeholder: 'Жишээ: шороо ачих, цас түрэх, талбай тэгшлэх', required: true, maxLength: 320 },
    { key: 'material', label: 'ЯМАР МАТЕРИАЛ / ХЭМЖЭЭ ВЭ?', placeholder: 'Жишээ: 20 м³ шороо, дайрга, цас', required: true, maxLength: 180 },
    { key: 'duration', label: 'ОЙРОЛЦОО ХЭР УДААН?', placeholder: 'Жишээ: 4 цаг, 1 өдөр', required: true, maxLength: 100 },
    { key: 'notes', label: 'НЭМЭЛТ МЭДЭЭЛЭЛ · ЗААВАЛ БИШ', placeholder: 'Талбай, нэвтрэх зам, ачих машин байгаа эсэх', required: false, maxLength: 350 },
  ],
}

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
  // Backward compatibility: sessions created before service_type existed are towing sessions.
  // Non-towing services are complete without a towing subtype; towing still requires butten/chiregch.
  const normalized = isServiceType(serviceType) ? serviceType : 'achilt'
  return normalized !== 'achilt' || isTowType(carType)
}

export function serviceDetailFields(serviceType: unknown): readonly ServiceDetailField[] {
  return isServiceType(serviceType) && serviceType !== 'achilt' ? SERVICE_DETAIL_FIELDS[serviceType] : []
}

export function normalizeServiceDetails(serviceType: unknown, value: unknown): Record<string, string> | null {
  if (!isServiceType(serviceType)) return null
  if (serviceType === 'achilt') return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const result: Record<string, string> = {}
  for (const field of SERVICE_DETAIL_FIELDS[serviceType]) {
    if (source[field.key] !== undefined && typeof source[field.key] !== 'string') return null
    const text = typeof source[field.key] === 'string' ? source[field.key].trim() : ''
    if ((field.required && !text) || text.length > field.maxLength) return null
    if (text) result[field.key] = text
  }
  return result
}

export function serviceDetailEntries(serviceType: unknown, value: unknown) {
  if (!isServiceType(serviceType) || serviceType === 'achilt' || !value || typeof value !== 'object' || Array.isArray(value)) return []
  const source = value as Record<string, unknown>
  return SERVICE_DETAIL_FIELDS[serviceType]
    .map(field => ({ label: field.label.replace(' · ЗААВАЛ БИШ', ''), value: typeof source[field.key] === 'string' ? source[field.key].trim() : '' }))
    .filter(item => item.value)
}
