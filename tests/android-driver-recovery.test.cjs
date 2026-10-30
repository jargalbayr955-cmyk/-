const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('Android driver can safely recover authenticated work after reboot', () => {
  const manifest = read('mobile/android/app/src/main/AndroidManifest.xml')
  const receiver = read('mobile/android/app/src/main/java/mn/achilt/driver/BootReceiver.java')
  const state = read('mobile/android/app/src/main/java/mn/achilt/driver/DriverWorkState.java')

  assert.match(manifest, /android\.permission\.RECEIVE_BOOT_COMPLETED/)
  assert.match(manifest, /android\.permission\.ACCESS_BACKGROUND_LOCATION/)
  assert.match(manifest, /android:name="\.BootReceiver"/)
  assert.match(manifest, /android\.intent\.action\.BOOT_COMPLETED/)
  assert.match(manifest, /android\.intent\.action\.MY_PACKAGE_REPLACED/)

  assert.match(receiver, /DriverWorkState\.enabled\(context\)/)
  assert.match(receiver, /ACCESS_BACKGROUND_LOCATION/)
  assert.match(receiver, /POST_NOTIFICATIONS/)
  assert.match(receiver, /notifications\.areNotificationsEnabled\(\)/)
  assert.match(receiver, /context\.startForegroundService\(work\)/)
  assert.match(state, /putBoolean\(ENABLED, true\)/)
  assert.match(state, /putString\(DRIVER_ID, driverId\)/)
})

test('reboot recovery never revives logged-out or expired driver sessions', () => {
  const activity = read('mobile/android/app/src/main/java/mn/achilt/driver/MainActivity.java')
  const service = read('mobile/android/app/src/main/java/mn/achilt/driver/DriverWorkService.java')

  assert.match(activity, /DriverWorkState\.remember\(this, id\)/)
  assert.match(activity, /private void logout\(\)[\s\S]*DriverWorkState\.clear\(this\)/)
  assert.match(activity, /backgroundLocationReady\(\)/)
  assert.match(activity, /Allow all the time \/ Үргэлж зөвшөөрөх/)

  assert.match(service, /!DriverWorkState\.enabled\(this\)/)
  assert.match(service, /return START_NOT_STICKY/)
  assert.match(service, /error\.status == 401 \|\| error\.status == 403[\s\S]*DriverWorkState\.clear\(this\)/)
  assert.match(service, /DriverWorkState\.remember\(this, currentId\)/)
})

test('native Android can bootstrap a missing active session from only its signed driver trust cookie', () => {
  const policy = read('mobile/android/app/src/main/java/mn/achilt/driver/WorkPolicy.java')
  const api = read('mobile/android/app/src/main/java/mn/achilt/driver/DriverApi.java')
  const session = read('app/api/driver/session/route.ts')

  assert.match(policy, /driverTrustCookie/)
  assert.match(policy, /driverProof/)
  assert.match(policy, /driverAuthHeader/)
  assert.match(api, /WorkPolicy\.driverProof\(allCookies\(\)\)/)
  assert.match(api, /\(session \|\| logout\) \? WorkPolicy\.driverAuthHeader\(before\) : WorkPolicy\.driverCookie\(before\)/)
  assert.match(api, /achilt_driver_session=/)
  assert.match(api, /achilt_driver_trust=/)
  assert.match(api, /!session && !logout && WorkPolicy\.driverCookie\(before\)\.isEmpty\(\)/)
  assert.match(api, /logout \|\| \(session && hasTrust\)/)
  assert.doesNotMatch(session, /setTrustedDriverDevice/)
  assert.match(session, /if \(restoredVersion\) setDeviceSession\(res, driver\.id, 'driver', restoredVersion\)/)
})

test('download page and CI publish the hardened 5.5.5 APK', () => {
  const gradle = read('mobile/android/app/build.gradle')
  const page = read('app/driver/app/page.tsx')
  const ci = read('.github/workflows/ci.yml')

  assert.match(gradle, /versionCode 555/)
  assert.match(gradle, /versionName '5\.5\.5-preview'/)
  assert.match(page, /AchiltDriver-5\.5\.5-preview\.apk/)
  assert.match(page, /Android апп татах · 5\.5\.5 · APK/)
  assert.match(ci, /AchiltDriver-5\.5\.5-preview\.apk/)
})
