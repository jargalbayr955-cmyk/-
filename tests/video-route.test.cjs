/* eslint-disable @typescript-eslint/no-require-imports -- Execute real route with isolated network/auth dependencies. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript'), next = require('next/server')
const id='00000000-0000-4000-8000-000000000001', instance='00000000-0000-4000-8000-000000000002'
const body={order_id:id,instance_id:instance,role:'customer',action:'state'}
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
function harness({customer={id:'owner'},driver={id:'selected-driver'},allowed=true,configured=true,error=null}={}){
 const exports={}, calls=[],auth=[],turn=[]
 vm.runInNewContext(compile('app/api/order/video/route.ts'),{exports,console:{warn(){}},require(name){
  if(name==='next/server')return next
  if(name.endsWith('/customer'))return {requireCustomer:async()=>{auth.push('customer');return customer}}
  if(name.endsWith('/driver'))return {requireDriver:async()=>{auth.push('driver');return driver}}
  if(name.endsWith('/security'))return {allowRequest:async()=>allowed}
  if(name.endsWith('/video-turn'))return {videoIsConfigured:()=>configured,videoIceServers:async()=>{turn.push(1);return [{urls:['turn:relay.example'],username:'short',credential:'temporary'}]}}
  if(name.endsWith('/supabase-admin'))return {getSupabaseAdmin:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{call:null},error}}})}
  throw Error(name)
 }})
 return {calls,auth,turn,run(value=body,headers={}){return exports.POST(new next.NextRequest('https://achilt.example/api/order/video',{method:'POST',body:typeof value==='string'?value:JSON.stringify(value),headers}))}}
}
test('video API binds the actor to the selected session role; IDs in body cannot impersonate users',async()=>{
 for(const role of ['customer','driver']){
  const h=harness();const r=await h.run({...body,role,actor_id:'intruder',p_actor_id:'intruder',p_enabled:true})
  assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/)
  assert.equal(h.calls[0].args.p_actor_id,role==='customer'?'owner':'selected-driver');assert.deepEqual(h.auth,[role]);assert.equal(h.turn.length,0)
 }
})
test('unauthenticated, cross-origin and rate-limited calls do not touch order state or TURN',async()=>{
 for(const [options,headers,status] of [[{customer:null},{},401],[{allowed:false},{},429],[{}, {origin:'https://evil.example'},403],[{}, {'sec-fetch-site':'cross-site'},403]]){
  const h=harness(options);assert.equal((await h.run(body,headers)).status,status);assert.equal(h.calls.length,0);assert.equal(h.turn.length,0)
 }
})
test('bad IDs, operations, SDP and oversized bodies are rejected',async()=>{
 for(const value of [null,{},'bad json',{...body,order_id:'bad'},{...body,instance_id:7},{...body,role:'admin'},{...body,action:'delete'},{...body,action:'start'},{...body,action:'answer',call_id:id,sdp:'bad'}])assert.equal((await harness().run(value)).status,400)
 assert.equal((await harness().run('x'.repeat(80001))).status,413)
})
test('TURN credentials require order authorization first and are only returned for prepare',async()=>{
 const h=harness();assert.equal((await h.run({...body,action:'prepare'})).status,200);assert.equal(h.calls[0].args.p_action,'state');assert.equal(h.turn.length,1)
 for(const message of ['Not allowed','Order unavailable']){
  const deny=harness({error:{message}});assert.equal((await deny.run({...body,action:'prepare'})).status,403);assert.equal(deny.turn.length,0)
 }
 const off=harness({configured:false});const r=await off.run();assert.equal((await r.json()).ready,false)
 assert.equal((await off.run({...body,action:'prepare'})).status,503);assert.equal(off.turn.length,0)
})
for(const [message,status] of [['Call busy',409],['Other device',409],['Call unavailable',409],['Video disabled',503],['private database error',503]])test(`call error ${message} is handled safely`,async()=>{
 const h=harness({error:{message}});const r=await h.run({...body,action:'start',call_id:id,sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'})
 assert.equal(r.status,status);assert.equal(h.calls[0].args.p_sdp.startsWith('v=0'),true)
 assert.equal(JSON.stringify(await r.json()).includes('private database error'),false)
})
test('Cloudflare TURN secrets remain server side and port 53 is excluded',async()=>{
 const exports={},requests=[],env={CLOUDFLARE_TURN_KEY_ID:'test-key-123',CLOUDFLARE_TURN_API_TOKEN:'server-secret'}
 let result={iceServers:[{urls:['stun:relay.example:3478','stun:relay.example:53']},{urls:['turn:relay.example:3478?transport=udp','turns:relay.example:443?transport=tcp','turn:relay.example:53'],username:'short-user',credential:'short-secret',other:'ignored'}]}
 vm.runInNewContext(compile('lib/server/video-turn.ts'),{exports,process:{env},AbortSignal,require(){return{}},fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>result}}})
 const servers=await exports.videoIceServers();assert.match(requests[0].url,/^https:\/\/rtc.live.cloudflare.com\/v1\/turn\/keys\/test-key-123\//)
 assert.equal(requests[0].options.headers.Authorization,'Bearer server-secret');assert.equal(JSON.parse(requests[0].options.body).ttl,900)
 const output=JSON.stringify(servers);assert.equal(output.includes(':53'),false);assert.equal(output.includes('server-secret'),false);assert.equal(output.includes('other'),false);assert.match(output,/:443/)
 result={iceServers:[{urls:['stun:relay.example:3478']}]};await assert.rejects(exports.videoIceServers(),/VIDEO_PROVIDER_UNAVAILABLE/)
 env.CLOUDFLARE_TURN_API_TOKEN='';assert.equal(exports.videoIsConfigured(),false);await assert.rejects(exports.videoIceServers(),/VIDEO_NOT_CONFIGURED/)
})
