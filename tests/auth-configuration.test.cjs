/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness loads compiled server routes. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { NextRequest } = require('next/server')

const verificationId = 'c4f1e2d3-7a8b-4c9d-a0e1-f2a3b4c5d6e7'
const customer = { id: '11111111-1111-4111-8111-111111111111', phone: '+97699112233', active: true }

function harness(options = {}) {
  const secret = Object.prototype.hasOwnProperty.call(options, 'secret') ? options.secret : 'x'.repeat(32)
  const wesendKey = Object.prototype.hasOwnProperty.call(options, 'wesendKey') ? options.wesendKey : 'ws_test_fixture'
  const providerReplies = options.providerReplies || []
  const user = Object.prototype.hasOwnProperty.call(options, 'user') ? options.user : customer
  const calls = []
  const cache = new Map()
  const env = { NODE_ENV: 'production', ...(secret === undefined ? {} : { SESSION_SECRET: secret }), ...(wesendKey === undefined ? {} : { WESEND_API_KEY: wesendKey }) }
  const admin = {
    async rpc(name, args) {
      calls.push({ type: 'rpc', name, args })
      return name === 'consume_rate_limit' ? { data: true, error: null } : { data: null, error: null }
    },
    from(table) {
      const query = { type: 'from', table, operations: [] }
      calls.push(query)
      const chain = {
        select(...args) { query.operations.push(['select', ...args]); return chain },
        limit(...args) { query.operations.push(['limit', ...args]); return Promise.resolve({ data: [], error: null }) },
        eq(...args) { query.operations.push(['eq', ...args]); return chain },
        upsert(...args) { query.operations.push(['upsert', ...args]); return chain },
        maybeSingle() { query.operations.push(['maybeSingle']); return Promise.resolve({ data: user, error: null }) },
        single() { query.operations.push(['single']); return Promise.resolve({ data: user, error: null }) },
      }
      return chain
    },
  }
  const providerFetch = async (url, options) => {
    calls.push({ type: 'fetch', url: String(url), options })
    const reply = providerReplies.shift()
    if (!reply) throw new Error('Unexpected provider call')
    return Response.json(reply.body || {}, { status: reply.status || 200, headers: reply.headers || {} })
  }
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const exports = {}
    cache.set(file, exports)
    const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
    }).outputText
    vm.runInNewContext(source, {
      exports, process: { env }, Buffer, URL, Date, Response, AbortController, setTimeout, clearTimeout,
      console: { error: () => {}, warn: () => {} }, fetch: providerFetch,
      require: (name) => {
        if (name === 'server-only') return {}
        if (name === '@/lib/server/supabase-admin') return { getSupabaseAdmin: () => admin }
        if (name.startsWith('@/')) return load(name.slice(2) + '.ts')
        if (name.startsWith('./')) return load(path.join(path.dirname(file), name) + '.ts')
        return require(name)
      },
    }, { filename: file })
    return exports
  }
  return { load, calls }
}

function otpRequest(phone = '99112233', cookie = '') {
  return new NextRequest('https://achilt.example/api/customer/otp/request', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ phone }),
  })
}
function otpVerify(code = '482913', phone = '99112233') {
  return new NextRequest('https://achilt.example/api/customer/otp/verify', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, verification_id: verificationId, code }),
  })
}

for (const secret of [undefined, 'x'.repeat(31)]) {
  test(`invalid session config (${secret === undefined ? 'missing' : 'too short'}) blocks OTP before provider/database access`, async () => {
    const h = harness({ secret })
    const response = await h.load('app/api/customer/otp/request/route.ts').POST(otpRequest())
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('set-cookie'), null)
    assert.deepEqual(h.calls, [])
  })
}

test('missing WeSend key blocks OTP before provider/database access', async () => {
  const h = harness({ wesendKey: undefined })
  const response = await h.load('app/api/customer/otp/request/route.ts').POST(otpRequest())
  assert.equal(response.status, 503)
  assert.deepEqual(h.calls, [])
})

test('OTP request sends a six-digit Mongolian verification request without creating a session', async () => {
  const h = harness({ providerReplies: [{ body: { id: verificationId, status: 'pending', channel: 'sms', to: '99112233', expires_at: '2026-10-28T07:00:00.000Z' } }] })
  const response = await h.load('app/api/customer/otp/request/route.ts').POST(otpRequest())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('set-cookie'), null)
  const body = await response.json()
  assert.equal(body.verification_id, verificationId)
  const provider = h.calls.find(call => call.type === 'fetch')
  assert.equal(provider.url, 'https://api.wesend.mn/v1/verify')
  const sent = JSON.parse(provider.options.body)
  assert.equal(sent.to, '99112233')
  assert.equal(sent.code_length, 6)
  assert.equal(sent.ttl, 300)
})

