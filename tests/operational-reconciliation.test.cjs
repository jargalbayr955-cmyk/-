const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('admin dashboard only treats linked confirmed orders as active', () => {
  const source = read('app/api/admin/dashboard/route.ts')
  assert.match(source, /const activeOrders = \(activeR\.data \|\| \[\]\)\.filter\(order => Boolean\(order\.driver_id\)\)/)
})

test('stale dispatch cleanup is wired into both database and Hobby-compatible deployment schedules', () => {
  const route = read('app/api/cron/refresh-slots/route.ts')
  assert.match(route, /rpc\('cleanup_stale_dispatch_orders'\)/)
  const scheduler = read('supabase/migrations/20261028174514_dispatch_cleanup_scheduler.sql')
  assert.match(scheduler, /achilt-dispatch-cleanup/)
  assert.match(scheduler, /'15 \* \* \* \*'/)
  const config = JSON.parse(read('vercel.json'))
  assert.deepEqual(config.crons, [{ path: '/api/cron/refresh-slots', schedule: '15 18 * * *' }])
})

test('operational reconciliation keeps history but cleans stale work and legacy debt from active queues', () => {
  const sql = read('supabase/migrations/20261028174050_operational_reconciliation.sql')
  assert.match(sql, /create or replace function public\.cleanup_stale_dispatch_orders\(\)/i)
  assert.match(sql, /bidding_expires_at < pg_catalog\.now\(\) - interval '1 hour'/i)
  assert.match(sql, /created_at < pg_catalog\.now\(\) - interval '24 hours'/i)
  assert.match(sql, /set status = 'cancelled'/i)
  assert.match(sql, /join public\.drivers d on d\.id = pc\.driver_id[\s\S]*d\.active is true[\s\S]*d\.deleted_at is null/i)
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(orders|payment_codes)/i)
})

test('OTP registration migration uses the repaired first real OTP registration cutoff', () => {
  const sql = read('supabase/migrations/20261028171144_admin_otp_registration_stats.sql')
  assert.match(sql, /2026-10-28 15:44:04\.830544/)
  assert.doesNotMatch(sql, /2026-10-28 08:55:54\.545/)
})
