import 'server-only'

export type BankSmsConfig = { sender: string; accountMask: string; receivingAccount: string }
export type BankReceipt = { code: string; amount: number; currency: 'MNT'; direction: 'credit' }

export function normalizeReceivingAccount(value: unknown) {
  if (typeof value !== 'string') return ''
  const account = value.replace(/[\s-]/g, '').toUpperCase()
  return /^(?:\d{8,20}|MN\d{20})$/.test(account) ? account : ''
}

// A masked SMS cannot prove the hidden digits. Bind the administrator's exact
// SMS mask to the saved transfer account, and check all comparable visible digits.
export function validBankSmsConfig(value: unknown, bankAccount: unknown): value is BankSmsConfig {
  if (!value || typeof value !== 'object') return false
  const config = value as Record<string, unknown>, account = normalizeReceivingAccount(bankAccount)
  return Boolean(account) && config.receivingAccount === account
    && typeof config.sender === 'string' && /^[+A-Za-z0-9][+A-Za-z0-9 ._-]{0,63}$/.test(config.sender)
    && config.sender === config.sender.trim()
    && typeof config.accountMask === 'string' && /^\d\*{3}\d{4}$/.test(config.accountMask)
    && account.endsWith(config.accountMask.slice(-4))
    && (account.startsWith('MN') || account.startsWith(config.accountMask[0]))
}

export function readBankSmsConfig(value: unknown, bankAccount: unknown): BankSmsConfig | null {
  try {
    const config: unknown = typeof value === 'string' ? JSON.parse(value) : null
    return validBankSmsConfig(config, bankAccount) ? config : null
  } catch { return null }
}

// Observed Khan Bank incoming SMS format, 2026-09-22. Anchor the entire message:
// balance, failed card transactions and reference-like digits elsewhere cannot pay.
const money = '(?:0|[1-9]\\d{0,14}|[1-9]\\d{0,2}(?:,\\d{3}){1,4})\\.\\d{2}'
const incoming = new RegExp(`^Tany (\\d\\*{3}\\d{4}) dansand ORLOGO:(${money})MNT orj ULDEGDEL:${money}MNT bolloo\\. ?Utga:(\\d{6})$`, 'i')

export function parseKhanBankSms(sms: string, sender: string, config: BankSmsConfig): BankReceipt | null {
  if (sms.length > 2048 || sender.trim() !== config.sender) return null
  const match = incoming.exec(sms.trim().replace(/\s+/g, ' '))
  if (!match || match[1] !== config.accountMask || !match[2].endsWith('.00')) return null
  const amount = Number(match[2].replace(/,/g, ''))
  if (!Number.isSafeInteger(amount) || amount <= 0) return null
  return { code: match[3], amount, currency: 'MNT', direction: 'credit' }
}
