import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'Тусдаа бүртгэл ашиглахгүй. Утасны дугаараараа OTP код баталгаажуулахад бүртгэл автоматаар үүснэ.' }, { status: 410 })
}
