const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('driver registration and remembered session go straight back to the driver map', () => {
  const registration = read('app/components/driver-registration.tsx')
  const request = read('app/api/driver/register/request/route.ts')
  const session = read('lib/server/device-session.ts')
  const clientSession = read('lib/client/session.ts')

  assert.match(registration, /window\.location\.replace\(body\.redirect \|\| '\/driver'\)/)
  assert.doesNotMatch(registration, /payment/i)
  assert.match(request, /setDeviceSession\(response, driver\.id, 'driver', session_version\)/)
  assert.match(request, /payment_required: false/)
  assert.match(request, /redirect: '\/driver'/)
  assert.match(session, /DEVICE_SESSION_TTL_SECONDS/)
  assert.match(clientSession, /driverStatus === 200/)
  assert.match(clientSession, /return '\/driver'/)
})

test('driver profile has an explicit bottom logout and vehicle number stays optional', () => {
  const profile = read('app/driver/profile/page.tsx')
  const route = read('app/api/driver/profile/route.ts')

  assert.match(profile, /handleLogout/)
  assert.match(profile, /\/api\/driver\/logout/)
  assert.match(profile, /pushManager\.getSubscription\(\)/)
  assert.match(profile, /subscription\?\.unsubscribe\(\)/)
  assert.match(profile, />Гарах</)
  assert.match(profile, /МАШИНЫ ДУГААР[\s\S]*заавал биш/)
  assert.doesNotMatch(profile, /if \(!form\.car_number\.trim\(\)\)/)
  assert.match(route, /driverNeedsOnboarding\(driver\)/)
  assert.match(route, /car_number: carNumber \|\| null/)
})

test('explicit logout turns the driver offline, removes this device push endpoint and clears the cookie', () => {
  const logout = read('app/api/driver/logout/route.ts')

  assert.match(logout, /requireDriver\(req, \{ allowIncomplete: true \}\)/)
  assert.match(logout, /available: false/)
  assert.match(logout, /is_online: false/)
  assert.match(logout, /notification_health: 'logged_out'/)
  assert.match(logout, /createHash\('md5'\)/)
  assert.match(logout, /push_subscriptions/)
  assert.match(logout, /endpoint_hash/)
  assert.match(logout, /maxAge: 0/)
})

test('background order notification reliability remains enabled while the driver stays signed in', () => {
  const push = read('lib/server/push.ts')
  const serviceWorker = read('public/sw.js')
  const nativeService = read('mobile/android/app/src/main/java/mn/achilt/driver/DriverWorkService.java')

  assert.match(push, /notifyOrderInvites/)
  assert.match(push, /attempt <= 3/)
  assert.match(push, /urgency: 'high'/)
  assert.match(serviceWorker, /showNotification/)
  assert.match(serviceWorker, /\/api\/push\/ack/)
  assert.match(nativeService, /scheduleWithFixedDelay\(this::tick, 0, 10, TimeUnit\.SECONDS\)/)
}
