'use client'

import { SERVICE_TYPES, type ServiceType } from '@/lib/service-types'

export function ServiceTypePicker({ value, onChange, disabled = false }: {
  value?: ServiceType | null
  onChange: (value: ServiceType) => void
  disabled?: boolean
}) {
  return <div style={{ display: 'grid', gap: 9 }} aria-label="Үйлчилгээний төрөл">
    {SERVICE_TYPES.map((service, index) => {
      const selected = value === service.id
      return <button
        key={service.id}
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        onClick={() => onChange(service.id)}
        style={{
          width: '100%', minHeight: 66, borderRadius: 15, padding: '10px 14px', cursor: disabled ? 'wait' : 'pointer',
          border: `1px solid ${selected ? 'rgba(232,67,58,.72)' : 'rgba(255,255,255,.13)'}`,
          background: selected ? 'rgba(232,67,58,.14)' : 'rgba(255,255,255,.055)', color: '#fff',
          display: 'grid', gridTemplateColumns: '34px 1fr auto', alignItems: 'center', gap: 11, textAlign: 'left',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 23, textAlign: 'center' }}>{service.icon}</span>
        <span style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 15 }}>{index + 1}. {service.label}</strong>
          <small style={{ display: 'block', marginTop: 3, color: 'rgba(255,255,255,.50)', fontSize: 12, lineHeight: 1.35 }}>{service.description}</small>
        </span>
        <span aria-hidden="true" style={{ color: selected ? '#ff7770' : 'rgba(255,255,255,.38)', fontSize: 18 }}>{selected ? '●' : '›'}</span>
      </button>
    })}
  </div>
}
