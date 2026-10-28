import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'PIN нэвтрэлт ашиглахгүй. Утасны дугаараараа OTP код авч нэвтэрнэ үү.' }, { status: 410 })
}
