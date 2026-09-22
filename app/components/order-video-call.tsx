'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { initialVideoState, OrderVideoSession } from '@/lib/client/video-call'
import { nativeVideoNeedsUpdate } from '@/lib/client/native-driver'
import type { CallRole } from '@/lib/video-call'
import styles from './order-video-call.module.css'

function CameraIcon() {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="2" y="5" width="14" height="14" rx="3"/><path d="m16 9 6-3v12l-6-3"/></svg>
}

function StreamVideo({ stream, local = false }: { stream: MediaStream | null; local?: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [needsPlay, setNeedsPlay] = useState(false)
  useEffect(() => {
    const element = video.current
    if (!element) return
    let cancelled = false
    element.srcObject = stream
    if (stream) void element.play().then(() => { if (!cancelled) setNeedsPlay(false) }).catch(() => { if (!cancelled) setNeedsPlay(true) })
    return () => { cancelled = true; element.srcObject = null }
  }, [stream])
  return <div className={local ? styles.local : styles.remote}>
    {/* Live camera streams have no prerecorded caption track. */}
    <video ref={video} autoPlay playsInline muted={local} aria-label={local ? 'Таны камер' : 'Нөгөө талын камер'} />
    {local && <span>Та</span>}
    {needsPlay && <button type="button" className={styles.play} onClick={() => { void video.current?.play().then(() => setNeedsPlay(false)).catch(() => {}) }}>Дүрс, дууг нээх</button>}
  </div>
}

export function OrderVideoCall({ orderId, role, phone, peerName }: { orderId: string; role: CallRole; phone?: string | null; peerName?: string | null }) {
  const [state, setState] = useState(initialVideoState)
  const [needsUpdate, setNeedsUpdate] = useState(false)
  const session = useRef<OrderVideoSession | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const peer = peerName || (role === 'driver' ? 'Хэрэглэгч' : 'Жолооч')
  const open = ['preparing', 'ringing', 'incoming', 'connecting', 'connected'].includes(state.phase)
  useEffect(() => {
    // Defer native capability detection until hydration, alongside the session subscription.
    const value = new OrderVideoSession(orderId, role, value => { setState(value); setNeedsUpdate(nativeVideoNeedsUpdate()) })
    session.current = value; value.startPolling()
    return () => { session.current = null; value.dispose() }
  }, [orderId, role])
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    else if (!open && element.open) { element.close(); button.current?.focus() }
  }, [open])
  const message = needsUpdate ? 'Видео дуудлага хийхийн тулд жолоочийн аппаа шинэчилнэ үү.' : state.ready === false ? 'Видео дуудлага түр боломжгүй. Утсаар холбогдоно уу.' : state.message
  const title = state.phase === 'incoming' ? `${peer} видеогоор залгаж байна` : state.phase === 'ringing' ? 'Хариу хүлээж байна…' : state.phase === 'preparing' ? 'Камер, микрофон нээж байна…' : state.phase === 'connecting' ? 'Холбож байна…' : peer
  return <section className={styles.bar} aria-label="Видео дуудлага">
    <button ref={button} type="button" className={styles.call} disabled={state.ready !== true || needsUpdate || state.phase !== 'idle'} onClick={() => { void session.current?.callPeer() }}><CameraIcon />Видеогоор залгах</button>
    {message && <p className={styles.note} role="status">{message}</p>}
    {needsUpdate && <Link className={styles.link} href="/driver/app">Апп шинэчлэх →</Link>}
    {!open && state.ready && !needsUpdate && state.phase === 'idle' && !message && <p className={styles.note}>Хоёр тал энэ хуудсаа нээлттэй байлгана.</p>}
    {message && phone && <a className={styles.link} href={`tel:${phone}`}>Утсаар залгах · {phone}</a>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`call-title-${role}`} onCancel={event => { event.preventDefault(); session.current?.hangup() }}>
      <div className={styles.content}>
        <header><span className={styles.eyebrow}>АЧИЛТ · ВИДЕО ДУУДЛАГА</span><h2 id={`call-title-${role}`}>{title}</h2><p>Дуудлага бичигдэхгүй · Нэг удаа 10 минут хүртэл</p></header>
        {state.phase === 'incoming' ? <div className={styles.incoming}>
          <div className={styles.avatar}><CameraIcon /></div>
          <p>Авах үед камер, микрофоны зөвшөөрөл асууна.</p>
          <button type="button" className={styles.call} disabled={needsUpdate} onClick={() => { void session.current?.callPeer(true) }}>Дуудлага авах</button>
          {needsUpdate && <p>{message}</p>}
          <button type="button" className={styles.end} onClick={() => session.current?.hangup('Дуудлагаас татгалзлаа.')}>Татгалзах</button>
        </div> : <>
          <div className={styles.stage}><StreamVideo stream={state.remote} /><StreamVideo stream={state.local} local /></div>
          {state.message && <p className={styles.note} role="status">{state.message}</p>}
          <div className={styles.controls}>
            <button type="button" disabled={!state.local} aria-pressed={!state.microphone} onClick={() => session.current?.microphone()}>{state.microphone ? 'Микрофон хаах' : 'Микрофон асаах'}</button>
            <button type="button" disabled={!state.local} aria-pressed={!state.camera} onClick={() => session.current?.camera()}>{state.camera ? 'Камер хаах' : 'Камер асаах'}</button>
            <button type="button" disabled={!state.local} onClick={() => { void session.current?.switchCamera() }}>Камер солих</button>
          </div>
          <button type="button" className={styles.end} onClick={() => session.current?.hangup()}>Дуудлага дуусгах</button>
        </>}
        <p className={styles.note}>Жолооч хөдөлгөөнөө зогсоосны дараа дуудлага авна.</p>
      </div>
    </dialog>
  </section>
}
