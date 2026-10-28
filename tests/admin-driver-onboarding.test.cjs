const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('admin creates a phone-only driver with fixed initial PIN 000000', () => {
  const source = read('app/api/admin/drivers/route.ts')
  assert.match(source, /if\(action==='add'\)/)
  assert.match(source, /const pin=['"]000000['"]/) 
  assert.match(source, /p_name:['"]Шинэ жолооч['"]/) 
  assert.match(source, /p_car_type:null/)
})

test('incomplete drivers can restore session only for onboarding and are blocked from normal driver APIs', () => {
  const driver = read('lib/server/driver.ts')
  const session = read('app/api/driver/session/route.ts')
  assert.match(driver, /driverNeedsOnboarding/)
  assert.match(driver, /name === ['"]Шинэ жолооч['"]/)
  assert.match(driver, /!options\.allowIncomplete && driverNeedsOnboarding\(driver\)/)
  assert.match(session, /requireDriver\(req, \{ allowIncomplete: true \}\)/)
  assert.match(session, /needsOnboarding: driverNeedsOnboarding\(driver\)/)
})

test('first driver login is forced through name, plate and a new non-default six digit PIN', () => {
  const layout = read('app/driver/layout.tsx')
  const gate = read('app/components/driver-onboarding-gate.tsx')
  const profile = read('app/api/driver/profile/route.ts')
  assert.match(layout, /DriverOnboardingGate/)
  assert.match(gate, /Бүртгэлээ дуусгах/)
  assert.match(gate, /Машины улсын дугаар/)
  assert.match(gate, /Шинэ PIN код/)
  assert.match(gate, /newPin === ['"]000000['"]/)
  assert.match(gate, /fetch\(['"]\/api\/driver\/profile['"]/)
  assert.match(profile, /complete_admin_driver_onboarding/)
  assert.match(profile, /newPin === ['"]000000['"]/)
  assert.match(profile, /setDeviceSession\(response, profile\.id, ['"]driver['"], sessionVersion\)/)
})

test('database onboarding changes the initial PIN atomically and keeps the driver unavailable until setup finishes', () => {
  const migration = read('supabase/migrations/20261029130000_admin_driver_onboarding.sql')
  assert.match(migration, /complete_admin_driver_onboarding/)
  assert.match(migration, /p_pin = '000000'/)
  assert.match(migration, /pin_hash = extensions\.crypt\(p_pin/)
  assert.match(migration, /available = false/)
  assert.match(migration, /session_version = gen_random_uuid\(\)/)
  assert.match(migration, /else 'butten' end/)
})
