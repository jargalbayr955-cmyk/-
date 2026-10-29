const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('admin live map uses road view and distinguishes drivers from online customers', () => {
  const source = read('app/components/admin-driver-map.tsx')
  assert.match(source, /MapTypeId\?\.ROADMAP/)
  assert.match(source, /\/api\/admin\/online-users/)
  assert.match(source, /createDotMarker\('#e8433a'/)
  assert.match(source, /createDotMarker\('#2563eb'/)
  assert.match(source, /Онлайн хэрэглэгч/)
})

test('customer presence is authenticated, same-origin and stores only valid coordinates', () => {
  const route = read('app/api/customer/presence/route.ts')
  const client = read('app/components/customer-presence.tsx')
  assert.match(route, /requireCustomer\(req\)/)
  assert.match(route, /req\.headers\.get\('origin'\) === req\.nextUrl\.origin/)
  assert.match(route, /last_seen_at/)
  assert.match(route, /location_updated_at/)
  assert.match(client, /permissions\?\.query/)
  assert.match(client, /state === 'granted'/)
  assert.match(client, /60_000/)
})

test('customer and driver connection map prefers real driving roads with fallback directions', () => {
  const map = read('app/components/order-connection-map.tsx')
  const customer = read('app/tracking/page.tsx')
  const driver = read('app/driver/page.tsx')
  assert.match(map, /Route\?\.computeRoutes/)
  assert.match(map, /DirectionsService/)
  assert.match(map, /travelMode: 'DRIVING'/)
  assert.match(map, /Авто замаар/)
  assert.match(customer, /<OrderConnectionMap pickup=\{pickup\} driver=\{driverPoint\}/)
  assert.match(driver, /<OrderConnectionMap key=\{safeOrder\.id\} pickup=\{pickup\} driver=\{position\} driverLabel="Та"/)
})
