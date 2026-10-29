import type { ReactNode } from 'react'
import { SessionGate } from '../components/session-gate'

export default function ServicesLayout({ children }: { children: ReactNode }) {
  return <SessionGate mode="customer">{children}</SessionGate>
}
