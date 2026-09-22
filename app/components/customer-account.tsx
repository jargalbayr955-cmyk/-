'use client'

import { useRef, useState } from 'react'
import { displayPhone, logoutCustomer } from '@/lib/client/session'
import { useCustomerIdentity } from './session-gate'

export function CustomerAccount() {
  const user = useCustomerIdentity()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)

  const logout = async () => {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await logoutCustomer()
      // A fresh document prevents the router from reusing a previous account's UI.
      window.location.replace('/start')
    } catch {
      setError('Гарч чадсангүй. Холболтоо шалгаад «Гарах» товчийг дахин дарна уу.')
      setBusy(false)
      pending.current = false
    }
  }

  return <div className="customer-account-wrap">
    <div className="customer-account" aria-label="Нэвтэрсэн хэрэглэгч">
      <div><span className="customer-account-label">Нэвтэрсэн дугаар</span><strong className="customer-account-phone">{displayPhone(user.phone)}</strong></div>
      <button type="button" className="customer-logout" onClick={() => void logout()} disabled={busy}>{busy ? 'Гарч байна...' : 'Гарах'}</button>
    </div>
    {error && <p role="alert" className="account-error">{error}</p>}
  </div>
}
