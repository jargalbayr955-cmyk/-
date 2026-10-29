'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map, Marker, LngLatBounds } from 'maplibre-gl'
import { createDotMarker, freeMapStyle, loadFreeMap, validCoords, ULAANBAATAR } from '@/lib/client/free-map'
import { adminDate, type AdminDriver } from '@/lib/client/admin-view'
import styles from '../admin/admin.module.css'

type OnlineUser = {
  id: string; phone: string; lat: number | null; lng: number | null
  last_seen_at: string | null; location_updated_at: string | null
}

export function AdminDriverMap({ drivers }: { drivers: AdminDriver[] }) {
  const container = useRef<HTMLDivElement>(null), map = useRef<Map | null>(null)
  const markers = useRef<Marker[]>([]), bounds = useRef<LngLatBounds | null>(null), fitted = useRef(false)
  const trafficLayer = useRef<any>(null)
  const [ready, setReady] = useState(false), [error, setError] = useState('')
  const [users, setUsers] = useState<OnlineUser[]>([])
  const active = drivers.filter(driver => driver.active && driver.available && validCoords(driver.lat, driver.lng))
  const online = users.filter(user => validCoords(user.lat, user.lng))

  useEffect(() => {
    let cancelled = false, pending = false
    let controller: AbortController | null = null
    const loadUsers = async () => {
      if (cancelled || pending || document.visibilityState === 'hidden') return
      pending = true
      controller?.abort(); controller = new AbortController()
      const timeout = window.setTimeout(() => controller?.abort(), 8000)
      try {
        const response = await fetch('/api/admin/online-users', { cache: 'no-store', signal: controller.signal })
        if (cancelled) return
        if (!response.ok) { if (response.status !== 401 && response.status !== 403) setError('Онлайн хэрэглэгчдийн байршлыг шинэчилж чадсангүй.'); return }
        const body = await response.json()
        if (!cancelled) setUsers(Array.isArray(body.users) ? body.users : [])
      } catch { if (!cancelled && !controller?.signal.aborted) setError('Онлайн хэрэглэгчдийн байршлыг шинэчилж чадсангүй.') }
      finally { window.clearTimeout(timeout); pending = false }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void loadUsers() }
    void loadUsers()
    const timer = window.setInterval(() => { void loadUsers() }, 10_000)
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; controller?.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const ml = await loadFreeMap()
        if (cancelled || !container.current) return

        map.current = new ml.Map({
          container: container.current,
          style: freeMapStyle(),
          center: [ULAANBAATAR.lng, ULAANBAATAR.lat],
          zoom: 11.5,
          attributionControl: {},
        }) as Map
        map.current.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right')
        map.current.on('error', () => {
          if (!cancelled) setError('Газрын зургийн зарим мэдээлэл ачаалагдсангүй. Интернэт холболтоо шалгана уу.')
        })
        map.current.on('idle', () => {
          if (!cancelled) setError('')
        })

        // Admin uses a clean road map so live drivers, customers and traffic are easy to distinguish.
        const rawGoogleMap = (map.current as any)?.rawMap
        if (rawGoogleMap && window.google?.maps) {
          rawGoogleMap.setOptions({
            mapTypeId: window.google.maps.MapTypeId?.ROADMAP || 'roadmap',
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            clickableIcons: true,
            gestureHandling: 'greedy',
            backgroundColor: '#eef2f6',
          })
          const TrafficLayer = window.google.maps.TrafficLayer
          if (TrafficLayer) {
            const traffic = new TrafficLayer()
            traffic.setMap(rawGoogleMap)
            trafficLayer.current = traffic
          }
        }

        setReady(true)
      } catch {
        if (!cancelled) setError('Газрын зураг ачаалагдсангүй. Хуудсыг шинэчилнэ үү.')
      }
    })()

    return () => {
      cancelled = true
      trafficLayer.current?.setMap?.(null)
      trafficLayer.current = null
      markers.current.forEach(marker => marker.remove())
      markers.current = []
      map.current?.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const ml = window.maplibregl
    if (!ready || !map.current || !ml) return

    markers.current.forEach(marker => marker.remove())
    markers.current = []
    const next = new ml.LngLatBounds()

    active.forEach(driver => {
      const point: [number, number] = [Number(driver.lng), Number(driver.lat)]
      const popup = new ml.Popup({ offset: 24 }).setText(
        `${driver.name || 'Жолооч'} · ${driver.car_number || 'Улсын дугааргүй'} · ${driver.phone} · Байршил: ${adminDate(driver.location_updated_at)}`,
      )
      markers.current.push(
        new ml.Marker({ element: createDotMarker('#e8433a', 22, driver.name || 'Жолооч') })
          .setLngLat(point)
          .setPopup(popup)
          .addTo(map.current!),
      )
      next.extend(point)
    })

    online.forEach(user => {
      const point: [number, number] = [Number(user.lng), Number(user.lat)]
      const popup = new ml.Popup({ offset: 22 }).setText(
        `Хэрэглэгч · ${user.phone} · Онлайн: ${adminDate(user.last_seen_at)} · GPS: ${adminDate(user.location_updated_at)}`,
      )
      markers.current.push(
        new ml.Marker({ element: createDotMarker('#2563eb', 19, 'Хэрэглэгч') })
          .setLngLat(point)
          .setPopup(popup)
          .addTo(map.current!),
      )
      next.extend(point)
    })

    bounds.current = next.isEmpty() ? null : next
    if (bounds.current && !fitted.current) {
      map.current.fitBounds(bounds.current, { padding: 60, maxZoom: 15, duration: 0 })
      fitted.current = true
    }
  }, [active, online, ready])

  const total = active.length + online.length
  return <section>
    <div className={styles.panelHeading}>
      <div>
        <p className={styles.muted}>{active.length} бэлэн жолооч · {online.length} онлайн хэрэглэгч. Тэмдэг дээр дарж дэлгэрэнгүй харна.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8, fontSize: 12, fontWeight: 800 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 999, background: '#e8433a', display: 'inline-block' }} />Жолооч</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 999, background: '#2563eb', display: 'inline-block' }} />Онлайн хэрэглэгч</span>
        </div>
      </div>
      <button
        type="button"
        disabled={!ready || !total}
        onClick={() => {
          if (bounds.current) map.current?.fitBounds(bounds.current, { padding: 60, maxZoom: 15, duration: 0 })
        }}
      >
        Бүгдийг багтаах
      </button>
    </div>
    {!total && <p className={styles.notice}>Одоогоор байршилтай бэлэн жолооч эсвэл онлайн хэрэглэгч алга.</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div ref={container} className={styles.map} aria-label="Жолооч болон онлайн хэрэглэгчдийн газрын зураг" />
  </section>
}
