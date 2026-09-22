'use client'

import { useRef, useState } from 'react'

type Props = { required?: boolean; onChanged: () => void; onCancel: () => void; onSessionExpired: () => void }

export function AdminPasswordForm({ required = false, onChanged, onCancel, onSessionExpired }: Props) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)

  return <section className="admin-password-card" aria-labelledby="admin-password-title">
    <h2 id="admin-password-title">{required ? 'Өөрийн нууц үгээ тохируулаарай' : 'Нууц үг солих'}</h2>
    <p>{required ? 'Түр кодоор нэвтэрлээ. Үргэлжлүүлэхийн өмнө өөрийн нууц үгээ үүсгэнэ үү.' : 'Хадгалмагц хуучин нууц үг болон бусад төхөөрөмжийн админ нэвтрэлт хүчингүй болно.'}</p>
    <form onSubmit={async event => {
      event.preventDefault()
      if (pending.current) return
      if (newPassword.trim().length < 12 || newPassword.length > 128) { setError('Шинэ нууц үг 12–128 тэмдэгттэй байна.'); return }
      if (newPassword !== confirmPassword) { setError('Давтан оруулсан нууц үг таарахгүй байна.'); return }
      if (newPassword === currentPassword) { setError('Хуучнаасаа өөр нууц үг сонгоно уу.'); return }
      pending.current = true
      setSaving(true)
      setError('')
      try {
        const response = await fetch('/api/admin/password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
        })
        const body = await response.json().catch(() => ({}))
        if (response.status === 401 || response.status === 409) { onSessionExpired(); return }
        if (!response.ok) { setError(body.error || 'Хадгалж чадсангүй. Дахин оролдоно уу.'); return }
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
        onChanged()
      } catch { setError('Холболт тасарлаа. Дахин оролдоно уу.') }
      finally { pending.current = false; setSaving(false) }
    }}>
      <label htmlFor="admin-current-password">{required ? 'Түр нууц үг' : 'Одоогийн нууц үг'}</label>
      <input id="admin-current-password" type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={128} value={currentPassword} disabled={saving} onChange={event => setCurrentPassword(event.target.value)} />
      <label htmlFor="admin-new-password">Шинэ нууц үг</label>
      <input id="admin-new-password" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} disabled={saving} aria-describedby="admin-password-hint" onChange={event => setNewPassword(event.target.value)} />
      <small id="admin-password-hint">12-оос доошгүй тэмдэгт. Урт, санахад амархан үгсийн нийлбэр ашиглаж болно.</small>
      <label htmlFor="admin-confirm-password">Шинэ нууц үгээ давтан оруулна уу</label>
      <input id="admin-confirm-password" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={12} maxLength={128} value={confirmPassword} disabled={saving} onChange={event => setConfirmPassword(event.target.value)} />
      <label className="admin-password-visible"><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} />Нууц үгийг харах</label>
      {error && <p className="admin-auth-error" role="alert">{error}</p>}
      <div className="admin-password-actions">
        <button type="button" disabled={saving} onClick={onCancel}>{required ? 'Гарах' : 'Болих'}</button>
        <button type="submit" className="admin-primary" disabled={saving}>{saving ? 'Хадгалж байна…' : 'Шинэ нууц үг хадгалах'}</button>
      </div>
    </form>
  </section>
}
