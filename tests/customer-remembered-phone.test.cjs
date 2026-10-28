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

test('trusted OTP request restores the remembered session without asking for a code', async () => {
  const user = { id: 'customer-a', phone: '+97699112233' }
  const h = harness({ responses: [
    { body: { trusted_login: true, user } },
    { body: { user } },
  ] })
  const auth = h.load('lib/client/customer-auth.ts')
  const result = await auth.requestCustomerOtp('99112233')
  assert.equal(result.ok, true)
  assert.equal(result.trusted, true)
  assert.equal(result.user.id, user.id)
})

test('customer UI prefills remembered phone and keeps the phone login screen concise', () => {
  const auth = fs.readFileSync(path.join(__dirname, '..', 'app/components/customer-auth.tsx'), 'utf8')
  const account = fs.readFileSync(path.join(__dirname, '..', 'app/components/customer-account.tsx'), 'utf8')
  assert.match(auth, /readRememberedCustomerPhone\(\)/)
  assert.match(auth, /rememberCustomerPhone\(phone\)/)
  assert.match(auth, /result\.trusted/)
  assert.match(auth, /Утасны дугаараар нэвтрэх/)
  assert.match(auth, /busy \? 'Шалгаж байна\.\.\.' : 'Нэвтрэх'/)
  assert.doesNotMatch(auth, /Энэ төхөөрөмж өмнө нь OTP-оор баталгаажсан бөгөөд 90 хоног дуусаагүй бол шууд нэвтэрнэ/)
  assert.doesNotMatch(auth, /Нэг удаа OTP-оор баталгаажсан энэ төхөөрөмж 90 хоног итгэмжлэгдэнэ/)
  assert.doesNotMatch(auth, /OTP код авах →/)
  assert.match(account, /rememberCustomerPhone\(user\.phone\)/)
  assert.match(account, /await logoutCustomer\(\)/)
})
