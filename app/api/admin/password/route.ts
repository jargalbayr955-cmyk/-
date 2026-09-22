import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { adminJson, requireAdmin, sameOriginAdminRequest, setAdminCookie } from '@/lib/server/admin'
import { hashAdminPassword, validAdminPassword, verifyAdminPassword } from '@/lib/server/admin-password'
import { allowRequest, getClientIp } from '@/lib/server/security'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function POST(req: NextRequest) {
  if (!sameOriginAdminRequest(req)) return adminJson({ error: 'Хүсэлт зөвшөөрөгдөөгүй.' }, 403)
  const access = await requireAdmin(req, true)
  if (!access.ok) return adminJson({ error: access.error }, access.status)
  if (!(await allowRequest(`admin-password:${getClientIp(req)}`, 5, 10 * 60_000))) {
    return adminJson({ error: 'Олон удаа оролдлоо. 10 минутын дараа дахин оролдоно уу.' }, 429)
  }
  const body = await req.json().catch(() => null)
  if (!validAdminPassword(body?.newPassword)) return adminJson({ error: 'Шинэ нууц үг 12–128 тэмдэгттэй байна.' }, 400)
  if (body.newPassword !== body.confirmPassword) return adminJson({ error: 'Давтан оруулсан нууц үг таарахгүй байна.' }, 400)
  if (body.newPassword === body.currentPassword) return adminJson({ error: 'Хуучнаасаа өөр нууц үг сонгоно уу.' }, 400)
  try {
    if (!(await verifyAdminPassword(body.currentPassword, access.credential.password_hash))) {
      return adminJson({ error: 'Одоогийн нууц үг буруу байна.' }, 400)
    }
    const version = randomUUID()
    const hash = await hashAdminPassword(body.newPassword)
    const { data, error } = await getSupabaseAdmin().from('admin_credentials').update({
      password_hash: hash, session_version: version, must_change_password: false, updated_at: new Date().toISOString(),
    }).eq('id', 1).eq('session_version', access.credential.session_version).select('session_version').maybeSingle()
    if (error) return adminJson({ error: 'Нууц үг хадгалагдсангүй. Дахин оролдоно уу.' }, 503)
    if (!data) return adminJson({ error: 'Нууц үг өөр төхөөрөмжөөс солигдсон байна. Дахин нэвтэрнэ үү.' }, 409)
    const res = adminJson({ success: true, mustChangePassword: false })
    setAdminCookie(res, version)
    return res
  } catch {
    return adminJson({ error: 'Нууц үг солиход түр алдаа гарлаа. Дахин оролдоно уу.' }, 503)
  }
}
