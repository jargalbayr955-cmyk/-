const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const registration = fs.readFileSync(path.join(root, 'app/components/driver-registration.tsx'), 'utf8')
const entry = fs.readFileSync(path.join(root, 'app/components/driver-registration-entry.tsx'), 'utf8')
const auth = fs.readFileSync(path.join(root, 'app/components/customer-auth.tsx'), 'utf8')

test('driver registration payment copy is customer-facing and automatic', () => {
  assert.match(registration, /ГҮЙЛГЭЭНИЙ УТГАД ЗААВАЛ БИЧНЭ/)
  assert.match(registration, /Энэ 6 оронтой тоог гүйлгээний утгад заавал бичнэ үү\. Төлбөр ормогц автоматаар баталгаажна\./)
  assert.doesNotMatch(registration, /MacroDroid/)
  assert.doesNotMatch(registration, /код болон дүнг тааруулмагц/)
})

test('phone back closes driver registration before leaving the driver login page', () => {
  assert.doesNotMatch(auth, /DRIVER_REGISTRATION_HISTORY/)
  assert.match(entry, /DRIVER_REGISTRATION_HISTORY/)
  assert.match(entry, /window\.history\.pushState/)
  assert.match(entry, /addEventListener\('popstate'/)
  assert.match(entry, /window\.history\.back\(\)/)
  assert.match(entry, /onClick=\{openRegistration\}/)
  assert.match(entry, /onClose=\{closeRegistration\}/)
})
