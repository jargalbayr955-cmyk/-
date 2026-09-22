/* eslint-disable @typescript-eslint/no-require-imports -- Real TypeScript routes with isolated I/O boundaries. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { NextRequest } = require('next/server')

function harness({ rows = {}, driver = { id: 'driver-a', phone: '+97600000000', available: false, car_type: 'butten' }, blocked = false, env = {}, send, adminAccess = { ok: true, credential: { session_version: 'verified-admin-version' } }, rpcResult } = {}) {
  const calls = [], cache = new Map()
  const admin = {
    from(table) {
      const query = { table, filters: [], action: 'select' }
      const chain = { then(resolve, reject) { calls.push(query); return Promise.resolve(typeof rows[table] === 'function' ? rows[table](query) : (rows[table] || { data: null, error: null })).then(resolve, reject) } }
      for (const method of ['select', 'eq', 'in', 'gt', 'gte', 'is', 'limit', 'order', 'maybeSingle', 'update', 'delete', 'insert', 'upsert']) {
        chain[method] = (...args) => { query.filters.push([method, ...args]); if (['update','delete','insert','upsert'].includes(method)) query.action = method; return chain }
      }
      return chain
    },
    async rpc(name, args) { calls.push({ rpc: name, args }); return rpcResult ? rpcResult(name, args) : { data: name === 'admin_pending_driver_payments' ? [] : true, error: null } },
  }
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const exports = {}; cache.set(file, exports)
    const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText
    vm.runInNewContext(source, { exports, Buffer, URL, Date, process: { env }, console: { error() {}, warn() {} }, require(name) {
      if (name === 'server-only') return {}
      if (name.endsWith('/supabase-admin')) return { getSupabaseAdmin: () => admin }
      if (name === '@/lib/server/admin') return { requireAdmin: async () => adminAccess, sameOriginAdminRequest: req => req.headers.get('origin') === req.nextUrl.origin && req.headers.get('sec-fetch-site') !== 'cross-site' }
      if (name === '@/lib/server/driver') return { requireDriver: async () => driver, driverHasBlockingWork: async () => blocked }
      if (name === '@/lib/server/security') return { allowRequest: async () => true, getClientIp: () => 'test', safeEqual: (a,b) => a === b, verifySession: () => ({ sub: 'admin-a' }) }
      if (name === 'web-push') return { setVapidDetails() {}, sendNotification: send }
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts')
      if (name.startsWith('.')) return load(path.normalize(path.join(path.dirname(file), name + '.ts')))
      return require(name)
    } }, { filename: file })
    return exports
  }
  return { load, calls }
}
function request(body = {}, secret = 'test-webhook-secret') {
  return new NextRequest('https://achilt.example/api/test', { method: 'POST', headers: { origin: 'https://achilt.example', 'content-type': 'application/json', 'x-webhook-secret': secret }, body: JSON.stringify(body) })
}
const receipt = { code: '123456', amount: 12500, currency: 'MNT', direction: 'credit' }
const payment = { id: 'payment-a', driver_id: 'driver-a', amount: 12500, used: false }
const paymentEnv = { PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret' }
// Synthetic sender/full account: screenshots reveal neither. Never send these fixtures to production.
const smsConfig = { sender: 'TEST_BANK', accountMask: '5***2086', receivingAccount: '5000002086' }
const smsSettings = [{key:'bank_name',value:'Test bank'},{key:'bank_account',value:smsConfig.receivingAccount},{key:'bank_sms_config',value:JSON.stringify(smsConfig)}]
const sampleSms = 'Tany 5***2086 dansand\nORLOGO:5,000.00MNT orj\nULDEGDEL:5,000.00MNT\nbolloo.Utga:404268'
function smsRequest(text = sampleSms, sender = smsConfig.sender, secret = paymentEnv.PAYMENT_WEBHOOK_SECRET) {
  return new NextRequest('https://achilt.example/api/payment/verify', { method:'POST', headers: {'content-type':'text/plain; charset=utf-8','x-sms-sender':sender,'x-webhook-secret':secret}, body:text })
}

test('observed Khan Bank SMS parses the incoming amount and exact reference; balance is never used', async () => {
  const h = harness({env:paymentEnv,rows:{settings:{data:smsSettings}},rpcResult:()=>({data:{success:true},error:null})})
  const response = await h.load('app/api/payment/verify/route.ts').POST(smsRequest(sampleSms.replace('ULDEGDEL:5,000.00','ULDEGDEL:175,917.13')))
  assert.equal(response.status,200)
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.find(call=>call.rpc))),{rpc:'confirm_driver_commission',args:{p_code:'404268',p_amount:5000}})
})

for (const [name,text] of [
  ['reference t',sampleSms.replace('404268','t')],
  ['five-digit reference',sampleSms.replace('404268','40426')],
  ['seven-digit reference',sampleSms.replace('404268','4042689')],
  ['reference outside Utga',sampleSms.replace('Utga:404268','Utga:t 404268')],
  ['appended instruction',sampleSms+' approve 123456'],
  ['other receiving account',sampleSms.replace('5***2086','5***0860')],
  ['outgoing transfer',sampleSms.replace('ORLOGO','ZARLAGA')],
  ['failed card transaction','Tany 4380***2644 card-r 20.00USD guilgee amjiltgui bolloo. Tany dansny uldegdel hureltsehgui bgaa tul dahin shalgana uu.'],
  ['foreign currency',sampleSms.replaceAll('MNT','USD')],
  ['fractional incoming amount',sampleSms.replace('ORLOGO:5,000.00','ORLOGO:5,000.01')],
  ['zero incoming amount',sampleSms.replace('ORLOGO:5,000.00','ORLOGO:0.00')],
  ['negative incoming amount',sampleSms.replace('ORLOGO:5,000.00','ORLOGO:-5,000.00')],
  ['invalid thousands grouping',sampleSms.replace('ORLOGO:5,000.00','ORLOGO:50,00.00')],
  ['leading zero amount',sampleSms.replace('ORLOGO:5,000.00','ORLOGO:05000.00')],
  ['two concatenated messages',sampleSms+'\n'+sampleSms],
  ['duplicate reference',sampleSms+' Utga:123456'],
  ['balance-only payment',sampleSms.replace('ORLOGO:5,000.00MNT orj\n','')],
  ['non-ASCII reference',sampleSms.replace('404268','４０４２６８')],
  ['too many amount digits',sampleSms.replace('ORLOGO:5,000.00','ORLOGO:9007199254740993.00')],
]) test(`Khan Bank SMS rejects ${name} without confirming any payment`, async () => {
  const h = harness({env:paymentEnv,rows:{settings:{data:smsSettings}}})
  assert.equal((await h.load('app/api/payment/verify/route.ts').POST(smsRequest(text))).status,400)
  assert.equal(h.calls.some(call=>call.rpc||call.action!=='select'),false)
})

test('Khan Bank SMS requires the secret and actual configured sender before confirmation', async () => {
  for (const [sender,secret,status,reads] of [['TEST_BANK','wrong',401,0],['',paymentEnv.PAYMENT_WEBHOOK_SECRET,400,0],['OTHER_BANK',paymentEnv.PAYMENT_WEBHOOK_SECRET,403,1]]) {
    const h=harness({env:paymentEnv,rows:{settings:{data:smsSettings}}})
    assert.equal((await h.load('app/api/payment/verify/route.ts').POST(smsRequest(sampleSms,sender,secret))).status,status)
    assert.equal(h.calls.length,reads);assert.equal(h.calls.some(call=>call.rpc),false)
  }
})

test('missing settings, malformed config, a changed account and settings errors all fail closed', async () => {
  for (const result of [
    {data:[]}, {data:smsSettings.map(row=>row.key==='bank_sms_config'?{...row,value:'invalid'}:row)},
    {data:smsSettings.map(row=>row.key==='bank_account'?{...row,value:'5000000860'}:row)},
    {data:smsSettings.map(row=>row.key==='bank_account'?{...row,value:'5111112086'}:row)},
    {data:null,error:{code:'XX000'}},
  ]) {
    const h=harness({env:paymentEnv,rows:{settings:result}})
    assert.equal((await h.load('app/api/payment/verify/route.ts').POST(smsRequest())).status,503)
    assert.equal(h.calls.some(call=>call.rpc),false)
  }
})

test('raw SMS still relies on atomic SQL exact-amount checks and duplicate handling', async () => {
  for (const [rpcResult,status] of [[{data:null,error:{code:'P0001'}},409],[{data:{success:true,already_confirmed:true,available:false},error:null},200]]) {
    const h=harness({env:paymentEnv,rows:{settings:{data:smsSettings}},rpcResult:()=>rpcResult})
    const result=await h.load('app/api/payment/verify/route.ts').POST(smsRequest())
    assert.equal(result.status,status)
    if(status===200) assert.deepEqual(await result.json(),rpcResult.data)
  }
})

test('SMS body size/type and mixed JSON overrides are rejected before database access', async () => {
  for (const [req,status] of [[smsRequest('x'.repeat(2049)),413],[request({...receipt,sms:sampleSms}),400]]) {
    const h=harness({env:paymentEnv})
    assert.equal((await h.load('app/api/payment/verify/route.ts').POST(req)).status,status)
    assert.equal(h.calls.length,0)
  }
  const h=harness({env:paymentEnv}),req=smsRequest();req.headers.set('content-type','text/html')
  assert.equal((await h.load('app/api/payment/verify/route.ts').POST(req)).status,415);assert.equal(h.calls.length,0)
})

test('admin SMS settings require current admin and same origin, and bind the saved account server-side', async () => {
  for (const status of [401,403]) {
    const h=harness({adminAccess:{ok:false,status,error:'Denied'}})
    assert.equal((await h.load('app/api/admin/payment-connection/route.ts').POST(request(smsConfig))).status,status)
    assert.equal(h.calls.length,0)
  }
  const denied=harness(),req=request(smsConfig);req.headers.set('origin','https://other.example')
  assert.equal((await denied.load('app/api/admin/payment-connection/route.ts').POST(req)).status,403);assert.equal(denied.calls.length,0)
  const h=harness({rows:{settings:{data:{key:'bank_account',value:'5000002086'}}}})
  assert.equal((await h.load('app/api/admin/payment-connection/route.ts').POST(request({...smsConfig,receivingAccount:'forged'}))).status,200)
  const write=h.calls.find(call=>call.action==='upsert').filters.find(filter=>filter[0]==='upsert')[1]
  assert.equal(write.key,'bank_sms_config');assert.deepEqual(JSON.parse(write.value),smsConfig)
})

test('admin SMS settings reject wrong account masks and invalid sender configuration before writes', async () => {
  for (const body of [null,{}, {...smsConfig,accountMask:'5***0860'},{...smsConfig,accountMask:'4***2086'},{...smsConfig,sender:''},{...smsConfig,sender:'*'},{...smsConfig,sender:'a\nb'}]) {
    const h=harness({rows:{settings:{data:{key:'bank_account',value:'5000002086'}}}})
    assert.equal((await h.load('app/api/admin/payment-connection/route.ts').POST(request(body))).status,400)
    assert.equal(h.calls.some(call=>call.action!=='select'),false)
  }
})

test('bank account normalization supports saved IBAN formatting and rebinds if account changes', () => {
  const {normalizeReceivingAccount,validBankSmsConfig}=harness().load('lib/server/khan-bank-sms.ts')
  const iban='MN00 0000 0000 5000 0020 86',normalized='MN00000000005000002086'
  assert.equal(normalizeReceivingAccount(iban),normalized)
  assert.equal(validBankSmsConfig({...smsConfig,receivingAccount:normalized},iban),true)
  assert.equal(validBankSmsConfig({...smsConfig,receivingAccount:normalized},normalized.replace('2086','0860')),false)
  assert.equal(normalizeReceivingAccount('not-an-account'),'')
})

for (const [name, body] of [
  ['ambiguous SMS', { sms: 'Zarlaga 12500 MNT Utga:123456' }],
  ['outgoing transfer', { ...receipt, direction: 'debit' }],
  ['wrong currency', { ...receipt, currency: 'USD' }],
  ['string amount', { ...receipt, amount: '12500' }],
  ['negative amount', { ...receipt, amount: -12500 }],
  ['null payload', null],
]) test(`payment rejects ${name} without accessing database`, async () => {
  const h = harness({ env: paymentEnv })
  const result = await h.load('app/api/payment/verify/route.ts').POST(request(body))
  assert.equal(result.status, 400); assert.equal(h.calls.length, 0)
})

test('payment rejects incorrect amount and never releases driver', async () => {
  const h = harness({ env: paymentEnv, rpcResult: () => ({data:null,error:{code:'P0001'}}) })
  const result = await h.load('app/api/payment/verify/route.ts').POST(request({ ...receipt, amount: 1 }))
  assert.equal(result.status, 409); assert.equal(h.calls.length,1)
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])),{rpc:'confirm_driver_commission',args:{p_code:'123456',p_amount:1}})
})
test('payment secret is required before database access', async () => {
  const h = harness({ env: paymentEnv })
  assert.equal((await h.load('app/api/payment/verify/route.ts').POST(request(receipt, 'wrong'))).status, 401)
  assert.equal(h.calls.length, 0)
})
test('matching bank receipts confirm through the atomic RPC; duplicate receipts are idempotent', async () => {
  for (const used of [false, true]) {
    const h = harness({ env: paymentEnv, rpcResult: () => ({data:{success:true,already_confirmed:used,available:!used},error:null}) })
    const result = await h.load('app/api/payment/verify/route.ts').POST(request(receipt))
    assert.equal(result.status,200)
    const body = await result.json()
    assert.equal(body.already_confirmed,used)
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls)),[{rpc:'confirm_driver_commission',args:{p_code:receipt.code,p_amount:receipt.amount}}])
  }
})

const approvalOrder = '00000000-0000-4000-8000-000000000123'
test('payment approval requires admin authentication and the same origin before writes', async () => {
  for (const access of [{ ok:false, status:401, error:'Unauthorized' }, { ok:false, status:403, error:'Change temporary password' }]) {
    const h = harness({ adminAccess: access })
    assert.equal((await h.load('app/api/admin/drivers/route.ts').POST(request({ action:'release_payment', order_id:approvalOrder }))).status, access.status)
    assert.equal(h.calls.length, 0)
  }
  const h = harness(), req = request({ action:'release_payment', order_id:approvalOrder })
  req.headers.set('origin','https://other.example')
  assert.equal((await h.load('app/api/admin/drivers/route.ts').POST(req)).status, 403)
  assert.equal(h.calls.length, 0)
})
test('approval uses the verified admin session and the selected order, ignoring forged body fields', async () => {
  const h = harness({ rpcResult: () => ({ data: { approved:true, available:true, pending_payments:0 }, error:null }) })
  const result = await h.load('app/api/admin/drivers/route.ts').POST(request({ action:'release_payment', order_id:approvalOrder, id:'another-driver', session_version:'forged' }))
  assert.equal(result.status, 200)
  assert.equal((await result.json()).available, true)
  assert.match(result.headers.get('cache-control'), /no-store/)
  assert.equal(h.calls.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])), { rpc:'admin_approve_driver_payment', args: { p_order_id:approvalOrder, p_session_version:'verified-admin-version' } })
})
test('approval rejects invalid IDs and reports revoked sessions or database conflicts', async () => {
  const invalid = harness()
  assert.equal((await invalid.load('app/api/admin/drivers/route.ts').POST(request({ action:'release_payment', order_id:'bad-id' }))).status, 400)
  assert.equal(invalid.calls.length, 0)
  for (const [code, status] of [['42501',401],['P0001',409]]) {
    const h = harness({ rpcResult: () => ({ data:null, error:{code} }) })
    assert.equal((await h.load('app/api/admin/drivers/route.ts').POST(request({ action:'release_payment', order_id:approvalOrder }))).status,status)
  }
})
test('driver payment settings report automatic matching only with bound SMS settings, never the key or sender', async () => {
  for (const configured of [false,true]) {
    const h = harness({ env:paymentEnv, rows:{settings:{data:configured?smsSettings:smsSettings.filter(row=>row.key!=='bank_sms_config')}} })
    const response = await h.load('app/api/driver/payment-settings/route.ts').GET(request())
    const body = await response.json()
    assert.equal(body.automatic_confirmation,configured)
    assert.equal(body.approval_required,false)
    assert.equal(body.commission_percent,5); assert.equal(body.rounding_step,500)
    assert.equal(JSON.stringify(body).includes(paymentEnv.PAYMENT_WEBHOOK_SECRET),false)
    assert.equal(JSON.stringify(body).includes(smsConfig.sender),false)
  }
})
test('admin dashboard reads the unpaid queue independently from recent trip history', async () => {
  const pending = { id:approvalOrder, code:'123456', amount:12500, total_pending:201 }
  const h = harness({ rows:{drivers:{data:[]},orders:{data:[]},settings:{data:[]}}, rpcResult:name => ({data:name==='admin_pending_driver_payments'?[pending]:null,error:null}) })
  const response = await h.load('app/api/admin/dashboard/route.ts').GET(request())
  assert.equal(response.status,200)
  const body = await response.json()
  assert.equal(body.pendingApprovalCount,201)
  assert.equal(body.pendingPayments[0].id,approvalOrder)
  assert.deepEqual(body.activeOrders,[])
})
test('payment search rejects anonymous, expired and temporary admin sessions before reading data', async () => {
  for (const status of [401, 403, 503]) {
    const h = harness({ adminAccess: { ok:false, status, error:'Denied' } })
    const result = await h.load('app/api/admin/payments/route.ts').GET(new NextRequest('https://achilt.example/api/admin/payments?q=99112233'))
    assert.equal(result.status,status); assert.equal(h.calls.length,0)
    assert.match(result.headers.get('cache-control'),/no-store/)
  }
})
test('payment search sends plate/phone terms and pagination as RPC parameters without exposing secrets', async () => {
  for (const q of ['1234 уба', '+976 9911-2233', '12%34', "x');drop table drivers;--"]) {
    const pending = { id:approvalOrder, car_number:'1234 УБА', driver_phone:'+97699112233', amount:12500 }
    const h = harness({ rpcResult:() => ({ data:{payments:[pending],total:205}, error:null }) })
    const response = await h.load('app/api/admin/payments/route.ts').GET(new NextRequest(`https://achilt.example/api/admin/payments?q=${encodeURIComponent(q)}&offset=200`))
    assert.equal(response.status,200); assert.match(response.headers.get('cache-control'),/no-store/)
    assert.deepEqual(await response.json(),{payments:[pending],total:205})
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls)),[{rpc:'admin_search_driver_payments',args:{p_search:q,p_offset:200}}])
  }
})
test('payment search rejects oversized terms and invalid pagination before reaching the database', async () => {
  for (const query of ['q='+'a'.repeat(41),'offset=-1','offset=1.5','offset=abc','offset=1000001']) {
    const h = harness()
    assert.equal((await h.load('app/api/admin/payments/route.ts').GET(new NextRequest(`https://achilt.example/api/admin/payments?${query}`))).status,400)
    assert.equal(h.calls.length,0)
  }
})
test('payment search distinguishes no matches from database failures', async () => {
  for (const [rpcResult,status] of [
    [()=>({data:{payments:[],total:0},error:null}),200],
    [()=>({data:null,error:{code:'XX000'}}),503],
  ]) {
    const h = harness({rpcResult})
    assert.equal((await h.load('app/api/admin/payments/route.ts').GET(new NextRequest('https://achilt.example/api/admin/payments'))).status,status)
  }
})
test('database lookup error is reported, not mistaken for an invalid payment', async () => {
  const h = harness({ env: paymentEnv, rpcResult:() => ({data:null,error:{code:'XX000'}}) })
  assert.equal((await h.load('app/api/payment/verify/route.ts').POST(request(receipt))).status, 503)
})
test('unknown references and invalid receipts retain distinct errors', async () => {
  for (const [code,status] of [['P0002',404],['22023',400]]) {
    const h = harness({ env:paymentEnv,rpcResult:()=>({data:null,error:{code}}) })
    assert.equal((await h.load('app/api/payment/verify/route.ts').POST(request(receipt))).status,status)
  }
})
test('completion returns the database commission instead of fare or client-supplied amounts', async () => {
  const h = harness({rows:{orders:{data:{id:approvalOrder,driver_id:'driver-a',status:'confirmed',final_price:112820,created_at:new Date().toISOString()}}},
    rpcResult:()=>({data:[{code:'654321',amount:5500,fare_amount:112820,paid:false}],error:null})})
  const response=await h.load('app/api/payment/complete/route.ts').POST(request({order_id:approvalOrder,amount:1,final_price:1}))
  const body=await response.json();assert.equal(response.status,200);assert.equal(body.amount,5500);assert.equal(body.fare_amount,112820)
  const call=h.calls.find(x=>x.rpc);assert.equal(call.rpc,'complete_order_and_issue_commission');assert.equal(call.args.p_amount,undefined)
})
test('webhook key remains private to current admins and is stable without exposing session secrets', async () => {
  for (const status of [401,403]) {
    const h=harness({env:paymentEnv,adminAccess:{ok:false,status,error:'Denied'}})
    const response=await h.load('app/api/admin/payment-connection/route.ts').GET(request())
    assert.equal(response.status,status);assert.equal(JSON.stringify(await response.json()).includes(paymentEnv.PAYMENT_WEBHOOK_SECRET),false)
  }
  const env={SESSION_SECRET:'test-only-session-secret-32-characters-or-longer'},h=harness({env})
  const api=h.load('app/api/admin/payment-connection/route.ts')
  const response=await api.GET(request());const body=await response.json()
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/)
  assert.match(body.secret,/^[a-f0-9]{64}$/);assert.notEqual(body.secret,env.SESSION_SECRET)
  assert.equal(body.url,'https://achilt.example/api/payment/verify')
  assert.equal((await (await api.GET(request())).json()).secret,body.secret)
})
test('completed paid order retry cannot issue a new payment or block driver', async () => {
  const h = harness({ rows: {
    orders: { data: { id: 'order-a', driver_id: 'driver-a', status: 'completed', final_price: 12500 } },
    payment_codes: { data: { code: '123456', amount: 12500, used: true } },
  } })
  const result = await h.load('app/api/payment/complete/route.ts').POST(request({ order_id: 'order-a' }))
  assert.equal(result.status, 200); assert.equal((await result.json()).paid, true)
  assert.equal(h.calls.some(x => x.rpc || x.action !== 'select'), false)
})
test('another driver cannot complete an order', async () => {
  const h = harness({ rows: { orders: { data: { id: 'order-a', driver_id: 'driver-b', status: 'confirmed', final_price: 12500 } } } })
  assert.equal((await h.load('app/api/payment/complete/route.ts').POST(request({ order_id: 'order-a' }))).status, 403)
  assert.equal(h.calls.some(x => x.rpc), false)
})
test('pending payment is recovered by driver ID without browser storage', async () => {
  const h = harness({ rows: { driver_invites: { data: [] }, payment_codes: { data: { code: '123456', amount: '12500', order_id: 'order-a' } } } })
  const result = await h.load('app/api/driver/orders/route.ts').GET(request())
  assert.equal(result.status, 200)
  assert.deepEqual((await result.json()).pendingPayment, { code: '123456', amount: 12500, order_id: 'order-a' })
  const lookup = h.calls.find(x => x.table === 'payment_codes')
  assert.ok(lookup.filters.some(x => x[0] === 'eq' && x[1] === 'driver_id' && x[2] === 'driver-a'))
  assert.ok(lookup.filters.some(x => x[0] === 'eq' && x[1] === 'used' && x[2] === false))
})
test('native order polling returns only the authenticated driver location and cannot choose another driver', async () => {
  const driver = { id: 'driver-a', available: false, lat: 47.9, lng: 106.9, location_updated_at: '2026-01-01T00:00:00Z', phone: '+97600000000', pin_hash: 'never-return' }
  const h = harness({ driver, rows: { driver_invites: { data: [] } } })
  const result = await h.load('app/api/driver/orders/route.ts').GET(new NextRequest('https://achilt.example/api/driver/orders?driver_id=driver-b'))
  const body = await result.json()
  assert.deepEqual(body.driverLocation, { lat: driver.lat, lng: driver.lng, location_updated_at: driver.location_updated_at })
  assert.equal(JSON.stringify(body).includes('never-return'), false)
  for (const lookup of h.calls) assert.ok(lookup.filters.some(x => x[0] === 'eq' && x[1] === 'driver_id' && x[2] === 'driver-a'))
})
test('driver logout expires the native shared cookie with secure attributes and no caching', async () => {
  const result = await harness({ env: { NODE_ENV: 'production' } }).load('app/api/driver/logout/route.ts').POST()
  assert.equal(result.status, 200)
  assert.match(result.headers.get('cache-control'), /no-store/)
  for (const flag of [/Max-Age=0/i, /HttpOnly/i, /Secure/i, /SameSite=lax/i, /Path=\//i]) assert.match(result.headers.get('set-cookie'), flag)
})
test('invalid PIN rejects profile changes before writes', async () => {
  const h = harness()
  assert.equal((await h.load('app/api/driver/profile/route.ts').POST(request({ name: 'Test', car_type: 'butten', new_pin: '1234' }))).status, 400)
  assert.equal(h.calls.length, 0)
})
test('missing, null and coerced coordinates cannot put a driver at 0,0', async () => {
  for (const coordinates of [{}, { lat:null, lng:null }, { lat:'', lng:'' }, { lat:false, lng:true }, { lat:91, lng:106 }]) {
    const h = harness()
    assert.equal((await h.load('app/api/driver/location/route.ts').POST(request(coordinates))).status, 400)
    assert.equal(h.calls.length, 0)
  }
})
test('location response preserves unavailability while payment is pending', async () => {
  const h = harness({ blocked: true })
  const result = await h.load('app/api/driver/location/route.ts').POST(request({ lat:47.9, lng:106.9, available:true }))
  assert.equal(result.status, 200); assert.equal((await result.json()).available, false)
  assert.equal(h.calls[0].filters.find(x => x[0] === 'update')[1].available, undefined)
})
test('admin database failure cannot appear as an empty healthy dashboard', async () => {
  const h = harness({ rows: { drivers: { error: { code: 'XX000' } } } })
  assert.equal((await h.load('app/api/admin/dashboard/route.ts').GET(request())).status, 503)
})
const keys = { p256dh: Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url'), auth: Buffer.alloc(16,2).toString('base64url') }
const sub = endpoint => ({ endpoint, keys })
test('push permits supported HTTPS providers and rejects arbitrary/private endpoints', () => {
  const valid = harness().load('lib/server/push-subscription.ts').isValidPushSubscription
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/test','https://updates.push.services.mozilla.com/wpush/v2/test','https://web.push.apple.com/test']) assert.equal(valid(sub(endpoint)), true)
  for (const endpoint of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://169.254.169.254/x','https://fcm.googleapis.com.evil.example/x','https://evil.example/push','https://fcm.googleapis.com:8443/x','https://user:password@fcm.googleapis.com/x']) assert.equal(valid(sub(endpoint)), false)
  assert.equal(valid({ endpoint:'https://fcm.googleapis.com/x',keys:{auth:'bad',p256dh:'bad'} }), false)
})
test('disabled driver cannot replace a push subscription', async () => {
  const h = harness({ driver:null })
  assert.equal((await h.load('app/api/push/subscribe/route.ts').POST(request({ subscription: sub('https://fcm.googleapis.com/test') }))).status, 401)
  assert.equal(h.calls.length, 0)
})
test('partial push failure marks only delivered invites and cleans up expired subscription', async () => {
  const h = harness({ env:{NEXT_PUBLIC_VAPID_PUBLIC_KEY:'test',VAPID_PRIVATE_KEY:'test'}, rows:{
    orders:{data:{id:'order-a',status:'pending',from_address:'Test'}},
    driver_invites:{data:[{id:'invite-a',driver_id:'driver-a'},{id:'invite-b',driver_id:'driver-b'},{id:'invite-c',driver_id:'driver-c'}]},
    push_subscriptions:{data:[{id:'sub-a',driver_id:'driver-a',subscription:sub('https://fcm.googleapis.com/success')},{id:'sub-b',driver_id:'driver-b',subscription:sub('https://fcm.googleapis.com/expired')}]},
  }, send:async (subscription, payload, options) => {
    assert.equal(options.timeout,5000)
    assert.equal(JSON.parse(payload).url,'/driver')
    if(subscription.endpoint.endsWith('/expired')) throw {statusCode:410}
  } })
  const result = await h.load('lib/server/push.ts').notifyOrderInvites('order-a')
  assert.equal(result.sent,1); assert.equal(result.invited,3)
  const marked = h.calls.find(x => x.table === 'driver_invites' && x.action === 'update')
  assert.deepEqual(Array.from(marked.filters.find(x=>x[0]==='in')[2]),['invite-a'])
  assert.ok(h.calls.some(x=>x.table==='push_subscriptions' && x.action==='delete'))
})

test('driver without a vehicle type cannot go online', async () => {
  for (const route of ['availability', 'location']) {
    const h = harness({ driver: { id:'driver-a', available:false, car_type:null } })
    const result = await h.load(`app/api/driver/${route}/route.ts`).POST(request({ available:true, lat:47.9, lng:106.9 }))
    assert.equal(result.status,409); assert.equal(h.calls.length,0)
  }
})


test('selection push targets only the assigned driver and keeps contacts off the lock screen', async () => {
  const sent = []
  const h = harness({ env: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'test', VAPID_PRIVATE_KEY: 'test' }, rows: {
    orders: { data: { id: 'order-a', driver_id: 'driver-a', status: 'confirmed' } },
    push_subscriptions: { data: [{ id: 'sub-a', driver_id: 'driver-a', subscription: sub('https://fcm.googleapis.com/selected') }] },
  }, send: async (subscription, payload) => sent.push(JSON.parse(payload)) })
  assert.equal((await h.load('lib/server/push.ts').notifySelectedDriver('order-a')).sent, 1)
  const lookup = h.calls.find(q => q.table === 'push_subscriptions')
  assert.ok(lookup.filters.some(f => f[0] === 'eq' && f[1] === 'driver_id' && f[2] === 'driver-a'))
  assert.equal(sent[0].type, 'ORDER_SELECTED'); assert.equal(sent[0].url, '/driver')
  assert.equal(sent[0].title, 'Таны саналыг сонголоо')
  assert.equal(sent[0].phone, undefined)
})

test('pending or finished orders cannot generate a selected-driver push', async () => {
  for (const status of ['pending','completed','cancelled']) {
    const h = harness({ env: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'test', VAPID_PRIVATE_KEY: 'test' }, rows: {
      orders: { data: { id: 'order-a', driver_id: 'driver-a', status } },
    }, send: async () => { throw new Error('Must not send') } })
    assert.equal((await h.load('lib/server/push.ts').notifySelectedDriver('order-a')).sent, 0)
    assert.equal(h.calls.some(q => q.table === 'push_subscriptions'), false)
  }
})
