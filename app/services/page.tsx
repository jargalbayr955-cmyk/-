'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ServicesPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/current') }, [router])
  return <main style={{minHeight:'100dvh', background:'#060608', color:'rgba(255,255,255,.55)', display:'grid', placeItems:'center'}}>Газрын зураг нээж байна…</main>
}
