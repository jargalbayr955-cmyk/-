export type CallRole = 'customer' | 'driver'
export type VideoCall = {
  id: string; status: 'ringing' | 'active' | 'ended' | 'declined' | 'missed'
  caller_role: CallRole; owned: boolean; expires_at: string
  offer_sdp: string | null; answer_sdp: string | null
}
export type CallResponse = { call: VideoCall | null; ready: boolean; iceServers?: RTCIceServer[] }
export const liveCall = (call: VideoCall | null) => Boolean(call && ['ringing', 'active'].includes(call.status))
