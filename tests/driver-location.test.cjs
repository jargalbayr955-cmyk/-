/* eslint-disable @typescript-eslint/no-require-imports -- Exercise browser GPS lifecycle and the real location uploader. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function locationHarness() {
  let now = Date.now(), watch, failWatch, interval, stopped, respond = async () => ({ ok: true, json: async () => ({ available: true }) })
  const requests = [], fixes = [], messages = [], gets = [], docEvents = {}, winEvents = {}
  const document = { visibilityState: 'visible', addEventListener: (name, fn) => { docEvents[name] = fn }, removeEventListener: name => { delete docEvents[name] } }
  const window = { addEventListener: (name, fn) => { winEvents[name] = fn }, removeEventListener: name => { delete winEvents[name] } }
  const cache = {}
  function load(file) {
    if (cache[file]) return cache[file]
    const exports = {}; cache[file] = exports
    const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    vm.runInNewContext(source, {
      exports, Error, AbortController, AbortSignal, Date: class extends Date { static now() { return now } }, document, window,
      navigator: { geolocation: {
        watchPosition: (success, error) => { watch = success; failWatch = error; return 42 },
        getCurrentPosition: (success, error) => gets.push({ success, error }), clearWatch: id => { stopped = id },
      } },
      fetch: async (url, options) => { requests.push({ url, body: JSON.parse(options.body), signal: options.signal }); return respond() },
      setInterval: (callback, ms) => { interval = { callback, ms }; return 1 }, clearInterval: () => { interval = null },
      require: name => { if (name === '@/lib/order-offers') return load('lib/order-offers.ts'); throw new Error(name) },
    })
    return exports
  }
  const api = load('lib/client/driver-location.ts')
  const cleanup = api.watchDriverLocation(fix => fixes.push(fix), message => messages.push(message))
  return {
    requests, fixes, messages, gets, docEvents, winEvents, document, cleanup,
    get stopped() { return stopped }, get interval() { return interval },
    advance(ms) { now += ms }, respondWith(fn) { respond = fn },
    locate(lat = 47.92, lng = 106.91, age = 0) { return watch({ coords: { latitude: lat, longitude: lng }, timestamp: now - age }) },
    fail(code) { failWatch({ code }) },
  }
}

test('automatic GPS starts immediately, uploads valid coordinates and throttles repeated fixes', async () => {
  const h = locationHarness()
  assert.equal(h.gets.length, 1)
  assert.equal(h.interval.ms, 45000)
  await h.locate()
  await h.locate()
  assert.equal(h.requests.length, 1)
  assert.deepEqual(h.requests[0].body, { lat: 47.92, lng: 106.91 })
  assert.equal(h.fixes.length, 1)
  assert.equal(h.messages.at(-1), '')
  h.advance(15000); await h.locate(47.93)
  assert.equal(h.fixes.at(-1).lat, 47.93)
  h.cleanup()
})

test('stationary GPS refreshes automatically, pauses hidden refreshes and retries on returning online', () => {
  const h = locationHarness()
  h.interval.callback(); assert.equal(h.gets.length, 2)
  h.document.visibilityState = 'hidden'
  h.interval.callback(); assert.equal(h.gets.length, 2)
  h.document.visibilityState = 'visible'
  h.docEvents.visibilitychange(); h.winEvents.online()
  assert.equal(h.gets.length, 4)
  h.cleanup()
})

test('cleanup stops GPS, cancels in-flight upload and ignores late fixes and responses', async () => {
  const h = locationHarness()
  let resolve
  h.respondWith(() => new Promise(done => { resolve = done }))
  const pending = h.locate()
  await h.locate(47.93)
  assert.equal(h.requests.length, 1)
  h.cleanup()
  assert.equal(h.stopped, 42)
  assert.equal(h.interval, null)
  assert.equal(h.requests[0].signal.aborted, true)
  assert.equal(Object.keys(h.docEvents).length + Object.keys(h.winEvents).length, 0)
  resolve({ ok: true, json: async () => ({ available: false }) })
  await pending
  h.advance(45000); await h.locate()
  assert.equal(h.requests.length, 1)
  assert.equal(h.fixes.length, 0)
})

test('invalid or stale GPS is ignored and permission denial has an actionable message', async () => {
  const h = locationHarness()
  await h.locate(91); await h.locate(47, 181); await h.locate(47, 106, 61000)
  assert.equal(h.requests.length, 0)
  h.fail(1); assert.match(h.messages.at(-1), /зөвшөөрөл хаалттай/)
  h.fail(2); assert.match(h.messages.at(-1), /автоматаар дахин/)
  h.cleanup()
})

test('a failed upload is retried with new GPS without reactivating a resting driver', async () => {
  const h = locationHarness()
  h.respondWith(async () => ({ ok: false, json: async () => ({ error: 'Холболт тасарсан' }) }))
  await h.locate()
  assert.equal(h.fixes.length, 0)
  assert.equal(h.messages.at(-1), 'Холболт тасарсан')
  h.advance(45000)
  h.respondWith(async () => ({ ok: true, json: async () => ({ available: false }) }))
  await h.locate()
  assert.equal(h.requests[1].body.available, undefined)
  assert.equal(h.fixes[0].available, false)
  h.cleanup()
})
