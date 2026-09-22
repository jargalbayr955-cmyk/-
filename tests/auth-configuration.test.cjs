/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness loads compiled server routes. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { NextRequest } = require('next/server')

// Exercise the real route handlers with a fake database boundary and isolated env.
function harness(secret, rpcResult = { data: null, error: null }) {
  const calls = []
  const cache = new Map()
  const fakeProcess = { env: { NODE_ENV: 'production', ...(secret === undefined ? {} : { SESSION_SECRET: secret }) } }
  const admin = {
    rpc: async (name) => { calls.push(name); return name === 'consume_rate_limit' ? { data: true, error: null } : rpcResult },
    from: () => { calls.push('from'); return { select: () => ({ limit: async () => ({ error: null }) }) } },
  }
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const exports = {}
    cache.set(file, exports)
    const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText
    vm.runInNewContext(source, {
      exports, process: fakeProcess, Buffer,
      console: { error: () => {} },
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
function request() {
  return new NextRequest('https://achilt.example/api/customer/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '00005520', pin: '550020' }),
  })
}

for (const secret of [undefined, 'x'.repeat(31)]) {
  test(`invalid session config (${secret === undefined ? 'missing' : 'too short'}) blocks auth before database writes`, async () => {
    const h = harness(secret)
    for (const route of ['register', 'login']) {
      const response = await h.load(`app/api/customer/${route}/route.ts`).POST(request())
      assert.equal(response.status, 503)
      assert.equal(response.headers.get('set-cookie'), null)
      assert.equal(typeof (await response.json()).error, 'string')
    }
    assert.deepEqual(h.calls, [])
  })
}

test('health fails when database works but session signing is unavailable', async () => {
  const h = harness(undefined)
  const response = await h.load('app/api/health/route.ts').GET()
  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.database, 'ok')
  assert.equal(body.authentication, 'error')
  assert.equal(body.ok, false)
})

test('valid PIN with configured signing creates a secure, verifiable session', async () => {
  const h = harness('x'.repeat(32), { data: 'test-user-id', error: null })
  const response = await h.load('app/api/customer/login/route.ts').POST(request())
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Secure/)
  assert.match(cookie, /SameSite=lax/i)
  const value = cookie.match(/^achilt_customer_session=([^;]+)/)[1]
  const session = h.load('lib/server/security.ts').verifySession(decodeURIComponent(value), 'customer')
  assert.equal(session.sub, 'test-user-id')
  assert.equal(session.role, 'customer')
})

test('PIN database failure is not misreported as a wrong PIN', async () => {
  const h = harness('x'.repeat(32), { data: null, error: { code: 'XX000' } })
  const response = await h.load('app/api/customer/login/route.ts').POST(request())
  assert.equal(response.status, 503)
})

test('a wrong PIN still fails authentication', async () => {
  const h = harness('x'.repeat(32))
  assert.equal((await h.load('app/api/customer/login/route.ts').POST(request())).status, 401)
})

test('health passes only with database and session signing ready', async () => {
  const h = harness('x'.repeat(32))
  const response = await h.load('app/api/health/route.ts').GET()
  assert.equal(response.status, 200)
  assert.equal((await response.json()).authentication, 'ok')
})

for (const route of ['customer/register', 'customer/login', 'driver/login']) {
  test(`${route} rejects null and malformed payloads without creating a session`, async () => {
    for (const body of ['null', '[]', '{invalid']) {
      const h = harness('x'.repeat(32))
      const response = await h.load(`app/api/${route}/route.ts`).POST(new NextRequest('https://achilt.example/api/test', {method:'POST', body}))
      assert.equal(response.status,400)
      assert.equal(response.headers.get('set-cookie'),null)
      assert.deepEqual(h.calls,['consume_rate_limit'])
    }
  })
}
