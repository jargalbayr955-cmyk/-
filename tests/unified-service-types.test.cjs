const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('customer and driver use one ordered six-service catalog', () => {
  const catalog = read('lib/service-types.ts')
  const expected = [
    ["achilt", "Ачилт"],
    ["crane", "Кран"],
    ["excavator", "Экскаватор"],
    ["car_start", "Машин асаалт"],
    ["bobcat", "Бобкат"],
    ["loader", "Ковш"],
  ]
  let last = -1
  for (const [id, label] of expected) {
    const index = catalog.indexOf(`id: '${id}', label: '${label}'`)
    assert.ok(index > last, `${label} must appear in the requested order`)
    last = index
  }
  assert.match(read('app/services/page.tsx'), /ServiceTypePicker/)
  assert.match(read('app/components/driver-registration.tsx'), /ServiceTypePicker/)
})

test('customer login chooses a service before opening the shared map', () => {
  assert.match(read('app/components/customer-auth.tsx'), /window\.location\.replace\('\/services'\)/)
  assert.match(read('lib/client/session.ts'), /destination: mode === 'customer' \? null : '\/services'/)
  assert.match(read('app/services/page.tsx'), /router\.replace\('\/current'\)/)
  assert.match(read('app/current/page.tsx'), /UnifiedCustomerOrderSheet/)
})

test('non-tow services create unified location orders and towing keeps its subtypes', () => {
  const createRoute = read('app/api/order/create/route.ts')
  const sheet = read('app/components/unified-customer-order-sheet.tsx')
  assert.match(createRoute, /service_type: serviceType/)
  assert.match(createRoute, /serviceType === 'achilt'/)
  assert.match(sheet, /car_type: null/)
  assert.match(sheet, /service_type: serviceType/)
  assert.match(sheet, /CustomerOrderSheet/)
})

test('driver registration, online state and dispatch are service-aware', () => {
  assert.match(read('app/api/driver/register/request/route.ts'), /start_driver_registration_v4/)
  assert.match(read('lib/server/driver.ts'), /service_type/)
  assert.match(read('app/api/driver/availability/route.ts'), /serviceProfileIsComplete/)
  assert.match(read('app/api/driver/location/route.ts'), /serviceProfileIsComplete/)
  const migration = read('supabase/migrations/20261029043322_unified_service_types.sql')
  assert.match(migration, /d\.service_type=v_order\.service_type/)
  assert.match(migration, /o\.service_type=v_driver\.service_type/)
  assert.match(migration, /v_order\.service_type<>'achilt' or d\.car_type=v_order\.car_type/)
})
