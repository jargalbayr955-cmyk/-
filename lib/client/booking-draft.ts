import { pickupPoint } from '@/lib/order-offers'

export const BOOKING_DRAFT_KEY = 'achilt_booking_draft'
export type BookingScreen = 'map' | 'vehicle' | 'destination' | 'car' | 'review' | 'detail' | 'edit-vehicle' | 'edit-destination' | 'edit-car'
export const isBookingScreen = (value: string): value is BookingScreen => ['map', 'vehicle', 'destination', 'car', 'review', 'detail', 'edit-vehicle', 'edit-destination', 'edit-car'].includes(value)
export type BookingDraft = { carType: string; dest: string; carMark: string; extraAddress: string; location: { lat: number; lng: number } | null; orderId: string | null }
export function readBookingDraft(): BookingDraft | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(BOOKING_DRAFT_KEY) || 'null')
    if (!value || !['', 'butten', 'chiregch'].includes(value.carType) || !['dest', 'carMark', 'extraAddress'].every(key => typeof value[key] === 'string')) return null
    return { ...value, location: pickupPoint(value.location?.lat, value.location?.lng), orderId: typeof value.orderId === 'string' ? value.orderId : null }
  } catch { return null }
}
export function saveBookingDraft(draft: BookingDraft) {
  try { sessionStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(draft)) } catch {}
}
export function clearBookingDraft() {
  try { sessionStorage.removeItem(BOOKING_DRAFT_KEY) } catch {}
}
