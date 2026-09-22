/* eslint-disable @typescript-eslint/no-require-imports -- Real call lifecycle with fake media devices and signaling transport. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto')
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const flush=()=>new Promise(resolve=>setImmediate(resolve))
class Track {constructor(kind){this.kind=kind;this.enabled=true;this.stopped=false} stop(){this.stopped=true}}
class Stream {constructor(tracks=[]){this.tracks=[...tracks]} getTracks(){return this.tracks} getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio')}getVideoTracks(){return this.tracks.filter(t=>t.kind==='video')}addTrack(t){this.tracks.push(t)}}
const sdp='v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=candidate:1 1 udp 1 192.0.2.1 10000 typ host\r\n'
function server(){
 let call=null;const requests=[]
 return {requests,get call(){return call},end(){call.status='ended'},async fetch(url,opts){
  const b=JSON.parse(opts.body);requests.push(b)
  if(b.action==='start')call={id:b.call_id,status:'ringing',caller_role:b.role,caller_instance:b.instance_id,offer_sdp:b.sdp,answer_sdp:null,expires_at:new Date(Date.now()+60000).toISOString()}
  if(b.action==='answer'){call.status='active';call.callee_instance=b.instance_id;call.answer_sdp=b.sdp;call.expires_at=new Date(Date.now()+600000).toISOString()}
  if(['end','decline'].includes(b.action)&&call?.id===b.call_id)call.status=b.action==='end'?'ended':'declined'
  const owned=call&&(call.caller_role===b.role?call.caller_instance===b.instance_id:call.callee_instance===b.instance_id)
  return {ok:true,json:async()=>({ready:true,call:call?{...call,owned:!!owned}:null,...(b.action==='prepare'?{iceServers:[{urls:['turn:relay.example'],username:'short',credential:'temporary'}]}:{})})}
 }
 }
}
function harness(role,server,{legacySignals=false}={}){
 const states=[],streams=[],peers=[],timers=new Map(),events={},docEvents={},captures=[],cache={}
 let media=null,fetcher=server.fetch.bind(server),sequence=0
 const document={visibilityState:'visible',addEventListener:(n,f)=>docEvents[n]=f,removeEventListener:n=>delete docEvents[n]}
 class Peer {
  constructor(){this.connectionState='new';this.iceGatheringState='complete';this.senders=[];peers.push(this)}
  close(){this.closed=true;this.connectionState='closed'}addEventListener(){}removeEventListener(){}
  addTrack(track){const sender={track,getParameters:()=>({encodings:[{}]}),setParameters:async()=>{},replaceTrack:async t=>{sender.track=t}};this.senders.push(sender);return sender}
  getSenders(){return this.senders}async createOffer(){return {type:'offer',sdp}}async createAnswer(){return {type:'answer',sdp}}
  async setLocalDescription(value){this.localDescription=value}async setRemoteDescription(value){this.remoteDescription=value}
  connect(){this.connectionState='connected';this.onconnectionstatechange?.()}
 }
 const navigator={mediaDevices:{getUserMedia:async constraints=>{captures.push(constraints);if(media)return media(constraints);const stream=new Stream([...(constraints.audio?[new Track('audio')]:[]),new Track('video')]);streams.push(stream);return stream}},vibrate(){}}
 function load(file){if(cache[file])return cache[file];const exports={};cache[file]=exports
  vm.runInNewContext(compile(file),{exports,Error,Date,crypto,AbortController,AbortSignal:legacySignals?{}:AbortSignal,MediaStream:Stream,RTCPeerConnection:Peer,document,navigator,window:{addEventListener:(n,f)=>events[n]=f,removeEventListener:n=>delete events[n]},fetch:(...args)=>fetcher(...args),setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id},clearInterval:id=>timers.delete(id),require:name=>{if(name==='@/lib/video-call')return load('lib/video-call.ts');if(name==='@/lib/client/request-signal')return load('lib/client/request-signal.ts');if(name==='@/lib/client/request-id')return load('lib/client/request-id.ts');throw Error(name)}});return exports
 }
 const session=new(load('lib/client/video-call.ts').OrderVideoSession)('order',role,value=>states.push(value))
 return {session,streams,peers,states,timers,events,docEvents,document,captures,get state(){return states.at(-1)},setMedia(fn){media=fn},setFetch(fn){fetcher=fn}}
}
for(const legacySignals of [false,true]) test(`two participants negotiate, mute/switch, hang up and release all media (legacy browser: ${legacySignals})`,async()=>{
 const wire=server(),a=harness('customer',wire,{legacySignals}),b=harness('driver',wire,{legacySignals})
 await a.session.poll();await b.session.poll();assert.equal(a.captures.length+b.captures.length,0)
 await a.session.callPeer();assert.equal(a.state.phase,'ringing');await b.session.poll();assert.equal(b.state.phase,'incoming');assert.equal(b.captures.length,0)
 await b.session.callPeer(true);await a.session.poll();assert.equal(a.peers[0].remoteDescription.type,'answer');assert.equal(b.peers[0].remoteDescription.type,'offer')
 a.peers[0].connect();b.peers[0].connect();assert.equal(a.state.phase,'connected');assert.equal(b.state.phase,'connected')
 a.session.microphone();a.session.camera();assert.equal(a.streams[0].getAudioTracks()[0].enabled,false);assert.equal(a.streams[0].getVideoTracks()[0].enabled,false)
 await a.session.switchCamera();assert.equal(a.streams[0].getVideoTracks()[0].stopped,true);assert.equal(a.state.local.getVideoTracks()[0].enabled,false)
 b.session.hangup();await a.session.poll();assert.equal(a.state.phase,'idle');assert.equal(a.peers[0].closed,true)
 for(const h of [a,b]){assert(h.streams.flatMap(s=>s.getTracks()).every(t=>t.stopped));h.session.dispose();assert.equal(h.timers.size,0)}
})
test('declining an incoming call never opens the camera',async()=>{
 const wire=server(),a=harness('driver',wire),b=harness('customer',wire)
 await a.session.callPeer();await b.session.poll();b.session.hangup();await a.session.poll()
 assert.equal(wire.call.status,'declined');assert.equal(b.captures.length,0);assert.equal(a.state.phase,'idle');a.session.dispose();b.session.dispose()
})
test('closing or backgrounding a connected page stops local tracks and heartbeat timers',async()=>{
 for(const event of ['pagehide','visibilitychange']){
  const wire=server(),a=harness('customer',wire);a.session.startPolling();await flush();await a.session.callPeer()
  if(event==='pagehide')a.events.pagehide();else{a.document.visibilityState='hidden';a.docEvents.visibilitychange()}
  assert.equal(wire.call.status,'ended');assert(a.streams[0].getTracks().every(t=>t.stopped));a.session.dispose();assert.equal(a.timers.size,0);assert.deepEqual(Object.keys(a.events),[])
 }
})
test('cancel while camera permission is pending releases late camera streams',async()=>{
 const wire=server(),a=harness('customer',wire);let resolve
 a.setMedia(()=>new Promise(done=>resolve=done));const promise=a.session.callPeer();await flush();a.session.hangup()
 const stream=new Stream([new Track('audio'),new Track('video')]);resolve(stream);await promise
 assert(stream.getTracks().every(t=>t.stopped));assert.equal(wire.requests.some(r=>r.action==='start'),false);assert.equal(a.state.phase,'idle');a.session.dispose()
})
test('cancel during a late start response ends the committed call and cannot revive camera',async()=>{
 const wire=server(),a=harness('customer',wire);let resolve
 a.setFetch(async(url,opts)=>{const result=await wire.fetch(url,opts);if(JSON.parse(opts.body).action==='start')await new Promise(done=>resolve=done);return result})
 const promise=a.session.callPeer();await flush();a.session.hangup();resolve();await promise
 assert.equal(wire.call.status,'ended');assert.equal(a.state.phase,'idle');assert(a.streams[0].getTracks().every(t=>t.stopped));a.session.dispose()
})
test('permission denied, order revoked and connection failed all close media with usable errors',async()=>{
 const wire=server(),a=harness('customer',wire)
 a.setMedia(async()=>{const error=new Error('denied');error.name='NotAllowedError';throw error});await a.session.callPeer();assert.match(a.state.message,/зөвшөөрлөө/);assert.equal(wire.call,null)
 a.setMedia(null);await a.session.callPeer();a.setFetch(async()=>({ok:false,status:403,json:async()=>({error:'Order unavailable'})}));await a.session.poll()
 assert.equal(a.state.ready,false);assert(a.streams[0].getTracks().every(t=>t.stopped));a.session.dispose()
 const b=harness('driver',server());await b.session.callPeer();b.peers[0].connectionState='failed';b.peers[0].onconnectionstatechange();assert.equal(b.state.phase,'idle');assert(b.streams[0].getTracks().every(t=>t.stopped));b.session.dispose()
})
test('second device does not take over an existing caller session or open a camera',async()=>{
 const wire=server(),a=harness('customer',wire),b=harness('customer',wire)
 await a.session.callPeer();await b.session.poll();assert.equal(b.state.phase,'busy');await b.session.callPeer();assert.equal(b.captures.length,0)
 b.session.dispose();assert.equal(wire.call.status,'ringing');a.session.dispose();assert.equal(wire.call.status,'ended')
})
test('lost answer response ends the call instead of leaving accepted camera capture running',async()=>{
 const wire=server(),a=harness('customer',wire),b=harness('driver',wire)
 await a.session.callPeer();await b.session.poll();b.setFetch(async(url,opts)=>{const r=await wire.fetch(url,opts);if(JSON.parse(opts.body).action==='answer')throw Error('lost response');return r})
 await b.session.callPeer(true);assert.equal(wire.call.status,'ended');assert(b.streams[0].getTracks().every(t=>t.stopped));a.session.dispose();b.session.dispose()
})
test('legacy browser times out a stalled response body and can retry the video request',async()=>{
 const wire=server(),a=harness('customer',wire,{legacySignals:true});let signal
 a.setFetch(async(url,opts)=>{signal=opts.signal;return {ok:true,json:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))}})
 const pending=a.session.poll();await flush()
 const deadline=[...a.timers.values()].find(timer=>timer.ms===15000);assert(deadline);deadline.fn();await pending
 assert.equal(signal.aborted,true);assert.match(a.state.message,/Сүлжээгээ шалгаад/);assert.equal(a.timers.size,0)
 a.setFetch(wire.fetch.bind(wire));await a.session.poll();assert.equal(a.state.ready,true)
 await a.session.callPeer();assert.equal(a.state.phase,'ringing');assert.equal(a.state.message,'')
 a.session.dispose();assert.equal(a.timers.size,0)
})
test('disposing a legacy browser session aborts pending requests without publishing a late error',async()=>{
 const a=harness('customer',server(),{legacySignals:true});let signal
 a.setFetch((url,opts)=>{signal=opts.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))})
 const pending=a.session.poll();a.session.dispose();await pending
 assert.equal(signal.aborted,true);assert.equal(a.timers.size,0);assert.equal(a.states.length,0)
})
