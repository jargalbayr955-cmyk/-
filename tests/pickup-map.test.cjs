/* eslint-disable @typescript-eslint/no-require-imports -- Exercise asynchronous GPS and map callbacks without a GPU. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function pickupMap() {
  const gps = []
  const maps = []
  const markers = []
  const effects = []
  const updates = []
  let resolveMap
  const loadingMap = new Promise(resolve => { resolveMap = resolve })
  class FakeMap {
    constructor() { this.events = {}; maps.push(this) }
    addControl() {}
    on(name, callback) { this.events[name] = callback }
    getZoom() { return 12 }
    easeTo(options) { this.center = options.center }
    remove() { this.removed = true }
  }
  class Marker {
    constructor() { this.events = {}; markers.push(this) }
    setLngLat(point) { this.point = point; return this }
    addTo() { return this }
    on(name, callback) { this.events[name] = callback }
    getLngLat() { return { lng: this.point[0], lat: this.point[1] } }
    remove() { this.removed = true }
  }
  const ml = { Map: FakeMap, Marker, NavigationControl: class {} }
  const window = {}
  const jsx = (type, props) => ({ type, props })
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/current/page.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(source, {
    exports, window, console,
    navigator: { geolocation: { getCurrentPosition: (success, error) => gps.push({ success, error }) } },
    require: name => {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return {
        useRef: current => ({ current }),
        useState: initial => [initial, value => updates.push(value)],
        useCallback: callback => callback,
        useEffect: effect => effects.push(effect),
      }
      if (name === 'next/navigation') return { useRouter: () => ({}) }
      if (name.includes('free-map')) return {
        loadFreeMap: () => loadingMap,
        freeMapStyle: () => 'test-style', createDotMarker: () => ({}),
        ULAANBAATAR: { lat: 47.9184, lng: 106.9177 }, mapErrorMessage: String,
      }
      if (name.includes('access-shortcuts')) return { AdminAccess: () => null, BrandAccess: () => null }
      if (name.includes('customer-account')) return { CustomerAccount: () => null }
      throw new Error('Unexpected import: ' + name)
    },
  })
  const view = exports.default()
  const mapCanvas = view.props.children.find(child => child?.props?.className === 'current-map-canvas')
  mapCanvas.props.ref.current = {}
  const cleanups = effects.map(effect => effect())
  return {
    gps, maps, markers, updates,
    async loadMap() { window.maplibregl = ml; resolveMap(ml); await loadingMap; await Promise.resolve() },
    locate(index, lat, lng) { gps[index].success({ coords: { latitude: lat, longitude: lng } }) },
    select(lat, lng) { maps[0].events.click({ lngLat: { lat, lng } }) },
    recenter() { view.props.children.find(child => child?.props?.['aria-label'] === 'Миний байршил руу очих').props.onClick() },
    unmount() { cleanups.forEach(cleanup => cleanup?.()) },
  }
}

test('GPS starts immediately and its point appears when the map finishes loading', async () => {
  const h = pickupMap()
  assert.equal(h.gps.length, 1)
  assert.equal(h.maps.length, 0)
  h.locate(0, 47.91, 106.92)
  await h.loadMap()
  assert.deepEqual(Array.from(h.markers[0].point), [106.92, 47.91])
  assert.deepEqual(Array.from(h.maps[0].center), [106.92, 47.91])
})

test('a late GPS result cannot replace the pickup selected by tapping the map', async () => {
  const h = pickupMap()
  await h.loadMap()
  h.select(47.95, 106.98)
  h.locate(0, 47.91, 106.92)
  assert.deepEqual(Array.from(h.markers[0].point), [106.98, 47.95])
})

test('dragging the pickup marker also takes priority over an outstanding GPS request', async () => {
  const h = pickupMap()
  await h.loadMap()
  h.locate(0, 47.91, 106.92)
  h.recenter()
  h.markers[0].point = [106.99, 47.96]
  h.markers[0].events.dragend()
  h.locate(1, 47.91, 106.92)
  assert.deepEqual(Array.from(h.markers[0].point), [106.99, 47.96])
})

test('after GPS is denied, manual selection and an explicit GPS retry remain usable', async () => {
  const h = pickupMap()
  await h.loadMap()
  h.gps[0].error({ code: 1 })
  h.select(47.95, 106.98)
  assert.deepEqual(Array.from(h.markers[0].point), [106.98, 47.95])
  h.recenter()
  h.locate(1, 47.91, 106.92)
  assert.deepEqual(Array.from(h.markers[0].point), [106.92, 47.91])
})

test('leaving the map cancels pending GPS and map initialization results', async () => {
  const h = pickupMap()
  h.unmount()
  const before = h.updates.length
  h.locate(0, 47.91, 106.92)
  await h.loadMap()
  assert.equal(h.updates.length, before)
  assert.equal(h.maps.length, 0)
})
