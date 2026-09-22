/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the real form and keyboard handlers without dispatching real orders. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function formHarness(options = {}) {
  const hooks = [], effects = [], elements = new Map(), requests = [], routes = [], storage = new Map()
  let cursor = 0, dirty = false, nodes = [], active, closed = 0
  const draftStorage = options.draftStorage || new Map()
  let steps = ['map', options.screen || 'vehicle'], position = 1
  let props = { screen: steps[position], location: { lat: 47.91, lng: 106.92 },
    onNavigate: next => { if (next === steps[position]) return; steps = steps.slice(0,position+1); steps.push(next); position++; props.screen = next; dirty = true },
    onBack: () => { if (!position) return false; props.screen = steps[--position]; render(); return true },
    onClose: () => { closed++; steps = ['map']; position = 0; props.screen = 'map'; render() }, ...options }
  function eventTarget(values = {}) {
    const listeners = new Map()
    return { ...values, listeners,
      addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback) },
      removeEventListener(name, callback) { listeners.get(name)?.delete(callback) },
      emit(name) { for (const callback of listeners.get(name) || []) callback() },
    }
  }
  const viewport = eventTarget({ height: 760, offsetTop: 0 })
  const window = eventTarget({ location: { pathname: '/current' }, innerHeight: 760, visualViewport: options.noVisualViewport ? undefined : viewport })
  const react = {
    useRef(value) { const index = cursor++; hooks[index] ??= { current: value }; return hooks[index] },
    useState(value) { const index = cursor++; hooks[index] ??= { value }; return [hooks[index].value, next => { hooks[index].value = typeof next === 'function' ? next(hooks[index].value) : next; dirty = true }] },
    useEffect(effect, deps) {
      const index = cursor++, old = hooks[index]
      if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
        hooks[index] = { deps, cleanup: old?.cleanup }
        effects.push(() => { old?.cleanup?.(); hooks[index].cleanup = effect() })
      }
    },
  }
  function load(file) {
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(source, {
    exports, window, console, crypto: require('node:crypto').webcrypto, AbortController, setTimeout, clearTimeout,
    localStorage: { setItem: (key, value) => { if (options.blockedStorage) throw Error('blocked'); storage.set(key, value) } },
    sessionStorage: { getItem: key => draftStorage.get(key), setItem: (key,value) => draftStorage.set(key,value), removeItem: key => draftStorage.delete(key) },
    fetch: (url, init) => new Promise(resolve => requests.push({ url, init, resolve })),
    require(name) {
      if (name === 'react') return react
      if (name === 'react-dom') return { flushSync: callback => { callback(); render() } }
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
      if (name === 'next/navigation') return { useRouter: () => ({ push: url => routes.push(url) }) }
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts')
      throw new Error('Unexpected import: ' + name)
    },
  })
  return exports
  }
  const component = load('app/components/customer-order-sheet.tsx').CustomerOrderSheet
  function render() {
    cursor = 0; dirty = false; nodes = []
    const view = component(props)
    function walk(node, parent, key = 'root') {
      if (Array.isArray(node)) { node.forEach((child, index) => walk(child, parent, key + ':' + index)); return }
      if (!node || typeof node !== 'object') return
      const id = node.props.id || key + ':' + node.type
      if (!elements.has(id)) {
        const values = {}
        elements.set(id, { type: node.type, scrollTop: 0, values,
          style: { setProperty: (key, value) => { values[key] = value } },
          focus() { active = elements.get(id) },
          showModal() { this.open = true }, close() { this.open = false },
        })
      }
      node.element = elements.get(id); node.parent = parent
      if (node.props.ref) node.props.ref.current = node.element
      nodes.push(node)
      walk(node.props.children, node, key + ':children')
    }
    walk(view)
    while (effects.length) effects.shift()()
    if (dirty) render()
  }
  function find(predicate) { const node = nodes.find(predicate); assert.ok(node, 'Expected form control'); return node }
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : text(node?.props?.children || '')
  function submit() {
    find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
    if (dirty) render()
  }
  render()
  return {
    requests, routes, storage, draftStorage, viewport, window,
    back() { return props.onBack() },
    get active() { return active }, get closed() { return closed },
    get dialog() { return find(node => node.type === 'dialog').element },
    get title() { return text(find(node => node.type === 'h2')) },
    get inputs() { return nodes.filter(node => node.type === 'input') },
    get error() { return text(nodes.find(node => node.props.role === 'alert')) },
    doneButton() { return nodes.find(node => node.type === 'button' && text(node) === 'Болсон') },
    button(label) { return find(node => node.type === 'button' && (node.props['aria-label'] === label || text(node).includes(label))) },
    input(id) { return find(node => node.type === 'input' && node.props.id === id) },
    type(id, value) { this.input(id).props.onChange({ target: { value } }); render() },
    click(label) {
      const button = this.button(label)
      assert.ok(!button.props.disabled, 'Button must be enabled')
      const result = button.props.onClick?.()
      if (button.props.type === 'submit') submit()
      if (dirty) render()
      return result
    },
    enter(composing = false) {
      let prevented = false
      find(node => node.type === 'form').props.onKeyDown({ key: 'Enter', keyCode: composing ? 229 : 13, nativeEvent: { isComposing: composing }, preventDefault() { prevented = true } })
      if (!prevented) submit()
    },
    async reply(index, status, body) {
      requests[index].resolve({ ok: status === 200, status, json: async () => body })
      for (let i = 0; i < 8; i++) { await Promise.resolve(); if (dirty) render() }
    },
    update(next) { props = { ...props, ...next }; render() },
    unmount() { for (const hook of hooks) hook.cleanup?.() },
  }
}

