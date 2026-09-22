export type PickupPoint = { lat: number; lng: number }
export type DriverSlot = {
  invite_id: string
  driver_id: string
  rank: number
  lat: number | null
  lng: number | null
  distance_km: number | null
  driver_name: string | null
  offer: { id: string; price: number } | null
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
