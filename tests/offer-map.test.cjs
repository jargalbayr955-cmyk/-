/* eslint-disable @typescript-eslint/no-require-imports -- Verify actual map component at its DOM/MapLibre boundary. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const point = { lat: 47.91, lng: 106.91 }
const slot = (id, price = 85000) => ({ driver_id: 'driver-' + id, driver_name: 'Driver ' + id, lat: 47.92, lng: 106.92, distance_km: 2.4, offer: { id, price } })
function mapHarness(initial, connection = false) {
  const hooks = [], pending = [], maps = [], markers = [], clicked = []
  let cursor = 0, dirty = false, props = { pickup: point, offers: initial, selectedDriverId: null, onSelect: id => clicked.push(id) }
  if (connection === true) props = { pickup: point, driver: null }
  if (connection === 'orders') props = { driver: point, fresh: true, orders: initial, selectedId: initial[0]?.id || null, onSelect: id => clicked.push(id) }
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.events = {}; this.style = {} }
    append(...children) { this.children.push(...children) }
    setAttribute(name, value) { this.attributes[name] = value }
    addEventListener(name, callback) { this.events[name] = callback }
  }
  class FakeMap {
    constructor() { this.fits = []; this.events = {}; this.sources = {}; this.loaded = false; maps.push(this) }
    addControl() {}
    resize() {}
    isStyleLoaded() { return this.loaded }
    getSource(id) { return this.sources[id] }
    addSource(id, source) { this.sources[id] = { data: source.data, setData(data) { this.data = data } } }
    addLayer() {}
    on(name, callback) { this.events[name] = callback }
    fitBounds(bounds, options) { this.fits.push({ bounds, options }) }
    easeTo(options) { this.center = options.center }
    remove() { this.removed = true }
  }
  class Marker {
    constructor(options) { this.element = options.element; markers.push(this) }
    getElement() { return this.element }
    setLngLat(point) { this.point = point; return this }
    addTo() { return this }
    remove() { this.removed = true }
  }
  class Bounds {
    constructor(a, b) { this.points = [a, b] }
    extend(point) { this.points.push(point); return this }
  }
  const ml = { Map: FakeMap, Marker, LngLatBounds: Bounds, NavigationControl: class {} }
  const react = {
    useRef(value) { const index = cursor++; hooks[index] ??= { current: value }; return hooks[index] },
    useState(value) { const index = cursor++; hooks[index] ??= { value }; return [hooks[index].value, next => { hooks[index].value = typeof next === 'function' ? next(hooks[index].value) : next; dirty = true }] },
    useEffect(effect, deps) {
      const index = cursor++, old = hooks[index]
      if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) pending.push(() => { old?.cleanup?.(); hooks[index] = { deps, cleanup: effect() } })
    },
  }
  const cache = {}
  function load(file) {
    if (cache[file]) return cache[file]
    const exports = {}; cache[file] = exports
    const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
    vm.runInNewContext(source, { exports, ResizeObserver: class { observe() {} disconnect() {} }, window: { maplibregl: ml }, document: { createElement: tag => new Element(tag) }, require(name) {
      if (name === 'react') return react
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
      if (name === '@/lib/order-offers') return load('lib/order-offers.ts')
      if (name === '@/lib/driver-orders') return load('lib/driver-orders.ts')
      if (name === './order-offers') return load('lib/order-offers.ts')
      if (name.endsWith('free-map')) return { loadFreeMap: async () => ml, freeMapStyle: () => 'test', createDotMarker: () => new Element('pickup'), createTruckMarker: () => new Element('truck'), ULAANBAATAR: point, mapErrorMessage: String }
      throw new Error('Unexpected import: ' + name)
    } })
    return exports
  }
  const component = connection === 'orders' ? load('app/components/driver-orders-map.tsx').DriverOrdersMap : connection ? load('app/components/order-connection-map.tsx').OrderConnectionMap : load('app/components/offer-map.tsx').OfferMap
  function render() {
    cursor = 0; dirty = false
    const view = component(props)
    view.props.children[0].props.ref.current = { clientHeight: 720 }
    while (pending.length) pending.shift()()
  }
  render()
  return {
    maps, markers, clicked,
    async flush() { for (let i = 0; i < 5; i++) { await Promise.resolve(); if (dirty) render() } },
    update(next) { props = { ...props, ...next }; render() },
    driverMarkers() { return markers.filter(marker => marker.element.tag === 'button' && !marker.removed) },
    unmount() { for (const hook of hooks) hook.cleanup?.() },
  }
}

test('offer markers show price and distance; tapping a marker selects its driver', async () => {
  const h = mapHarness([slot('a'), slot('b', 70000)])
  await h.flush()
  assert.equal(h.driverMarkers().length, 2)
  const marker = h.driverMarkers()[0]
  assert.equal(marker.element.children[1].textContent, '85,000 ₮')
  assert.equal(marker.element.children[2].textContent, '2.4 км зайтай')
  marker.element.events.click({ stopPropagation() {} })
  assert.deepEqual(h.clicked, ['driver-a'])
  assert.ok(h.markers.some(item => item.element.tag === 'pickup'))
})

test('repeated polling updates labels without resetting the user map view', async () => {
  const h = mapHarness([slot('a')])
  await h.flush()
  const count = h.maps[0].fits.length
  h.update({ pickup: { ...point }, offers: [slot('a', 90000)] })
  assert.equal(h.maps[0].fits.length, count)
  assert.equal(h.driverMarkers()[0].element.children[1].textContent, '90,000 ₮')
  h.update({ offers: [slot('a', 90000), slot('b')] })
  assert.equal(h.maps[0].fits.length, count + 1)
})

test('withdrawn or expired offers disappear, selected markers and click handlers update', async () => {
  const h = mapHarness([slot('a'), slot('b')])
  await h.flush()
  const selected = []
  h.update({ offers: [slot('b')], selectedDriverId: 'driver-b', onSelect: id => selected.push(id) })
  assert.equal(h.driverMarkers().length, 1)
  const marker = h.driverMarkers()[0]
  assert.equal(marker.element.attributes['aria-pressed'], 'true')
  marker.element.events.click({ stopPropagation() {} })
  assert.deepEqual(selected, ['driver-b'])
  h.update({ offers: [], selectedDriverId: null })
  assert.equal(h.driverMarkers().length, 0)
  h.unmount()
  assert.equal(h.maps[0].removed, true)
  assert.ok(h.markers.every(item => item.removed))
})


test('connected map starts with pickup only, then follows the selected driver without moving the camera on every update', async () => {
  const h = mapHarness([], true)
  await h.flush()
  const map = h.maps[0]
  map.loaded = true; map.events.load()
  assert.equal(h.markers.filter(m => m.element.tag === 'truck').length, 0)
  assert.equal(map.getSource('order-connection').data.features.length, 0)
  h.update({ driver: { lat: 47.92, lng: 106.92 } })
  const truck = h.markers.find(m => m.element.tag === 'truck')
  assert.equal(JSON.stringify(truck.point), JSON.stringify([106.92, 47.92]))
  assert.equal(map.fits.length, 1)
  h.update({ driver: { lat: 47.93, lng: 106.93 } })
  assert.equal(map.fits.length, 1)
  assert.equal(JSON.stringify(map.getSource('order-connection').data.features[0].geometry.coordinates), JSON.stringify([[106.93,47.93],[106.91,47.91]]))
  h.update({ driver: null })
  assert.equal(truck.removed, true)
  assert.equal(map.getSource('order-connection').data.features.length, 0)
  h.unmount(); assert.equal(map.removed, true)
})

test('GPS updates during map loading use the newest position when the style becomes ready', async () => {
  const h = mapHarness([], true)
  h.update({ driver: { lat: 0, lng: 0 }, pickup: { lat: 0, lng: 0.01 } })
  await h.flush()
  h.update({ driver: { lat: 0, lng: 0.001 } })
  const map = h.maps[0]
  map.loaded = true; map.events.load()
  assert.equal(JSON.stringify(map.getSource('order-connection').data.features[0].geometry.coordinates), JSON.stringify([[0.001,0],[0.01,0]]))
  assert.equal(h.maps.length, 1)
  h.unmount()
})

const order = (id, type = 'chiregch') => ({ id, created_at: '2026-09-22T10:00:00Z', from_address: 'Сүхбаатарын талбай', to_address: 'Авто засвар', from_lat: 47.92, from_lng: 106.92, car_type: type, car_mark: 'Prius' })

test('driver map shows own truck and customer pickup; both locations fit on selecting an order', async () => {
  const h = mapHarness([order('a'), order('b', 'butten')], 'orders')
  await h.flush()
  const truck = h.markers.find(item => item.element.tag === 'truck')
  assert.deepEqual(Array.from(truck.point), [106.91, 47.91])
  assert.equal(h.driverMarkers().length, 2)
  assert.match(h.driverMarkers()[0].element.attributes['aria-label'], /Чирэгч.*Сүхбаатарын талбай.*Авто засвар/)
  assert.equal(h.driverMarkers()[1].element.children[1].textContent, 'Бүтэн ачигч')
  const bounds = h.maps[0].fits[0].bounds.points
  assert.equal(JSON.stringify(bounds), JSON.stringify([[106.91,47.91],[106.92,47.92]]))
  h.driverMarkers()[1].element.events.click({ stopPropagation() {} })
  assert.deepEqual(h.clicked, ['b'])
  h.update({ selectedId: 'b' })
  assert.equal(h.driverMarkers()[1].element.attributes['aria-pressed'], 'true')
  assert.equal(h.maps[0].fits.length, 2)
  h.unmount()
})

test('driver GPS moves the truck without camera jumps; expired orders remove their map points', async () => {
  const h = mapHarness([order('a'), order('b')], 'orders')
  await h.flush()
  const truck = h.markers.find(item => item.element.tag === 'truck')
  h.update({ driver: { lat: 47.93, lng: 106.94 }, fresh: false })
  assert.deepEqual(Array.from(truck.point), [106.94, 47.93])
  assert.equal(truck.element.style.opacity, '.55')
  assert.equal(h.maps[0].fits.length, 1)
  h.update({ orders: [order('b')], selectedId: 'b' })
  assert.equal(h.driverMarkers().length, 1)
  h.update({ orders: [], selectedId: null })
  assert.equal(h.driverMarkers().length, 0)
  h.unmount()
  assert.ok(h.markers.every(marker => marker.removed))
})

test('unknown pickup coordinates never create a fabricated map point', async () => {
  const h = mapHarness([{ ...order('a'), from_lat: null, from_lng: null }], 'orders')
  await h.flush()
  assert.equal(h.driverMarkers().length, 0)
  assert.equal(h.maps[0].fits.length, 0)
  h.unmount()
})
