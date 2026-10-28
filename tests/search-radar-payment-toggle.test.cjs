const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('offer waiting map shows a pulsing search radar at the pickup point and stops at zero', () => {
  const source = read('app/components/offer-map.tsx')
  assert.match(source, /pickup-search-ring/)
  assert.match(source, /@keyframes achiltSearchRadar/)
  assert.match(source, /offers-countdown/)
  assert.match(source, /clock !== '00:00'/)
  assert.match(source, /createPickupSearchMarker\(activeSearching\)/)
})

test('admin can enable or disable MacroDroid automatic verification', () => {
  const ui = read('app/components/admin-payment-connection.tsx')
  const adminRoute = read('app/api/admin/payment-connection/route.ts')
  const verifyRoute = read('app/api/payment/verify/route.ts')
  assert.match(ui, /Админы зөвшөөрөл/)
  assert.match(ui, /autoEnabled/)
  assert.match(adminRoute, /payment_auto_verify_enabled/)
  assert.match(adminRoute, /body\.autoEnabled \? 'true' : 'false'/)
  assert.match(verifyRoute, /payment_auto_verify_enabled/)
  assert.match(verifyRoute, /status: 423/)
})
