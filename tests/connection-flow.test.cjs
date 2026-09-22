/* eslint-disable @typescript-eslint/no-require-imports -- Exercise real route code across a selection with isolated database and push I/O. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const next = require('next/server')

function flow() {
  const customer = { id: 'customer-a', phone: '+97600000001' }
  const driver = { id: 'driver-a', name: 'Бат', phone: '+97600000002', photo_url: 'https://example.com/driver.jpg', car_number: '1234 УБА', car_type: 'butten', lat: 47.92, lng: 106.92, location_updated_at: new Date().toISOString(), available: true, pin_hash: 'private-hash' }
  const order = { id: 'order-a', user_id: customer.id, user_phone: customer.phone, status: 'pending', from_lat: 47.91, from_lng: 106.91 }
  const offer = { id: 'offer-a', order_id: order.id, driver_id: driver.id, price: 85000, status: 'pending', driver_phone: driver.phone }
  const invite = { id: 'invite-a', order_id: order.id, driver_id: driver.id, status: 'offered', rank: 1, expires_at: new Date(Date.now() + 600000).toISOString() }
  const rows = { orders: [order], drivers: [driver], offers: [offer], driver_invites: [invite], payment_codes: [] }
  const calls = [], tasks = [], notifications = [], cache = {}
  const state = { customer, driver, dbError: null, rpcError: null, waiting: false, dispatchError: false }
  const admin = {
    from(table) {
      const q = { table, filters: [], columns: null, single: false, update: null }
      const chain = {
        select(columns) { q.columns = columns; return chain },
        eq(k,v) { q.filters.push(row => row[k] === v); return chain },
        is(k,v) { q.filters.push(row => row[k] === v); return chain },
        in(k,v) { q.filters.push(row => v.includes(row[k])); return chain },
        gt(k,v) { q.filters.push(row => row[k] > v); return chain },
        order() { return chain }, limit() { return chain },
        maybeSingle() { q.single = true; return chain },
        update(value) { q.update = value; return chain },
        then(resolve, reject) {
          calls.push(q)
          let data = (rows[table] || []).filter(row => q.filters.every(f => f(row)))
          if (q.update) data.forEach(row => Object.assign(row, q.update))
          data = data.map(row => q.columns ? Object.fromEntries(q.columns.split(',').map(k => [k, row[k] ?? null])) : { ...row })
          return Promise.resolve({ data: q.single ? data[0] || null : data, error: state.dbError }).then(resolve, reject)
        }
      }
      return chain
    },
    async rpc(name, args) {
      calls.push({ rpc: name, args })
      if (name === 'refresh_waiting_orders_for_driver') {
        if (state.dispatchError) return { error: { code: 'XX000' } }
        if (state.waiting) { rows.driver_invites.push(invite); state.waiting = false; return { data: { order_ids: [order.id] } } }
        return { data: { order_ids: [] } }
      }
      if (name === 'refresh_order_driver_slots') return { data: { inserted: 0, expired: false, bidding_expires_at: invite.expires_at } }
      if (state.rpcError) return { error: { message: state.rpcError } }
      if (order.status !== 'pending') return { error: { message: 'Order already selected' } }
      Object.assign(order, { status: 'confirmed', driver_id: driver.id, driver_name: driver.name, driver_phone: driver.phone, final_price: offer.price })
      driver.available = false; offer.status = 'accepted'; invite.status = 'selected'
      return { data: { order_id: order.id, driver_id: driver.id, offer_id: offer.id, price: offer.price } }
    }
  }
  function load(file) {
    if (cache[file]) return cache[file]
    const exports = {}; cache[file] = exports
    const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    vm.runInNewContext(source, { exports, console, Date, require(name) {
      if (name === 'next/server') return { ...next, after: fn => tasks.push(fn) }
      if (name.endsWith('/supabase-admin')) return { getSupabaseAdmin: () => admin }
      if (name.endsWith('/customer')) return { requireCustomer: async () => state.customer }
      if (name.endsWith('/driver')) return { requireDriver: async () => state.driver }
      if (name.endsWith('/security')) return { allowRequest: async () => true }
      if (name.endsWith('/push')) return { notifyOrderInvites: async id => notifications.push('invite:' + id), notifySelectedDriver: async id => notifications.push(id) }
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts')
      return require(name)
    } })
    return exports
  }
  async function call(route, body = { order_id: order.id, offer_id: offer.id }, method = 'POST') {
    const req = new next.NextRequest(`https://achilt.example/api/${route}`, { method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) })
    const response = await load(`app/api/${route}/route.ts`)[method](req)
    return { response, body: await response.json() }
  }
  return { state, rows, calls, tasks, notifications, driver, customer, order, offer, call }
}

test('driver polling recovers a waiting order before reading invitations, then notifies after response', async () => {
  const h = flow(); h.rows.driver_invites = []; h.state.waiting = true
  const result = await h.call('driver/orders', {}, 'GET')
  assert.equal(result.response.status, 200)
  assert.equal(result.body.orders[0].id, 'order-a')
  assert.equal(JSON.stringify(result.body).includes(h.customer.phone), false)
  assert.equal(h.calls[0].rpc, 'refresh_waiting_orders_for_driver')
  assert.equal(h.calls[0].args.p_driver_id, h.driver.id)
  assert.equal(h.notifications.length, 0)
  for (const task of h.tasks.splice(0)) await task()
  assert.deepEqual(h.notifications, ['invite:order-a'])
  await h.call('driver/orders', {}, 'GET')
  assert.equal(h.tasks.length, 0)
})

test('dispatch failure is visible and offline drivers do not dispatch', async () => {
  const h = flow(); h.state.dispatchError = true
  assert.equal((await h.call('driver/orders', {}, 'GET')).response.status, 503)
  assert.equal(h.tasks.length, 0)
  h.driver.available = false
  const count = h.calls.length
  assert.equal((await h.call('driver/orders', {}, 'GET')).response.status, 200)
  assert.equal(h.calls.slice(count).some(c => c.rpc), false)
})

test('offer → selection → both maps: profile before selection, phone exchange only afterward', async () => {
  const h = flow()
  let result = await h.call('order/slots')
  assert.equal(result.response.status, 200)
  const slot = result.body.slots[0]
  assert.equal(slot.photo_url, h.driver.photo_url); assert.equal(slot.car_number, h.driver.car_number)
  assert.equal(slot.offer.price, 85000); assert.ok(slot.distance_km > 0)
  assert.equal(JSON.stringify(result.body).includes(h.driver.phone), false)
  assert.equal(JSON.stringify(result.body).includes('private-hash'), false)
  result = await h.call('driver/orders', {}, 'GET')
  assert.equal(result.body.acceptedOrder, null)
  assert.equal(JSON.stringify(result.body).includes(h.customer.phone), false)
  result = await h.call('order/tracking')
  assert.equal(result.body.driver, null); assert.equal(result.body.order.driver_phone, null)

  result = await h.call('order/accept-offer')
  assert.equal(result.response.status, 200)
  assert.equal(h.order.status, 'confirmed'); assert.equal(h.notifications.length, 0)
  for (const task of h.tasks.splice(0)) await task()
  assert.deepEqual(h.notifications, ['order-a'])
  result = await h.call('order/tracking')
  assert.equal(result.body.order.driver_phone, h.driver.phone)
  assert.equal(result.body.driver.car_number, h.driver.car_number)
  assert.equal(result.body.driver.lat, h.driver.lat)
  assert.equal(result.body.order.final_price, 85000)
  const customerPickup = [result.body.order.from_lat, result.body.order.from_lng]
  assert.match(result.response.headers.get('cache-control'), /no-store/)
  result = await h.call('driver/orders', {}, 'GET')
  assert.equal(result.body.acceptedOrder.user_phone, h.customer.phone)
  assert.deepEqual([result.body.acceptedOrder.from_lat, result.body.acceptedOrder.from_lng], customerPickup)
  assert.equal(result.body.available, false)
  assert.match(result.response.headers.get('cache-control'), /no-store/)
})

test('selection retry reuses the result and does not notify or mutate again', async () => {
  const h = flow()
  await h.call('order/accept-offer')
  const first = h.calls.filter(c => c.rpc).length
  const result = await h.call('order/accept-offer')
  assert.equal(result.response.status, 200); assert.equal(result.body.result.driver_id, 'driver-a')
  assert.equal(h.tasks.length, 1); assert.equal(h.calls.filter(c => c.rpc).length, first)
  const different = await h.call('order/accept-offer', { order_id: 'order-a', offer_id: 'offer-b' })
  assert.equal(different.response.status, 409); assert.equal(h.tasks.length, 1)
})

test('unrelated customer and driver cannot see the selected contacts or location', async () => {
  const h = flow(); await h.call('order/accept-offer')
  h.state.customer = { id: 'other', phone: '+97600000009' }
  for (const route of ['order/slots','order/tracking','order/accept-offer']) assert.equal((await h.call(route)).response.status, 404)
  h.state.driver = { id: 'driver-b' }
  const result = await h.call('driver/orders', {}, 'GET')
  assert.equal(result.body.acceptedOrder, null)
  assert.equal(JSON.stringify(result.body).includes(h.customer.phone), false)
  h.state.customer = null
  assert.equal((await h.call('order/tracking')).response.status, 401)
})

test('completed or cancelled orders stop disclosing ongoing driver GPS', async () => {
  const h = flow(); await h.call('order/accept-offer')
  h.order.status = 'completed'
  let result = await h.call('order/tracking')
  assert.equal(result.body.driver.lat, null); assert.equal(result.body.driver.lng, null)
  assert.equal(result.body.driver.location_updated_at, null)
  h.order.status = 'cancelled'
  result = await h.call('order/tracking')
  assert.equal(result.body.driver, null); assert.equal(result.body.order.driver_phone, null)
})

test('failed selection or database lookup does not send a selected notification', async () => {
  const h = flow(); h.state.rpcError = 'Driver is already busy'
  assert.equal((await h.call('order/accept-offer')).response.status, 409)
  assert.equal(h.tasks.length, 0); assert.equal(h.order.status, 'pending')
  h.state.dbError = { code: 'XX000' }
  for (const route of ['order/tracking','order/accept-offer']) assert.equal((await h.call(route)).response.status, 503)
})

test('returning from tracking keeps the selected offer visible without reopening bidding or sharing phones', async () => {
  const h = flow(); await h.call('order/accept-offer')
  const count = h.calls.filter(c => c.rpc === 'refresh_order_driver_slots').length
  const result = await h.call('order/slots')
  assert.equal(result.response.status,200)
  assert.equal(result.body.order_status,'confirmed')
  assert.equal(result.body.slots.length,1)
  assert.equal(result.body.slots[0].driver_id,'driver-a')
  assert.equal(result.body.slots[0].offer.price,85000)
  assert.equal(JSON.stringify(result.body).includes(h.driver.phone),false)
  assert.equal(h.calls.filter(c => c.rpc === 'refresh_order_driver_slots').length,count)
  h.order.status='completed'
  assert.equal((await h.call('order/slots')).body.slots.length,0)
})
