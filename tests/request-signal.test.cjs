/* eslint-disable @typescript-eslint/no-require-imports -- Check cancellation and cleanup without modern AbortSignal methods. */
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')
const { getEventListeners } = require('node:events')

function harness() {
  const timers = new Map(), exports = {}; let sequence = 0
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/client/request-signal.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(source, {
    exports, AbortController, AbortSignal: {},
    setTimeout: (fn, ms) => { const id = ++sequence; timers.set(id, { fn, ms }); return id },
    clearTimeout: id => timers.delete(id),
  })
  return { create: exports.createRequestSignal, timers }
}

test('legacy browser timeout aborts the request and removes the parent listener', () => {
  const h = harness(), parent = new AbortController(), request = h.create(15000, parent.signal)
  assert.equal(request.signal.aborted, false)
  assert.equal(getEventListeners(parent.signal, 'abort').length, 1)
  const timeout = [...h.timers.values()][0]; assert.equal(timeout.ms, 15000); timeout.fn()
  assert.equal(request.signal.aborted, true)
  assert.equal(parent.signal.aborted, false)
  assert.equal(h.timers.size, 0)
  assert.equal(getEventListeners(parent.signal, 'abort').length, 0)
})

test('parent cancellation immediately aborts every outstanding request and clears deadlines', () => {
  const h = harness(), parent = new AbortController()
  const requests = [h.create(12000, parent.signal), h.create(15000, parent.signal)]
  parent.abort()
  assert(requests.every(request => request.signal.aborted))
  assert.equal(h.timers.size, 0)
  assert.equal(getEventListeners(parent.signal, 'abort').length, 0)
})

test('an already cancelled parent starts no timeout or listener', () => {
  const h = harness(), parent = new AbortController(); parent.abort()
  const request = h.create(15000, parent.signal)
  assert.equal(request.signal.aborted, true)
  assert.equal(h.timers.size, 0)
  assert.equal(getEventListeners(parent.signal, 'abort').length, 0)
})

test('completed requests release timers and listeners; a standalone request still times out', () => {
  const h = harness(), parent = new AbortController(), request = h.create(15000, parent.signal)
  request.dispose(); request.dispose(); parent.abort()
  assert.equal(request.signal.aborted, false)
  assert.equal(h.timers.size, 0)
  assert.equal(getEventListeners(parent.signal, 'abort').length, 0)
  const standalone = h.create(12000)
  ;[...h.timers.values()][0].fn()
  assert.equal(standalone.signal.aborted, true)
  assert.equal(h.timers.size, 0)
})

test('request IDs remain cryptographically random on browsers without randomUUID', () => {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/client/request-id.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {
    exports,crypto:{getRandomValues:require('node:crypto').webcrypto.getRandomValues.bind(require('node:crypto').webcrypto)},
  })
  const a=exports.createRequestId(),b=exports.createRequestId()
  assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.notEqual(a,b)
})
