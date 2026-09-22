'use client'

import { useEffect, useRef, useState } from 'react'
import { createRequestSignal } from '@/lib/client/request-signal'
import { AdminPaymentQueue, type PendingDriverPayment } from './admin-payment-queue'
import styles from './admin-payment-queue.module.css'

export function AdminPaymentPanel({ onSessionExpired, onApproved }: { onSessionExpired: () => void; onApproved: () => void }) {
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; payments: PendingDriverPayment[]; total: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [approvalError, setApprovalError] = useState('')
  const [message, setMessage] = useState('')
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const approvalPending = useRef(false)
  const sequence = useRef(0)
  const lifetime = useRef<AbortController | null>(null)
  const key = JSON.stringify([search, offset])
  const current = result?.key === key ? result : null

  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller
    return () => controller.abort()
  }, [])

  useEffect(() => {
    let active = true, inFlight = false
    const controller = new AbortController()
    const load = async () => {
      if (inFlight || approvalPending.current) return
      inFlight = true
      const attempt = ++sequence.current, request = createRequestSignal(12_000, controller.signal)
      setLoading(true)
      try {
        const response = await fetch(`/api/admin/payments?q=${encodeURIComponent(search)}&offset=${offset}`, { cache: 'no-store', signal: request.signal })
        if (!active || attempt !== sequence.current) return
        if (response.status === 401 || response.status === 403) { onSessionExpired(); return }
        const body = await response.json()
        if (!active || attempt !== sequence.current) return
        if (!response.ok) throw new Error(body.error || 'Мэдээлэл шинэчлэгдсэнгүй.')
        if (offset > 0 && offset >= body.total) { setOffset(Math.max(0, Math.ceil(body.total / 50) - 1) * 50); return }
        setResult({ key, payments: body.payments, total: body.total }); setError('')
      } catch (cause) {
        if (active && attempt === sequence.current) setError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'Холболтоо шалгаад дахин оролдоно уу.')
      } finally {
        request.dispose(); inFlight = false
        if (active && attempt === sequence.current) setLoading(false)
      }
    }
    void load()
    const refresh = () => { if (document.visibilityState === 'visible') void load() }
    const timer = setInterval(refresh, 10_000)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [search, offset, key, revision, onSessionExpired])

  const approve = async (orderId: string) => {
    if (approvalPending.current) return
    approvalPending.current = true; sequence.current++
    setApprovingId(orderId); setMessage(''); setApprovalError('')
    const parent = lifetime.current?.signal, request = createRequestSignal(12_000, parent)
    try {
      const response = await fetch('/api/admin/drivers', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'release_payment', order_id: orderId }), signal: request.signal })
      const body = await response.json()
      if (parent?.aborted) return
      if (response.status === 401 || response.status === 403) { onSessionExpired(); return }
      if (!response.ok) throw new Error(body.error || 'Зөвшөөрөл хадгалагдсангүй.')
      setResult(value => value && { ...value, payments: value.payments.filter(payment => payment.id !== orderId), total: Math.max(0, value.total - 1) })
      setMessage(body.available ? 'Зөвшөөрлөө. Жолооч дараагийн захиалга авах боломжтой.' : body.pending_payments > 0 ? 'Захиалгыг зөвшөөрлөө. Жолоочид хүлээгдэж буй өөр төлбөр байна.' : 'Захиалгыг зөвшөөрлөө. Жолоочийн бүртгэл болон ажиллах төлөвийг шалгана уу.')
      onApproved()
    } catch (cause) {
      if (!parent?.aborted) setApprovalError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'Холболт тасарлаа. Мэдээллээ шинэчлээд зөвшөөрөл хадгалагдсан эсэхийг шалгана уу.')
    } finally {
      request.dispose(); approvalPending.current = false
      if (!parent?.aborted) { setApprovingId(null); setRevision(value => value + 1) }
    }
  }

  const clear = () => { setDraft(''); setSearch(''); setOffset(0); setMessage(''); setError(''); setApprovalError('') }
  return <section className={styles.queue} aria-label="Жолоочийн эрх нээх">
    <h2 className={styles.heading}>Жолоочийн эрх нээх {current && <span>{current.total}</span>}</h2>
    <p className={styles.note}>Улсын дугаар эсвэл утасны дугаараар хайж, төлбөрийг шалгаад зөвшөөрнө үү.</p>
    <form role="search" className={styles.search} onSubmit={event => { event.preventDefault(); if (approvalPending.current) return; setSearch(draft.trim()); setOffset(0); setMessage(''); setError(''); setRevision(value => value + 1) }}>
      <label htmlFor="approval-search">Машины улсын дугаар / утасны дугаар</label>
      <div className={styles.searchRow}>
        <input id="approval-search" type="search" enterKeyHint="search" autoComplete="off" maxLength={40} value={draft} disabled={approvingId !== null} onChange={event => setDraft(event.target.value)} placeholder="Жишээ: 1234 УБА эсвэл 99112233" />
        <button type="submit" disabled={approvingId !== null}>Хайх</button>
      </div>
      {(draft || search) && <button type="button" className={styles.clear} disabled={approvingId !== null} onClick={clear}>Хайлт арилгах · Бүгдийг харах</button>}
    </form>
    {message && <p className={styles.success} role="status">{message}</p>}
    {approvalError && <p className={styles.error} role="alert">{approvalError}</p>}
    {error && <p className={styles.error} role="alert">{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Дахин ачаалах</button></p>}
    {loading && <p className={styles.note} role="status">Шинэчилж байна…</p>}
    {current && <>
      <p className={styles.note}>{search ? `«${search}» хайлтаар ${current.total} захиалга олдлоо.` : `Зөвшөөрөл хүлээж буй ${current.total} захиалга.`}</p>
      {!loading && current.payments.length === 0 && <p className={styles.note}>{search ? 'Тохирох хүлээгдэж буй төлбөр олдсонгүй. Дугаараа шалгах эсвэл хайлтаа арилгана уу.' : 'Админы зөвшөөрөл хүлээсэн захиалга алга.'}</p>}
      <AdminPaymentQueue payments={current.payments} approvingId={approvingId} disabled={loading} onApprove={approve} />
      {(offset > 0 || current.total > 50) && <nav className={styles.pagination} aria-label="Хайлтын хуудсууд">
        <button type="button" disabled={offset === 0 || loading || approvingId !== null} onClick={() => setOffset(value => Math.max(0, value - 50))}>← Өмнөх</button>
        <span>{offset + 1}–{Math.min(offset + 50, current.total)} / {current.total}</span>
        <button type="button" disabled={offset + 50 >= current.total || loading || approvingId !== null} onClick={() => setOffset(value => value + 50)}>Дараах →</button>
      </nav>}
    </>}
  </section>
}
