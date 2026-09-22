/* eslint-disable @typescript-eslint/no-require-imports -- Isolated route harness, with the real signing and cookie code. */
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { NextRequest } = require('next/server')

const DAY = 86400
const SECRET = 'test-only-session-secret-not-a-live-secret'
function harness() {
  let now = 1_800_000_000
  const users = []
  const drivers = [{ id: 'driver-a', phone: '+97600006602', pin: '664422', active: true, deleted_at: null }]
  const state = { unavailable: false }
  const cache = new Map()
  const admin = {
    rpc: async (name, args) => {
      if (name === 'consume_rate_limit') return { data: true, error: null }
      if (state.unavailable) return { data: null, error: { code: 'unavailable' } }
      if (name === 'register_customer_secure') {
        const user = { id: 'customer-a', phone: args.p_phone, pin: args.p_pin, active: true }
        users.push(user)
        return { data: user.id, error: null }
      }
      const list = name === 'verify_driver_pin' ? drivers : users
      return { data: list.find(u => u.phone === args.p_phone && u.pin === args.p_pin && u.active)?.id || null, error: null }
    },
    from: (table) => {
      const filters = []
      const builder = {
        select: () => builder,
        limit: () => builder,
        eq: (key, value) => { filters.push(u => u[key] === value); return builder },
        is: (key, value) => { filters.push(u => u[key] === value); return builder },
        maybeSingle: async () => {
          const row = (table === 'drivers' ? drivers : users).find(u => filters.every(fn => fn(u)))
          // Simulate the safe SELECT projections used by the routes.
          const data = row ? Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'pin')) : null
          return state.unavailable ? { data: null, error: { code: 'unavailable' } } : { data, error: null }
        },
      }
      return builder
    },
  }
  class Clock extends Date { static now() { return now * 1000 } }
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const exports = {}
    cache.set(file, exports)
    const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText
    vm.runInNewContext(source, {
      exports, Date: Clock, Buffer, console,
      process: { env: { NODE_ENV: 'production', SESSION_SECRET: SECRET } },
      require: name => {
        if (name === 'server-only') return {}
        if (name === '@/lib/server/supabase-admin' || name === './supabase-admin') return { getSupabaseAdmin: () => admin }
        if (name.startsWith('@/')) return load(name.slice(2) + '.ts')
        if (name.startsWith('./')) return load(path.join(path.dirname(file), name) + '.ts')
        return require(name)
      },
    }, { filename: file })
    return exports
  }
  const request = (route, body, cookie) => new NextRequest(`https://achilt.example/api/${route}`, {
    method: body ? 'POST' : 'GET', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  async function call(route, body, cookie) { return load(`app/api/${route}/route.ts`)[body ? 'POST' : 'GET'](request(route, body, cookie)) }
  return { load, call, users, state, advance: seconds => { now += seconds }, now: () => now }
}
function cookie(response) { return response.headers.get('set-cookie').split(';')[0] }
function signed(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
}
const credentials = { phone: '00006601', pin: '663311' }

test('registration immediately creates a persistent secure session; PIN never enters the cookie', async () => {
  const h = harness()
  const response = await h.call('customer/register', credentials)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('set-cookie'), /Max-Age=7776000/)
  assert.match(response.headers.get('set-cookie'), /HttpOnly/)
  assert.match(response.headers.get('set-cookie'), /Secure/)
  assert.match(response.headers.get('set-cookie'), /SameSite=lax/i)
  assert.match(response.headers.get('cache-control'), /no-store/)
  const saved = cookie(response)
  const claims = JSON.parse(Buffer.from(saved.split('=')[1].split('.')[0], 'base64url'))
  assert.deepEqual(Object.keys(claims).sort(), ['exp', 'role', 'sub'])
  assert.equal(claims.exp, h.now() + 90 * DAY)
  assert.equal((await h.call('customer/session', null, saved)).status, 200)
})

test('a new device signs into the same account with normalized phone and PIN; logout is per device', async () => {
  const h = harness()
  const first = cookie(await h.call('customer/register', credentials))
  assert.equal((await h.call('customer/session')).status, 401)
  h.advance(1)
  const secondResponse = await h.call('customer/login', { ...credentials, phone: '+976 0000 6601' })
  assert.equal(secondResponse.status, 200)
  const second = cookie(secondResponse)
  assert.notEqual(first, second)
  assert.equal((await secondResponse.json()).user.id, h.users[0].id)
  assert.equal((await h.call('customer/login', { ...credentials, pin: '000000' })).status, 401)
  assert.equal((await h.call('customer/register', credentials)).status, 409)
  const logout = await h.call('customer/logout', {}, first)
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)
  assert.equal((await h.call('customer/session', null, cookie(logout))).status, 401)
  assert.equal((await h.call('customer/session', null, second)).status, 200)
  assert.equal((await h.call('customer/login', credentials)).status, 200)
})

