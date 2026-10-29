const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('pending search back resets every customer booking field and starts from current map', () => {
  const source = read('app/drivers/page.tsx')
  assert.match(source, /const restartBooking = useCallback/)
  assert.match(source, /clearBookingDraft\(\)/)
  for (const key of ['current_order_id', 'fromLat', 'fromLng', 'fromAddress', 'dest', 'tracking_driver_id']) {
    assert.match(source, new RegExp(`['\"]${key}['\"]`))
  }
  assert.match(source, /fetch\('\/api\/order\/cancel'/)
  assert.match(source, /keepalive\s*:\s*true/)
  assert.match(source, /if\s*\(!confirmed\s*&&\s*!finished\)\s*\{\s*restartBooking\(\);\s*return\s*\}/)
  assert.match(source, /router\.replace\('\/current'\)/)
})

test('cancel endpoint authenticates ownership and only cancels pending orders', () => {
  const source = read('app/api/order/cancel/route.ts')
  assert.match(source, /requireCustomer\(req\)/)
  assert.match(source, /select\('id,user_id,user_phone,status'\)/)
  assert.match(source, /order\.user_id !== user\.id/)
  assert.match(source, /order\.user_phone !== user\.phone/)
  assert.match(source, /order\.status !== 'pending'/)
  assert.match(source, /update\(\{ status: 'cancelled' \}\)/)
  assert.match(source, /\.eq\('status', 'pending'\)/)
  assert.match(source, /driver_invites/)
  assert.match(source, /offers/)
})
