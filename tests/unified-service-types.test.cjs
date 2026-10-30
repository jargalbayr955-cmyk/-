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
  assert.match(read('app/components/unified-customer-order-sheet.tsx'), /ServiceTypePicker/)
  assert.match(read('app/components/driver-registration.tsx'), /ServiceTypePicker/)
})

test('customer login opens the map first and service selection happens after Жолооч хайх', () => {
  assert.match(read('app/components/customer-auth.tsx'), /window\.location\.replace\('\/current'\)/)
  assert.match(read('lib/client/session.ts'), /destination: mode === 'customer' \? null : '\/current'/)
  const current = read('app/current/page.tsx')
  assert.match(current, /booking\.navigate\('service'\)/)
  assert.match(current, /Жолооч хайх/)
  assert.match(current, /UnifiedCustomerOrderSheet/)
  const draft = read('lib/client/booking-draft.ts')
  assert.match(draft, /'service'/)
  assert.match(draft, /'service-details'/)
})

test('non-tow services collect tailored work details and towing keeps its two subtypes', () => {
  const createRoute = read('app/api/order/create/route.ts')
  const sheet = read('app/components/unified-customer-order-sheet.tsx')
  const catalog = read('lib/service-types.ts')
  assert.match(createRoute, /service_type: serviceType/)
  assert.match(createRoute, /service_details: serviceDetails/)
  assert.match(createRoute, /normalizeServiceDetails/)
  assert.match(sheet, /service-details/)
  assert.match(sheet, /serviceDetailFields/)
  assert.match(sheet, /service_details: normalizedDetails/)
  assert.match(sheet, /CustomerOrderSheet/)
  assert.match(catalog, /ЯМАР АЧАА ВЭ\?/)
  assert.match(catalog, /ОЙРОЛЦОО ЖИН/)
  assert.match(catalog, /ЯМАР АЖИЛ ХИЙЛГЭХ ВЭ\?/)
  assert.match(catalog, /ОЙРОЛЦОО ХЭР УДААН\?/)
  assert.match(catalog, /МАШИН ЯАГААД АСАХГҮЙ БАЙНА\?/)
})

test('service details are stored atomically and returned to drivers', () => {
  const migration = read('supabase/migrations/20261030110000_service_order_details.sql')
  const driverOrders = read('app/api/driver/orders/route.ts')
  const driverView = read('app/components/driver-dispatch-view.tsx')
  assert.match(migration, /add column if not exists service_details jsonb/)
  assert.match(migration, /coalesce\(v_order\.service_details,'\{\}'::jsonb\) is distinct from v_service_details/)
  assert.match(driverOrders, /car_mark,service_details/)
  assert.match(driverView, /serviceDetailEntries\(selected\.service_type, selected\.service_details\)/)
})

test('driver registration, online state and dispatch are service-aware', () => {
  assert.match(read('app/api/driver/register/request/route.ts'), /start_driver_registration_v6/)
  assert.match(read('lib/server/driver.ts'), /service_type/)
  assert.match(read('app/api/driver/location/route.ts'), /serviceProfileIsComplete/)
  const offer = read('app/api/driver/offer/route.ts')
  assert.match(offer, /driver\.service_type === 'achilt'/)
  assert.doesNotMatch(offer, /if \(!\['butten', 'chiregch'\]\.includes\(driver\.car_type \|\| ''\)\)/)
  const migration = read('supabase/migrations/20261029043322_unified_service_types.sql')
  assert.match(migration, /d\.service_type=v_order\.service_type/)
  assert.match(migration, /o\.service_type=v_driver\.service_type/)
  assert.match(migration, /v_order\.service_type<>'achilt' or d\.car_type=v_order\.car_type/)
})
