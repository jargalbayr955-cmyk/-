const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

for (const [file, original, label] of [
  ['public/vehicle-buten-achigch.svg', 'public/vehicle-buten-achigch-original.svg', 'Бүтэн ачигч'],
  ['public/vehicle-chiregch.svg', 'public/vehicle-chiregch-original.svg', 'Чирэгч'],
]) {
  test(`${label} keeps the old photo look without a cross-deployment dependency`, () => {
    const wrapper = read(file)
    const source = read(original)
    assert.match(wrapper, /viewBox="0 0 118 72"/)
    assert.match(wrapper, /x="-15" y="-9" width="148" height="90"/)
    assert.match(wrapper, new RegExp(`href="/${path.basename(original).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`))
    assert.doesNotMatch(wrapper, /href="https?:\/\//i)
    assert.doesNotMatch(wrapper, /vercel\.app/i)
    assert.match(source, /href="data:image\/jpeg;base64,/i)
    assert.doesNotMatch(source, /href="https?:\/\//i)
  })
}

test('tow images keep a stable frame on customer and registration screens', () => {
  const customer = read('app/components/customer-order-sheet.tsx')
  const registration = read('app/components/driver-registration.tsx')
  assert.match(customer, /width: 118, height: 72/)
  assert.match(customer, /width="118" height="72"/)
  assert.match(registration, /vehicle-buten-achigch-original\.svg/)
  assert.match(registration, /vehicle-chiregch-original\.svg/)
  assert.match(registration, /objectFit: 'cover'/)
  assert.doesNotMatch(registration, /<img src="\/vehicle-buten-achigch\.svg"/)
  assert.doesNotMatch(registration, /<img src="\/vehicle-chiregch\.svg"/)
})
