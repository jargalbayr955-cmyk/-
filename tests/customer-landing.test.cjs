const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const page = fs.readFileSync(path.join(__dirname, '..', 'app/page.tsx'), 'utf8')

test('public landing page explains the customer flow and sends every CTA to customer start', () => {
  assert.match(page, /АЧИЛТ ХЭРЭГТЭЙ ЮУ\?/)
  assert.match(page, /Байршлаа оруул/)
  assert.match(page, /Үнэ санал ав/)
  assert.match(page, /Жолоочоо сонго/)
  assert.match(page, /Ачилт захиалах/)
  assert.equal((page.match(/href="\/start"/g) || []).length >= 3, true)
})

test('public acquisition landing does not expose driver registration or admin entry copy', () => {
  assert.doesNotMatch(page, /Жолоочоор бүртгүүлэх/)
  assert.doesNotMatch(page, /Админ/)
  assert.doesNotMatch(page, /000000/)
})
