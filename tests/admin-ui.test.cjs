/* eslint-disable @typescript-eslint/no-require-imports -- Exercise real admin event handlers with isolated HTTP, history and timer boundaries. */
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript')

function harness(file = 'app/admin/page.tsx', name = 'default', initialProps = {}) {
  const hooks = [], effects = [], requests = [], timers = new Map(), cache = new Map()
  let cursor = 0, dirty = false, nodes = [], props = initialProps, timerId = 0, screens = ['overview'], position = 0
  const equal = (a,b) => a && b && a.length === b.length && a.every((v,i)=>Object.is(v,b[i]))
  const react = {
    useState(value) { const i=cursor++; if (!hooks[i]) hooks[i]={value:typeof value==='function'?value():value}; return [hooks[i].value,next=>{ const value=typeof next==='function'?next(hooks[i].value):next; if(!Object.is(hooks[i].value,value)){hooks[i].value=value;dirty=true} }] },
    useRef(value) { const i=cursor++; return hooks[i]??=( {current:value} ) },
    useCallback(fn,deps) { const i=cursor++; if(!hooks[i]||!equal(hooks[i].deps,deps))hooks[i]={deps,fn};return hooks[i].fn },
    useEffect(fn,deps) { const i=cursor++,old=hooks[i]; if(!old||!equal(old.deps,deps)){hooks[i]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();hooks[i].cleanup=fn()})} },
  }
  const navigate=(screen,replace=false)=>{if(replace)screens[position]=screen;else{screens=screens.slice(0,position+1);screens.push(screen);position++}dirty=true}
  const back=()=>{if(!position)return false;position--;dirty=true;return true}
  const children=Object.fromEntries(['AdminPasswordForm','AdminPaymentPanel','AdminSettings','AdminDriverMap','AdminPaymentConnection'].map(name=>[name,function Stub(){}]))
  const document={visibilityState:'visible',addEventListener(){},removeEventListener(){}}
  function load(filename) {
    if(cache.has(filename))return cache.get(filename)
    const exports={};cache.set(filename,exports)
    const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',filename),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
    vm.runInNewContext(source,{exports,AbortController,Date,Intl,console,document,
      fetch:(url,init)=>new Promise((resolve,reject)=>requests.push({url,init,resolve,reject})),
      setInterval:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id},clearInterval:id=>timers.delete(id),
      setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id),
      require(module){
        if(module==='react')return react
        if(module==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})}
        if(module==='next/navigation')return {useRouter:()=>({push(){}})}
        if(module==='next/image')return {__esModule:true,default:'img'}
        if(module.endsWith('.module.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})}
        if(module.endsWith('/use-screen-history'))return {useScreenHistory:()=>({screen:screens[position],navigate,back})}
        if(module.endsWith('/navigation'))return {readScreen:()=>({value:screens[position]}),backInApp(){}}
        if(/admin-(password-form|payment-panel|settings|driver-map|payment-connection)$/.test(module))return children
        if(module.startsWith('@/'))return load(module.slice(2)+'.ts')
        throw Error('Unexpected module: '+module)
      },
    },{filename})
    return exports
  }
  const component=load(file)[name]
  function render() {
    cursor=0;dirty=false;nodes=[]
    const tree=component(props)
    function walk(node){if(Array.isArray(node)){node.forEach(walk);return}if(!node||typeof node!=='object')return;nodes.push(node);if(node.props.ref)node.props.ref.current={focus(){}};walk(node.props.children)}
    walk(tree);while(effects.length)effects.shift()();if(dirty)render()
  }
  const text=node=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):''
  const find=predicate=>{const node=nodes.find(predicate);assert.ok(node,'Expected control');return node}
  render()
  return {
    requests,children,load,
    get screen(){return screens[position]},get text(){return nodes.filter(node=>['h1','h2','h3','p','button','output','span','strong'].includes(node.type)).map(text).join('\n')},
    child(name){return nodes.find(node=>node.type===children[name])},
    input(id,value){const n=find(node=>node.props.id===id);n.props.onChange({target:{value}});render()},
    button(label){return find(node=>node.type==='button'&&text(node)===label)},
    click(label){const n=this.button(label);assert.ok(!n.props.disabled,'Enabled button');const result=n.props.onClick?.();if(dirty)render();return result},
    submit(index=0){nodes.filter(node=>node.type==='form')[index].props.onSubmit({preventDefault(){}});if(dirty)render()},
    async reply(index,status,body){requests[index].resolve({status,ok:status>=200&&status<300,json:async()=>body});await this.flush()},
    async flush(){for(let i=0;i<20;i++){await Promise.resolve();if(dirty)render()}},
    update(next){props={...props,...next};render()},
    back(){back();render()},
    tick(ms){for(const timer of [...timers.values()])if(timer.ms===ms)timer.fn();if(dirty)render()},
    unmount(){for(const hook of hooks)hook?.cleanup?.()},
  }
}
const drivers=[
  {id:'a',name:'Бат',phone:'+97699112233',car_type:'butten',car_number:'1234 УБА',active:true,available:true},
  {id:'b',name:'Дорж',phone:'+97688112233',car_type:'chiregch',car_number:'5678 УББ',active:false,available:true},
]
const dashboard={drivers,orders:[],activeOrders:[],pendingApprovalCount:4,heroUrl:'',bankName:'',bankAccount:''}
async function ready(){const h=harness();await h.reply(0,200,{mustChangePassword:false});await h.reply(1,200,dashboard);return h}

