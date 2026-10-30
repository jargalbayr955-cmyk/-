import { driverServiceLabel, isServiceType, isTowType, type ServiceType, type TowType } from '@/lib/service-types'

export type DriverRoom = {
  key: string
  label: string
  serviceType: ServiceType
  carType: TowType | null
}

export function driverRoomProfile(serviceType: unknown, carType?: unknown): DriverRoom | null {
  if (!isServiceType(serviceType)) return null
  if (serviceType === 'achilt') {
    if (!isTowType(carType)) return null
    return {
      key: `achilt:${carType}`,
      label: driverServiceLabel(serviceType, carType),
      serviceType,
      carType,
    }
  }
  return {
    key: serviceType,
    label: driverServiceLabel(serviceType),
    serviceType,
    carType: null,
  }
}

export function driverRoomKey(serviceType: unknown, carType?: unknown) {
  return driverRoomProfile(serviceType, carType)?.key || null
}

export function sameDriverRoom(
  a: { service_type?: unknown; car_type?: unknown },
  b: { service_type?: unknown; car_type?: unknown },
) {
  const key = driverRoomKey(a.service_type, a.car_type)
  return Boolean(key && key === driverRoomKey(b.service_type, b.car_type))
}
