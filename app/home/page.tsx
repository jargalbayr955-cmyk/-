 'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const [choice, setChoice] = useState<null | 1 | 2>(null)
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-sm mx-auto pt-8">
        <div className="flex items-center gap-2 mb-8">
          <span className="text-2xl">🚛</span>
          <h1 className="text-xl font-medium">АчТүрэн</h1>
        </div>

        <h2 className="text-lg font-medium mb-2">Байршил сонгох</h2>
        <p className="text-gray-500 text-sm mb-6">Машинаа хаанаас ачуулах вэ?</p>

        <div
          onClick={() => router.push('/current')}
          className="bg-white border border-gray-200 rounded-2xl p-4 mb-3 flex items-center gap-4 cursor-pointer hover:border-red-400 transition-colors"
        >
          <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white font-medium">1</div>
          <div className="flex-1">
            <p className="font-medium text-sm">Энэ байгаа байршлаас</p>
            <p className="text-gray-400 text-xs mt-0.5">GPS байршлыг ашиглана</p>
          </div>
          <span className="text-red-400">📍</span>
        </div>

        <div
          onClick={() => router.push('/manual')}
          className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:border-red-400 transition-colors"
        >
          <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white font-medium">2</div>
          <div className="flex-1">
            <p className="font-medium text-sm">Өөр газрын байршил</p>
            <p className="text-gray-400 text-xs mt-0.5">Гараар хаяг оруулна</p>
          </div>
          <span className="text-red-400">✏️</span>
        </div>
      </div>
    </div>
  )
}
