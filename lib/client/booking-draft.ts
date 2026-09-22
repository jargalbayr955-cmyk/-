import { pickupPoint } from '@/lib/order-offers'

export const BOOKING_DRAFT_KEY = 'achilt_booking_draft'
export type BookingScreen = 'map' | 'vehicle' | 'destination' | 'car' | 'review' | 'detail' | 'edit-vehicle' | 'edit-destination' | 'edit-car'
export const isBookingScreen = (value: string): value is BookingScreen => ['map', 'vehicle', 'destination', 'car', 'review', 'detail', 'edit-vehicle', 'edit-destination', 'edit-car'].includes(value)
export type BookingDraft = { carType: string; dest: string; carMark: string; extraAddress: string; location: { lat: number; lng: number } | null; orderId: string | null; request?: { id: string; payload: string } }
let memoryDraft: BookingDraft | null = null
let useMemoryDraft = false
export function readBookingDraft(): BookingDraft | null {
  if (useMemoryDraft) return memoryDraft
  try {
    const value = JSON.parse(sessionStorage.getItem(BOOKING_DRAFT_KEY) || 'null')
    if (!value || !['', 'butten', 'chiregch'].includes(value.carType) || !['dest', 'carMark', 'extraAddress'].every(key => typeof value[key] === 'string')) return null
    return { ...value, location: pickupPoint(value.location?.lat, value.location?.lng), orderId: typeof value.orderId === 'string' ? value.orderId : null }
  } catch { return memoryDraft }
}
export function saveBookingDraft(draft: BookingDraft) {
  memoryDraft = draft
  try { sessionStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(draft)); useMemoryDraft = false } catch { useMemoryDraft = true }
}
export function clearBookingDraft() {
  memoryDraft = null
  try { sessionStorage.removeItem(BOOKING_DRAFT_KEY); useMemoryDraft = false } catch { useMemoryDraft = true }
}

export function currentOrderId(): string | null {
  const draftId = readBookingDraft()?.orderId
  if (draftId) return draftId
  try { return localStorage.getItem('current_order_id') || null }
  catch { return null }
}
