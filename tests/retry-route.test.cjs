/* eslint-disable @typescript-eslint/no-require-imports -- Exercise retry route with isolated I/O. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const next = require('next/server')
const orderId='00000000-0000-4000-8000-000000000001'
function harness({ user={id:'owner',phone:'+97600000000'}, allowed=true, error=null }={}) {
  const calls=[], tasks=[], pushes=[]; let created=false
  const exports={}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../app/api/order/retry/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
    exports, console:{error(){},warn(){}}, require(name){
      if(name==='next/server')return {...next,after:fn=>tasks.push(fn)}
      if(name.endsWith('/customer'))return {requireCustomer:async()=>user}
      if(name.endsWith('/security'))return {allowRequest:async()=>allowed,getClientIp:()=> 'test'}
      if(name.endsWith('/push'))return {notifyOrderInvites:async id=>pushes.push(id)}
      if(name.endsWith('/supabase-admin'))return {getSupabaseAdmin:()=>({rpc:async(name,args)=>{
        calls.push({name,args});if(error)return {error}
        const result={order:{id:'replacement'},created:!created,bidding_expires_at:'2026-09-22T00:10:00Z'};created=true;return {data:result}
      }})}
      throw Error(name)
    }
  })
  return {calls,tasks,pushes,run(body={order_id:orderId}){return exports.POST(new next.NextRequest('https://achilt.example/api/order/retry',{method:'POST',body:JSON.stringify(body)}))}}
}
test('lost-response retries reuse one order and schedule push only once',async()=>{
  const h=harness(); const a=await h.run();const b=await h.run()
  assert.equal(a.status,200);assert.equal(b.status,200)
  assert.equal((await a.json()).order.id,(await b.json()).order.id)
  assert.equal(h.tasks.length,1);assert.equal(h.pushes.length,0)
  assert.match(a.headers.get('cache-control'),/no-store/)
  for(const fn of h.tasks)await fn()
  assert.deepEqual(h.pushes,['replacement'])
  assert.equal(h.calls[0].args.p_customer_id,'owner')
  assert.equal(h.calls[0].args.p_customer_phone,'+97600000000')
})
test('authentication, rate limit and invalid IDs reject before retry transaction',async()=>{
  for(const [options,status] of [[{user:null},401],[{allowed:false},429]]){
    const h=harness(options);assert.equal((await h.run()).status,status);assert.equal(h.calls.length,0)
  }
  for(const body of [null,{}, {order_id:'invalid'}, {order_id:2}]){
    const h=harness();assert.equal((await h.run(body)).status,400);assert.equal(h.calls.length,0)
  }
})
for(const [message,status] of [['Order not found',404],['Order already selected',409],['Bidding still active',409],['Database unavailable',503]])test(`retry reports ${message} and never notifies`,async()=>{
  const h=harness({error:{message,code:'test'}});assert.equal((await h.run()).status,status);assert.equal(h.tasks.length,0)
})
