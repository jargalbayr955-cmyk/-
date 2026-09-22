import 'server-only'
import crypto from 'crypto'

// Domain-separated key; revealing this dedicated key cannot reveal SESSION_SECRET.
// An explicitly configured existing adapter secret continues to take precedence.
export function getPaymentWebhookSecret() {
  if (process.env.PAYMENT_WEBHOOK_SECRET) return process.env.PAYMENT_WEBHOOK_SECRET
  const sessionSecret = process.env.SESSION_SECRET
  if (!sessionSecret || sessionSecret.length < 32) return null
  return crypto.createHmac('sha256', sessionSecret).update('achilt:macrodroid:payment-webhook:v1').digest('hex')
}

export function validPaymentReceipt(body: unknown): body is { code: string; amount: number; currency: 'MNT'; direction: 'credit' } {
  if (!body || typeof body !== 'object') return false
  const value = body as Record<string, unknown>
  return typeof value.code === 'string' && /^\d{6}$/.test(value.code)
    && typeof value.amount === 'number' && Number.isSafeInteger(value.amount) && value.amount > 0
    && value.currency === 'MNT' && value.direction === 'credit'
}
