import { CustomerIdentity, readSession } from './session'
import { createRequestSignal } from './request-signal'

export type OtpRequestResult =
  | { ok: true; verificationId: string; expiresAt: string; resendAfterSeconds: number }
  | { ok: false; error: string }

export type OtpVerifyResult =
  | { ok: true; user: CustomerIdentity }
  | { ok: false; error: string }

export async function requestCustomerOtp(phone: string): Promise<OtpRequestResult> {
  const deadline = createRequestSignal(20_000)
  try {
    const response = await fetch('/api/customer/otp/request', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }), signal: deadline.signal,
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) return { ok: false, error: body.error || 'OTP код илгээж чадсангүй. Дахин оролдоно уу.' }
    if (typeof body.verification_id !== 'string' || !body.verification_id) return { ok: false, error: 'OTP үйлчилгээний хариу буруу байна. Дахин оролдоно уу.' }
    return {
      ok: true,
      verificationId: body.verification_id,
      expiresAt: typeof body.expires_at === 'string' ? body.expires_at : '',
      resendAfterSeconds: Number.isFinite(body.resend_after_seconds) ? Math.max(1, Number(body.resend_after_seconds)) : 60,
    }
  } catch {
    return { ok: false, error: 'Хариу ирсэнгүй. Интернэт холболтоо шалгаад дахин оролдоно уу.' }
  } finally {
    deadline.dispose()
  }
}

export async function verifyCustomerOtp(phone: string, verificationId: string, code: string): Promise<OtpVerifyResult> {
  let verified = false
  let deadline = createRequestSignal(20_000)
  try {
    const response = await fetch('/api/customer/otp/verify', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, verification_id: verificationId, code }), signal: deadline.signal,
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) return { ok: false, error: body.error || 'OTP код баталгаажсангүй. Дахин оролдоно уу.' }
    verified = true

    deadline.dispose()
    deadline = createRequestSignal(10_000)
    const session = await readSession('customer', deadline.signal)
    if (!session.user || session.user.id !== body.user?.id) {
      return { ok: false, error: 'Нэвтрэлт энэ хөтөч дээр хадгалагдсангүй. Cookie-г зөвшөөрөөд шинээр OTP код авч оролдоно уу.' }
    }
    return { ok: true, user: session.user }
  } catch {
    return {
      ok: false,
      error: verified
        ? 'OTP баталгаажсан боловч нэвтрэлтийг шалгаж чадсангүй. Хуудсаа дахин нээгээд оролдоно уу.'
        : 'Хариу ирсэнгүй. Интернэт холболтоо шалгаад дахин оролдоно уу.',
    }
  } finally {
    deadline.dispose()
  }
}
