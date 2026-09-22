export type SessionGateMode = 'entry' | 'guest' | 'customer'
export type CustomerIdentity = { id: string; phone: string }
export type SessionState = { destination: string | null; user: CustomerIdentity | null }

// A network/database failure is not proof that the user has signed out.
export async function readSession(mode: SessionGateMode, signal?: AbortSignal): Promise<SessionState> {
  const options: RequestInit = { cache: 'no-store', credentials: 'same-origin', signal }
  const [customer, driver] = await Promise.all([
    fetch('/api/customer/session', options),
    mode === 'entry' ? fetch('/api/driver/session', options) : Promise.resolve(null),
  ])
  if (driver?.ok) return { destination: '/driver', user: null }
  if (customer.ok) {
    const { user } = await customer.json()
    if (typeof user?.id !== 'string' || !user.id || !/^\+976\d{8}$/.test(user?.phone)) throw new Error('Invalid session response')
    return { destination: mode === 'customer' ? null : '/current', user: { id: user.id, phone: user.phone } }
  }
  if (customer.status !== 401 || (driver && driver.status !== 401)) throw new Error('Session service unavailable')
  return { destination: mode === 'guest' ? null : '/start', user: null }
}

export function phoneInput(value: string) {
  return value.replace(/\D/g, '').replace(/^976(?=\d{8}$)/, '').slice(0, 8)
}

export function displayPhone(phone: string) {
  return phone.replace(/^(\+976)(\d{4})(\d{4})$/, '$1 $2 $3')
}

export const CUSTOMER_SESSION_EVENT = 'achilt:customer-session-changed'
export const CUSTOMER_SESSION_STORAGE_KEY = 'achilt_customer_session_changed'

export function clearCustomerBrowserState() {
  // Remove only customer data. Never erase driver work or unrelated preferences.
  for (const key of ['user', 'current_order_id', 'tracking_driver_id', 'fromAddress', 'from', 'fromLat', 'fromLng', 'dest', 'phone_called']) {
    try { localStorage.removeItem(key) } catch { /* Cookie auth works even when storage is blocked. */ }
  }
}

export function notifyCustomerSessionChanged() {
  window.dispatchEvent(new Event(CUSTOMER_SESSION_EVENT))
  try { localStorage.setItem(CUSTOMER_SESSION_STORAGE_KEY, String(Date.now())) } catch {}
  try {
    const channel = new BroadcastChannel(CUSTOMER_SESSION_EVENT)
    channel.postMessage('changed')
    channel.close()
  } catch { /* Visibility checks cover browsers without BroadcastChannel. */ }
}

export async function logoutCustomer() {
  const response = await fetch('/api/customer/logout', { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error('Logout failed')
  clearCustomerBrowserState()
  try { sessionStorage.setItem('achilt_signed_out', '1') } catch {}
  notifyCustomerSessionChanged()
}
