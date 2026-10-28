const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('admin dashboard counts only OTP-marked customer registrations', () => {
  const route = read('app/api/admin/dashboard/route.ts')
  const page = read('app/admin/page.tsx')
  const type = read('lib/client/admin-view.ts')
  assert.match(route, /otp_registered_at/)
  assert.match(route, /otpRegisteredUserCount/)
  assert.match(type, /otpRegisteredUserCount: number/)
  assert.match(page, /OTP-оор бүртгүүлсэн хэрэглэгч/)
  assert.match(page, /otpRegisteredUserCount/)
})

test('OTP registration migration separates legacy PIN users from production OTP registrations', () => {
  const migration = read('supabase/migrations/20261028171144_admin_otp_registration_stats.sql')
  assert.match(migration, /otp_registered_at timestamptz default pg_catalog\.now\(\)/)
  assert.match(migration, /created_at < timestamp '2026-10-28 15:44:04\.830544'/)
  assert.match(migration, /set otp_registered_at = null/)
  assert.match(migration, /created_at >= timestamp '2026-10-28 15:44:04\.830544'/)
})
