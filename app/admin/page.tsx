'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Driver = {
  id: string
  name: string
  phone: string
  car_type: string
  price: number
  rating: number
  available: boolean
}

export default function AdminPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', phone: '', car_type: '', price: '' })
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [heroUrl, setHeroUrl] = useState('')
  const [heroSaved, setHeroSaved] = useState(false)

  const ADMIN_PASSWORD = 'achilt2024'

  const fetchDrivers = async () => {
    const { data } = await supabase.from('drivers').select().order('created_at', { ascending: false })
    if (data) setDrivers(data)
    setLoading(false)
  }

  useEffect(() => {
    if (authed) {
      fetchDrivers()
      const saved = localStorage.getItem('hero_url')
      if (saved) setHeroUrl(saved)
    }
  }, [authed])

  const saveHeroUrl = () => {
    localStorage.setItem('hero_url', heroUrl)
    setHeroSaved(true)
    setTimeout(() => setHeroSaved(false), 2000)
  }

  const handleAdd = async () => {
    if (!form.name || !form.phone || !form.car_type || !form.price) return
    setAdding(true)
    await supabase.from('drivers').insert({
      name: form.name,
      phone: form.phone,
      car_type: form.car_type,
      price: parseInt(form.price),
      rating: 5.0,
      available: true,
    })
    setForm({ name: '', phone: '', car_type: '', price: '' })
    setShowForm(false)
    fetchDrivers()
    setAdding(false)
  }

  const toggleAvailable = async (id: string, current: boolean) => {
    await supabase.from('drivers').update({ available: !current }).eq('id', id)
    fetchDrivers()
  }

  const deleteDriver = async (id: string) => {
    await supabase.from('drivers').delete().eq('id', id)
    fetchDrivers()
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-2xl">🔐</span>
            <h1 className="text-xl font-medium">Admin</h1>
          </div>
          <input
            type="password"
            placeholder="Нууц үг"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 mb-4 text-sm outline-none"
          />
          <button
            onClick={() => password === ADMIN_PASSWORD ? setAuthed(true) : alert('Буруу нууц үг')}
            className="w-full bg-red-500 text-white rounded-xl py-3 font-medium text-sm"
          >
            Нэвтрэх
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto pt-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🚛</span>
            <h1 className="text-xl font-medium">Admin Panel</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-red-500 text-white rounded-xl px-4 py-2 text-sm font-medium"
          >
            + Жолооч нэмэх
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
          <h3 className="font-medium text-sm mb-3">🖼️ Нүүр хуудасны зураг</h3>
          <input
            type="text"
            placeholder="Зургийн URL оруулна уу..."
            value={heroUrl}
            onChange={e => setHeroUrl(e.target.value)}
            className="w-full border border-gray-100 rounded-xl px-3 py-2 text-sm mb-2 outline-none"
          />
          {heroUrl && (
            <img src={heroUrl} alt="preview" className="w-full h-32 object-cover rounded-xl mb-2" />
          )}
          <button
            onClick={saveHeroUrl}
            className="w-full bg-red-500 text-white rounded-xl py-2 text-sm font-medium"
          >
            {heroSaved ? '✅ Хадгалагдлаа!' : 'Хадгалах'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
            <h3 className="font-medium text-sm mb-3">Шинэ жолооч</h3>
            <input type="text" placeholder="Нэр" value={form.name}
              onChange={e => setForm({...form, name: e.target.value})}
              className="w-full border border-gray-100 rounded-xl px-3 py-2 text-sm mb-2 outline-none" />
            <input type="tel" placeholder="Утас" value={form.phone}
              onChange={e => setForm({...form, phone: e.target.value})}
              className="w-full border border-gray-100 rounded-xl px-3 py-2 text-sm mb-2 outline-none" />
            <input type="text" placeholder="Машины төрөл (Тавцан / Чирэгч)" value={form.car_type}
              onChange={e => setForm({...form, car_type: e.target.value})}
              className="w-full border border-gray-100 rounded-xl px-3 py-2 text-sm mb-2 outline-none" />
            <input type="number" placeholder="Үнэ" value={form.price}
              onChange={e => setForm({...form, price: e.target.value})}
              className="w-full border border-gray-100 rounded-xl px-3 py-2 text-sm mb-3 outline-none" />
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={adding}
                className="flex-1 bg-red-500 text-white rounded-xl py-2 text-sm font-medium disabled:opacity-50">
                {adding ? 'Нэмж байна...' : 'Нэмэх'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-200 rounded-xl py-2 text-sm">
                Болих
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 mb-3">{drivers.length} жолооч бүртгэлтэй</p>

        {loading ? (
          <p className="text-center text-gray-400 text-sm py-12">Ачааллаж байна...</p>
        ) : (
          <div className="space-y-3">
            {drivers.map((d) => (
              <div key={d.id} className="bg-white border border-gray-200 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                    {d.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{d.name}</p>
                    <p className="text-xs text-gray-400">{d.phone} · {d.car_type} · ₮{d.price.toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleAvailable(d.id, d.available)}
                      className={"text-xs rounded-lg px-3 py-1.5 font-medium " + (d.available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                      {d.available ? 'Идэвхтэй' : 'Идэвхгүй'}
                    </button>
                    <button onClick={() => deleteDriver(d.id)}
                      className="text-xs bg-red-50 text-red-500 rounded-lg px-3 py-1.5">
                      Устгах
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}