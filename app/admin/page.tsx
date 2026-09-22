'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useScreenHistory } from '@/lib/client/use-screen-history'
import { backInApp, readScreen } from '@/lib/client/navigation'
import { createRequestSignal } from '@/lib/client/request-signal'
import { adminSections, validAdminScreen, filterAdminDrivers, adminMoney, adminCarLabel, adminDate, type AdminTab, type AdminDashboard, type AdminDriver, type AdminOrder, type DriverFilter } from '@/lib/client/admin-view'
import { AdminPasswordForm } from '../components/admin-password-form'
import { AdminPaymentPanel } from '../components/admin-payment-panel'
import { AdminSettings } from '../components/admin-settings'
import { AdminDriverMap } from '../components/admin-driver-map'
import styles from './admin.module.css'

const emptyDashboard: AdminDashboard = { drivers: [], orders: [], activeOrders: [], pendingApprovalCount: 0, heroUrl: '', bankName: '', bankAccount: '' }
type DriverAction = { action: 'toggle' | 'delete' | 'reset_pin'; driver: AdminDriver }
type DriverNotice = { ok: boolean; text: string; pin?: string; phone?: string }

function OrderCard({ order, now }: { order: AdminOrder; now: number }) {
  const completed = order.status === 'completed'
  const minutes = completed ? order.duration_minutes : Math.max(0, Math.round((now - new Date(order.created_at).getTime()) / 60000))
  return <article className={styles.listCard}>
    <div className={styles.driverHeader}>
      <div><span className={`${styles.badge} ${styles.ready}`}>{completed ? 'Дууссан' : 'Явагдаж байна'}</span><p className={styles.muted}>Үүссэн: {adminDate(order.created_at)}</p></div>
      <div><span className={styles.muted}>Тохиролцсон үнэ</span><h3>{Number(order.final_price) > 0 ? adminMoney(order.final_price) : 'Үнэ бүртгэгдээгүй'}</h3></div>
    </div>
    <h3>{order.driver_name || 'Жолоочийн нэр бүртгэгдээгүй'}</h3>
    <p className={styles.muted}>{order.driver_phone && <a href={`tel:${order.driver_phone}`}>{order.driver_phone}</a>} · {adminCarLabel(order.car_type)}{order.car_mark ? ` · ${order.car_mark}` : ''}</p>
    <div className={styles.orderRoute}><p><span>Хаанаас</span><strong>{order.from_address || 'Байршлаар сонгосон'}</strong></p><p><span>Хаашаа</span><strong>{order.to_address || 'Хүргэх газар оруулаагүй'}</strong></p></div>
    <p className={styles.muted}>{completed ? `Дууссан: ${adminDate(order.completed_at)}` : 'Захиалга үүссэнээс хойш'}{minutes != null && Number.isFinite(minutes) ? ` · ${minutes} минут` : ''}</p>
  </article>
}

