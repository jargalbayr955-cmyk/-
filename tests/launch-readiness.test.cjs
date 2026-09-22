/* eslint-disable @typescript-eslint/no-require-imports -- Real TypeScript routes with isolated I/O boundaries. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { NextRequest } = require('next/server')

function harness({ rows = {}, driver = { id: 'driver-a', phone: '+97600000000', available: false, car_type: 'butten' }, blocked = false, env = {}, send } = {}) {
  const calls = [], cache = new Map()
  const admin = {
    from(table) {
      const query = { table, filters: [], action: 'select' }
      const chain = { then(resolve, reject) { calls.push(query); return Promise.resolve(typeof rows[table] === 'function' ? rows[table](query) : (rows[table] || { data: null, error: null })).then(resolve, reject) } }
      for (const method of ['select', 'eq', 'in', 'gt', 'gte', 'is', 'limit', 'order', 'maybeSingle', 'update', 'delete', 'insert']) {
        chain[method] = (...args) => { query.filters.push([method, ...args]); if (['update','delete','insert'].includes(method)) query.action = method; return chain }
      }
      return chain
    },
    async rpc(name, args) { calls.push({ rpc: name, args }); return { data: true, error: null } },
  }
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const exports = {}; cache.set(file, exports)
    const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText
    vm.runInNewContext(source, { exports, Buffer, URL, Date, process: { env }, console: { error() {}, warn() {} }, require(name) {
      if (name === 'server-only') return {}
      if (name.endsWith('/supabase-admin')) return { getSupabaseAdmin: () => admin }
      if (name === '@/lib/server/driver') return { requireDriver: async () => driver, driverHasBlockingWork: async () => blocked }
      if (name === '@/lib/server/security') return { allowRequest: async () => true, getClientIp: () => 'test', safeEqual: (a,b) => a === b, verifySession: () => ({ sub: 'admin-a' }) }
      if (name === 'web-push') return { setVapidDetails() {}, sendNotification: send }
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts')
      if (name.startsWith('.')) return load(path.normalize(path.join(path.dirname(file), name + '.ts')))
      return require(name)
    } }, { filename: file })
    return exports
  }
  return { load, calls }
}
function request(body = {}, secret = 'test-webhook-secret') {
  return new NextRequest('https://achilt.example/api/test', { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-secret': secret }, body: JSON.stringify(body) })
}
const receipt = { code: '123456', amount: 12500, currency: 'MNT', direction: 'credit' }
const payment = { id: 'payment-a', driver_id: 'driver-a', amount: 12500, used: false }
const paymentEnv = { PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret' }

for (const [name, body] of [
  ['ambiguous SMS', { sms: 'Zarlaga 12500 MNT Utga:123456' }],
  ['outgoing transfer', { ...receipt, direction: 'debit' }],
  ['wrong currency', { ...receipt, currency: 'USD' }],
  ['string amount', { ...receipt, amount: '12500' }],
  ['negative amount', { ...receipt, amount: -12500 }],
  ['null payload', null],
]) test(`payment rejects ${name} without accessing database`, async () => {
  const h = harness({ env: paymentEnv })
  const result = await h.load('app/api/payment/verify/route.ts').POST(request(body))
  assert.equal(result.status, 400); assert.equal(h.calls.length, 0)
})

test('payment rejects incorrect amount and never releases driver', async () => {
  const h = harness({ env: paymentEnv, rows: { payment_codes: { data: payment } } })
  const result = await h.load('app/api/payment/verify/route.ts').POST(request({ ...receipt, amount: 1 }))
  assert.equal(result.status, 409); assert.equal(h.calls.some(x => x.rpc), false)
})
test('payment secret is required before database access', async () => {
  const h = harness({ env: paymentEnv })
  assert.equal((await h.load('app/api/payment/verify/route.ts').POST(request(receipt, 'wrong'))).status, 401)
  assert.equal(h.calls.length, 0)
})
test('matching incoming payment confirms atomically and duplicate does not confirm again', async () => {
  for (const used of [false, true]) {
    const h = harness({ env: paymentEnv, rows: { payment_codes: { data: { ...payment, used } } } })
    const result = await h.load('app/api/payment/verify/route.ts').POST(request(receipt))
    assert.equal(result.status, 200)
    assert.equal(h.calls.filter(x => x.rpc === 'confirm_payment_atomic').length, used ? 0 : 1)
  }
})
test('database lookup error is reported, not mistaken for an invalid payment', async () => {
  const h = harness({ env: paymentEnv, rows: { payment_codes: { error: { code: 'XX000' } } } })
  assert.equal((await h.load('app/api/payment/verify/route.ts').POST(request(receipt))).status, 503)
})
test('completed paid order retry cannot issue a new payment or block driver', async () => {
  const h = harness({ rows: {
    orders: { data: { id: 'order-a', driver_id: 'driver-a', status: 'completed', final_price: 12500 } },
    payment_codes: { data: { code: '123456', amount: 12500, used: true } },
  } })
  const result = await h.load('app/api/payment/complete/route.ts').POST(request({ order_id: 'order-a' }))
  assert.equal(result.status, 200); assert.equal((await result.json()).paid, true)
  assert.equal(h.calls.some(x => x.rpc || x.action !== 'select'), false)
})
test('another driver cannot complete an order', async () => {
  const h = harness({ rows: { orders: { data: { id: 'order-a', driver_id: 'driver-b', status: 'confirmed', final_price: 12500 } } } })
  assert.equal((await h.load('app/api/payment/complete/route.ts').POST(request({ order_id: 'order-a' }))).status, 403)
  assert.equal(h.calls.some(x => x.rpc), false)
})
test('pending payment is recovered by driver ID without browser storage', async () => {
  const h = harness({ rows: { driver_invites: { data: [] }, payment_codes: { data: { code: '123456', amount: '12500', order_id: 'order-a' } } } })
  const result = await h.load('app/api/driver/orders/route.ts').GET(request())
  assert.equal(result.status, 200)
  assert.deepEqual((await result.json()).pendingPayment, { code: '123456', amount: 12500, order_id: 'order-a' })
  const lookup = h.calls.find(x => x.table === 'payment_codes')
  assert.ok(lookup.filters.some(x => x[0] === 'eq' && x[1] === 'driver_id' && x[2] === 'driver-a'))
  assert.ok(lookup.filters.some(x => x[0] === 'eq' && x[1] === 'used' && x[2] === false))
})
test('invalid PIN rejects profile changes before writes', async () => {
  const h = harness()
  assert.equal((await h.load('app/api/driver/profile/route.ts').POST(request({ name: 'Test', car_type: 'butten', new_pin: '1234' }))).status, 400)
  assert.equal(h.calls.length, 0)
})
test('missing, null and coerced coordinates cannot put a driver at 0,0', async () => {
  for (const coordinates of [{}, { lat:null, lng:null }, { lat:'', lng:'' }, { lat:false, lng:true }, { lat:91, lng:106 }]) {
    const h = harness()
    assert.equal((await h.load('app/api/driver/location/route.ts').POST(request(coordinates))).status, 400)
    assert.equal(h.calls.length, 0)
  }
})
test('location response preserves unavailability while payment is pending', async () => {
  const h = harness({ blocked: true })
  const result = await h.load('app/api/driver/location/route.ts').POST(request({ lat:47.9, lng:106.9, available:true }))
  assert.equal(result.status, 200); assert.equal((await result.json()).available, false)
  assert.equal(h.calls[0].filters.find(x => x[0] === 'update')[1].available, undefined)
})
test('admin database failure cannot appear as an empty healthy dashboard', async () => {
  const h = harness({ rows: { drivers: { error: { code: 'XX000' } } } })
  assert.equal((await h.load('app/api/admin/dashboard/route.ts').GET(request())).status, 503)
})
const keys = { p256dh: Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url'), auth: Buffer.alloc(16,2).toString('base64url') }
const sub = endpoint => ({ endpoint, keys })
test('push permits supported HTTPS providers and rejects arbitrary/private endpoints', () => {
  const valid = harness().load('lib/server/push-subscription.ts').isValidPushSubscription
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/test','https://updates.push.services.mozilla.com/wpush/v2/test','https://web.push.apple.com/test']) assert.equal(valid(sub(endpoint)), true)
  for (const endpoint of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://169.254.169.254/x','https://fcm.googleapis.com.evil.example/x','https://evil.example/push','https://fcm.googleapis.com:8443/x','https://user:password@fcm.googleapis.com/x']) assert.equal(valid(sub(endpoint)), false)
  assert.equal(valid({ endpoint:'https://fcm.googleapis.com/x',keys:{auth:'bad',p256dh:'bad'} }), false)
})
test('disabled driver cannot replace a push subscription', async () => {
  const h = harness({ driver:null })
  assert.equal((await h.load('app/api/push/subscribe/route.ts').POST(request({ subscription: sub('https://fcm.googleapis.com/test') }))).status, 401)
  assert.equal(h.calls.length, 0)
})
test('partial push failure marks only delivered invites and cleans up expired subscription', async () => {
  const h = harness({ env:{NEXT_PUBLIC_VAPID_PUBLIC_KEY:'test',VAPID_PRIVATE_KEY:'test'}, rows:{
    orders:{data:{id:'order-a',status:'pending',from_address:'Test'}},
    driver_invites:{data:[{id:'invite-a',driver_id:'driver-a'},{id:'invite-b',driver_id:'driver-b'},{id:'invite-c',driver_id:'driver-c'}]},
    push_subscriptions:{data:[{id:'sub-a',driver_id:'driver-a',subscription:sub('https://fcm.googleapis.com/success')},{id:'sub-b',driver_id:'driver-b',subscription:sub('https://fcm.googleapis.com/expired')}]},
  }, send:async (subscription, payload, options) => {
    assert.equal(options.timeout,5000)
    assert.equal(JSON.parse(payload).url,'/driver')
    if(subscription.endpoint.endsWith('/expired')) throw {statusCode:410}
  } })
  const result = await h.load('lib/server/push.ts').notifyOrderInvites('order-a')
  assert.equal(result.sent,1); assert.equal(result.invited,3)
  const marked = h.calls.find(x => x.table === 'driver_invites' && x.action === 'update')
  assert.deepEqual(Array.from(marked.filters.find(x=>x[0]==='in')[2]),['invite-a'])
  assert.ok(h.calls.some(x=>x.table==='push_subscriptions' && x.action==='delete'))
})

test('driver without a vehicle type cannot go online', async () => {
  for (const route of ['availability', 'location']) {
    const h = harness({ driver: { id:'driver-a', available:false, car_type:null } })
    const result = await h.load(`app/api/driver/${route}/route.ts`).POST(request({ available:true, lat:47.9, lng:106.9 }))
    assert.equal(result.status,409); assert.equal(h.calls.length,0)
  }
})
