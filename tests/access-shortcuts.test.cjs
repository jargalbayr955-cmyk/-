/* eslint-disable @typescript-eslint/no-require-imports -- Verify pointer/keyboard timing without real waits. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function shortcut() {
  let now = 10000, nextId = 0
  const timers = new Map(), routes = [], cleanups = [], listeners = new Map()
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/components/access-shortcuts.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const events = { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) }
  const document = { ...events, visibilityState: 'visible' }
  vm.runInNewContext(source, {
    exports, document, window: events, Date: { now: () => now },
    setTimeout: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, at: now + delay }); return id },
    clearTimeout: id => timers.delete(id),
    require(name) {
      if (name === 'react') return { useRef: current => ({ current }), useCallback: callback => callback, useEffect: effect => cleanups.push(effect()) }
      if (name === 'next/navigation') return { useRouter: () => ({ push: path => routes.push(path) }) }
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) }
      throw new Error('Unexpected import: ' + name)
    },
  })
  const props = exports.BrandAccess({}).props
  const pointer = { isPrimary: true, button: 0, clientX: 20, clientY: 20 }
  return {
    props, routes, document, listeners,
    down: () => props.onPointerDown(pointer),
    up: () => props.onPointerUp(pointer),
    tap({ leaveAfterUp = false } = {}) { props.onPointerDown(pointer); props.onPointerUp(pointer); if (leaveAfterUp) props.onPointerLeave(); props.onClick() },
    advance(ms) {
      now += ms
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback() }
    },
    unmount: () => cleanups.forEach(cleanup => cleanup?.()),
  }
}

test('three short taps still open driver access, including touch pointerleave after release', () => {
  const h = shortcut()
  h.tap({ leaveAfterUp: true }); h.advance(100)
  h.tap({ leaveAfterUp: true }); h.advance(100)
  assert.deepEqual(h.routes, [])
  h.tap({ leaveAfterUp: true })
  assert.deepEqual(h.routes, ['/driver'])
})

test('admin opens only after five seconds; release cannot also trigger the driver shortcut', () => {
  const h = shortcut()
  h.tap(); h.tap(); h.down()
  h.advance(4999)
  assert.deepEqual(h.routes, [])
  h.advance(1)
  assert.deepEqual(h.routes, ['/admin'])
  h.up(); h.props.onClick()
  h.tap(); h.tap()
  assert.deepEqual(h.routes, ['/admin'])
  h.tap()
  assert.deepEqual(h.routes, ['/admin', '/driver'])
})

test('early release, leaving, dragging, cancellation and blur cannot accidentally open admin', () => {
  for (const cancel of [h => h.up(), h => h.props.onPointerLeave(), h => h.props.onPointerMove({ clientX: 40, clientY: 20 }), h => h.props.onPointerCancel(), h => h.props.onBlur(), h => h.listeners.get('blur')()]) {
    const h = shortcut()
    h.down(); h.advance(4999); cancel(h); h.advance(5000)
    assert.deepEqual(h.routes, [])
  }
})

test('backgrounding or unmounting clears the pending hold', () => {
  for (const cancel of [h => { h.document.visibilityState = 'hidden'; h.listeners.get('visibilitychange')() }, h => h.unmount()]) {
    const h = shortcut()
    h.down(); h.advance(4000); cancel(h); h.advance(1000)
    assert.deepEqual(h.routes, [])
  }
})

test('keyboard holds support admin without repeat keydown triggering three taps', () => {
  const h = shortcut()
  const event = { key: 'Enter', repeat: false, preventDefault() {} }
  h.props.onKeyDown(event)
  h.advance(2500)
  h.props.onKeyDown({ ...event, repeat: true })
  assert.deepEqual(h.routes, [])
  h.advance(2500)
  h.props.onKeyUp(event)
  assert.deepEqual(h.routes, ['/admin'])
})
