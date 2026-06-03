'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function IndexPage() {
  const router = useRouter()

  useEffect(() => {
    try {
      const user = localStorage.getItem('user')
      if (user && user !== 'null' && user !== 'undefined') {
        router.replace('/home')
      } else {
        router.replace('/register')
      }
    } catch {
      router.replace('/register')
    }
  }, [])

  return (
    <div style={{minHeight:'100vh', background:'#0a0a0f'}}/>
  )
}
