'use client'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex flex-col" style={{background:'#f5f5f7'}}>
      <div className="bg-white px-5 py-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-medium" style={{background:'#e8433a'}}>А</div>
          <span className="font-medium text-base">Ачилт</span>
        </div>
        <span className="text-xl">🔔</span>
      </div>

      <div className="px-5 pt-6 pb-2">
        <h2 className="text-xl font-medium" style={{color:'#1a1a1a'}}>Сайн байна уу 👋</h2>
        <p className="text-sm mt-1" style={{color:'#888'}}>Машинаа хаанаас ачуулах вэ?</p>
      </div>

      <div className="px-5 pt-4 flex flex-col gap-3">
        <div
          onClick={() => router.push('/current')}
          className="bg-white rounded-2xl p-4 flex items-center gap-4 cursor-pointer active:opacity-80"
          style={{border:'0.5px solid #eee'}}
        >
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{background:'#fff0ef'}}>📍</div>
          <div className="flex-1">
            <p className="font-medium text-sm" style={{color:'#1a1a1a'}}>Энэ байгаа байршлаас</p>
            <p className="text-xs mt-0.5" style={{color:'#aaa'}}>GPS байршлыг ашиглана</p>
          </div>
          <span style={{color:'#ccc', fontSize:'20px'}}>›</span>
        </div>

        <div
          onClick={() => router.push('/manual')}
          className="bg-white rounded-2xl p-4 flex items-center gap-4 cursor-pointer active:opacity-80"
          style={{border:'0.5px solid #eee'}}
        >
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{background:'#eff5ff'}}>✏️</div>
          <div className="flex-1">
            <p className="font-medium text-sm" style={{color:'#1a1a1a'}}>Өөр газрын байршил</p>
            <p className="text-xs mt-0.5" style={{color:'#aaa'}}>Гараар хаяг оруулна</p>
          </div>
          <span style={{color:'#ccc', fontSize:'20px'}}>›</span>
        </div>

        <div
          className="rounded-2xl p-4 flex items-center gap-4 cursor-pointer active:opacity-80"
          style={{background:'#fff0ef', border:'0.5px solid #ffd5d0'}}
        >
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{background:'#ffe0dc'}}>🚨</div>
          <div className="flex-1">
            <p className="font-medium text-sm" style={{color:'#e8433a'}}>Яаралтай тусламж</p>
            <p className="text-xs mt-0.5" style={{color:'#e8433a', opacity:0.6}}>24/7 ажилладаг</p>
          </div>
          <span style={{color:'#e8433a', fontSize:'20px'}}>›</span>
        </div>
      </div>

      <div className="mt-auto flex bg-white border-t border-gray-100">
        <div className="flex-1 flex flex-col items-center py-3 gap-0.5" style={{color:'#e8433a'}}>
          <span className="text-xl">🏠</span>
          <span className="text-xs font-medium">Нүүр</span>
        </div>
        <div className="flex-1 flex flex-col items-center py-3 gap-0.5" style={{color:'#bbb'}}>
          <span className="text-xl">🕐</span>
          <span className="text-xs">Түүх</span>
        </div>
        <div className="flex-1 flex flex-col items-center py-3 gap-0.5" style={{color:'#bbb'}}>
          <span className="text-xl">👤</span>
          <span className="text-xs">Профайл</span>
        </div>
      </div>
    </div>
  )
}