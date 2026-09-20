import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'OTP нэвтрэлт түр ашиглахгүй. Утасны дугаар + PIN ашиглана уу.' }, { status: 410 })
}