export default function AdminPage() {
  const router = useRouter(), navigation = useScreenHistory('admin', 'overview', validAdminScreen)
  const tab = navigation.screen.split(':')[0] as AdminTab
  const showForm = navigation.screen.endsWith(':add'), showPassword = navigation.screen.endsWith(':password')
  const [dashboard, setDashboard] = useState<AdminDashboard>(emptyDashboard)
  const [checkingSession, setCheckingSession] = useState(true), [authed, setAuthed] = useState(false), [mustChangePassword, setMustChangePassword] = useState(false)
  const [password, setPassword] = useState(''), [loginError, setLoginError] = useState(''), [loginBusy, setLoginBusy] = useState(false)
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [dashboardError, setDashboardError] = useState('')
  const [updatedAt, setUpdatedAt] = useState(''), [now, setNow] = useState(0), [passwordMessage, setPasswordMessage] = useState('')
  const [search, setSearch] = useState(''), [filter, setFilter] = useState<DriverFilter>('all'), [phone, setPhone] = useState('')
  const [driverAction, setDriverAction] = useState<DriverAction | null>(null), [driverBusy, setDriverBusy] = useState(false), [driverNotice, setDriverNotice] = useState<DriverNotice | null>(null)
  const pendingLogin = useRef(false), pendingDriver = useRef(false), sequence = useRef(0), sessionGeneration = useRef(0)
  const lifetime = useRef<AbortController | null>(null), dashboardRequest = useRef<AbortController | null>(null)
  const heading = useRef<HTMLHeadingElement>(null), notice = useRef<HTMLDivElement>(null), previousScreen = useRef(navigation.screen)
  const { drivers, orders, activeOrders, pendingApprovalCount } = dashboard
  const availableDrivers = drivers.filter(driver => driver.active && driver.available)
  const filteredDrivers = filterAdminDrivers(drivers, search, filter)
  const currentSection = adminSections.find(section => section.id === tab) || adminSections[0]

  const clearPrivateState = useCallback(() => {
    sessionGeneration.current++; sequence.current++; dashboardRequest.current?.abort()
    setAuthed(false); setDashboard(emptyDashboard); setDriverNotice(null); setDriverAction(null); setPhone('')
    setUpdatedAt(''); setLoading(true); setPasswordMessage(''); setSearch(''); setFilter('all')
  }, [])
  const sessionExpired = useCallback(() => { clearPrivateState(); setLoginError('Нэвтрэлт дууслаа. Админы нууц үгээр дахин нэвтэрнэ үү.') }, [clearPrivateState])
  const fetchDashboard = useCallback(async () => {
    const attempt = ++sequence.current
    dashboardRequest.current?.abort()
    const controller = new AbortController(); dashboardRequest.current = controller
    const request = createRequestSignal(12_000, controller.signal)
    setRefreshing(true)
    try {
      const response = await fetch('/api/admin/dashboard', { cache: 'no-store', signal: request.signal })
      if (attempt !== sequence.current || lifetime.current?.signal.aborted) return
      if (response.status === 401 || response.status === 403) { sessionExpired(); return }
      const body = await response.json()
      if (attempt !== sequence.current || lifetime.current?.signal.aborted) return
      if (!response.ok) throw new Error(body.error || 'Мэдээлэл ачаалж чадсангүй.')
      setDashboard({ drivers: body.drivers || [], orders: body.orders || [], activeOrders: body.activeOrders || [], pendingApprovalCount: body.pendingApprovalCount || 0,
        heroUrl: body.heroUrl || '', bankName: body.bankName || '', bankAccount: body.bankAccount || '' })
      setUpdatedAt(new Date().toISOString()); setDashboardError('')
    } catch (cause) {
      if (attempt === sequence.current && !lifetime.current?.signal.aborted) setDashboardError(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'Холболт тасарлаа. Мэдээлэл хамгийн сүүлд шинэчилсэн үеийнх байна.')
    } finally { request.dispose(); if (attempt === sequence.current && !lifetime.current?.signal.aborted) { setLoading(false); setRefreshing(false) } }
  }, [sessionExpired])
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller
    const request = createRequestSignal(12_000, controller.signal)
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    void (async () => {
      try {
        const response = await fetch('/api/admin/session', { cache: 'no-store', signal: request.signal })
        const body = await response.json()
        if (controller.signal.aborted) return
        if (response.ok) { setMustChangePassword(Boolean(body.mustChangePassword)); setAuthed(true) }
        else if (response.status !== 401) setLoginError('Нэвтрэлтийг шалгаж чадсангүй. Дахин оролдоно уу.')
      } catch { if (!controller.signal.aborted) setLoginError('Интернэт холболтоо шалгаад нэвтэрнэ үү.') }
      finally { request.dispose(); if (!controller.signal.aborted) setCheckingSession(false) }
    })()
    return () => { controller.abort(); request.dispose(); clearInterval(timer); sequence.current++; dashboardRequest.current?.abort() }
  }, [])
  useEffect(() => {
    if (!authed || mustChangePassword) return
    void fetchDashboard()
    const refresh = () => { if (document.visibilityState === 'visible' && !pendingDriver.current) void fetchDashboard() }
    const timer = setInterval(refresh, 10_000)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); sequence.current++; dashboardRequest.current?.abort() }
  }, [authed, mustChangePassword, fetchDashboard])
  useEffect(() => {
    if (previousScreen.current !== navigation.screen) {
      previousScreen.current = navigation.screen; heading.current?.focus()
      if (tab !== 'drivers') { setDriverNotice(null); setDriverAction(null) }
    }
  }, [navigation.screen, tab])
  useEffect(() => { if (driverNotice) notice.current?.focus() }, [driverNotice])
  const setTab = (next: AdminTab) => { if (next !== navigation.screen) navigation.navigate(next) }
  const closeSubpage = () => { if (readScreen('admin')?.value.includes(':')) navigation.back() }
  const mutateDriver = async (action: 'add' | DriverAction['action'], driver?: AdminDriver) => {
    if (pendingDriver.current) return
    pendingDriver.current = true; setDriverBusy(true); setDriverNotice(null)
    const generation = sessionGeneration.current, parent = lifetime.current?.signal, request = createRequestSignal(12_000, parent)
    try {
      const response = await fetch('/api/admin/drivers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: request.signal,
        body: JSON.stringify(action === 'add' ? { action, driver: { phone, name: 'Шинэ жолооч' } } : { action, id: driver?.id }) })
      const body = await response.json()
      if (parent?.aborted || generation !== sessionGeneration.current) return
      if (response.status === 401 || response.status === 403) { sessionExpired(); return }
      if (!response.ok) throw new Error(body.error || 'Үйлдэл хадгалагдсангүй.')
      if (!readScreen('admin')?.value.startsWith('drivers')) { void fetchDashboard(); return }
      setDriverNotice({ ok: true, text: action === 'add' ? 'Жолооч бүртгэгдлээ.' : action === 'reset_pin' ? 'Жолоочийн PIN шинэчлэгдлээ.' : action === 'delete' ? 'Жолооч жагсаалтаас хасагдлаа. Захиалгын түүх хадгалагдсан.' : body.active ? 'Бүртгэл идэвхжлээ. Жолооч өөрөө нэвтэрч ажиллах төлөвөө асаана.' : 'Жолоочийн бүртгэлийг түр хаалаа.', pin: body.pin, phone: driver?.phone || phone })
      setDriverAction(null)
      if (action === 'add') { setPhone(''); navigation.navigate('drivers', true) }
      void fetchDashboard()
    } catch (cause) {
      if (!parent?.aborted && generation === sessionGeneration.current) setDriverNotice({ ok: false, text: cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'Холболт тасарлаа. Дахин үйлдэхээс өмнө жагсаалтаа шинэчилж шалгана уу.' })
    } finally { request.dispose(); pendingDriver.current = false; if (!parent?.aborted) setDriverBusy(false) }
  }
  const logout = async () => {
    try {
      const response = await fetch('/api/admin/session', { method: 'DELETE' })
      if (!response.ok) { setDashboardError('Гарч чадсангүй. Дахин оролдоно уу.'); return }
      clearPrivateState(); setMustChangePassword(false); setPassword(''); setLoginError(''); setDashboardError(''); navigation.navigate('overview', true)
    } catch { setDashboardError('Интернэт холболтоо шалгаад дахин оролдоно уу.') }
  }
  const passwordChanged = () => { setMustChangePassword(false); closeSubpage(); setPasswordMessage('Нууц үг солигдлоо. Дараагийн нэвтрэлтэд шинэ нууц үгээ ашиглана уу.') }

  if (checkingSession) return <div className={`${styles.page} ${styles.login}`}><p role="status">Админы нэвтрэлтийг шалгаж байна…</p></div>
  if (!authed) return <main className={`${styles.page} ${styles.login}`}><div className={styles.loginCard}>
    <div className={styles.brandMark} aria-hidden="true">А</div><p className={styles.eyebrow}>АЧИЛТ · УДИРДЛАГА</p><h1>Админаар нэвтрэх</h1><p className={styles.muted}>Жолооч, захиалга, төлбөрийн эрхийг удирдана.</p>
    <form onSubmit={async event => {
      event.preventDefault(); if (pendingLogin.current) return
      pendingLogin.current = true; setLoginBusy(true); setLoginError('')
      const parent = lifetime.current?.signal, request = createRequestSignal(12_000, parent)
      try {
        const response = await fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), signal: request.signal })
        const body = await response.json()
        if (parent?.aborted) return
        if (!response.ok) { setLoginError(body.error || 'Нэвтэрч чадсангүй.'); return }
        setMustChangePassword(Boolean(body.mustChangePassword)); setAuthed(true); setPassword(''); setLoading(true)
      } catch { if (!parent?.aborted) setLoginError('Холболтоо шалгаад дахин оролдоно уу.') }
      finally { request.dispose(); pendingLogin.current = false; if (!parent?.aborted) setLoginBusy(false) }
    }}><label htmlFor="admin-login-password">Админы нууц үг</label><input id="admin-login-password" type="password" autoComplete="current-password" required maxLength={128} value={password} disabled={loginBusy} onChange={event => setPassword(event.target.value)} />
      {loginError && <p className={styles.error} role="alert">{loginError}</p>}<button className={styles.primary} type="submit" disabled={loginBusy}>{loginBusy ? 'Нэвтэрч байна…' : 'Нэвтрэх'}</button>
    </form><button type="button" className={styles.linkButton} onClick={() => backInApp(router, '/start')}>← Эхлэх хуудас</button>
  </div></main>
  if (mustChangePassword) return <main className={`${styles.page} ${styles.login}`}><div>{dashboardError && <p className={styles.error} role="alert">{dashboardError}</p>}<AdminPasswordForm required onChanged={passwordChanged} onCancel={() => void logout()} onSessionExpired={sessionExpired} /></div></main>

  return <div className={styles.page}>
    <header className={styles.topbar}><div className={styles.topbarInner}>
      <div className={styles.brand}><div className={styles.brandMark} aria-hidden="true">А</div><div><p className={styles.eyebrow}>АЧИЛТ</p><h1>Удирдлагын самбар</h1></div></div>
      <div className={styles.actions}><button type="button" className={styles.quiet} disabled={driverBusy} onClick={() => { if (!navigation.back()) backInApp(router, '/start') }}>← Буцах</button><button type="button" disabled={refreshing} onClick={() => void fetchDashboard()}>{refreshing ? 'Шинэчилж байна…' : 'Мэдээлэл шинэчлэх'}</button><button type="button" className={styles.quiet} disabled={driverBusy} onClick={() => void logout()}>Гарах</button></div>
    </div></header>
    <div className={styles.layout}>
      <aside className={styles.sidebar}><nav className={styles.nav} aria-label="Админы үндсэн цэс">{adminSections.map((section, index) => <button type="button" key={section.id} className={styles.navItem} disabled={driverBusy} aria-current={tab === section.id ? 'page' : undefined} onClick={() => setTab(section.id)}>
        <span className={styles.navIndex}>{String(index + 1).padStart(2, '0')}</span><span><strong>{section.label}</strong><small>{section.description}</small></span>{section.id === 'payments' && pendingApprovalCount > 0 && <span className={styles.navBadge}>{pendingApprovalCount}</span>}
      </button>)}</nav><p className={styles.sidebarNote}>Нээлттэй үед мэдээлэл 10 секунд тутам шинэчлэгдэнэ.<br />{updatedAt ? `Сүүлд: ${adminDate(updatedAt)}` : 'Мэдээлэл хүлээж байна…'}</p></aside>
      <main className={styles.main}>
        <div className={styles.pageHeading}><div><h2 ref={heading} tabIndex={-1}>{currentSection.label}</h2><p className={styles.muted}>{currentSection.description}</p></div>{tab === 'drivers' && !showForm && <button type="button" className={styles.primary} disabled={driverBusy} onClick={() => { setDriverNotice(null); navigation.navigate('drivers:add') }}>+ Жолооч бүртгэх</button>}</div>
        {dashboardError && <p className={styles.error} role="alert">{dashboardError} <button type="button" onClick={() => void fetchDashboard()}>Дахин ачаалах</button></p>}
        {passwordMessage && <p className={styles.success} role="status">{passwordMessage}</p>}
        {showPassword && <div className={styles.passwordWrap}><AdminPasswordForm onChanged={passwordChanged} onCancel={closeSubpage} onSessionExpired={sessionExpired} /></div>}
        {loading && <p className={styles.empty} role="status">Мэдээллийг ачаалж байна…</p>}
        {!loading && !updatedAt && <p className={styles.empty}>Мэдээлэл хараахан ачаалагдаагүй. Дээрх «Дахин ачаалах» товчийг дарна уу.</p>}
        {updatedAt && <>
          {tab === 'overview' && <>
            <div className={styles.cards}>
              <button className={`${styles.stat} ${pendingApprovalCount ? styles.attention : ''}`} onClick={() => setTab('payments')}><span>Төлбөр хүлээж буй</span><strong>{pendingApprovalCount}</strong><small>Шимтгэл шалгах, эрх нээх →</small></button>
              <button className={styles.stat} onClick={() => setTab('active')}><span>Явагдаж буй захиалга</span><strong>{activeOrders.length}{activeOrders.length >= 50 ? '+' : ''}</strong><small>Жолооч сонгогдсон захиалгууд →</small></button>
              <button className={styles.stat} onClick={() => { setFilter('available'); setSearch(''); setTab('drivers') }}><span>Захиалга авахад бэлэн</span><strong>{availableDrivers.length}</strong><small>Нийт {drivers.length} жолооч бүртгэлтэй →</small></button>
              <button className={styles.stat} onClick={() => setTab('history')}><span>Дууссан захиалга</span><strong>{orders.length}{orders.length >= 100 ? '+' : ''}</strong><small>Сүүлийн 24 цагт үүссэн захиалга →</small></button>
            </div>
            {(!dashboard.bankName || !dashboard.bankAccount) && <div className={styles.notice}><strong>Төлбөр авах дансаа тохируулна уу.</strong><p>Жолоочид шилжүүлэх данс харагдахын тулд банк, дансны дугаараа хадгална.</p><button type="button" onClick={() => setTab('settings')}>Банкны данс тохируулах →</button></div>}
            <section className={styles.panel}><h3>Та юу хийх вэ?</h3><ol className={styles.steps}>
              <li><div><strong>Шинэ жолооч бүртгэх</strong><br />Утасны дугаарыг нэмээд, үүссэн түр PIN-ийг жолоочид дамжуулна.<br /><button type="button" className={styles.linkButton} onClick={() => navigation.navigate('drivers:add')}>Жолооч бүртгэх →</button></div></li>
              <li><div><strong>Төлбөр төлсөн жолоочийн эрх нээх</strong><br />Улсын дугаар эсвэл утсаар хайж, банкны орлогын дүн, гүйлгээний кодыг тулгана.<br /><button type="button" className={styles.linkButton} onClick={() => setTab('payments')}>Төлбөр шалгах →</button></div></li>
              <li><div><strong>Автоматаар эрх нээлгэх</strong><br />Банкны дансаа хадгалаад SMS авдаг утасны MacroDroid-ыг холбоно.<br /><button type="button" className={styles.linkButton} onClick={() => setTab('settings')}>Тохиргоо нээх →</button></div></li>
            </ol></section>
          </>}
          {tab === 'payments' && <AdminPaymentPanel onSessionExpired={sessionExpired} onApproved={fetchDashboard} onConfigure={() => setTab('settings')} />}
          {tab === 'drivers' && <>
            <p className={styles.muted}>Бүртгэл идэвхтэй байх нь жолоочийн төлбөр төлөгдсөнийг илэрхийлэхгүй. Шимтгэлийн зөвшөөрлийг «Төлбөр · Эрх нээх» цэсээс удирдана.</p>
            {showForm && <section className={styles.panel}><h3>Шинэ жолооч бүртгэх</h3><p className={styles.muted}>Утасны дугаараар бүртгэнэ. 6 оронтой түр PIN зөвхөн энэ удаа харагдана. Жолооч нэвтрээд нэр, машин, улсын дугаараа нөхөж оруулна.</p><form onSubmit={event => { event.preventDefault(); void mutateDriver('add') }}>
              <label htmlFor="new-driver-phone">Жолоочийн утасны дугаар</label><input id="new-driver-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={16} required placeholder="Жишээ: 99112233" value={phone} disabled={driverBusy} onChange={event => setPhone(event.target.value)} />
              <div className={styles.cardFooter}><button type="submit" className={styles.primary} disabled={driverBusy}>{driverBusy ? 'Бүртгэж байна…' : 'Бүртгээд түр PIN үүсгэх'}</button><button type="button" disabled={driverBusy} onClick={closeSubpage}>Болих</button></div>
            </form></section>}
            {driverNotice && <div ref={notice} tabIndex={-1} role={driverNotice.ok ? 'status' : 'alert'} className={driverNotice.ok ? styles.success : styles.error}><strong>{driverNotice.text}</strong>{driverNotice.pin && <><p>{driverNotice.phone} дугаарт нэвтрэх түр PIN:</p><output className={styles.pin}>{driverNotice.pin}</output><p>Жолоочид аюулгүй сувгаар дамжуулна уу. Энэ хэсгийг хаавал PIN дахин харагдахгүй.</p><button type="button" onClick={() => setDriverNotice(null)}>PIN-ийг дамжуулсан · Хаах</button></>}</div>}
            <div className={styles.searchRow}><div><label htmlFor="driver-search">Жолооч хайх</label><input id="driver-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Нэр, утас эсвэл улсын дугаар" /></div><div><label htmlFor="driver-filter">Төлөвөөр шүүх</label><select id="driver-filter" value={filter} onChange={event => setFilter(event.target.value as DriverFilter)}><option value="all">Бүх жолооч</option><option value="available">Захиалга авахад бэлэн</option><option value="paused">Бүртгэл түр хаасан</option></select></div></div>
            <p className={styles.muted}>Нийт {drivers.length} жолоочоос {filteredDrivers.length} харагдаж байна. {(search || filter !== 'all') && <button type="button" className={styles.linkButton} onClick={() => { setSearch(''); setFilter('all') }}>Хайлт, шүүлтүүр арилгах</button>}</p>
            {!filteredDrivers.length && <p className={styles.empty}>{drivers.length ? 'Тохирох жолооч олдсонгүй. Хайлт, төлөвийн шүүлтүүрээ өөрчилнө үү.' : 'Жолооч бүртгэгдээгүй байна. Дээрх «Жолооч бүртгэх» товчоор эхэлнэ.'}</p>}
            {filteredDrivers.map(driver => <article className={styles.listCard} key={driver.id}>
              <div className={styles.driverHeader}><div className={styles.driverIdentity}><span className={styles.avatar} aria-hidden="true">{(driver.name || 'Ж')[0]}</span><div><h3>{driver.name || 'Шинэ жолооч'}</h3><span className={styles.plate}>{driver.car_number || 'Улсын дугаар бүртгээгүй'}</span></div></div><span className={`${styles.badge} ${!driver.active ? styles.paused : driver.available ? styles.ready : ''}`}>{!driver.active ? 'Бүртгэл түр хаасан' : driver.available ? 'Захиалга авахад бэлэн' : 'Одоогоор захиалга авахгүй'}</span></div>
              <dl className={styles.details}><div><dt>Утасны дугаар</dt><dd><a href={`tel:${driver.phone}`}>{driver.phone}</a></dd></div><div><dt>Машины төрөл</dt><dd>{adminCarLabel(driver.car_type)}</dd></div></dl>
              <div className={styles.cardFooter}><button disabled={driverBusy} onClick={() => { setDriverNotice(null); setDriverAction({ action: 'toggle', driver }) }}>{driver.active ? 'Бүртгэл түр хаах' : 'Бүртгэл идэвхжүүлэх'}</button><button disabled={driverBusy} onClick={() => { setDriverNotice(null); setDriverAction({ action: 'reset_pin', driver }) }}>PIN шинэчлэх</button><button className={styles.danger} disabled={driverBusy} onClick={() => { setDriverNotice(null); setDriverAction({ action: 'delete', driver }) }}>Жагсаалтаас хасах</button></div>
              {driverAction?.driver.id === driver.id && <div className={styles.confirmation} role="group" aria-label="Жолоочийн үйлдэл баталгаажуулах">
                <h3>{driverAction.action === 'reset_pin' ? 'Шинэ түр PIN үүсгэх үү?' : driverAction.action === 'delete' ? 'Жолоочийг жагсаалтаас хасах уу?' : driver.active ? 'Жолоочийн бүртгэлийг түр хаах уу?' : 'Жолоочийн бүртгэлийг идэвхжүүлэх үү?'}</h3>
                <p>{driver.name} · {driver.phone}</p><p className={styles.muted}>{driverAction.action === 'reset_pin' ? 'Одоогийн PIN хүчингүй болж, шинэ 6 оронтой PIN энэ дэлгэцэд харагдана.' : driverAction.action === 'delete' ? 'Шинэ захиалга авах боломжгүй болж, жагсаалтаас хасагдана. Өмнөх захиалгын түүх хадгалагдана.' : driver.active ? 'Шинэ захиалга авах боломжийг хаана. Дараа нь дахин идэвхжүүлж болно.' : 'Бүртгэл нээгдэнэ. Төлөгдөөгүй шимтгэл болон бусад ажиллах нөхцөл хэвээр шалгагдана.'}</p>
                <div className={styles.actions}><button type="button" disabled={driverBusy} onClick={() => setDriverAction(null)}>Болих</button><button type="button" className={styles.primary} disabled={driverBusy} onClick={() => void mutateDriver(driverAction.action, driver)}>{driverBusy ? 'Хадгалж байна…' : driverAction.action === 'reset_pin' ? 'Тийм, PIN шинэчлэх' : driverAction.action === 'delete' ? 'Тийм, жагсаалтаас хасах' : 'Тийм, бүртгэлийг өөрчлөх'}</button></div>
              </div>}
            </article>)}
          </>}
          {tab === 'active' && <><p className={styles.muted}>Жолооч сонгогдсон, хараахан дуусаагүй захиалгууд. Хамгийн сүүлийн 50 хүртэл захиалга харагдана.</p>{!activeOrders.length && <p className={styles.empty}>Одоогоор явагдаж буй захиалга алга.</p>}{activeOrders.map(order => <OrderCard key={order.id} order={order} now={now} />)}</>}
          {tab === 'history' && <><div className={styles.cards}><div className={styles.stat}><span>Энэ жагсаалтын захиалга</span><strong>{orders.length}</strong></div><div className={styles.stat}><span>Тохиролцсон үнийн нийлбэр</span><strong>{adminMoney(orders.reduce((sum, order) => sum + Number(order.final_price || 0), 0))}</strong><small>Шимтгэлийн бодит орлогыг «Төлбөр» хэсэгт тулган шалгана.</small></div></div><p className={styles.muted}>Сүүлийн 24 цагт үүссэн, дууссан төлөвтэй 100 хүртэл захиалга.</p>{!orders.length && <p className={styles.empty}>Энэ хугацаанд дууссан захиалга алга.</p>}{orders.map(order => <OrderCard key={order.id} order={order} now={now} />)}</>}
          {tab === 'map' && <AdminDriverMap drivers={drivers} />}
          {tab === 'settings' && !showPassword && <AdminSettings initial={dashboard} onSaved={fetchDashboard} onPassword={() => { setPasswordMessage(''); navigation.navigate('settings:password') }} onSessionExpired={sessionExpired} />}
        </>}
      </main>
    </div>
  </div>
}
