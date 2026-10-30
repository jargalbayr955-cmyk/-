'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function browserStandaloneMode() {
  if (typeof window === 'undefined') return false
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || Boolean(navigatorWithStandalone.standalone)
}

export function DriverInstallEntryLink() {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [help, setHelp] = useState('')
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setInstalled(browserStandaloneMode())
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})

    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
      setHelp('')
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
      setHelp('Ачилт апп суулгагдлаа. Утасны нүүрэн дээрх “Ачилт” icon-оос жолоочийн бүртгүүлэх/нэвтрэх нүүр шууд нээгдэнэ.')
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

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

  const install = async () => {
    setHelp('')

    if (installPrompt) {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      setInstallPrompt(null)
      if (choice.outcome === 'accepted') {
        setHelp('Суулгаж байна. Суулгасны дараа “Ачилт” icon-оос жолоочийн бүртгүүлэх/нэвтрэх нүүр шууд нээгдэнэ.')
      }
      return
    }

    const ua = navigator.userAgent
    const ios = /iPhone|iPad|iPod/i.test(ua)
    const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)

    if (browserStandaloneMode()) {
      setInstalled(true)
      return
    }

    if (ios) {
      setHelp(safari
        ? 'Safari-ийн Share (□↑) → “Add to Home Screen” → Add дарна уу. Суулгасан icon жолоочийн бүртгүүлэх/нэвтрэх нүүрийг нээнэ.'
        : 'iPhone дээр Safari-аар энэ нүүрийг нээгээд Share (□↑) → “Add to Home Screen” → Add дарна уу.')
      return
    }

    setHelp('Chrome-ийн ⋮ цэс → “Install app” эсвэл “Add to Home screen” дарна уу.')
  }

  if (!target || installed) return null

  return createPortal(
    <div style={{ marginTop: 12, textAlign: 'center' }}>
      <button
        type="button"
        onClick={() => void install()}
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
          cursor: 'pointer',
        }}
      >
        📲 Жолооч апп утас дээр суулгах
      </button>
      <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 12, lineHeight: 1.45, margin: '8px 4px 0' }}>
        Эндээс шууд суулгана. Суулгасны дараа Ачилт icon жолоочийн бүртгүүлэх/нэвтрэх нүүрийг шууд нээнэ.
      </p>
      {help && <p role="status" style={{ color: '#ffd166', fontSize: 12, lineHeight: 1.5, margin: '8px 4px 0' }}>{help}</p>}
    </div>,
    target
  )
}
