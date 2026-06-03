'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function IndexPage() {
  const router = useRouter()
  useEffect(() => {
    const user = localStorage.getItem('user')
    if (user) {
      router.replace('/home')
    } else {
      router.replace('/register')
    }
  }, [])
  return null
}
