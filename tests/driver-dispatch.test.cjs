/* eslint-disable @typescript-eslint/no-require-imports -- Verify driver map interactions and tracking lifecycle with isolated data. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function componentHarness(file, name, initial = {}, replacements = {}, globals = {}) {
  const hooks = [], pending = [], cache = {}
  let cursor = 0, dirty = true, view, props = initial
  const react = {
    useRef(value) { const index = cursor++; hooks[index] ??= { current: value }; return hooks[index] },
    useState(value) { const index = cursor++; hooks[index] ??= { value }; return [hooks[index].value, next => { hooks[index].value = typeof next === 'function' ? next(hooks[index].value) : next; dirty = true }] },
    useCallback(fn, deps) { const index = cursor++, old = hooks[index]; if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) hooks[index] = { deps, fn }; return hooks[index].fn },
    useEffect(effect, deps) { const index = cursor++, old = hooks[index]; if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) pending.push(() => { old?.cleanup?.(); hooks[index] = { deps, cleanup: effect() } }) },
  }
  function load(file) {
    if (cache[file]) return cache[file]
    const exports = {}; cache[file] = exports
    const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
    vm.runInNewContext(source, {
      exports, console, AbortController, AbortSignal, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 2, clearInterval() {},
      window: { addEventListener() {}, removeEventListener() {} }, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }, navigator: {}, localStorage: { setItem() {}, removeItem() {} }, ...globals,
      require(module) {
        if (Object.hasOwn(replacements, module)) return replacements[module]
        if (module === 'react') return react
        if (module === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
        if (module === '@/lib/order-offers' || module === './order-offers') return load('lib/order-offers.ts')
        if (module === '@/lib/driver-orders') return load('lib/driver-orders.ts')
        if (module === './driver-orders-map') return { DriverOrdersMap: 'DriverOrdersMap' }
        if (module === 'next/link') return { default: 'a' }
        if (module === 'next/navigation') return { useRouter: () => ({ push() {} }) }
        if (module === '../components/order-video-call') return { OrderVideoCall: 'OrderVideoCall' }
        if (module === '../components/order-connection-map') return { OrderConnectionMap: 'OrderConnectionMap' }
        if (module === '../components/driver-dispatch-view') return { DriverDispatchView: 'DriverDispatchView' }
        throw new Error('Unexpected import: ' + module)
      },
    })
    return exports
  }
  const component = load(file)[name]
  function render() { cursor = 0; dirty = false; view = component(props); while (pending.length) pending.shift()() }
  render()
  function nodes(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)] }
  return {
    get view() { return view }, nodes: () => nodes(view),
    text() { const text = node => Array.isArray(node) ? node.map(text).join(' ') : node && typeof node === 'object' ? text(node.props?.children) : node ?? ''; return text(view).replace(/\s+/g, ' ') },
    update(next = {}) { props = { ...props, ...next }; render() },
    async flush() { for (let i = 0; i < 15; i++) { await Promise.resolve(); if (dirty) render() } },
    unmount() { for (const hook of hooks) hook.cleanup?.() },
  }
}
const driver = { id: 'isolated-driver', name: 'Жолооч', car_type: 'chiregch', lat: 47.91, lng: 106.91, available: true, location_updated_at: new Date().toISOString() }
const order = (id, lat = 47.92) => ({ id, created_at: '2026-09-22T12:00:00Z', from_address: 'Талбай ' + id, to_address: 'Засвар ' + id, from_lat: lat, from_lng: 106.91, car_type: id === 'a' ? 'chiregch' : 'butten', car_mark: 'Prius ' + id })
const props = { driver, orders: [order('a'), order('b', 47.94)], locating: false, locationMessage: '', error: '', newOrderAlert: false, nativeDriver: false, pushReady: false, notificationsDenied: false, sentOffers: {}, sendingOffer: null, onToggleAvailable() {}, onSubscribe() {}, onProfile() {}, onOffer() {} }

test('selecting customer map points shows route, car and requested truck; price drafts stay with their order', async () => {
  const submitted = []
  const h = componentHarness('app/components/driver-dispatch-view.tsx', 'DriverDispatchView', { ...props, onOffer: (order, price) => submitted.push([order.id, price]) })
  assert.match(h.text(), /Чирэгч хэрэгтэй.*Талбай a.*Засвар a.*Prius a/)
  assert.doesNotMatch(h.text(), /Байршил шинэчлэх|байршил илгээх/)
  const input = () => h.nodes().find(node => node.type === 'input')
  const map = () => h.nodes().find(node => node.type === 'DriverOrdersMap')
  input().props.onChange({ target: { value: '85000' } }); await h.flush()
  map().props.onSelect('b'); await h.flush()
  assert.match(h.text(), /Бүтэн ачигч хэрэгтэй.*Талбай b.*Засвар b.*Prius b/)
  assert.equal(input().props.value, '')
  map().props.onSelect('a'); await h.flush()
  assert.equal(input().props.value, '85000')
  h.nodes().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.deepEqual(submitted, [['a', '85000']])
  h.update({ sentOffers: { a: true } })
  assert.match(h.text(), /Үнийн санал илгээсэн/)
  assert.equal(h.nodes().filter(node => node.type === 'form').length, 0)
  h.unmount()
})

test('withdrawn selection switches to an existing order and empty/offline state stays useful', async () => {
  const h = componentHarness('app/components/driver-dispatch-view.tsx', 'DriverDispatchView', props)
  h.nodes().find(node => node.type === 'DriverOrdersMap').props.onSelect('b'); await h.flush()
  h.update({ orders: [order('a')] })
  assert.match(h.text(), /Талбай a/)
  assert.doesNotMatch(h.text(), /Талбай b/)
  h.update({ driver: { ...driver, available: false } })
  assert.equal(h.nodes().find(node => node.props?.type === 'submit').props.disabled, true)
  h.update({ orders: [] })
  assert.match(h.text(), /Ажиллаж эхлэх.*Захиалга авахгүй.*Ажиллаж эхлээд захиалга аваарай/)
  assert.equal(h.nodes().filter(node => node.type === 'DriverOrdersMap').length, 1)
  h.unmount()
})

async function pageHarness(native = false) {
  const watchers = [], intervals = []
  let state = { orders: [], active: true, available: true, acceptedOrder: null, pendingPayment: null }
  const h = componentHarness('app/driver/page.tsx', 'default', {}, {
    '@/lib/client/native-driver': { isNativeDriver: () => native },
    '@/lib/client/driver-location': {
      watchDriverLocation(onLocation) { const watcher = { onLocation, stopped: false }; watchers.push(watcher); return () => { watcher.stopped = true } },
      saveDriverLocation: async () => { throw new Error('Unexpected manual GPS') },
    },
  }, {
    setInterval(callback) { intervals.push(callback); return intervals.length },
    fetch: async url => ({ ok: true, status: 200, json: async () => url.endsWith('/session') ? { driver } : url.endsWith('/orders') ? { ...state } : {} }),
  })
  await h.flush()
  return { h, watchers, async poll(next) { state = { ...state, ...next }; intervals.forEach(fn => fn()); await h.flush() } }
}

test('restored working session tracks automatically, resting stops GPS, accepted trip resumes, payment stops', async () => {
  const { h, watchers, poll } = await pageHarness()
  assert.equal(watchers.length, 1)
  assert.equal(h.nodes().some(node => node.type === 'OrderVideoCall'), false)
  watchers[0].onLocation({ lat: 47.95, lng: 106.95, location_updated_at: new Date().toISOString(), available: true }); await h.flush()
  assert.equal(h.view.props.driver.lat, 47.95)
  await poll({ available: false })
  assert.equal(watchers[0].stopped, true)
  await poll({ acceptedOrder: { ...order('a'), status: 'confirmed', final_price: 85000 } })
  assert.equal(watchers.length, 2)
  assert.match(h.text(), /Чирэгч.*Prius a/)
  assert.equal(h.view.props.children[0].type, 'OrderVideoCall')
  assert.equal(h.view.props.children[0].props.role, 'driver')
  assert.equal(h.view.props.children[0].props.orderId, 'a')
  await poll({ acceptedOrder: null, pendingPayment: { code: '123456', amount: 8500 } })
  assert.equal(watchers[1].stopped, true)
  assert.equal(h.nodes().some(node => node.type === 'OrderVideoCall'), false)
  h.unmount()
})

test('native driver keeps its existing GPS service instead of starting a second web tracker', async () => {
  const { h, watchers } = await pageHarness(true)
  assert.equal(watchers.length, 0)
  assert.equal(h.view.props.nativeDriver, true)
  h.unmount()
})

test('customer call control is first on a confirmed order and disappears after completion', async () => {
  let status = 'confirmed'
  const timers = [], router = { replace() {} }
  const h = componentHarness('app/tracking/page.tsx', 'default', {}, {
    'next/navigation': { useRouter: () => router },
    '@/lib/client/navigation': { backInApp() {} },
    '@/lib/client/booking-draft': { clearBookingDraft() {} },
    '../components/driver-summary': { DriverSummary: 'DriverSummary' },
  }, {
    localStorage: { getItem: () => 'order-customer' },
    setInterval(callback) { timers.push(callback); return timers.length },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ order: { id: 'order-customer', status, driver_phone: '00000000' }, driver: null }) }),
  })
  await h.flush()
  assert.equal(h.view.props.children[0].type, 'OrderVideoCall')
  assert.equal(h.view.props.children[0].props.role, 'customer')
  assert.equal(h.view.props.children[0].props.orderId, 'order-customer')
  status = 'completed'; timers.forEach(fn => fn()); await h.flush()
  assert.equal(h.nodes().some(node => node.type === 'OrderVideoCall'), false)
  h.unmount()
})
