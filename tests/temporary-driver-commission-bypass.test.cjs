const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('driver completion can temporarily bypass commission and continue immediately', () => {
  const route = read('app/api/payment/complete/route.ts')
  const page = read('app/driver/page.tsx')
  const migration = read('supabase/migrations/20261029072000_temporary_driver_commission_bypass.sql')

  assert.match(route, /driver_commission_enabled/)
  assert.match(route, /complete_order_without_commission/)
  assert.match(route, /payment_required:\s*false/)
  assert.match(route, /paid:\s*true/)
  assert.match(page, /if \(data\.paid\) \{ setAcceptedOrder\(null\); setPaymentInfo\(null\); return \}/)
  assert.match(migration, /values \('driver_commission_enabled', 'false'\)/)
  assert.match(migration, /create or replace function public\.complete_order_without_commission/)
  assert.match(migration, /approved_via = 'temporary_waiver'/)
  assert.match(migration, /update public\.drivers/)
})
