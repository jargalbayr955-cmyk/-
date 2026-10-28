const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

for (const [file, label] of [
  ['public/vehicle-buten-achigch.svg', 'Бүтэн ачигч'],
  ['public/vehicle-chiregch.svg', 'Чирэгч'],
]) {
  test(`${label} image is a local scalable vector with no deployment dependency`, () => {
    const svg = read(file)
    assert.match(svg, /viewBox="0 0 900 520"/)
    assert.doesNotMatch(svg, /<image\b/i)
    assert.doesNotMatch(svg, /href="https?:\/\//i)
    assert.doesNotMatch(svg, /vercel\.app/i)
  })
}

test('tow images keep a stable frame on customer and registration screens', () => {
  const customer = read('app/components/customer-order-sheet.tsx')
  const registration = read('app/components/driver-registration.tsx')
  assert.match(customer, /width: 118, height: 72/)
  assert.match(customer, /width="118" height="72"/)
  assert.match(registration, /vehicle-buten-achigch\.svg/)
  assert.match(registration, /vehicle-chiregch\.svg/)
  assert.match(registration, /objectFit: 'contain'/)
})