function fillToReview(h) {
  h.click('Бүтэн ачигч')
  h.type('destination', '  3-р хороолол  ')
  h.click('Болсон')
  h.type('car-mark', ' Toyota Prius ')
  h.click('Болсон')
}

test('Done is inside the active input banner, appears only with text, and advances focus', () => {
  const h = formHarness()
  assert.equal(h.inputs.length, 0)
  h.click('Бүтэн ачигч')
  assert.equal(h.inputs.length, 1)
  assert.equal(h.doneButton(), undefined)
  assert.equal(h.active, h.input('destination').element)
  h.type('destination', 'Засварын газар')
  assert.equal(h.doneButton().parent, h.input('destination').parent)
  h.type('destination', '')
  assert.equal(h.doneButton(), undefined)
  h.type('destination', 'Засварын газар')
  h.click('Болсон')
  assert.equal(h.inputs.length, 1)
  assert.equal(h.active, h.input('car-mark').element)
  assert.equal(h.doneButton(), undefined)
  h.type('car-mark', 'Prius')
  h.click('Болсон')
  assert.equal(h.active.type, 'h2')
  assert.equal(h.inputs.length, 0)
  assert.equal(h.requests.length, 0)
})

test('keyboard Done advances; empty or composing input cannot skip a field or create an order', () => {
  const h = formHarness()
  h.click('Чирэгч')
  h.type('destination', '   ')
  h.enter()
  assert.match(h.error, /Хүрэх газраа/)
  assert.equal(h.doneButton(), undefined)
  h.type('destination', 'Засварын газар')
  h.enter(true)
  assert.equal(h.input('destination').props.value, 'Засварын газар')
  h.enter()
  h.enter()
  assert.match(h.error, /марк/)
  h.type('car-mark', 'Prius')
  h.enter()
  assert.equal(h.active.type, 'h2')
  h.enter()
  assert.equal(h.requests.length, 0)
})

test('back, close, and reopening preserve entered details; review edits return directly to review', () => {
  const h = formHarness()
  fillToReview(h)
  h.click('Хүрэх газар засах')
  assert.equal(h.input('destination').props.value, '  3-р хороолол  ')
  h.type('destination', '5-р хороолол')
  h.click('Болсон')
  assert.equal(h.title, 'Захиалгаа шалгаарай')
  h.click('Буцах')
  assert.equal(h.input('car-mark').props.value, ' Toyota Prius ')
  h.click('Хаах')
  assert.equal(h.dialog.open, false)
  h.update({ screen: 'car' })
  assert.equal(h.active.type, 'h2')
  assert.equal(h.input('car-mark').props.value, ' Toyota Prius ')
  h.click('Болсон')
  h.click('Хүрэх газар засах')
  assert.equal(h.input('destination').props.value, '5-р хороолол')
})

test('keyboard resizing and panning keep the sheet within the visible area; listeners clean up', () => {
  const h = formHarness()
  assert.equal(h.dialog.values['--order-visible-height'], '760px')
  h.viewport.height = 340
  h.viewport.offsetTop = 82
  h.viewport.emit('resize')
  assert.equal(h.dialog.values['--order-visible-height'], '340px')
  assert.equal(h.dialog.values['--order-visible-top'], '82px')
  h.viewport.offsetTop = 96
  h.viewport.emit('scroll')
  assert.equal(h.dialog.values['--order-visible-top'], '96px')
  h.unmount()
  assert.equal(h.viewport.listeners.get('resize').size, 0)
  assert.equal(h.viewport.listeners.get('scroll').size, 0)
  assert.equal(h.window.listeners.get('resize').size, 0)
  const fallback = formHarness({ noVisualViewport: true })
  fallback.window.innerHeight = 320
  fallback.window.emit('resize')
  assert.equal(fallback.dialog.values['--order-visible-height'], '320px')
})

