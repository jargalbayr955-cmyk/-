import { CustomerIdentity, readSession } from './session'

export type AuthMode = 'login' | 'register'
export type AuthResult = { ok: true; user: CustomerIdentity } | { ok: false; error: string; canLogin?: boolean }

export async function authenticateCustomer(mode: AuthMode, phone: string, pin: string): Promise<AuthResult> {
  let accountCreated = false
  try {
    const response = await fetch(`/api/customer/${mode}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, pin }), signal: AbortSignal.timeout(20_000),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) return {
      ok: false,
      error: body.error || 'Хүсэлт амжилтгүй боллоо. Дахин оролдоно уу.',
      canLogin: mode === 'register' && response.status === 409,
    }
    accountCreated = mode === 'register'
    // Confirm the browser accepted the HttpOnly cookie before leaving the form.
    const session = await readSession('customer', AbortSignal.timeout(10_000))
    if (!session.user || session.user.id !== body.user?.id) return {
      ok: false,
      error: 'Нэвтрэлт энэ хөтөч дээр хадгалагдсангүй. Сайтын cookie-г зөвшөөрөөд «Нэвтрэх»-ээр дахин оролдоно уу.',
      canLogin: accountCreated,
    }
    return { ok: true, user: session.user }
  } catch {
    return {
      ok: false,
      error: accountCreated
        ? 'Бүртгэл үүслээ. Холболтоо шалгаад «Нэвтрэх»-ээр орно уу.'
        : 'Хариу ирсэнгүй. Интернэт холболтоо шалгаад дахин оролдоно уу.',
      canLogin: accountCreated,
    }
  }
}
