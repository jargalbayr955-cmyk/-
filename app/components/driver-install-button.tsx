'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isNativeDriver } from '@/lib/client/native-driver'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function browserStandaloneMode() {
  if (typeof window === 'undefined') return false
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || Boolean(navigatorWithStandalone.standalone)
}

export function DriverInstallButton() {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [help, setHelp] = useState('')
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setInstalled(isNativeDriver() || browserStandaloneMode())
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})

    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
      setHelp('')
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallPrompt(null)
      setHelp('')
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    if (isNativeDriver() || browserStandaloneMode()) return

    const syncHost = () => {
      const loginButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => {
        const text = button.textContent || ''
        return text.includes('Нэвтрэх →') || text.includes('Нэвтэрч байна...')
      })
      const legacyDownload = document.querySelector<HTMLAnchorElement>('a[href="/driver/app"]')

      if (!loginButton) {
        if (hostRef.current) {
          hostRef.current.remove()
          hostRef.current = null
          setTarget(null)
        }
        if (legacyDownload?.dataset.achiltInstallHidden === '1') {
          legacyDownload.style.removeProperty('display')
          delete legacyDownload.dataset.achiltInstallHidden
        }
        return
      }

      if (legacyDownload) {
        legacyDownload.dataset.achiltInstallHidden = '1'
        legacyDownload.style.display = 'none'
      }

      if (!hostRef.current || !hostRef.current.isConnected) {
        const host = document.createElement('div')
        host.dataset.driverInstallHost = 'true'
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
      const legacyDownload = document.querySelector<HTMLAnchorElement>('a[href="/driver/app"][data-achilt-install-hidden="1"]')
      if (legacyDownload) {
        legacyDownload.style.removeProperty('display')
        delete legacyDownload.dataset.achiltInstallHidden
      }
    }
  }, [])

  const install = async () => {
    if (isNativeDriver() || browserStandaloneMode()) {
      setInstalled(true)
      return
    }
    setHelp('')

    if (installPrompt) {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      setInstallPrompt(null)
      if (choice.outcome === 'accepted') setHelp('Суулгаж байна. Дараа нь утасны нүүрэн дээрх “Ачилт” icon-оос шууд жолоочийн нүүр нээгдэнэ.')
      return
    }

    const ua = navigator.userAgent
    const ios = /iPhone|iPad|iPod/i.test(ua)
    const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)

    if (ios) {
      setHelp(safari
        ? 'Safari-ийн Share (□↑) → “Add to Home Screen” → Add дарна уу.'
        : 'iPhone дээр энэ хуудсыг Safari-аар нээгээд Share (□↑) → “Add to Home Screen” → Add дарна уу.')
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
          width: '100%', borderRadius: 14, padding: '14px 16px', background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.16)', color: '#fff', fontSize: 15, fontWeight: 800,
          cursor: 'pointer'
        }}
      >📲 Жолооч апп утас дээр суулгах</button>
      <p style={{ color: 'rgba(255,255,255,0.42)', fontSize: 12, lineHeight: 1.45, margin: '8px 4px 0' }}>
        Нэг удаа суулгаад утасны нүүрэн дээрх Ачилт icon-оос жолоочийн нүүрийг шууд нээнэ.
      </p>
      {help && <p role="status" style={{ color: '#ffd166', fontSize: 12, lineHeight: 1.5, margin: '8px 4px 0' }}>{help}</p>}
    </div>,
    target
  )
}
