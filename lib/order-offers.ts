export type PickupPoint = { lat: number; lng: number }
export type DriverSlot = {
  invite_id: string
  driver_id: string
  rank: number
  lat: number | null
  lng: number | null
  distance_km: number | null
  driver_name: string | null
  photo_url?: string | null
  car_number?: string | null
  car_type?: string | null
  offer: { id: string; price: number } | null
}

// Straight-line distance; this is not a road route or a travel-time estimate.
export function pointDistance(a: PickupPoint | null, b: PickupPoint | null) {
  if (!a || !b) return null
  const rad = Math.PI / 180
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))))
}

export function locationIsFresh(updatedAt: string | null | undefined, now = Date.now()) {
  const time = updatedAt ? Date.parse(updatedAt) : NaN
  return Number.isFinite(time) && now - time < 120_000 && time <= now + 30_000
}

export function pickupPoint(lat: unknown, lng: unknown): PickupPoint | null {
  if (![lat, lng].every(value => (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '')) return null
  const a = Number(lat), b = Number(lng)
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null
}

export function mapOffers(slots: DriverSlot[]) {
  return slots.filter(slot => slot.offer && Number.isFinite(slot.offer.price) && slot.offer.price > 0 && pickupPoint(slot.lat, slot.lng))
}

export function offerPrice(price: number) {
  return `${price.toLocaleString('en-US')} ₮`
}

export function offerDistance(distance: number | null) {
  return distance != null && Number.isFinite(distance) && distance >= 0
    ? `${distance.toLocaleString('en-US', { maximumFractionDigits: 1 })} км зайтай`
    : 'Зай тодорхойгүй'
}

export function remainingSeconds(expiresAt: string | null, now = Date.now()) {
  if (!expiresAt) return null
  const expires = Date.parse(expiresAt)
  return Number.isFinite(expires) ? Math.max(0, Math.ceil((expires - now) / 1000)) : null
}

export function offerSnapshot(previous: Set<string> | null, slots: DriverSlot[]) {
  const ids = slots.flatMap(slot => slot.offer ? [slot.offer.id] : [])
  return { hasNew: previous !== null && ids.some(id => !previous.has(id)), seen: new Set([...(previous || []), ...ids]) }
}