test('trusted device restores the same customer session without sending another OTP', async () => {
  const h = harness()
  const token = h.load('lib/server/security.ts').signSession(customer.id, 'customer')
  const response = await h.load('app/api/customer/otp/request/route.ts').POST(otpRequest('99112233', `achilt_customer_trust=${token}`))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.trusted_login, true)
  assert.equal(body.user.id, customer.id)
  assert.equal(h.calls.some(call => call.type === 'fetch'), false)
  assert.match(response.headers.get('set-cookie'), /achilt_customer_session=/)
  assert.match(response.headers.get('set-cookie'), /Max-Age=7776000/)
})

test('trusted device is bound to its verified phone and a different phone still receives OTP', async () => {
  const h = harness({ providerReplies: [{ body: { id: verificationId, status: 'pending', channel: 'sms', to: '88112233', expires_at: '2026-10-28T07:00:00.000Z' } }] })
  const token = h.load('lib/server/security.ts').signSession(customer.id, 'customer')
  const response = await h.load('app/api/customer/otp/request/route.ts').POST(otpRequest('88112233', `achilt_customer_trust=${token}`))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.trusted_login, undefined)
  assert.equal(body.verification_id, verificationId)
  assert.equal(h.calls.filter(call => call.type === 'fetch').length, 1)
})

test('approved OTP creates or finds the customer and issues both session and 90-day trusted-device cookies', async () => {
  const h = harness({ providerReplies: [{ body: { id: verificationId, status: 'approved', channel: 'sms', to: '99112233', expires_at: '2026-10-28T07:00:00.000Z' } }] })
  const response = await h.load('app/api/customer/otp/verify/route.ts').POST(otpVerify())
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /achilt_customer_session=/)
  assert.match(cookie, /achilt_customer_trust=/)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Secure/)
  assert.match(cookie, /SameSite=lax/i)
  assert.match(cookie, /Max-Age=7776000/)
  const write = h.calls.find(call => call.type === 'from' && call.table === 'users')
  assert.ok(write.operations.some(operation => operation[0] === 'upsert'))
})

test('wrong OTP never creates a customer session', async () => {
  const h = harness({ providerReplies: [{ status: 422, body: { error: { code: 'invalid_code', attempts_remaining: 4 } } }] })
  const response = await h.load('app/api/customer/otp/verify/route.ts').POST(otpVerify('000000'))
  assert.equal(response.status, 422)
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(h.calls.some(call => call.type === 'from' && call.table === 'users'), false)
  assert.match((await response.json()).error, /4 оролдлого/)
})

test('provider phone mismatch never logs in the submitted phone', async () => {
  const h = harness({ providerReplies: [{ body: { id: verificationId, status: 'approved', channel: 'sms', to: '88112233', expires_at: '2026-10-28T07:00:00.000Z' } }] })
  const response = await h.load('app/api/customer/otp/verify/route.ts').POST(otpVerify())
  assert.equal(response.status, 401)
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(h.calls.some(call => call.type === 'from' && call.table === 'users'), false)
})

test('logout clears the active customer session without deleting the 90-day trusted-device cookie', async () => {
  const h = harness()
  const response = await h.load('app/api/customer/logout/route.ts').POST()
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /achilt_customer_session=/)
  assert.match(cookie, /Max-Age=0/)
  assert.doesNotMatch(cookie, /achilt_customer_trust=/)
})

test('legacy customer PIN login and registration are disabled', async () => {
  const h = harness()
  for (const route of ['login', 'register']) {
    const response = await h.load(`app/api/customer/${route}/route.ts`).POST()
    assert.equal(response.status, 410)
    assert.equal(response.headers.get('set-cookie'), null)
  }
})

test('health reports authentication error until both session signing and WeSend are configured', async () => {
  for (const options of [{ secret: undefined }, { wesendKey: undefined }]) {
    const h = harness(options)
    const response = await h.load('app/api/health/route.ts').GET()
    assert.equal(response.status, 503)
    assert.equal((await response.json()).authentication, 'error')
  }
  const h = harness()
  const response = await h.load('app/api/health/route.ts').GET()
  assert.equal(response.status, 200)
  assert.equal((await response.json()).authentication, 'ok')
})
