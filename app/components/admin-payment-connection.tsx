'use client'

import { useEffect, useRef, useState } from 'react'
import { createRequestSignal } from '@/lib/client/request-signal'
import styles from './admin-payment-queue.module.css'

export function AdminPaymentConnection() {
  const [open, setOpen] = useState(false)
  const [connection, setConnection] = useState<{ url: string; secret: string; bankName: string; bankAccount: string; configured: boolean } | null>(null)
  const [sender, setSender] = useState('')
  const [accountMask, setAccountMask] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const lifetime = useRef<AbortController | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!open) return
    const controller = new AbortController(), request = createRequestSignal(12_000, controller.signal)
    lifetime.current = controller
    void (async () => {
      try {
        const response = await fetch('/api/admin/payment-connection', { cache: 'no-store', signal: request.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Холболтын мэдээлэл олдсонгүй.')
        if (!controller.signal.aborted) { setConnection(body); setSender(body.sender); setAccountMask(body.accountMask) }
      } catch (cause) { if (!controller.signal.aborted) setMessage(cause instanceof Error ? cause.message : 'Дахин оролдоно уу.') }
      finally { request.dispose() }
    })()
    return () => { controller.abort(); request.dispose() }
  }, [open])
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setMessage('Хуулагдлаа.') }
    catch { setMessage('Талбарын утгыг сонгоод хуулна уу.') }
  }
  const save = async () => {
    if (savingRef.current) return
    savingRef.current = true; setSaving(true); setMessage('')
    const parent = lifetime.current?.signal, request = createRequestSignal(12_000, parent)
    try {
      const response = await fetch('/api/admin/payment-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender, accountMask }), signal: request.signal })
      const body = await response.json()
      if (parent?.aborted) return
      if (!response.ok) throw new Error(body.error || 'Хадгалж чадсангүй.')
      setSender(body.sender); setAccountMask(body.accountMask)
      setConnection(value => value && { ...value, configured: true })
      setMessage('Хадгаллаа. Одоо банкны SMS авдаг утасныхаа MacroDroid-ыг доорх заавраар холбоно уу.')
    } catch (cause) {
      if (!parent?.aborted) setMessage(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'Холболт тасарлаа. Хааж нээгээд тохиргоо хадгалагдсан эсэхийг шалгана уу.')
    } finally { request.dispose(); savingRef.current = false; if (!parent?.aborted) setSaving(false) }
  }
  return <div className={styles.connection}>
    <button type="button" disabled={saving} aria-expanded={open} onClick={() => { setOpen(value => !value); setConnection(null); setSender(''); setAccountMask(''); setMessage('') }}>MacroDroid холболт {open ? 'хаах' : 'тохируулах'}</button>
    {open && <div>
      <p className={styles.note}>Хаан банкны орлогын SMS-ийг бүтнээр нь илгээнэ. Сервер ORLOGO-оос орлогын дүн, Utga-аас 6 оронтой кодыг уншина. Үлдэгдэл, зарлага, амжилтгүй гүйлгээг төлбөрт тооцохгүй.</p>
      {connection ? <>
        <p className={styles.note}>Төлбөр авах данс: <strong>{connection.bankName} {connection.bankAccount || 'Хадгалаагүй'}</strong>. Үүнийг «Жолооч» цэсэнд хадгалж эсвэл солино. Данс сольсон бол SMS тохиргоог дахин хадгална.</p>
        <form onSubmit={event => { event.preventDefault(); void save() }}>
          <label htmlFor="payment-sms-sender">Банкны SMS илгээгчийн дугаар / ID</label>
          <input id="payment-sms-sender" value={sender} required maxLength={64} autoComplete="off" disabled={saving} onChange={event => setSender(event.target.value)} />
          <p className={styles.note}>SMS-ийн мэдээлэл дэх жинхэнэ илгээгчийг оруулна. Утасны жагсаалтад хадгалсан «Khan Bank» нэрээс өөр байж болно.</p>
          <label htmlFor="payment-sms-account">SMS дэх данс (жишээ: 5***2086)</label>
          <input id="payment-sms-account" value={accountMask} required maxLength={8} autoComplete="off" disabled={saving} onChange={event => setAccountMask(event.target.value)} placeholder="5***2086" />
          <p className={styles.note}>Төлбөр авах дансныхаа SMS-д байгаа байдлаар нь оруулна. Сүүлийн 4 орон нь дээрх данстай таарах ёстой.</p>
          <button type="submit" disabled={saving || !connection.bankAccount}>{saving ? 'Хадгалж байна…' : 'SMS тохиргоо хадгалах'}</button>
        </form>
        <p className={styles.note}>{connection.configured ? 'SMS шалгах тохиргоо хадгалагдсан. Утасны холболтыг бодит орлогоор шалгах шаардлагатай.' : 'SMS тохиргоо дутуу байна. Автоматаар эрх нээхэд эхлээд дээрх тохиргоог хадгална.'}</p>
        <p className={styles.note}>MacroDroid → SMS Received: зөвхөн банкны энэ илгээгчийг сонгоно. Дараа нь HTTP Request үйлдэл нэмж, POST сонгоно.</p>
        <label htmlFor="payment-hook-url">HTTP POST хаяг</label>
        <div className={styles.searchRow}><input id="payment-hook-url" value={connection.url} readOnly onFocus={event => event.target.select()} /><button type="button" onClick={() => void copy(connection.url)}>Хуулах</button></div>
        <label htmlFor="payment-hook-secret">x-webhook-secret</label>
        <div className={styles.searchRow}><input id="payment-hook-secret" type="password" value={connection.secret} readOnly autoComplete="off" onFocus={event => event.target.select()} /><button type="button" onClick={() => void copy(connection.secret)}>Хуулах</button></div>
        <p className={styles.note}>HTTP Headers-д <code>x-webhook-secret</code>-ийг дээрх түлхүүрээр, <code>x-sms-sender</code>-ийг Magic Text цэснээс ирсэн SMS-ийн илгээгчийн дугаараар тохируулна.</p>
        <p className={styles.note}>Content-Type: <code>text/plain; charset=utf-8</code>. Body / Content талбарт Magic Text цэснээс ирсэн SMS-ийн бүтэн текстийг сонгоно. Дүн, кодыг гараар задлахгүй, хуучин SMS-ийг жишээ болгон илгээхгүй.</p>
        <p className={styles.note}>Банкны данс, илгээгч зөв бөгөөд шилжүүлсэн дүн, код хоёулаа хүлээгдэж буй төлбөртэй таарвал эрх нээгдэнэ. Утас интернэттэй, SMS унших зөвшөөрөлтэй, MacroDroid ажиллаж байх шаардлагатай. Шилжүүлсэн ч эрх нээгдээгүй бол админ банкны хуулгаас шалгаж зөвшөөрнө.</p>
      </> : !message && <p className={styles.note}>Холболтыг ачаалж байна…</p>}
      {message && <p role="status" className={styles.note}>{message}</p>}
    </div>}
  </div>
}
