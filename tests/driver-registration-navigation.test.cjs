const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const registration = fs.readFileSync(path.join(root, 'app/components/driver-registration.tsx'), 'utf8')
const auth = fs.readFileSync(path.join(root, 'app/components/customer-auth.tsx'), 'utf8')

test('driver registration payment copy is customer-facing and automatic', () => {
  assert.match(registration, /ГҮЙЛГЭЭНИЙ УТГАД ЗААВАЛ БИЧНЭ/)
  assert.match(registration, /Энэ 6 оронтой тоог гүйлгээний утгад заавал бичнэ үү\. Төлбөр ормогц автоматаар баталгаажна\./)
  assert.doesNotMatch(registration, /MacroDroid/)
  assert.doesNotMatch(registration, /код болон дүнг тааруулмагц/)
})

test('phone back closes driver registration before leaving the start page', () => {
  assert.match(auth, /DRIVER_REGISTRATION_HISTORY/)
  assert.match(auth, /window\.history\.pushState/)
  assert.match(auth, /addEventListener\('popstate'/)
  assert.match(auth, /window\.history\.back\(\)/)
  assert.match(auth, /onClick=\{openDriverRegistration\}/)
  assert.match(auth, /onClose=\{closeDriverRegistration\}/)
})