test('daily use renews the saved session; old seven-day sessions upgrade without a PIN', async () => {
  const h = harness()
  const saved = cookie(await h.call('customer/register', credentials))
  assert.equal((await h.call('customer/session', null, saved)).headers.get('set-cookie'), null)
  h.advance(2 * DAY)
  const renewed = await h.call('customer/session', null, saved)
  assert.match(renewed.headers.get('set-cookie'), /Max-Age=7776000/)
  const claims = h.load('lib/server/security.ts').verifySession(cookie(renewed).split('=')[1], 'customer')
  assert.equal(claims.exp, h.now() + 90 * DAY)
  const old = 'achilt_customer_session=' + signed({ sub: h.users[0].id, role: 'customer', exp: h.now() + 7 * DAY })
  assert.match((await h.call('customer/session', null, old)).headers.get('set-cookie'), /Max-Age=7776000/)
})

test('expired, disabled and deleted accounts cannot renew; database failure is retryable', async () => {
  const h = harness()
  const saved = cookie(await h.call('customer/register', credentials))
  h.state.unavailable = true
  const unavailable = await h.call('customer/session', null, saved)
  assert.equal(unavailable.status, 503)
  assert.equal(unavailable.headers.get('set-cookie'), null)
  h.state.unavailable = false
  h.users[0].active = false
  assert.equal((await h.call('customer/session', null, saved)).status, 401)
  h.users[0].active = true
  h.advance(90 * DAY)
  const expired = await h.call('customer/session', null, saved)
  assert.equal(expired.status, 401)
  assert.equal(expired.headers.get('set-cookie'), null)
  h.users.length = 0
  assert.equal((await h.call('customer/session', null, saved)).status, 401)
})

test('signed session validation rejects role confusion, missing expiry, tampering and extra segments', () => {
  const h = harness()
  const security = h.load('lib/server/security.ts')
  const token = security.signSession('customer-a', 'customer')
  assert.equal(security.verifySession(token, 'driver'), null)
  assert.equal(security.verifySession(token + '.extra', 'customer'), null)
  assert.equal(security.verifySession(token.slice(0, -2) + 'xx', 'customer'), null)
  assert.equal(security.verifySession(signed({ sub: 'customer-a', role: 'customer' }), 'customer'), null)
  const admin = security.verifySession(security.signSession('admin', 'admin'), 'admin')
  assert.equal(admin.exp - h.now(), 7 * DAY)
})

test('driver login and session restoration have the same persistent lifetime', async () => {
  const h = harness()
  const response = await h.call('driver/login', { phone: '00006602', pin: '664422' })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('set-cookie'), /Max-Age=7776000/)
  h.advance(2 * DAY)
  const restored = await h.call('driver/session', null, cookie(response))
  assert.equal(restored.status, 200)
  assert.match(restored.headers.get('set-cookie'), /Max-Age=7776000/)
})

function destination(customerStatus, driverStatus = 401, offline = false) {
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/client/session.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(source, { exports, fetch: async (url, options) => {
    assert.equal(options.cache, 'no-store')
    assert.equal(options.credentials, 'same-origin')
    if (offline) throw new Error('offline')
    return Response.json({ user: { id: 'customer-a', phone: '+97600006601' } }, { status: url.includes('/driver/') ? driverStatus : customerStatus })
  } })
  return async mode => (await exports.readSession(mode)).destination
}

test('returning customer skips both authentication forms and entry; new device sees the forms', async () => {
  assert.equal(await destination(200)('entry'), '/home')
  assert.equal(await destination(200)('guest'), '/home')
  assert.equal(await destination(200)('customer'), null)
  assert.equal(await destination(401)('entry'), '/start')
  assert.equal(await destination(401)('guest'), null)
  assert.equal(await destination(401)('customer'), '/start')
  assert.equal(await destination(401, 200)('entry'), '/driver')
})

test('network and service failure preserve the retry state instead of sending users to registration', async () => {
  for (const mode of ['entry', 'guest', 'customer']) {
    await assert.rejects(destination(503)(mode), /unavailable/)
    await assert.rejects(destination(401, 401, true)(mode), /offline/)
  }
})
