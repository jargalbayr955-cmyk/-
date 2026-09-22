export type AdminDriver = {
  id: string; name: string; phone: string; car_type: string; car_number?: string | null
  available: boolean; active: boolean; lat?: number | null; lng?: number | null; location_updated_at?: string | null
}
export type AdminOrder = {
  id: string; created_at: string; completed_at?: string | null; from_address: string; to_address: string
  driver_name: string; driver_phone: string; car_type: string; car_mark: string; status: string
  final_price: number; duration_minutes?: number | null
}
export type AdminDashboard = {
  drivers: AdminDriver[]; orders: AdminOrder[]; activeOrders: AdminOrder[]; pendingApprovalCount: number
  heroUrl: string; bankName: string; bankAccount: string
}
export type DriverFilter = 'all' | 'available' | 'paused'
export const adminSections = [
  { id: 'overview', label: 'Ерөнхий тойм', description: 'Хүлээгдэж буй ажил, хурдан үйлдэл' },
  { id: 'payments', label: 'Төлбөр · Эрх нээх', description: 'Шимтгэл шалгаж, жолоочийн эрх нээх' },
  { id: 'drivers', label: 'Жолооч нар', description: 'Бүртгэл, утас, улсын дугаар, PIN' },
  { id: 'active', label: 'Явагдаж буй захиалга', description: 'Жолооч сонгогдсон захиалгууд' },
  { id: 'history', label: 'Дууссан захиалга', description: 'Сүүлийн 24 цагт үүсэж, дууссан захиалга' },
  { id: 'map', label: 'Жолоочийн байршил', description: 'Захиалга авахад бэлэн жолооч нар' },
  { id: 'settings', label: 'Тохиргоо', description: 'Банк, автомат нээлт, зураг, нууц үг' },
] as const
export type AdminTab = typeof adminSections[number]['id']
export const validAdminScreen = (value: string): value is string => /^(overview|drivers|payments|active|history|map|settings)(:password|:add)?$/.test(value)
export function filterAdminDrivers(drivers: AdminDriver[], query: string, filter: DriverFilter) {
  const normalize = (value: string) => value.toLocaleLowerCase('mn-MN').replace(/[\s+-]/g, '')
  const term = normalize(query)
  return drivers.filter(driver => (filter === 'all' || (filter === 'paused' ? !driver.active : driver.active && driver.available))
    && [driver.name, driver.phone, driver.car_number || ''].some(value => normalize(value || '').includes(term)))
}
export const adminMoney = (value: number | null | undefined) => `${Number(value || 0).toLocaleString('mn-MN')} ₮`
export const adminCarLabel = (type: string) => type === 'butten' ? 'Бүтэн ачигч' : type === 'chiregch' ? 'Чирэгч' : 'Машины төрөл бүртгээгүй'
export function adminDate(value?: string | null) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Огноо байхгүй'
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(part => [part.type, part.value]))
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`
}
