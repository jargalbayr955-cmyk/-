'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map, Marker, LngLatBounds } from 'maplibre-gl'
import { createDotMarker, freeMapStyle, loadFreeMap, validCoords, ULAANBAATAR } from '@/lib/client/free-map'
import { adminDate, type AdminDriver } from '@/lib/client/admin-view'
import styles from '../admin/admin.module.css'

export function AdminDriverMap({ drivers }: { drivers: AdminDriver[] }) {
  const container = useRef<HTMLDivElement>(null), map = useRef<Map | null>(null)
  const markers = useRef<Marker[]>([]), bounds = useRef<LngLatBounds | null>(null), fitted = useRef(false)
  const [ready, setReady] = useState(false), [error, setError] = useState('')
  const active = drivers.filter(driver => driver.active && driver.available && validCoords(driver.lat, driver.lng))
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const ml = await loadFreeMap()
        if (cancelled || !container.current) return
        map.current = new ml.Map({ container: container.current, style: freeMapStyle(), center: [ULAANBAATAR.lng, ULAANBAATAR.lat], zoom: 11.5, attributionControl: {} })
        map.current.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')
        map.current.on('error', () => { if (!cancelled) setError('Газрын зургийн зарим мэдээлэл ачаалагдсангүй. Интернэт холболтоо шалгана уу.') })
        setReady(true)
      } catch { if (!cancelled) setError('Газрын зураг ачаалагдсангүй. Хуудсыг шинэчилнэ үү.') }
    })()
    return () => { cancelled = true; markers.current.forEach(marker => marker.remove()); markers.current = []; map.current?.remove(); map.current = null }
  }, [])
  useEffect(() => {
    const ml = window.maplibregl
    if (!ready || !map.current || !ml) return
    markers.current.forEach(marker => marker.remove()); markers.current = []
    const next = new ml.LngLatBounds()
    drivers.filter(driver => driver.active && driver.available && validCoords(driver.lat, driver.lng)).forEach(driver => {
      const point: [number, number] = [Number(driver.lng), Number(driver.lat)]
      const popup = new ml.Popup({ offset: 24 }).setText(`${driver.name || 'Жолооч'} · ${driver.car_number || 'Улсын дугааргүй'} · ${driver.phone} · Байршил: ${adminDate(driver.location_updated_at)}`)
      markers.current.push(new ml.Marker({ element: createDotMarker('#e8433a', 22, driver.name || 'Жолооч') }).setLngLat(point).setPopup(popup).addTo(map.current!))
      next.extend(point)
    })
    bounds.current = next.isEmpty() ? null : next
    if (bounds.current && !fitted.current) { map.current.fitBounds(bounds.current, { padding: 60, maxZoom: 15, duration: 0 }); fitted.current = true }
  }, [drivers, ready])
  return <section>
    <div className={styles.panelHeading}>
      <p className={styles.muted}>{active.length} жолоочийн хамгийн сүүлд илгээсэн байршил. Тэмдэг дээр дарж нэр, утас, шинэчилсэн цагийг харна.</p>
      <button type="button" disabled={!ready || !active.length} onClick={() => { if (bounds.current) map.current?.fitBounds(bounds.current, { padding: 60, maxZoom: 15, duration: 0 }) }}>Бүх жолоочийг багтаах</button>
    </div>
    {!active.length && <p className={styles.notice}>Одоогоор байршилтай, захиалга авахад бэлэн жолооч алга.</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div ref={container} className={styles.map} aria-label="Жолооч нарын газрын зураг" />
  </section>
}
