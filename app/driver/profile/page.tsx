'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function DriverProfilePage() {
  const [driver, setDriver] = useState<any>(null)
  const [form, setForm] = useState({ name: '', phone: '', car_type: '', car_number: '', photo_url: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    const session = localStorage.getItem('driver_session')
    if (!session) { router.push('/driver'); return }
    const d = JSON.parse(session)
    setDriver(d)
    setForm({
      name: d.name || '',
      phone: d.phone || '',
      car_type: d.car_type || '',
      car_number: d.car_number || '',
      photo_url: d.photo_url || ''
    })
  }, [])

  const handleSave = async () => {
    if (!form.name || !form.phone) return setError('Нэр болон утас заавал бөглөнө үү')
    setSaving(true)
    setError('')
    const { data, error } = await supabase
      .from('drivers')
      .update({
        name: form.name,
        car_type: form.car_type,
        car_number: form.car_number,
        photo_url: form.photo_url
      })
      .eq('id', driver.id)
      .select()
      .single()

    if (error) {
      setError('Хадгалахад алдаа гарлаа')
    } else {
      localStorage.setItem('driver_session', JSON.stringify(data))
      setDriver(data)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  if (!driver) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <button onClick={() => router.push('/driver')} className="text-gray-400 text-sm">← Буцах</button>
        <p className="font-medium text-sm">Профайл засах</p>
      </div>

      <div className="px-4 pt-6 pb-10 max-w-sm mx-auto">

        {/* Зураг */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-24 h-24 rounded-full overflow-hidden mb-3 border-2 border-gray-200">
            {form.photo_url ? (
              <img src={form.photo_url} alt="profile" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-red-500 flex items-center justify-center text-white text-3xl font-medium">
                {form.name.charAt(0) || '?'}
              </div>
            )}
          </div>
          <input
            type="text"
            placeholder="Зургийн URL оруулна уу..."
            value={form.photo_url}
            onChange={e => setForm({...form, photo_url: e.target.value})}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none text-center"
          />
        </div>

        {/* Мэдээлэл */}
        <div className="space-y-3">
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Нэр</p>
            <input
              type="text"
              placeholder="Бүтэн нэр"
              value={form.name}
              onChange={e => setForm({...form, name: e.target.value})}
              className="w-full text-sm outline-none text-gray-700"
            />
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Утасны дугаар</p>
            <p className="text-sm text-gray-400">{form.phone}</p>
            <p className="text-xs text-gray-300 mt-1">Утасны дугаар өөрчлөх боломжгүй</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Машины төрөл</p>
            <input
              type="text"
              placeholder="Тавцан, чирэгч, эвдрэл..."
              value={form.car_type}
              onChange={e => setForm({...form, car_type: e.target.value})}
              className="w-full text-sm outline-none text-gray-700"
            />
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Машины дугаар</p>
            <input
              type="text"
              placeholder="1234УБА"
              value={form.car_number}
              onChange={e => setForm({...form, car_number: e.target.value})}
              className="w-full text-sm outline-none text-gray-700"
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-xs mt-3 text-center">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-2xl py-4 font-medium text-sm text-white mt-6 disabled:opacity-50"
          style={{background:'#e8433a'}}
        >
          {saving ? 'Хадгалж байна...' : saved ? '✅ Хадгалагдлаа!' : 'Хадгалах'}
        </button>
      </div>
    </div>
  )
}
