import { pickupPoint, pointDistance, type PickupPoint } from './order-offers'

export type DriverOrder = {
  id: string
  created_at: string
  from_address: string | null
  to_address: string | null
  from_lat: number | null
  from_lng: number | null
  car_type: string | null
  car_mark: string | null
  has_offered?: boolean
}
export function vehicleLabel(type: string | null) {
  return type === 'butten' ? 'Бүтэн ачигч' : type === 'chiregch' ? 'Чирэгч' : 'Ачигч'
}
export function nearbyOrders(orders: DriverOrder[], driver: PickupPoint | null) {
  return orders.map(order => ({ ...order, distance: pointDistance(driver, pickupPoint(order.from_lat, order.from_lng)) }))
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}
