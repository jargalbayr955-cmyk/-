'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DriverRegistrationDialog } from './driver-registration'

const DRIVER_REGISTRATION_HISTORY = 'achiltDriverRegistration'

export function DriverRegistrationEntry() {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const syncHost = () => {
      const loginButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => {
        const text = button.textContent || ''
        return text.includes('Нэвтрэх →') || text.includes('Нэвтэрч байна...')
      })

      if (!loginButton) {
        if (hostRef.current) {
          hostRef.current.remove()
          hostRef.current = null
          setTarget(null)
        }
        return
      }

      if (!hostRef.current || !hostRef.current.isConnected) {
        const host = document.createElement('div')
        host.dataset.driverRegistrationHost = 'true'
        host.style.width = '100%'
        loginButton.insertAdjacentElement('afterend', host)
        hostRef.current = host
        setTarget(host)
      }
    }

    syncHost()
    const observer = new MutationObserver(syncHost)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      hostRef.current?.remove()
      hostRef.current = null
      setTarget(null)
    }
  }, [])

  useEffect(() => {
    const onPopState = () => setOpen(false)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const openRegistration = () => {
    if (open) return
    window.history.pushState({ ...window.history.state, [DRIVER_REGISTRATION_HISTORY]: true }, '', window.location.href)
    setOpen(true)
  }

  const closeRegistration = () => {
    if (window.history.state?.[DRIVER_REGISTRATION_HISTORY]) {
      window.history.back()
      return
    }
    setOpen(false)
  }

  const registrationButton = target ? createPortal(
    <div style={{ marginTop: 12, textAlign: 'center', display:'grid', gap:8 }}>
      <button
        type="button"
        onClick={openRegistration}
        style={{
          width: '100%', borderRadius: 14, padding: '14px 16px', background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 15, fontWeight: 800,
          cursor: 'pointer'
        }}
      >🚚 Жолоочоор бүртгүүлэх</button>
      <button
        type="button"
        onClick={() => { window.location.href = '/driver/recover' }}
        style={{
          width:'100%', borderRadius:12, padding:'11px 14px', background:'transparent',
          border:'1px solid rgba(255,255,255,0.12)', color:'rgba(255,255,255,.72)', fontSize:13, fontWeight:800,
          cursor:'pointer'
        }}
      >🔐 PIN мартсан / сэргээх</button>
      <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 12, lineHeight: 1.45, margin: '0 4px' }}>
        Шинээр жолооч болох бол бүртгүүлнэ. PIN мартсан бол SMS OTP-оор сэргээнэ.
      </p>
    </div>,
    target,
  ) : null

  const registrationDialog = open && typeof document !== 'undefined'
    ? createPortal(<DriverRegistrationDialog initialPhone="" onClose={closeRegistration} />, document.body)
    : null

  return <>{registrationButton}{registrationDialog}</>
}