test('admin waits for session; temporary credentials cannot load private dashboard',async()=>{
  const h=harness();assert.equal(h.requests.length,1);assert.match(h.text,/нэвтрэлтийг шалгаж/)
  await h.reply(0,200,{mustChangePassword:true});assert.ok(h.child('AdminPasswordForm'));assert.equal(h.requests.length,1);h.unmount()
})
test('overview leads to distinct payment, driver and settings areas',async()=>{
  const h=await ready();assert.equal(h.screen,'overview');assert.match(h.text,/Төлбөр авах дансаа тохируулна/)
  h.click('Банкны данс тохируулах →');assert.ok(h.child('AdminSettings'));assert.equal(h.child('AdminPaymentPanel'),undefined)
  h.back();h.click('Төлбөр шалгах →');assert.ok(h.child('AdminPaymentPanel'));h.child('AdminPaymentPanel').props.onConfigure();await h.flush();assert.ok(h.child('AdminSettings'));h.unmount()
})
test('driver filters match spaced Cyrillic plates and phones; unavailable registrations cannot appear ready',()=>{
  const h=harness(),{filterAdminDrivers}=h.load('lib/client/admin-view.ts')
  assert.deepEqual(Array.from(filterAdminDrivers(drivers,'12 34 уба','all'),d=>d.id),['a'])
  assert.deepEqual(Array.from(filterAdminDrivers(drivers,'9911-2233','all'),d=>d.id),['a'])
  assert.deepEqual(Array.from(filterAdminDrivers(drivers,'','available'),d=>d.id),['a'])
  assert.deepEqual(Array.from(filterAdminDrivers(drivers,'','paused'),d=>d.id),['b']);h.unmount()
})
test('adding from overview submits once and shows the temporary PIN on the driver screen',async()=>{
  const h=await ready();h.click('Жолооч бүртгэх →');h.input('new-driver-phone','99000000');h.submit();h.submit()
  assert.equal(h.requests.filter(r=>r.url==='/api/admin/drivers').length,1)
  assert.equal(JSON.parse(h.requests[2].init.body).driver.phone,'99000000')
  await h.reply(2,200,{success:true,pin:'123456'});assert.equal(h.screen,'drivers');assert.match(h.text,/123456/)
  h.click('PIN-ийг дамжуулсан · Хаах');assert.doesNotMatch(h.text,/123456/);h.unmount()
})
test('PIN reset needs a specific-driver confirmation and clears the PIN when leaving drivers',async()=>{
  const h=await ready();h.click('Захиалга авахад бэлэн1Нийт 2 жолооч бүртгэлтэй →');h.click('PIN шинэчлэх');assert.equal(h.requests.length,2)
  assert.match(h.text,/Бат · \+97699112233/);h.click('Болих');assert.equal(h.requests.length,2)
  h.click('PIN шинэчлэх');h.click('Тийм, PIN шинэчлэх');assert.equal(JSON.parse(h.requests[2].init.body).id,'a')
  await h.reply(2,200,{pin:'654321'});assert.match(h.text,/654321/)
  h.click('07ТохиргооБанк, автомат нээлт, зураг, нууц үг');h.back();assert.doesNotMatch(h.text,/654321/);h.unmount()
})
test('logout clears private state and ignores a late dashboard response',async()=>{
  const h=await ready();h.tick(10000);const late=h.requests.length-1;h.click('Гарах');const logout=h.requests.length-1
  await h.reply(logout,200,{success:true});await h.reply(late,200,dashboard);assert.match(h.text,/Админаар нэвтрэх/);assert.doesNotMatch(h.text,/Төлбөр авах дансаа/);h.unmount()
})
test('settings preserve typed drafts during parent refresh and save bank/account together once',async()=>{
  let saved=0,expired=0
  const h=harness('app/components/admin-settings.tsx','AdminSettings',{initial:dashboard,onSaved:()=>saved++,onPassword(){},onSessionExpired:()=>expired++})
  h.input('admin-bank-name','Хаан банк');h.input('admin-bank-account','5000002086');h.update({initial:{...dashboard,bankName:'old'}});h.submit();h.submit()
  assert.equal(h.requests.length,1);assert.deepEqual(JSON.parse(h.requests[0].init.body),{key:'bank_details',value:{bank_name:'Хаан банк',bank_account:'5000002086'}})
  await h.reply(0,503,{error:'Хадгалж чадсангүй.'});assert.equal(saved,0);assert.match(h.text,/Хадгалж чадсангүй/)
  h.submit();await h.reply(1,200,{success:true});assert.equal(saved,1);assert.match(h.text,/Данс хадгалагдлаа/);assert.equal(expired,0);h.unmount()
})
test('manual payment approval shows the exact amount/code first, and changed amounts require review again',()=>{
  const calls=[],payment={id:'o1',driver_id:'a',driver_name:'Бат',driver_phone:'99112233',car_number:'1234 УБА',code:'123456',amount:5500}
  const h=harness('app/components/admin-payment-queue.tsx','AdminPaymentQueue',{payments:[payment],approvingId:null,disabled:false,onApprove:id=>calls.push(id)})
  h.click('Энэ төлбөрийг зөвшөөрөх · Эрх нээх');assert.deepEqual(calls,[]);assert.match(h.text,/123456/)
  h.click('Болих');assert.deepEqual(calls,[])
  h.click('Энэ төлбөрийг зөвшөөрөх · Эрх нээх');h.update({payments:[{...payment,amount:6000}]});assert.ok(h.button('Энэ төлбөрийг зөвшөөрөх · Эрх нээх'))
  h.click('Энэ төлбөрийг зөвшөөрөх · Эрх нээх');h.click('Орлогыг шалгасан · Эрх нээх');assert.deepEqual(calls,['o1']);h.unmount()
})

test('background polling does not repeatedly abort a slow dashboard response',async()=>{
 const h=await ready();h.tick(10000);const pending=h.requests.length-1
 h.tick(10000);assert.equal(h.requests.length,pending+1);assert.equal(h.requests[pending].init.signal.aborted,false)
 await h.reply(pending,200,dashboard);h.tick(10000);assert.equal(h.requests.length,pending+2);h.unmount()
})
