'use client'
import { liveCall, type CallResponse, type CallRole, type VideoCall } from '@/lib/video-call'

export type VideoState = {
  phase: 'idle' | 'preparing' | 'ringing' | 'incoming' | 'connecting' | 'connected' | 'busy'
  ready: boolean | null; message: string; local: MediaStream | null; remote: MediaStream | null
  microphone: boolean; camera: boolean
}
export const initialVideoState: VideoState = { phase: 'idle', ready: null, message: '', local: null, remote: null, microphone: true, camera: true }
class CallError extends Error { constructor(message: string, readonly status: number) { super(message) } }
export function mediaError(error: unknown) {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Камер, микрофоны зөвшөөрлөө асаагаад дахин оролдоно уу.'
  if (name === 'NotFoundError') return 'Камер эсвэл микрофон олдсонгүй. Утасныхаа browser-оор нээнэ үү.'
  if (name === 'NotReadableError') return 'Камер өөр аппад ашиглагдаж байна. Түүнийг хаагаад дахин оролдоно уу.'
  return error instanceof Error ? error.message : 'Дуудлага холбогдсонгүй. Дахин оролдоно уу.'
}

// Non-trickle SDP keeps short-lived negotiation on the authenticated API; media never passes through it.
export function gatheredDescription(pc: RTCPeerConnection, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', changed); signal.removeEventListener('abort', aborted)
      const sdp = pc.localDescription?.sdp
      if (error) reject(error)
      else if (sdp?.includes('a=candidate:')) resolve(sdp)
      else reject(new Error('Дуудлагын сүлжээ холбогдсонгүй. Утсаар холбогдоно уу.'))
    }
    const changed = () => { if (pc.iceGatheringState === 'complete') finish() }
    const aborted = () => finish(new Error('Дуудлага цуцлагдсан.'))
    const timer = setTimeout(() => finish(), 12_000)
    pc.addEventListener('icegatheringstatechange', changed); signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) aborted(); else changed()
  })
}

