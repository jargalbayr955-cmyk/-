'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { createRequestSignal } from '@/lib/client/request-signal'
import type { AdminDashboard } from '@/lib/client/admin-view'
import { AdminPaymentConnection } from './admin-payment-connection'
import styles from '../admin/admin.module.css'

function isImageUrl(value: string) {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

export function AdminSettings({ initial, onSaved, onPassword, onSessionExpired }: {
  initial: Pick<AdminDashboard, 'bankName' | 'bankAccount' | 'heroUrl'>
  onSaved: () => void; onPassword: () => void; onSessionExpired: () => void
}) {
  const [bankName, setBankName] = useState(initial.bankName), [bankAccount, setBankAccount] = useState(initial.bankAccount)
  const [heroUrl, setHeroUrl] = useState(initial.heroUrl), [previewError, setPreviewError] = useState(false)
  const [busy, setBusy] = useState(''), [result, setResult] = useState<{ section: string; ok: boolean; text: string } | null>(null)
  const [bankRevision, setBankRevision] = useState(0)
  const pending = useRef(false), lifetime = useRef<AbortController | null>(null)
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort() }, [])
  const save = async (section: 'bank' | 'hero') => {
    if (pending.current) return
    pending.current = true; setBusy(section); setResult(null)
    const parent = lifetime.current?.signal, request = createRequestSignal(12_000, parent)
    try {
      const response = await fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: request.signal,
        body: JSON.stringify(section === 'bank' ? { key: 'bank_details', value: { bank_name: bankName, bank_account: bankAccount } } : { key: 'hero_url', value: heroUrl }) })
      const body = await response.json()
      if (parent?.aborted) return
      if (response.status === 401 || response.status === 403) { onSessionExpired(); return }
      if (!response.ok) throw new Error(body.error || 'Хадгалж чадсангүй.')
      setResult({ section, ok: true, text: section === 'bank' ? 'Данс хадгалагдлаа. Доорх 2-р алхамд SMS тохиргоогоо хадгална уу.' : 'Нүүр хуудасны зураг хадгалагдлаа.' })
      if (section === 'bank') setBankRevision(value => value + 1)
      onSaved()
    } catch (cause) {
      if (!parent?.aborted) setResult({ section, ok: false, text: cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'Холболт тасарлаа. Тохиргоог дахин нээж хадгалагдсан утгыг шалгана уу.' })
    } finally { request.dispose(); pending.current = false; if (!parent?.aborted) setBusy('') }
  }
  const feedback = (section: string) => result?.section === section && <p role={result.ok ? 'status' : 'alert'} className={result.ok ? styles.success : styles.error}>{result.text}</p>
  return <>
    <section className={styles.panel} aria-labelledby="bank-settings-title">
      <p className={styles.eyebrow}>ТӨЛБӨРИЙН ТОХИРГОО · АЛХАМ 1</p>
      <h3 id="bank-settings-title">Шимтгэл хүлээн авах данс</h3>
      <p className={styles.muted}>Жолоочид энэ данс харагдана. Тохиролцсон үнийн 5%-ийг хамгийн ойрын 500 ₮-өөр бүхэлчилж төлнө.</p>
      <form onSubmit={event => { event.preventDefault(); void save('bank') }}>
        <div className={styles.formGrid}>
          <div><label htmlFor="admin-bank-name">Банкны нэр</label><input id="admin-bank-name" value={bankName} onChange={event => { setBankName(event.target.value); setResult(null) }} required maxLength={100} disabled={Boolean(busy)} placeholder="Жишээ: Хаан банк" /></div>
          <div><label htmlFor="admin-bank-account">Дансны дугаар / IBAN</label><input id="admin-bank-account" value={bankAccount} onChange={event => { setBankAccount(event.target.value); setResult(null) }} required maxLength={100} disabled={Boolean(busy)} autoComplete="off" placeholder="Бүтэн дугаараа оруулна" aria-describedby="admin-bank-help" /></div>
        </div>
        <small id="admin-bank-help" className={styles.formHint}>SMS-д харагддаг одтой дугаар биш, банкны апп дахь бүтэн данс эсвэл IBAN-аа оруулна.</small>
        {feedback('bank')}
        <button className={styles.primary} type="submit" disabled={Boolean(busy)}>{busy === 'bank' ? 'Хадгалж байна…' : 'Данс хадгалах'}</button>
      </form>
    </section>
    <section className={styles.panel} aria-labelledby="sms-settings-title">
      <p className={styles.eyebrow}>ТӨЛБӨРИЙН ТОХИРГОО · АЛХАМ 2</p>
      <h3 id="sms-settings-title">Төлбөр ормогц эрх автоматаар нээх</h3>
      <p className={styles.muted}>Банкны SMS хүлээн авдаг утасны MacroDroid-ыг холбоно. Орлогын дүн, 6 оронтой код хоёулаа таарвал жолоочийн төлбөр баталгаажна.</p>
      <AdminPaymentConnection key={bankRevision} />
      <p className={styles.muted}>Утасны холболтыг бодит орлогоор шалгасны дараа ашиглана. Автоматаар нээгдээгүй төлбөрийг «Төлбөр · Эрх нээх» цэсээс банкны хуулгатай тулгаж зөвшөөрч болно.</p>
    </section>
    <section className={styles.panel} aria-labelledby="hero-settings-title">
      <h3 id="hero-settings-title">Нүүр хуудасны зураг</h3>
      <p className={styles.muted}>Хэрэглэгч нэвтрэхээс өмнө харах зураг. Хоосон хадгалбал үндсэн зураг ашиглана.</p>
      <form onSubmit={event => { event.preventDefault(); void save('hero') }}>
        <label htmlFor="admin-hero-url">Зургийн холбоос</label>
        <input id="admin-hero-url" type="url" value={heroUrl} maxLength={1000} onChange={event => { setHeroUrl(event.target.value); setPreviewError(false); setResult(null) }} disabled={Boolean(busy)} placeholder="https://…" />
        <small className={styles.formHint}>https:// гэж эхэлсэн, нийтэд нээлттэй зургийн холбоос оруулна.</small>
        {isImageUrl(heroUrl) && !previewError && <Image src={heroUrl} alt="Нүүр хуудасны зургийн урьдчилсан харагдац" width={800} height={240} unoptimized className={styles.preview} onError={() => setPreviewError(true)} />}
        {previewError && <p className={styles.error}>Зураг харагдсангүй. Холбоосоо шалгана уу.</p>}
        {feedback('hero')}
        <button type="submit" disabled={Boolean(busy)}>{busy === 'hero' ? 'Хадгалж байна…' : 'Зураг хадгалах'}</button>
      </form>
    </section>
    <section className={styles.panel}>
      <h3>Админы нууц үг</h3>
      <p className={styles.muted}>Одоогийн нууц үгээ оруулж шинэчилнэ. Шинэчилсний дараа бусад төхөөрөмж дээр дахин нэвтрэх шаардлагатай.</p>
      <button type="button" onClick={onPassword}>Нууц үг солих</button>
    </section>
  </>
}
