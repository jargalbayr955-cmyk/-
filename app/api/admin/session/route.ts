import { NextRequest } from 'next/server'
import { allowRequest, getClientIp } from '@/lib/server/security'
import { ADMIN_COOKIE, adminJson, getAdminCredential, requireAdmin, sameOriginAdminRequest, setAdminCookie } from '@/lib/server/admin'
import { verifyAdminPassword } from '@/lib/server/admin-password'

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req, true)
  if (!access.ok) return adminJson({ authenticated: false, error: access.error }, access.status)
  return adminJson({ authenticated: true, mustChangePassword: access.credential.must_change_password })
}

export async function POST(req: NextRequest) {
  if (!sameOriginAdminRequest(req)) return adminJson({ error: 'Хүсэлт зөвшөөрөгдөөгүй.' }, 403)
  if (!(await allowRequest(`admin-login:${getClientIp(req)}`, 6, 10 * 60_000))) {
    return adminJson({ error: 'Олон удаа оролдлоо. 10 минутын дараа дахин оролдоно уу.' }, 429)
  }
  const body = await req.json().catch(() => null)
  if (typeof body?.password !== 'string' || body.password.length > 128) return adminJson({ error: 'Нууц үгээ оруулна уу.' }, 400)
  try {
    const credential = await getAdminCredential()
    if (!(await verifyAdminPassword(body.password, credential.password_hash))) return adminJson({ error: 'Нууц үг буруу байна.' }, 401)
    const res = adminJson({ authenticated: true, mustChangePassword: credential.must_change_password })
    setAdminCookie(res, credential.session_version)
    return res
  } catch {
    return adminJson({ error: 'Нэвтрэхэд түр алдаа гарлаа. Дахин оролдоно уу.' }, 503)
  }
}

export async function DELETE(req: NextRequest) {
  if (!sameOriginAdminRequest(req)) return adminJson({ error: 'Хүсэлт зөвшөөрөгдөөгүй.' }, 403)
  const res = adminJson({ authenticated: false })
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 })
  return res
}