export class OrderVideoSession {
  private instance = crypto.randomUUID()
  private state: VideoState = { ...initialVideoState }
  private call: VideoCall | null = null
  private pc: RTCPeerConnection | null = null
  private controller = new AbortController()
  private timer: ReturnType<typeof setInterval> | null = null
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null
  private expiryTimer: ReturnType<typeof setTimeout> | null = null
  private mediaTimer: ReturnType<typeof setTimeout> | null = null
  private busy = false
  private polling = false
  private disposed = false
  private generation = 0
  private verifiedAt = Date.now()
  private facing: 'user' | 'environment' = 'user'
  constructor(private order: string, private role: CallRole, private changed: (state: VideoState) => void) {}
  private emit(next: Partial<VideoState>) { if (!this.disposed) { this.state = { ...this.state, ...next }; this.changed(this.state) } }
  private valid(generation: number) { return !this.disposed && generation === this.generation }
  private async request(action: string, extra: Record<string, unknown> = {}): Promise<CallResponse> {
    const response = await fetch('/api/order/video', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ order_id: this.order, role: this.role, instance_id: this.instance, action, ...extra }),
      signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(15_000)]),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new CallError(body.error || 'Дуудлагын холболт тасарсан.', response.status)
    return body
  }
  private stopMedia() {
    const pc = this.pc; this.pc = null; pc?.close()
    this.state.local?.getTracks().forEach(track => track.stop())
    this.state.remote?.getTracks().forEach(track => track.stop())
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer)
    if (this.expiryTimer) clearTimeout(this.expiryTimer)
    if (this.mediaTimer) clearTimeout(this.mediaTimer)
    this.disconnectTimer = null; this.expiryTimer = null; this.mediaTimer = null
    this.emit({ local: null, remote: null })
  }
  private notifyEnd(call: VideoCall | null, action = 'end') {
    if (!call) return
    void fetch('/api/order/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ order_id: this.order, role: this.role, instance_id: this.instance, action, call_id: call.id }),
    }).catch(() => {})
  }
  private leaving = () => { this.hangup() }
  private visible = () => {
    if (document.visibilityState === 'visible') void this.poll()
    else if (this.state.local) this.hangup('Хуудас далд орсон тул дуудлага дууслаа.')
  }
  startPolling() {
    void this.poll(); this.timer = setInterval(() => { if (document.visibilityState === 'visible') void this.poll() }, 5000)
    window.addEventListener('pagehide', this.leaving)
    document.addEventListener('visibilitychange', this.visible)
  }
  private async process(body: CallResponse) {
    this.emit({ ready: body.ready })
    const old = this.call; this.call = body.call
    const call = this.call
    if (!liveCall(call)) {
      if (this.pc || old && liveCall(old)) {
        this.busy = false; this.generation++; this.stopMedia()
        this.emit({ phase: 'idle', message: call?.status === 'declined' ? 'Дуудлагыг авахаас татгалзлаа.' : call?.status === 'missed' ? 'Дуудлагад хариулсангүй.' : 'Дуудлага дууслаа.' })
      } else this.emit({ phase: 'idle' })
      return
    }
    if (!call) return
    if (Date.parse(call.expires_at) <= Date.now()) { this.hangup('Дуудлагын хугацаа дууслаа.'); return }
    if (call.caller_role !== this.role && call.status === 'ringing') {
      if (old?.id !== call.id) navigator.vibrate?.([200, 100, 200])
      this.emit({ phase: 'incoming', message: '' }); return
    }
    if (!call.owned || !this.pc) {
      this.stopMedia(); this.emit({ phase: 'busy', message: 'Дуудлага өөр цонх эсвэл төхөөрөмж дээр нээлттэй байна.' }); return
    }
    if (call.caller_role === this.role && call.answer_sdp && !this.pc.remoteDescription) {
      const pc = this.pc, generation = this.generation
      await pc.setRemoteDescription({ type: 'answer', sdp: call.answer_sdp })
      if (!this.valid(generation) || this.pc !== pc) return
      if (pc.connectionState !== 'connected') this.emit({ phase: 'connecting' })
    } else if (call.status === 'ringing') this.emit({ phase: 'ringing' })
    if (this.expiryTimer) clearTimeout(this.expiryTimer)
    this.expiryTimer = setTimeout(() => this.hangup('Дуудлагын хугацаа дууслаа. Дахин залгаж болно.'), Math.max(0, Date.parse(call.expires_at) - Date.now()))
  }
  async poll() {
    if (this.disposed || this.busy || this.polling) return
    this.polling = true; const generation = this.generation
    try {
      const response = await this.request('state')
      if (this.valid(generation) && !this.busy) { this.verifiedAt = Date.now(); await this.process(response) }
    } catch (error) {
      if (this.valid(generation)) {
        if (error instanceof CallError && [401, 403].includes(error.status)) { this.generation++; this.stopMedia(); this.call = null; this.emit({ phase: 'idle', ready: false }) }
        if (this.pc && Date.now() - this.verifiedAt > 40_000) this.hangup('Сүлжээ тасарсан тул дуудлага дууслаа.')
        this.emit({ message: mediaError(error) })
      }
    } finally { this.polling = false }
  }
  private async media(generation: number) {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') throw new Error('Энэ browser видео дуудлага дэмжихгүй байна. Chrome эсвэл Safari-аар нээнэ үү.')
    const request = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 20 }, facingMode: this.facing } })
    let timeout: ReturnType<typeof setTimeout>
    let timedOut = false
    request.then(stream => { if (timedOut || !this.valid(generation)) stream.getTracks().forEach(track => track.stop()) }).catch(() => {})
    try {
      const stream = await Promise.race([request, new Promise<never>((_, reject) => { timeout = setTimeout(() => { timedOut = true; reject(new Error('Камер, микрофоны зөвшөөрлөө шалгаад дахин оролдоно уу.')) }, 30_000) })])
      if (!this.valid(generation)) { stream.getTracks().forEach(track => track.stop()); throw new Error('Дуудлага цуцлагдсан.') }
      this.emit({ local: stream, microphone: true, camera: true }); return stream
    } finally { clearTimeout(timeout!) }
  }
  private peer(iceServers: RTCIceServer[], stream: MediaStream, generation: number) {
    const pc = new RTCPeerConnection({ iceServers }); this.pc = pc
    const remote = new MediaStream(); this.emit({ remote })
    for (const track of stream.getTracks()) {
      const sender = pc.addTrack(track, stream)
      if (track.kind === 'video') {
        const parameters = sender.getParameters(); parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}]
        parameters.encodings[0].maxBitrate = 650_000; parameters.encodings[0].maxFramerate = 20
        void sender.setParameters(parameters).catch(() => {})
      }
    }
    pc.ontrack = event => { if (this.valid(generation)) { remote.addTrack(event.track); this.emit({ remote }) } }
    pc.onconnectionstatechange = () => {
      if (!this.valid(generation) || this.pc !== pc) return
      if (pc.connectionState === 'connected') {
        if (this.disconnectTimer) clearTimeout(this.disconnectTimer)
        if (this.mediaTimer) clearTimeout(this.mediaTimer)
        this.disconnectTimer = null; this.mediaTimer = null
        this.emit({ phase: 'connected', message: '' })
      } else if (pc.connectionState === 'failed') this.hangup('Сүлжээний холболт үүссэнгүй. Дахин залгах эсвэл утсаар холбогдоно уу.')
      else if (pc.connectionState === 'disconnected' && !this.disconnectTimer) {
        this.emit({ message: 'Сүлжээ тасалдсан. Холболтоо сэргээж байна…' })
        this.disconnectTimer = setTimeout(() => this.hangup('Холболт тасарлаа. Дахин залгана уу.'), 15_000)
      }
    }
    return pc
  }
  async callPeer(answer = false) {
    if (this.busy || this.disposed || !answer && liveCall(this.call)) return
    const incoming = answer ? this.call : null
    if (answer && (!incoming || incoming.status !== 'ringing' || incoming.caller_role === this.role)) return
    this.busy = true; const generation = ++this.generation
    this.emit({ phase: 'preparing', message: '' })
    let pendingCall: VideoCall | null = null
    try {
      const prepared = await this.request('prepare')
      if (!this.valid(generation)) return
      if (!prepared.iceServers?.length) throw new Error('Видео дуудлагын үйлчилгээ бэлэн биш байна.')
      const stream = await this.media(generation)
      if (!this.valid(generation)) return
      const pc = this.peer(prepared.iceServers, stream, generation)
      if (incoming?.offer_sdp) await pc.setRemoteDescription({ type: 'offer', sdp: incoming.offer_sdp })
      await pc.setLocalDescription(incoming ? await pc.createAnswer() : await pc.createOffer())
      const sdp = await gatheredDescription(pc, this.controller.signal)
      if (!this.valid(generation)) return
      const id = incoming?.id || crypto.randomUUID()
      // Remember the ID before sending, so a lost response or immediate navigation can end it.
      this.call = incoming || { id, caller_role: this.role, owned: true, status: 'ringing', expires_at: new Date(Date.now() + 60_000).toISOString(), offer_sdp: null, answer_sdp: null }
      pendingCall = this.call
      const result = await this.request(incoming ? 'answer' : 'start', { call_id: id, sdp })
      if (!this.valid(generation)) { this.notifyEnd(pendingCall); return }
      this.call = result.call; this.verifiedAt = Date.now()
      this.emit({ phase: incoming ? 'connecting' : 'ringing' })
      await this.process(result)
      if (this.valid(generation) && this.pc === pc && pc.connectionState !== 'connected') this.mediaTimer = setTimeout(() => this.hangup('Хариу эсвэл сүлжээний холболт үүссэнгүй. Дахин залгана уу.'), incoming ? 30_000 : 90_000)
    } catch (error) {
      if (this.valid(generation)) {
        this.notifyEnd(pendingCall)
        this.busy = false; this.generation++; this.stopMedia(); this.call = null
        this.emit({ phase: 'idle', message: mediaError(error) })
      }
    } finally { if (this.valid(generation)) this.busy = false }
  }
  hangup(message = 'Дуудлага дууслаа.') {
    const call = this.call; this.generation++; this.busy = false; this.stopMedia(); this.call = null
    if (call && (call.owned || call.status === 'ringing' && call.caller_role !== this.role)) this.notifyEnd(call, call.status === 'ringing' && call.caller_role !== this.role ? 'decline' : 'end')
    this.emit({ phase: 'idle', message })
  }
  microphone() {
    const enabled = !this.state.microphone
    this.state.local?.getAudioTracks().forEach(track => { track.enabled = enabled }); this.emit({ microphone: enabled })
  }
  camera() {
    const enabled = !this.state.camera
    this.state.local?.getVideoTracks().forEach(track => { track.enabled = enabled }); this.emit({ camera: enabled })
  }
  async switchCamera() {
    if (this.busy || !this.pc || !this.state.local) return
    this.busy = true; const generation = this.generation
    let replacement: MediaStream | null = null
    try {
      const facing = this.facing === 'user' ? 'environment' : 'user'
      replacement = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { exact: facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 20 } } })
      if (!this.valid(generation) || !this.pc || !this.state.local) return
      const track = replacement.getVideoTracks()[0]
      const sender = this.pc.getSenders().find(item => item.track?.kind === 'video')
      if (!track || !sender) throw new Error('Камер солигдсонгүй.')
      track.enabled = this.state.camera
      await sender.replaceTrack(track)
      if (!this.valid(generation) || !this.state.local) return
      const stream = new MediaStream([...this.state.local.getAudioTracks(), track])
      this.state.local.getVideoTracks().forEach(old => old.stop()); this.facing = facing
      replacement = null; this.emit({ local: stream, message: '' })
    } catch { if (this.valid(generation)) this.emit({ message: 'Нөгөө камерыг нээж чадсангүй. Одоогийн камер үргэлжилж байна.' }) }
    finally { replacement?.getTracks().forEach(track => track.stop()); if (this.valid(generation)) this.busy = false }
  }
  dispose() {
    if (this.call?.owned) this.notifyEnd(this.call)
    this.generation++; this.disposed = true; this.stopMedia(); this.controller.abort()
    if (this.timer) clearInterval(this.timer)
    window.removeEventListener('pagehide', this.leaving); document.removeEventListener('visibilitychange', this.visible)
  }
}
