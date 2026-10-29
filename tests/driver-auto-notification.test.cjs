const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('starting work automatically requests push notifications before enabling availability', () => {
  const view = read('app/components/driver-dispatch-view.tsx')
  assert.match(view, /if \(!driver\.available && !pushReady && !notificationsDenied\) onSubscribe\(\)/)
  assert.match(view, /onSubscribe\(\)[\s\S]{0,80}onToggleAvailable\(\)/)
  assert.match(view, /driver\.available \? 'Амрах' : 'Ажиллаж эхлэх'/)
})
