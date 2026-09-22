/* eslint-disable @typescript-eslint/no-require-imports -- Real route and client logic with isolated I/O. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { NextRequest } = require('next/server')

function moduleSource(file) {
  return ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
}
function helpers() {
  const exports = {}
  vm.runInNewContext(moduleSource('lib/order-offers.ts'), { exports, Date })
  return exports
}
const offer = (id = 'offer-a', price = 85000) => ({ driver_id: 'driver-' + id, rank: 1, lat: 47.92, lng: 106.92, distance_km: 2.4, driver_name: 'Test driver', offer: { id, price } })

test('only priced offers with real coordinates appear as driver markers', () => {
  const h = helpers()
  const good = offer()
  for (const point of [[null, null], ['', ''], [false, true], [91, 106], [47, Infinity]]) assert.equal(h.pickupPoint(...point), null)
  assert.equal(h.pickupPoint(0, 0).lat, 0)
  const result = h.mapOffers([good, { ...offer('b'), offer: null }, { ...offer('c'), lat: null }, offer('d', 0), offer('e', NaN)])
  assert.equal(result.length, 1)
  assert.equal(result[0].offer.id, 'offer-a')
  assert.equal(h.offerPrice(good.offer.price), '85,000 ₮')
  assert.equal(h.offerDistance(good.distance_km), '2.4 км зайтай')
})

test('countdown uses the server deadline, clamps expiry and never invents a deadline', () => {
  const h = helpers(), now = Date.parse('2026-09-22T00:00:00Z')
  assert.equal(h.remainingSeconds('2026-09-22T00:10:00Z', now), 600)
  assert.equal(h.remainingSeconds('2026-09-22T00:10:00Z', now + 1001), 599)
  assert.equal(h.remainingSeconds('2026-09-22T00:10:00Z', now + 600001), 0)
  for (const value of [null, 'invalid']) assert.equal(h.remainingSeconds(value, now), null)
})

test('new offer alerts fire once per new offer batch, not on initial load or repeated polling', () => {
  const h = helpers()
  let snapshot = h.offerSnapshot(null, [offer()])
  assert.equal(snapshot.hasNew, false)
  snapshot = h.offerSnapshot(snapshot.seen, [offer(), offer('b')])
  assert.equal(snapshot.hasNew, true)
  snapshot = h.offerSnapshot(snapshot.seen, [offer('b'), offer()])
  assert.equal(snapshot.hasNew, false)
  snapshot = h.offerSnapshot(snapshot.seen, [])
  snapshot = h.offerSnapshot(snapshot.seen, [offer('b')])
  assert.equal(snapshot.hasNew, false)
})

function routeHarness({ customer = { id: 'customer-a', phone: '+97600000000' }, order = {}, invited = true, coords = [47.92, 106.92], dbError = null } = {}) {
  const calls = []
  const rows = {
    orders: { data: { id: 'order-a', user_id: 'customer-a', status: 'pending', from_lat: 47.91, from_lng: 106.91, bidding_expires_at: '2026-09-22T00:10:00Z', ...order } },
    driver_invites: { data: invited ? [{ id: 'invite-a', driver_id: 'driver-a', rank: 1, status: 'offered' }] : [] },
    drivers: { data: [{ id: 'driver-a', name: 'Driver', lat: coords[0], lng: coords[1] }], error: dbError },
    offers: { data: [{ id: 'offer-a', driver_id: 'driver-a', price: 85000, driver_lat: coords[0], driver_lng: coords[1] }] },
  }
  const admin = {
    from(table) {
      calls.push(table)
      const chain = { then(resolve, reject) { return Promise.resolve(rows[table]).then(resolve, reject) } }
      for (const name of ['select', 'eq', 'is', 'in', 'update', 'maybeSingle', 'order', 'limit']) chain[name] = () => chain
      return chain
    },
    rpc: async () => ({ data: { expired: false, inserted: 0, bidding_expires_at: '2026-09-22T00:10:00Z' } }),
  }
  const exports = {}
  vm.runInNewContext(moduleSource('app/api/order/slots/route.ts'), { exports, require: name => {
    if (name.endsWith('/supabase-admin')) return { getSupabaseAdmin: () => admin }
    if (name.endsWith('/security')) return { allowRequest: async () => true }
    if (name.endsWith('/customer')) return { requireCustomer: async () => customer }
    if (name.endsWith('/push')) return { notifyOrderInvites: async () => { throw new Error('No real notifications in tests') } }
    if (name === '@/lib/order-offers') return helpers()
    return require(name)
  } })
  return { calls, async run() {
    return exports.POST(new NextRequest('https://achilt.example/api/order/slots', { method: 'POST', body: JSON.stringify({ order_id: 'order-a' }) }))
  } }
}

test('waiting and offered responses both contain the authenticated order pickup', async () => {
  for (const invited of [false, true]) {
    const response = await routeHarness({ invited }).run()
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body.pickup, { lat: 47.91, lng: 106.91 })
    assert.equal(body.slots.length, invited ? 1 : 0)
    if (invited) {
      assert.equal(body.slots[0].offer.price, 85000)
      assert.ok(body.slots[0].distance_km > 1 && body.slots[0].distance_km < 2)
    }
  }
})

test('missing driver coordinates stay unknown instead of producing a marker at zero', async () => {
  const body = await (await routeHarness({ coords: [null, null] }).run()).json()
  assert.equal(body.slots[0].lat, null)
  assert.equal(body.slots[0].lng, null)
  assert.equal(body.slots[0].distance_km, null)
})

test('order ownership blocks pickup and offer location disclosure', async () => {
  const anonymous = routeHarness({ customer: null })
  assert.equal((await anonymous.run()).status, 401)
  assert.equal(anonymous.calls.length, 0)
  const other = routeHarness({ order: { user_id: 'someone-else' } })
  const response = await other.run()
  assert.equal(response.status, 404)
  assert.equal((await response.json()).pickup, undefined)
  assert.deepEqual(other.calls, ['orders'])
})

test('driver lookup failure cannot masquerade as an empty successful offer response', async () => {
  assert.equal((await routeHarness({ dbError: { code: 'unavailable' } }).run()).status, 503)
})
