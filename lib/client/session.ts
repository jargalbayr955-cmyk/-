export type SessionGateMode = 'entry' | 'guest' | 'customer'

// A network/database failure is not proof that the user has signed out.
export async function sessionDestination(mode: SessionGateMode, signal?: AbortSignal): Promise<string | null> {
  const options: RequestInit = { cache: 'no-store', credentials: 'same-origin', signal }
  const [customer, driver] = await Promise.all([
    fetch('/api/customer/session', options),
    mode === 'entry' ? fetch('/api/driver/session', options) : Promise.resolve(null),
  ])
  if (driver?.ok) return '/driver'
  if (customer.ok) return mode === 'customer' ? null : '/home'
  if (customer.status !== 401 || (driver && driver.status !== 401)) throw new Error('Session service unavailable')
  return mode === 'entry' ? '/register' : mode === 'customer' ? '/login' : null
}
