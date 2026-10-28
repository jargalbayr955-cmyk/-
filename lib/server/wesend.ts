import 'server-only'

const WESEND_BASE_URL = 'https://api.wesend.mn/v1'
const REQUEST_TIMEOUT_MS = 12_000

type VerificationData = {
  id: string
  status: string
  to: string
  expiresAt: string
}

export type WeSendVerificationResult =
  | { ok: true; data: VerificationData }
  | { ok: false; status: number; code: string; attemptsRemaining?: number; retryAfter?: number }

export function isWeSendConfigured() {
  return Boolean(process.env.WESEND_API_KEY?.trim())
}

async function postJson(path: string, payload: Record<string, unknown>) {
  const apiKey = process.env.WESEND_API_KEY?.trim()
  if (!apiKey) return { status: 503, body: { error: { code: 'not_configured' } }, retryAfter: undefined as number | undefined }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${WESEND_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: controller.signal,
    })
    const body = await response.json().catch(() => ({}))
    const retryAfterRaw = Number(response.headers.get('retry-after') || '')
    return {
      status: response.status,
      body,
      retryAfter: Number.isFinite(retryAfterRaw) && retryAfterRaw > 0 ? retryAfterRaw : undefined,
    }
  } catch {
    return { status: 503, body: { error: { code: 'provider_unavailable' } }, retryAfter: undefined as number | undefined }
  } finally {
    clearTimeout(timeout)
  }
}

function toResult(response: Awaited<ReturnType<typeof postJson>>): WeSendVerificationResult {
  if (response.status < 200 || response.status >= 300) {
    const error = response.body?.error
    const code = typeof error?.code === 'string' ? error.code : 'provider_error'
    const attempts = Number(error?.attempts_remaining)
    return {
      ok: false,
      status: response.status,
      code,
      ...(Number.isFinite(attempts) ? { attemptsRemaining: attempts } : {}),
      ...(response.retryAfter ? { retryAfter: response.retryAfter } : {}),
    }
  }

  const body = response.body as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : ''
  const status = typeof body.status === 'string' ? body.status : ''
  const to = typeof body.to === 'string' ? body.to : ''
  const expiresAt = typeof body.expires_at === 'string' ? body.expires_at : ''
  if (!id || !status || !to || !expiresAt) return { ok: false, status: 503, code: 'provider_invalid_response' }
  return { ok: true, data: { id, status, to, expiresAt } }
}

export async function startPhoneVerification(localPhone: string) {
  return toResult(await postJson('/verify', {
    to: localPhone,
    brand: 'Achilt',
    locale: 'mn',
    code_length: 6,
    code_type: 'digits',
    ttl: 300,
  }))
}

export async function checkPhoneVerification(verificationId: string, code: string) {
  return toResult(await postJson(`/verify/${encodeURIComponent(verificationId)}/check`, { code }))
}

export function describeWeSendFailure(result: Extract<WeSendVerificationResult, { ok: false }>) {
  if (result.code === 'unsupported_number') return { status: 400, error: 'Монголын үүрэн операторын 8 оронтой дугаар оруулна уу.' }
  if (result.code === 'invalid_code') {
    const suffix = typeof result.attemptsRemaining === 'number' ? ` ${result.attemptsRemaining} оролдлого үлдлээ.` : ''
    return { status: 422, error: `OTP код буруу байна.${suffix}` }
  }
  if (result.code === 'verification_expired') return { status: 410, error: 'OTP кодын хугацаа дууссан. Шинээр код авна уу.' }
  if (result.code === 'invalid_request') return { status: 400, error: 'Энэ OTP баталгаажуулалт аль хэдийн ашиглагдсан байна. Шинээр код авна уу.' }
  if (result.code === 'max_attempts_reached') return { status: 429, error: 'Олон удаа буруу код оруулсан байна. Шинээр код аваад дахин оролдоно уу.' }
  if (result.status === 429 || result.code === 'rate_limited') return { status: 429, error: 'Олон удаа хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу.' }
  if (result.code === 'not_configured' || result.code === 'invalid_api_key') return { status: 503, error: 'OTP үйлчилгээ одоогоор тохируулагдаагүй байна.' }
  if (result.code === 'insufficient_credits' || result.code === 'subscription_required') return { status: 503, error: 'OTP үйлчилгээ түр боломжгүй байна.' }
  if (result.code === 'provider_failed') return { status: 503, error: 'SMS операторт хүргэхэд алдаа гарлаа. Дахин оролдоно уу.' }
  return { status: 503, error: 'OTP үйлчилгээ түр боломжгүй байна. Дахин оролдоно уу.' }
}
