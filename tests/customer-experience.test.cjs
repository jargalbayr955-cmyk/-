/* eslint-disable @typescript-eslint/no-require-imports -- Exercise real client logic at HTTP and browser-storage boundaries. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const user = { id: 'fixture-customer', phone: '+97600009988' }
function client({ responses = [], blockedStorage = false } = {}) {
  const requests = []
  const storage = new Map([
    ['user', 'stale customer'], ['current_order_id', 'old-order'], ['tracking_driver_id', 'old-driver'],
    ['fromAddress', 'old pickup'], ['from', 'legacy pickup'], ['fromLat', '1'], ['fromLng', '2'], ['dest', 'old destination'], ['phone_called', '1'],
    ['driver_session', 'keep driver'], ['payment_info', 'keep driver payment'], ['preference', 'keep preference'],
  ])
  const notices = new Map()
  const events = []
  const cache = new Map()
  const mockStorage = map => ({
    getItem: key => { if (blockedStorage) throw new Error('blocked'); return map.get(key) || null },
    removeItem: key => { if (blockedStorage) throw new Error('blocked'); map.delete(key) },
    setItem: (key, value) => { if (blockedStorage) throw new Error('blocked'); map.set(key, value) },
  })
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const exports = {}
    cache.set(file, exports)
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
    vm.runInNewContext(code, {
      exports, AbortSignal, Event, localStorage: mockStorage(storage), sessionStorage: mockStorage(notices),
      window: { dispatchEvent: event => events.push(event.type) },
      BroadcastChannel: class { postMessage(message) { events.push(message) } close() {} },
      fetch: async (url, options) => {
        requests.push({ url, options })
        const reply = responses.shift()
        if (reply instanceof Error) throw reply
        if (!reply) throw new Error('Unexpected HTTP request: ' + url)
        return Response.json(reply.body || {}, { status: reply.status || 200 })
      },
      require: name => {
        if (name.startsWith('./')) return load(path.join(path.dirname(file), name) + '.ts')
        throw new Error('Unexpected import: ' + name)
      },
    })
    return exports
  }
  return { load, requests, storage, notices, events }
}

test('account header identity comes from the verified server response, not saved browser data', async () => {
  const h = client({ responses: [{ body: { user } }] })
  const result = await h.load('lib/client/session.ts').readSession('customer')
  assert.equal(result.user.id, user.id)
  assert.equal(result.user.phone, user.phone)
  assert.equal(h.load('lib/client/session.ts').displayPhone(result.user.phone), '+976 0000 9988')
  assert.equal(result.destination, null)
})

test('a malformed successful response cannot display a stale or fabricated account', async () => {
  for (const body of [{}, { user: { id: 'a' } }, { user: { id: '', phone: user.phone } }]) {
    const h = client({ responses: [{ body }] })
    await assert.rejects(h.load('lib/client/session.ts').readSession('customer'), /Invalid session/)
  }
})

test('logout removes only customer data, reports a state change and leaves driver work intact', async () => {
  const h = client({ responses: [{}] })
  await h.load('lib/client/session.ts').logoutCustomer()
  for (const key of ['user', 'current_order_id', 'tracking_driver_id', 'fromAddress', 'from', 'fromLat', 'fromLng', 'dest', 'phone_called']) assert.equal(h.storage.has(key), false)
  assert.equal(h.storage.get('driver_session'), 'keep driver')
  assert.equal(h.storage.get('payment_info'), 'keep driver payment')
  assert.equal(h.storage.get('preference'), 'keep preference')
  assert.equal(h.notices.get('achilt_signed_out'), '1')
  assert.ok(h.events.includes('achilt:customer-session-changed'))
  assert.ok(h.events.includes('changed'))
  assert.equal(h.requests[0].options.method, 'POST')
})

test('failed logout does not erase customer data or announce success', async () => {
  for (const response of [{ status: 503 }, new Error('offline')]) {
    const h = client({ responses: [response] })
    await assert.rejects(h.load('lib/client/session.ts').logoutCustomer())
    assert.equal(h.storage.get('current_order_id'), 'old-order')
    assert.equal(h.notices.size, 0)
    assert.deepEqual(h.events, [])
  }
})

test('logout still works when optional browser storage is blocked', async () => {
  const h = client({ responses: [{}], blockedStorage: true })
  await h.load('lib/client/session.ts').logoutCustomer()
  assert.ok(h.events.includes('changed'))
})

test('phone input accepts pasted country code and preserves local numbers beginning with 976', () => {
  const { phoneInput } = client().load('lib/client/session.ts')
  assert.equal(phoneInput('+976 9911 2233'), '99112233')
  assert.equal(phoneInput('9761 2233'), '97612233')
  assert.equal(phoneInput('99112233'), '99112233')
})

test('login succeeds only after the browser session resolves to the same account', async () => {
  const h = client({ responses: [{ body: { user } }, { body: { user } }] })
  const result = await h.load('lib/client/customer-auth.ts').authenticateCustomer('login', '00009988', '123456')
  assert.equal(result.ok, true)
  assert.equal(result.user.phone, user.phone)
  assert.equal(h.requests.length, 2)
  assert.equal(h.requests[1].url, '/api/customer/session')
})

test('blocked cookies and wrong account responses never report a successful login', async () => {
  for (const session of [{ status: 401 }, { body: { user: { ...user, id: 'another-account' } } }]) {
    const h = client({ responses: [{ body: { user } }, session] })
    const result = await h.load('lib/client/customer-auth.ts').authenticateCustomer('login', '00009988', '123456')
    assert.equal(result.ok, false)
    assert.match(result.error, /cookie/)
  }
})

test('duplicate registration offers login and never issues a second registration request', async () => {
  const h = client({ responses: [{ status: 409, body: { error: 'Энэ дугаар бүртгэлтэй байна.' } }] })
  const result = await h.load('lib/client/customer-auth.ts').authenticateCustomer('register', '00009988', '123456')
  assert.equal(result.ok, false)
  assert.equal(result.canLogin, true)
  assert.equal(h.requests.length, 1)
})

test('registration followed by a connection failure explains that the account was created', async () => {
  const h = client({ responses: [{ body: { user } }, new Error('offline')] })
  const result = await h.load('lib/client/customer-auth.ts').authenticateCustomer('register', '00009988', '123456')
  assert.equal(result.ok, false)
  assert.equal(result.canLogin, true)
  assert.match(result.error, /Бүртгэл үүслээ/)
})