test('optional pickup detail Done closes the keyboard and never sends an order', () => {
  const h = formHarness()
  fillToReview(h)
  h.click('тайлбар нэмэх')
  assert.equal(h.doneButton(), undefined)
  h.type('pickup-detail', 'Орц 2')
  assert.equal(h.doneButton().parent, h.input('pickup-detail').parent)
  h.click('Болсон')
  assert.equal(h.active.type, 'h2')
  assert.equal(h.inputs.length, 0)
  assert.equal(h.requests.length, 0)
})

test('final explicit confirmation sends one trimmed order and opens its waiting map', async () => {
  const h = formHarness()
  fillToReview(h)
  const send = h.button('Жолооч хайх').props.onClick
  void send()
  void send()
  assert.equal(h.requests.length, 1)
  const { request_id, ...details } = JSON.parse(h.requests[0].init.body)
  assert.match(request_id, /^[a-f0-9-]{36}$/)
  assert.deepEqual(details, {
    from_address: 'Газрын зураг дээр сонгосон цэг (47.91000, 106.92000)',
    to_address: '3-р хороолол', from_lat: 47.91, from_lng: 106.92, car_type: 'butten', car_mark: 'Toyota Prius',
  })
  await h.reply(0, 200, { order: { id: 'test-order' } })
  assert.deepEqual(h.routes, ['/drivers'])
  assert.equal(h.storage.get('current_order_id'), 'test-order')
  void send()
  assert.equal(h.requests.length, 1)
})

test('missing pickup blocks dispatch; server failure preserves details and allows a retry', async () => {
  const h = formHarness({ location: null })
  fillToReview(h)
  void h.click('Жолооч хайх')
  assert.equal(h.requests.length, 0)
  assert.match(h.error, /ачих цэгээ/)
  h.update({ location: { lat: 47.91, lng: 106.92 } })
  void h.click('Жолооч хайх')
  assert.equal(h.button('Хаах').props.disabled, true)
  h.button('Хаах').props.onClick()
  assert.equal(h.closed, 0)
  await h.reply(0, 503, { error: 'Түр алдаа' })
  assert.equal(h.error, 'Түр алдаа')
  void h.click('Жолооч хайх')
  assert.equal(h.requests.length, 2)
  assert.equal(JSON.parse(h.requests[1].init.body).request_id, JSON.parse(h.requests[0].init.body).request_id)
  assert.equal(JSON.parse(h.requests[1].init.body).to_address, '3-р хороолол')
  await h.reply(1, 200, { order: { id: 'test-retry-order' } })
  assert.deepEqual(h.routes, ['/drivers'])
})

test('Back walks every field and keeps the draft; a sent order resumes without another dispatch', async () => {
  const h = formHarness()
  fillToReview(h)
  h.back(); assert.equal(h.input('car-mark').props.value, ' Toyota Prius ')
  h.back(); assert.equal(h.input('destination').props.value, '  3-р хороолол  ')
  h.back(); assert.equal(h.title, 'Ямар машин хэрэгтэй вэ?')
  h.click('Бүтэн ачигч'); h.click('Болсон'); h.click('Болсон')
  void h.click('Жолооч хайх')
  await h.reply(0,200,{order:{id:'saved-order'}})
  h.unmount()
  const restored = formHarness({ screen:'review', draftStorage:h.draftStorage })
  assert.equal(restored.title,'Захиалгаа шалгаарай')
  void restored.click('Үнийн санал руу')
  assert.equal(restored.requests.length,0)
  assert.deepEqual(restored.routes,['/drivers'])
  restored.back()
  assert.equal(restored.dialog.open,false)
})

test('a lost create response and page reload preserve the idempotency key', async () => {
  const h = formHarness(); fillToReview(h); void h.click('Жолооч хайх')
  const first = JSON.parse(h.requests[0].init.body)
  await h.reply(0,503,{error:'Lost response'})
  h.unmount()
  const restored = formHarness({screen:'review',draftStorage:h.draftStorage})
  void restored.click('Жолооч хайх')
  assert.equal(JSON.parse(restored.requests[0].init.body).request_id,first.request_id)
  await restored.reply(0,200,{order:{id:'recovered-order'}})
  assert.deepEqual(restored.routes,['/drivers'])
})

test('blocked optional browser storage does not turn a successful order into a retry', async () => {
  const h = formHarness({blockedStorage:true}); fillToReview(h); void h.click('Жолооч хайх')
  assert.equal(h.requests.length,1)
  await h.reply(0,200,{order:{id:'storage-blocked-order'}})
  assert.deepEqual(h.routes,['/drivers'])
  assert.equal(JSON.parse(h.draftStorage.get('achilt_booking_draft')).orderId,'storage-blocked-order')
})
