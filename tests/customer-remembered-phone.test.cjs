/* eslint-disable @typescript-eslint/no-require-imports -- Exercises browser-only remembered-phone helpers. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function harness({ responses = [] } = {}) {
  const storage = new Map()
  const notices = new Map()
  const events = []
  const mockStorage = map => ({
    getItem: key => map.get(key) || null,
    removeItem: key => map.delete(key),
    setItem: (key, value) => map.set(key, value),
  })
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const exports = {}
    cache.set(file, exports)
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
    vm.runInNewContext(code, {
      exports, AbortSignal: {}, AbortController, setTimeout, clearTimeout, Event,
      localStorage: mockStorage(storage), sessionStorage: mockStorage(notices),
      window: { dispatchEvent: event => events.push(event.type) },
      BroadcastChannel: class { postMessage(message) { events.push(message) } close() {} },
      fetch: async () => {
        const reply = responses.shift()
        if (!reply) throw new Error('Unexpected HTTP request')
        return Response.json(reply.body || {}, { status: reply.status || 200 })
      },
      require: name => {
        if (name.startsWith('@/')) return load(name.slice(2) + '.ts')
        if (name.startsWith('./')) return load(path.join(path.dirname(file), name) + '.ts')
        throw new Error('Unexpected import: ' + name)
      },
    })
    return exports
  }
  return { load, storage, notices }
}

test('remembered customer phone is normalized and readable for the next OTP screen', () => {
  const h = harness()
  const session = h.load('lib/client/session.ts')
  session.rememberCustomerPhone('+976 9911 2233')
  assert.equal(h.storage.get('achilt_last_customer_phone'), '99112233')
  assert.equal(session.readRememberedCustomerPhone(), '99112233')
})

test('deliberate logout clears the authenticated state but keeps the remembered phone', async () => {
  const h = harness({ responses: [{}] })
  const session = h.load('lib/client/session.ts')
  session.rememberCustomerPhone('99112233')
  h.storage.set('current_order_id', 'old-order')
  await session.logoutCustomer()
  assert.equal(h.storage.get('achilt_last_customer_phone'), '99112233')
  assert.equal(h.storage.has('current_order_id'), false)
  assert.equal(h.notices.get('achilt_signed_out'), '1')
})

test('customer UI prefills remembered phone after logout while keeping OTP required', () => {
  const auth = fs.readFileSync(path.join(__dirname, '..', 'app/components/customer-auth.tsx'), 'utf8')
  const account = fs.readFileSync(path.join(__dirname, '..', 'app/components/customer-account.tsx'), 'utf8')
  assert.match(auth, /readRememberedCustomerPhone\(\)/)
  assert.match(auth, /rememberCustomerPhone\(phone\)/)
  assert.match(auth, /Дахин нэвтрэх OTP авах/)
  assert.match(auth, /«Гарах» дарсан бол аюулгүй байдлаар OTP дахин шаардана/)
  assert.match(account, /rememberCustomerPhone\(user\.phone\)/)
  assert.match(account, /await logoutCustomer\(\)/)
})
