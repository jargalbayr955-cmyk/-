import 'server-only'
import crypto from 'crypto'

function legacyPaymentWebhookSecret() {
  const sessionSecret = process.env.SESSION_SECRET
  if (!sessionSecret || sessionSecret.length < 32) return null
  return crypto.createHmac('sha256', sessionSecret).update('achilt:macrodroid:payment-webhook:v1').digest('hex')
}

// The configured dedicated key is the one shown to admins. During the rollout we
// also accept the old domain-separated key so an already installed MacroDroid
// rule is not broken by the first deployment that enables PAYMENT_WEBHOOK_SECRET.
export function getPaymentWebhookSecrets() {
  const values = [process.env.PAYMENT_WEBHOOK_SECRET || null, legacyPaymentWebhookSecret()].filter((value): value is string => Boolean(value))
  return [...new Set(values)]
}

export function getPaymentWebhookSecret() {
  return getPaymentWebhookSecrets()[0] ?? null
}

export function validPaymentReceipt(body: unknown): body is { code: string; amount: number; currency: 'MNT'; direction: 'credit' } {
  if (!body || typeof body !== 'object') return false
  const value = body as Record<string, unknown>
  return typeof value.code === 'string' && /^(?:\d{6}|\d{8})$/.test(value.code)
    && typeof value.amount === 'number' && Number.isSafeInteger(value.amount) && value.amount > 0
    && value.currency === 'MNT' && value.direction === 'credit'
}
