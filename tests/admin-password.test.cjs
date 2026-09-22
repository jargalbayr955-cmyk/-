/* eslint-disable @typescript-eslint/no-require-imports -- Test real crypto, cookies and API handlers against an isolated database boundary. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { NextRequest } = require('next/server')

const OLD = 'Test-only-old-password-423'
const NEW = 'Test-only-new-password-529'

async function harness({ temporary = false } = {}) {
  const state = { credential: null, unavailable: false, limited: false, conflict: false, updates: 0, otherTableReads: 0 }
  const cache = new Map()
  const db = {
    rpc: async () => ({ data: !state.limited, error: null }),
    from(table) {
      let change
      const filters = []
      const chain = {
        select() { return chain }, eq(key, value) { filters.push([key, value]); return chain },
        update(value) { change = value; return chain },
        async maybeSingle() {
          assert.equal(table, 'admin_credentials')
          if (state.unavailable) return { data: null, error: { code: 'unavailable' } }
          const matches = filters.every(([key, value]) => state.credential?.[key] === value)
          if (!matches || (change && state.conflict)) return { data: null, error: null }
          if (change) { state.credential = { ...state.credential, ...change }; state.updates++ }
          return { data: { ...state.credential }, error: null }
        },
      }
      if (table !== 'admin_credentials') { state.otherTableReads++; throw new Error('Unexpected privileged access') }
      return chain
    },
  }
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const exports = {}; cache.set(file, exports)
    const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText
    vm.runInNewContext(source, {
      exports, Buffer, Date, console, process: { env: { NODE_ENV: 'production', SESSION_SECRET: 'test-only-admin-session-key-at-least-32-chars', ADMIN_PASSWORD: 'obsolete-environment-password' } },
      require(name) {
        if (name === 'server-only') return {}
        if (name.endsWith('/supabase-admin')) return { getSupabaseAdmin: () => db }
        if (name.startsWith('@/')) return load(name.slice(2) + '.ts')
        if (name.startsWith('.')) return load(path.normalize(path.join(path.dirname(file), name + '.ts')))
        return require(name)
      },
    }, { filename: file })
    return exports
  }
  const crypto = load('lib/server/admin-password.ts')
  state.credential = { id: 1, password_hash: await crypto.hashAdminPassword(OLD), session_version: 'initial-version', must_change_password: temporary }
  const req = (route, method, body, cookie, origin = 'https://achilt.example') => new NextRequest('https://achilt.example/api/admin/' + route, {
    method, headers: { origin, 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const call = (route, method = 'GET', body, cookie, origin) => load(`app/api/admin/${route}/route.ts`)[method](req(route, method, body, cookie, origin))
  const cookie = response => response.headers.get('set-cookie')?.split(';')[0]
  const login = password => call('session', 'POST', { password })
  return { state, load, crypto, call, cookie, login, req }
}

test('passwords are salted, memory-hard hashes; wrong passwords and malformed hashes fail', async () => {
  const h = await harness()
  const hash = await h.crypto.hashAdminPassword(OLD)
  assert.notEqual(hash, h.state.credential.password_hash)
  assert.equal(hash.includes(OLD), false)
  assert.equal(await h.crypto.verifyAdminPassword(OLD, hash), true)
  assert.equal(await h.crypto.verifyAdminPassword(NEW, hash), false)
  for (const broken of ['', 'scrypt-v1$bad$bad', hash + '$extra']) assert.equal(await h.crypto.verifyAdminPassword(OLD, broken), false)
  await assert.rejects(h.crypto.hashAdminPassword('short'))
})

test('login sets a secure four-hour cookie, hides credential data and ignores the obsolete env password', async () => {
  const h = await harness()
  assert.equal((await h.login('obsolete-environment-password')).status, 401)
  const response = await h.login(OLD)
  assert.equal(response.status, 200)
  for (const flag of [/HttpOnly/i, /Secure/i, /SameSite=strict/i, /Max-Age=14400/]) assert.match(response.headers.get('set-cookie'), flag)
  assert.deepEqual(await response.json(), { authenticated: true, mustChangePassword: false })
  const restored = await h.call('session', 'GET', undefined, h.cookie(response))
  assert.equal(restored.status, 200)
  assert.match(restored.headers.get('cache-control'), /no-store/)
  assert.equal(JSON.stringify(await restored.json()).includes('hash'), false)
})

test('temporary login can change its password but cannot read the dashboard or mutate drivers/settings', async () => {
  const h = await harness({ temporary: true })
  const login = await h.login(OLD), saved = h.cookie(login)
  assert.equal((await login.json()).mustChangePassword, true)
  for (const [route, method] of [['dashboard', 'GET'], ['drivers', 'POST'], ['settings', 'POST']]) {
    assert.equal((await h.call(route, method, method === 'POST' ? {} : undefined, saved)).status, 403)
  }
  assert.equal(h.state.otherTableReads, 0)
  const changed = await h.call('password', 'POST', { currentPassword: OLD, newPassword: NEW, confirmPassword: NEW }, saved)
  assert.equal(changed.status, 200)
  assert.equal(h.state.credential.must_change_password, false)
})

test('changing the password invalidates every previous session, rejects the old password and renews the current session', async () => {
  const h = await harness()
  const first = h.cookie(await h.login(OLD)), second = h.cookie(await h.login(OLD))
  const changed = await h.call('password', 'POST', { currentPassword: OLD, newPassword: NEW, confirmPassword: NEW }, first)
  assert.equal(changed.status, 200)
  assert.equal(h.state.updates, 1)
  for (const previous of [first, second]) {
    assert.equal((await h.call('session', 'GET', undefined, previous)).status, 401)
    assert.equal((await h.call('settings', 'POST', {}, previous)).status, 401)
  }
  assert.equal((await h.call('session', 'GET', undefined, h.cookie(changed))).status, 200)
  assert.equal((await h.login(OLD)).status, 401)
  assert.equal((await h.login(NEW)).status, 200)
  assert.equal(h.state.credential.password_hash.includes(NEW), false)
})

test('password changes require a live admin session, current password, confirmation, length and same origin', async () => {
  const h = await harness()
  const saved = h.cookie(await h.login(OLD))
  const valid = { currentPassword: OLD, newPassword: NEW, confirmPassword: NEW }
  assert.equal((await h.call('password', 'POST', valid)).status, 401)
  const customer = 'achilt_admin_session=' + h.load('lib/server/security.ts').signSession('initial-version', 'customer')
  assert.equal((await h.call('password', 'POST', valid, customer)).status, 401)
  assert.equal((await h.call('password', 'POST', valid, saved, 'https://evil.example')).status, 403)
  assert.equal((await h.call('session', 'POST', { password: OLD }, undefined, 'https://evil.example')).status, 403)
  for (const patch of [
    { currentPassword: 'wrong' }, { newPassword: 'short', confirmPassword: 'short' },
    { confirmPassword: 'different' }, { newPassword: OLD, confirmPassword: OLD },
    { newPassword: ' '.repeat(14), confirmPassword: ' '.repeat(14) },
  ]) assert.equal((await h.call('password', 'POST', { ...valid, ...patch }, saved)).status, 400)
  assert.equal((await h.call('password', 'POST', null, saved)).status, 400)
  assert.equal(h.state.updates, 0)
})

test('rate limiting, database failure and concurrent changes never overwrite credentials', async () => {
  const h = await harness()
  const saved = h.cookie(await h.login(OLD))
  const body = { currentPassword: OLD, newPassword: NEW, confirmPassword: NEW }
  h.state.limited = true
  assert.equal((await h.login(OLD)).status, 429)
  assert.equal((await h.call('password', 'POST', body, saved)).status, 429)
  h.state.limited = false; h.state.unavailable = true
  assert.equal((await h.login(OLD)).status, 503)
  assert.equal((await h.call('session', 'GET', undefined, saved)).status, 503)
  assert.equal((await h.call('password', 'POST', body, saved)).status, 503)
  h.state.unavailable = false; h.state.conflict = true
  assert.equal((await h.call('password', 'POST', body, saved)).status, 409)
  assert.equal(h.state.updates, 0)
})

test('logout clears the secure cookie and rejects cross-origin requests', async () => {
  const h = await harness()
  assert.equal((await h.call('session', 'DELETE', undefined, undefined, 'https://evil.example')).status, 403)
  const response = await h.call('session', 'DELETE')
  assert.equal(response.status, 200)
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/)
  assert.match(response.headers.get('set-cookie'), /Secure/i)
})
