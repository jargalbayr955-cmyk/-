const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('admin onboarding session refresh does not overwrite an in-progress form draft', () => {
  const gate = read('app/components/driver-onboarding-gate.tsx')
  assert.match(gate, /const hydratedDriverId = useRef<string \| null>\(null\)/)
  assert.match(gate, /hydratedDriverId\.current !== profile\.id/)
  assert.match(gate, /hydratedDriverId\.current = profile\.id/)
  assert.match(gate, /if \(!hasDriver\.current && !onboardingRequired\.current\) void checkSession\(\)/)
  assert.doesNotMatch(gate, /\[checkSession, driver, pathname, required\]/)
  assert.match(gate, /\[checkSession, pathname\]/)
})

test('self-registration dialog stays mounted while the login host rerenders', () => {
  const entry = read('app/components/driver-registration-entry.tsx')
  assert.match(entry, /if \(!loginButton\) \{[\s\S]*?setTarget\(null\)[\s\S]*?return[\s\S]*?\}/)
  assert.match(entry, /const registrationDialog = open && typeof document !== 'undefined'/)
  assert.match(entry, /createPortal\(<DriverRegistrationDialog initialPhone="" onClose=\{closeRegistration\} \/>, document\.body\)/)
})
