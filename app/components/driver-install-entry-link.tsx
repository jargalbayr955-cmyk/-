'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function DriverInstallEntryLink() {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const syncHost = () => {
      const loginButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button.auth-submit')).find(button => {
        const text = button.textContent || ''
        return text.includes('Нэвтрэх') || text.includes('Шалгаж байна...')
      })

      if (!loginButton) {
        hostRef.current?.remove()
        hostRef.current = null
        setTarget(null)
        return
      }

      if (!hostRef.current || !hostRef.current.isConnected) {
        const host = document.createElement('div')
        host.dataset.driverInstallEntry = 'true'
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

  if (!target) return null

  return createPortal(
    <div style={{ marginTop: 12, textAlign: 'center' }}>
      <a
        href="/driver"
        style={{
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
          borderRadius: 14,
          padding: '14px 16px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.16)',
          color: '#fff',
          fontSize: 15,
          fontWeight: 800,
          textDecoration: 'none',
        }}
      >
        📲 Жолооч апп утас дээр суулгах
      </a>
      <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 12, lineHeight: 1.45, margin: '8px 4px 0' }}>
        Дармагц жолоочийн суулгах хэсэг нээгдэнэ.
      </p>
    </div>,
    target
  )
}
