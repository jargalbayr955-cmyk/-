'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function IndexPage() {
  const router = useRouter()

  useEffect(() => {
    try {
      // Жолооч нэвтэрсэн бол /driver руу
      const driver = localStorage.getItem('driver_session')
      if (driver && driver !== 'null' && driver !== 'undefined') {
        router.replace('/driver')
        return
      }
      // Хэрэглэгч нэвтэрсэн бол /home руу
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
