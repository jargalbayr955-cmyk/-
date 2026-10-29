'use client'

import { useRouter } from 'next/navigation'
import { CustomerAccount } from '../components/customer-account'
import { ServiceTypePicker } from '../components/service-type-picker'
import { clearBookingDraft } from '@/lib/client/booking-draft'
import { saveSelectedService } from '@/lib/client/service-selection'
import type { ServiceType } from '@/lib/service-types'

export default function ServicesPage() {
  const router = useRouter()
  const choose = (service: ServiceType) => {
    saveSelectedService(service)
    clearBookingDraft()
    try {
      for (const key of ['current_order_id', 'tracking_driver_id', 'fromAddress', 'fromLat', 'fromLng', 'dest']) localStorage.removeItem(key)
    } catch {}
    router.replace('/current')
  }

  return <main style={{ minHeight: '100dvh', background: '#060608', color: '#fff', padding: '18px 16px 34px' }}>
    <div style={{ width: 'min(100%, 460px)', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}><CustomerAccount /></div>
      <div style={{ marginBottom: 18 }}>
        <p style={{ margin: '0 0 7px', color: '#ff7770', fontSize: 12, fontWeight: 900, letterSpacing: '.08em' }}>ҮЙЛЧИЛГЭЭ СОНГОХ</p>
        <h1 style={{ margin: 0, fontSize: 25, lineHeight: 1.2 }}>Ямар үйлчилгээ хэрэгтэй вэ?</h1>
        <p style={{ margin: '9px 0 0', color: 'rgba(255,255,255,.56)', fontSize: 14, lineHeight: 1.5 }}>Үйлчилгээгээ сонгоход газрын зураг нээгдэж, таны байршилд хамгийн ойр тохирох жолооч нарыг хайна.</p>
      </div>
      <ServiceTypePicker onChange={choose} />
    </div>
  </main>
}
