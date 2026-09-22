/* eslint-disable @typescript-eslint/no-require-imports -- Model browser history while executing the real navigation helpers and hook. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function browserHistory(url = '/current') {
  const entries = [{ url, state: { __NA: true, tree: 'next-router-tree' } }], listeners = new Set()
  let index = 0
  const location = { get pathname() { return entries[index].url.split('?')[0] }, get href() { return 'https://achilt.example' + entries[index].url } }
  const normalize = value => String(value).replace('https://achilt.example', '')
  const history = {
    get state() { return entries[index].state },
    pushState(state, _, url) { entries.splice(index + 1); entries.push({ state, url: normalize(url) }); index++ },
    replaceState(state, _, url) { entries[index] = { state, url: normalize(url) } },
    go(n) { if (index + n < 0 || index + n >= entries.length) return; index += n; for (const fn of [...listeners]) fn() },
    back() { this.go(-1) }, forward() { this.go(1) },
  }
  return { entries, location, history, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn), get listenerCount() { return listeners.size } }
}
function harness(scope = 'booking', initial = 'map', window = browserHistory()) {
  const hooks = [], effects = [], cache = {}
  let cursor = 0, dirty = false, result
  const react = {
    useRef(value) { const i = cursor++; return hooks[i] ??= { current: value } },
    useState(value) { const i = cursor++; hooks[i] ??= { value }; return [hooks[i].value, next => { if (next !== hooks[i].value) { hooks[i].value = next; dirty = true } }] },
    useCallback(fn) { cursor++; return fn },
    useEffect(fn, deps) {
      const i = cursor++, old = hooks[i]
      if (!old || deps.some((v,k) => v !== old.deps[k])) { hooks[i] = { deps }; effects.push(() => { old?.cleanup?.(); hooks[i].cleanup = fn() }) }
    }
  }
  function load(file) {
    if (cache[file]) return cache[file]
    const exports = {}; cache[file] = exports
    const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    vm.runInNewContext(source, { exports, window, require(name) {
      if (name === 'react') return react
      if (name === './navigation') return load('lib/client/navigation.ts')
      throw new Error(name)
    } })
    return exports
  }
  const nav = load('lib/client/navigation.ts'), hook = load('lib/client/use-screen-history.ts').useScreenHistory
  const valid = value => typeof value === 'string'
  function render() { cursor = 0; dirty = false; result = hook(scope, initial, valid); while (effects.length) effects.shift()(); if (dirty) render() }
  render()
  return {
    window, nav,
    get screen() { if (dirty) render(); return result.screen },
    navigate(value) { result.navigate(value); if (dirty) render() },
    back() { const used = result.back(); if (dirty) render(); return used },
    close() { result.close(); if (dirty) render() },
    unmount() { for (const h of hooks) h?.cleanup?.() },
  }
}

test('browser Back and page Back both move one booking step, preserving Next history state', () => {
  const h = harness()
  for (const step of ['vehicle','destination','car','review']) h.navigate(step)
  assert.equal(h.screen, 'review')
  assert.equal(h.window.history.state.tree, 'next-router-tree')
  h.window.history.back(); assert.equal(h.screen, 'car')
  h.back(); assert.equal(h.screen, 'destination')
  h.back(); assert.equal(h.screen, 'vehicle')
  h.back(); assert.equal(h.screen, 'map')
  assert.equal(h.back(), false)
  h.window.history.forward(); assert.equal(h.screen, 'vehicle')
  h.unmount(); assert.equal(h.window.listenerCount, 0)
})

test('review edit and admin subpanel return to the exact preceding screen', () => {
  const h = harness()
  for (const step of ['vehicle','destination','car','review','edit-destination']) h.navigate(step)
  h.back(); assert.equal(h.screen, 'review')
  h.back(); assert.equal(h.screen, 'car')
  const admin = harness('admin','drivers',browserHistory('/admin'))
  for (const screen of ['active','history','history:password']) admin.navigate(screen)
  admin.back(); assert.equal(admin.screen, 'history')
  admin.window.history.back(); assert.equal(admin.screen, 'active')
  admin.back(); assert.equal(admin.screen, 'drivers')
  assert.equal(admin.back(), false)
})

test('closing a sheet consumes its own steps; reopening cannot jump back into stale fields', () => {
  const h = harness()
  for (const step of ['vehicle','destination','car','review']) h.navigate(step)
  h.close(); assert.equal(h.screen, 'map')
  h.navigate('vehicle'); h.back(); assert.equal(h.screen, 'map')
  assert.equal(h.window.entries.length, 2)
})

test('tracking → selected offer → offer map → booking review traverses actual entries', () => {
  const booking = harness(), { window, nav } = booking
  nav.rememberRoute('/current', null)
  for (const step of ['vehicle','destination','car','review']) booking.navigate(step)
  booking.unmount()
  window.history.pushState({ __NA: true }, '', '/drivers'); nav.rememberRoute('/drivers', '/current')
  const offers = harness('offers','map',window)
  offers.navigate('driver-a'); offers.unmount()
  window.history.pushState({ __NA: true }, '', '/tracking'); nav.rememberRoute('/tracking', '/drivers')
  const router = { back: () => window.history.back(), replace: () => { throw new Error('Must use real previous entry') } }
  nav.backInApp(router,'/drivers')
  assert.equal(window.location.pathname,'/drivers'); assert.equal(nav.readScreen('offers').value,'driver-a')
  const restored = harness('offers','map',window)
  assert.equal(restored.screen,'driver-a'); restored.back(); assert.equal(restored.screen,'map')
  nav.backInApp(router,'/current')
  assert.equal(window.location.pathname,'/current'); assert.equal(nav.readScreen('booking').value,'review')
  const resumed = harness('booking','map',window)
  assert.equal(resumed.screen,'review'); resumed.back(); assert.equal(resumed.screen,'car')
})

test('direct links use an in-app fallback instead of returning to an unknown external site', () => {
  const h = harness('offers','map',browserHistory('/drivers')), replaced = []
  h.nav.rememberRoute('/drivers',null)
  const router = { back: () => { throw new Error('No known predecessor') }, replace: path => replaced.push(path) }
  h.nav.backInApp(router,'/current'); assert.deepEqual(replaced,['/current'])
})
