'use client'

import { useEffect, useState } from 'react'
import { createRequestSignal } from '@/lib/client/request-signal'
import styles from './admin-payment-queue.module.css'

export function AdminPaymentConnection() {
  const [open, setOpen] = useState(false)
  const [connection, setConnection] = useState<{ url: string; secret: string } | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!open) return
    const controller = new AbortController(), request = createRequestSignal(12_000, controller.signal)
    void (async () => {
      try {
        const response = await fetch('/api/admin/payment-connection', { cache: 'no-store', signal: request.signal })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'Холболтын мэдээлэл олдсонгүй.')
        if (!controller.signal.aborted) setConnection(body)
      } catch (cause) { if (!controller.signal.aborted) setMessage(cause instanceof Error ? cause.message : 'Дахин оролдоно уу.') }
      finally { request.dispose() }
    })()
    return () => { controller.abort(); request.dispose() }
  }, [open])
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setMessage('Хуулагдлаа.') }
    catch { setMessage('Талбарын утгыг сонгоод хуулна уу.') }
  }
  return <div className={styles.connection}>
    <button type="button" aria-expanded={open} onClick={() => { setOpen(value => !value); setConnection(null); setMessage('') }}>MacroDroid холболт {open ? 'хаах' : 'тохируулах'}</button>
    {open && <div>
      <p className={styles.note}>Эхлээд «Жолооч» цэсэнд төлбөр хүлээн авах банк, дансаа хадгална. MacroDroid нь тэр дансны орлогын SMS-ээс гүйлгээний код, орлогын дүнг ялгаж илгээнэ.</p>
      <p className={styles.note}>Банкны SMS илгээгчийг сонгож, зөвхөн орлого ирэхэд HTTP POST хүсэлт явуулахаар тохируулна.</p>
      {connection ? <>
        <label htmlFor="payment-hook-url">HTTP POST хаяг</label>
        <div className={styles.searchRow}><input id="payment-hook-url" value={connection.url} readOnly onFocus={event => event.target.select()} /><button type="button" onClick={() => void copy(connection.url)}>Хуулах</button></div>
        <label htmlFor="payment-hook-secret">x-webhook-secret</label>
        <div className={styles.searchRow}><input id="payment-hook-secret" type="password" value={connection.secret} readOnly autoComplete="off" onFocus={event => event.target.select()} /><button type="button" onClick={() => void copy(connection.secret)}>Хуулах</button></div>
        <p className={styles.note}>Content-Type: application/json</p>
        <pre>{'{"code":"123456","amount":5500,"currency":"MNT","direction":"credit"}'}</pre>
        <p className={styles.note}>Энэ нь зөвхөн жишээ. code-д SMS-ийн гүйлгээний утгын 6 оронтой код, amount-д тухайн орлогын дүнг тоогоор оруулна. Дансны үлдэгдэл, зарлагын дүнг илгээхгүй.</p>
        <p className={styles.note}>Дүн, код хоёулаа таарвал эрх нээгдэнэ. Тохиргоог дуусгасны дараа нэг бодит орлогоор шалгана.</p>
      </> : !message && <p className={styles.note}>Холболтыг ачаалж байна…</p>}
      {message && <p role="status" className={styles.note}>{message}</p>}
    </div>}
  </div>
}
