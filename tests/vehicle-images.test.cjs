const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

for (const [file, label] of [
  ['public/vehicle-buten-achigch.svg', 'Бүтэн ачигч'],
  ['public/vehicle-chiregch.svg', 'Чирэгч'],
]) {
  test(`${label} image is self-contained and never depends on an old deployment`, () => {
    const svg = read(file)
    assert.match(svg, /viewBox="0 0 118 72"/)
    assert.match(svg, /data:image\/jpeg;base64,/)
    assert.doesNotMatch(svg, /https?:\/\//)
    assert.doesNotMatch(svg, /xMidYMid slice/)
  })
}

test('tow images keep the same fixed aspect ratio on customer and registration screens', () => {
  const customer = read('app/components/customer-order-sheet.tsx')
  const registration = read('app/components/driver-registration.tsx')
  assert.match(customer, /width: 118, height: 72/)
  assert.match(customer, /width="118" height="72"/)
  assert.match(registration, /vehicle-buten-achigch\.svg/)
  assert.match(registration, /vehicle-chiregch\.svg/)
  assert.match(registration, /objectFit: 'contain'/)
})
