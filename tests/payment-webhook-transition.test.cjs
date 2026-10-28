const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')

test('MacroDroid webhook rollout accepts the dedicated key without stranding the previous derived key', () => {
  const helper = read('lib/server/payment-webhook.ts')
  const route = read('app/api/payment/verify/route.ts')
  assert.match(helper, /getPaymentWebhookSecrets/)
  assert.match(helper, /PAYMENT_WEBHOOK_SECRET/)
  assert.match(helper, /achilt:macrodroid:payment-webhook:v1/)
  assert.match(helper, /new Set\(values\)/)
  assert.match(route, /getPaymentWebhookSecrets/)
  assert.match(route, /secrets\.some\(secret => safeEqual\(secret, provided\)\)/)
})
