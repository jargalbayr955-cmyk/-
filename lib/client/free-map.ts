'use client'

type MapLibre = typeof import('maplibre-gl')
type AnyRecord = Record<string, any>
type PointTuple = [number, number]

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
const GOOGLE_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || 'DEMO_MAP_ID'

let googleLoaderPromise: Promise<any> | null = null
let mapLibreLoaderPromise: Promise<any> | null = null

declare global {
  interface Window {
    maplibregl?: MapLibre & { __achiltGoogleAdapter?: boolean }
    google?: any
    __achiltGoogleMapsReady?: () => void
  }
}

function asPoint(value: unknown): { lat: number; lng: number } | null {
  if (Array.isArray(value) && value.length >= 2) {
    const lng = Number(value[0]), lat = Number(value[1])
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  }
  if (value && typeof value === 'object') {
    const row = value as AnyRecord
    const latValue = typeof row.lat === 'function' ? row.lat() : row.lat
    const lngValue = typeof row.lng === 'function' ? row.lng() : row.lng
    const lat = Number(latValue), lng = Number(lngValue)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  }
  return null
}

async function loadMapLibre() {
  if (typeof window === 'undefined') throw new Error('Map is browser-only')
  if (window.maplibregl?.Map && !window.maplibregl.__achiltGoogleAdapter) return window.maplibregl
  if (mapLibreLoaderPromise) return mapLibreLoaderPromise

  mapLibreLoaderPromise = import('maplibre-gl')
    .then(ml => {
      ml.setWorkerUrl(`${window.location.origin}/maplibre/${ml.getVersion()}/maplibre-gl-worker.mjs`)
      window.maplibregl = ml
      return ml
    })
    .catch(error => {
      mapLibreLoaderPromise = null
      throw error
    })
  return mapLibreLoaderPromise
}

async function loadGoogleMapsApi() {
  if (!GOOGLE_KEY) throw new Error('Google Maps API key is not configured')
  if (typeof window === 'undefined') throw new Error('Map is browser-only')
  if (window.google?.maps?.Map) return window.google
  if (googleLoaderPromise) return googleLoaderPromise

  googleLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-achilt-google-maps]')
    if (existing) {
      const started = Date.now()
      const timer = window.setInterval(() => {
        if (window.google?.maps?.Map) {
          window.clearInterval(timer)
          resolve(window.google)
        } else if (Date.now() - started > 15000) {
          window.clearInterval(timer)
          googleLoaderPromise = null
          reject(new Error('Google Maps timed out'))
        }
      }, 80)
      return
    }

    const callbackName = '__achiltGoogleMapsReady'
    const timeout = window.setTimeout(() => {
      googleLoaderPromise = null
      reject(new Error('Google Maps timed out'))
    }, 15000)

    window[callbackName] = () => {
      window.clearTimeout(timeout)
      if (window.google?.maps?.Map) resolve(window.google)
      else {
        googleLoaderPromise = null
        reject(new Error('Google Maps unavailable'))
      }
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_KEY)}&v=weekly&language=mn&region=MN&loading=async&callback=${callbackName}`
    script.async = true
    script.defer = true
    script.dataset.achiltGoogleMaps = '1'
    script.onerror = () => {
      window.clearTimeout(timeout)
      googleLoaderPromise = null
      reject(new Error('Google Maps failed to load'))
    }
    document.head.appendChild(script)
  })

  return googleLoaderPromise
}

class GoogleBoundsAdapter {
  private bounds: any
  private points = 0

  constructor(sw?: PointTuple | AnyRecord, ne?: PointTuple | AnyRecord) {
    this.bounds = new window.google.maps.LatLngBounds()
    if (sw) this.extend(sw)
    if (ne) this.extend(ne)
  }

  extend(point: PointTuple | AnyRecord) {
    const p = asPoint(point)
    if (p) {
      this.bounds.extend(p)
      this.points += 1
    }
    return this
  }

  isEmpty() {
    return this.points === 0
  }

  toGoogleBounds() {
    return this.bounds
  }
}

class GooglePopupAdapter {
  content: string | Node = ''

  constructor(_options: AnyRecord = {}) {}

  setHTML(html: string) {
    this.content = html
    return this
  }

  setText(text: string) {
    const node = document.createElement('div')
    node.textContent = text
    this.content = node
    return this
  }
}

class GoogleMarkerAdapter {
  private element?: HTMLElement
  private draggable = false
  private position = { lat: ULAANBAATAR.lat, lng: ULAANBAATAR.lng }
  private mapAdapter: GoogleMapAdapter | null = null
  private marker: any = null
  private popup: GooglePopupAdapter | null = null
  private pendingListeners: Array<{ name: string; fn: (event?: any) => void }> = []
  private googleListeners: any[] = []

  constructor(options: AnyRecord = {}) {
    this.element = options.element
    this.draggable = Boolean(options.draggable)
  }

  setLngLat(point: PointTuple) {
    const parsed = asPoint(point)
    if (!parsed) return this
    this.position = parsed
    if (this.marker) {
      if ('position' in this.marker) this.marker.position = parsed
      else this.marker.setPosition?.(parsed)
    }
    return this
  }

  getLngLat() {
    let pos = this.position
    if (this.marker) {
      const current = this.marker.position ?? this.marker.getPosition?.()
      const parsed = asPoint(current)
      if (parsed) pos = parsed
    }
    this.position = pos
    return { lat: pos.lat, lng: pos.lng }
  }

  getElement() {
    return this.element || this.marker?.content || document.createElement('div')
  }

  addTo(mapAdapter: GoogleMapAdapter) {
    this.mapAdapter = mapAdapter
    const g = window.google
    const AdvancedMarker = g?.maps?.marker?.AdvancedMarkerElement
    if (AdvancedMarker) {
      this.marker = new AdvancedMarker({
        map: mapAdapter.rawMap,
        position: this.position,
        content: this.element,
        gmpDraggable: this.draggable,
      })
    } else {
      this.marker = new g.maps.Marker({
        map: mapAdapter.rawMap,
        position: this.position,
        draggable: this.draggable,
      })
      if (this.element) {
        const text = this.element.textContent?.trim().slice(0, 16) || '•'
        this.marker.setLabel?.({ text })
      }
    }

    for (const listener of this.pendingListeners) this.attachListener(listener.name, listener.fn)
    this.pendingListeners = []
    if (this.popup) this.bindPopup()
    return this
  }

  private attachListener(name: string, fn: (event?: any) => void) {
    if (!this.marker) return
    const listener = this.marker.addListener?.(name, fn)
    if (listener) this.googleListeners.push(listener)
  }

  on(name: string, fn: (event?: any) => void) {
    if (this.marker) this.attachListener(name, fn)
    else this.pendingListeners.push({ name, fn })
    return this
  }

  setPopup(popup: GooglePopupAdapter) {
    this.popup = popup
    if (this.marker) this.bindPopup()
    return this
  }

  private bindPopup() {
    if (!this.popup || !this.marker || !this.mapAdapter) return
    const info = new window.google.maps.InfoWindow({ content: this.popup.content })
    const listener = this.marker.addListener?.('click', () => {
      info.open({ map: this.mapAdapter?.rawMap, anchor: this.marker })
    })
    if (listener) this.googleListeners.push(listener)
  }

  remove() {
    for (const listener of this.googleListeners) listener?.remove?.()
    this.googleListeners = []
    if (!this.marker) return
    if ('map' in this.marker) this.marker.map = null
    else this.marker.setMap?.(null)
    this.marker = null
  }
}

function lineCoordinates(data: any): any[] {
  if (!data) return []
  if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
    const line = data.features.find((feature: any) => feature?.geometry?.type === 'LineString')
    return line?.geometry?.coordinates || []
  }
  if (data.type === 'Feature') return data.geometry?.type === 'LineString' ? data.geometry.coordinates || [] : []
  if (data.type === 'LineString') return data.coordinates || []
  if (data.geometry?.type === 'LineString') return data.geometry.coordinates || []
  return []
}

class GoogleGeoJsonSourceAdapter {
  private data: any
  private polyline: any = null
  private style: AnyRecord = {}
  private routeRequestSeq = 0

  constructor(private mapAdapter: GoogleMapAdapter, private id: string, data: any) {
    this.data = data
  }

  setData(data: any) {
    this.data = data
    this.render(this.style)
    return this
  }

  setStyle(style: AnyRecord) {
    this.style = style || {}
    this.render(this.style)
  }

  private clearLine() {
    this.polyline?.setMap?.(null)
    this.polyline = null
  }

  private drawPath(path: Array<{ lat: number; lng: number }>, style: AnyRecord = {}) {
    if (path.length < 2) {
      this.clearLine()
      return
    }
    this.clearLine()
    this.polyline = new window.google.maps.Polyline({
      map: this.mapAdapter.rawMap,
      path,
      strokeColor: style['line-color'] || '#e8433a',
      strokeWeight: Number(style['line-width'] || 5),
      strokeOpacity: Number(style['line-opacity'] ?? .9),
      geodesic: true,
    })
  }

  private async renderRoadRoute(path: Array<{ lat: number; lng: number }>, style: AnyRecord, seq: number) {
    if (!/(route|connection)/i.test(this.id) || path.length < 2 || !window.google?.maps?.importLibrary) return
    try {
      const routesLibrary = await window.google.maps.importLibrary('routes')
      const Route = routesLibrary?.Route
      if (!Route?.computeRoutes) return
      const result = await Route.computeRoutes({
        origin: path[0],
        destination: path[path.length - 1],
        travelMode: 'DRIVING',
        routingPreference: 'TRAFFIC_AWARE',
        fields: ['path'],
      })
      if (seq !== this.routeRequestSeq) return
      const routePath = (result?.routes?.[0]?.path || [])
        .map((point: any) => asPoint(point))
        .filter(Boolean) as Array<{ lat: number; lng: number }>
      if (routePath.length > 1) this.drawPath(routePath, style)
    } catch {
      // Routes API is optional; the straight geodesic fallback remains visible.
    }
  }

  private render(style: AnyRecord = {}) {
    const coords = lineCoordinates(this.data)
    const path = coords.map((coord: any) => asPoint(coord)).filter(Boolean) as Array<{ lat: number; lng: number }>
    const seq = ++this.routeRequestSeq
    if (path.length < 2) {
      this.clearLine()
      return
    }
    this.drawPath(path, style)
    void this.renderRoadRoute(path, style, seq)
  }

  remove() {
    this.routeRequestSeq += 1
    this.clearLine()
  }
}

class GoogleMapAdapter {
  rawMap: any
  private container: HTMLElement
  private listeners: any[] = []
  private sources = new Map<string, GoogleGeoJsonSourceAdapter>()
  private layers = new Map<string, AnyRecord>()

  constructor(options: AnyRecord) {
    this.container = options.container
    const center = asPoint(options.center) || ULAANBAATAR
    this.rawMap = new window.google.maps.Map(options.container, {
      center,
      zoom: Number(options.zoom || 12),
      mapId: GOOGLE_MAP_ID,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: true,
      gestureHandling: 'greedy',
      zoomControl: true,
      controlSize: 34,
    })
  }

  addControl() {
    return this
  }

  on(name: string, fn: (event?: any) => void) {
    if (name === 'error') return this
    if (name === 'load') {
      const listener = window.google.maps.event.addListenerOnce(this.rawMap, 'idle', fn)
      if (listener) this.listeners.push(listener)
      return this
    }
    const listener = this.rawMap.addListener(name, (event: any) => {
      if (name === 'click') {
        const parsed = asPoint(event?.latLng)
        fn({ ...event, lngLat: parsed || { lat: ULAANBAATAR.lat, lng: ULAANBAATAR.lng } })
      } else {
        fn(event)
      }
    })
    if (listener) this.listeners.push(listener)
    return this
  }

  once(name: string, fn: (event?: any) => void) {
    if (name === 'error') return this
    const eventName = name === 'load' ? 'idle' : name
    const listener = window.google.maps.event.addListenerOnce(this.rawMap, eventName, fn)
    if (listener) this.listeners.push(listener)
    return this
  }

  easeTo(options: AnyRecord) {
    const center = asPoint(options.center)
    if (center) this.rawMap.panTo(center)
    if (Number.isFinite(Number(options.zoom))) this.rawMap.setZoom(Number(options.zoom))
    return this
  }

  getZoom() {
    return Number(this.rawMap.getZoom?.() || 0)
  }

  fitBounds(bounds: GoogleBoundsAdapter, options: AnyRecord = {}) {
    const googleBounds = bounds?.toGoogleBounds?.() || bounds
    const padding = options.padding ?? 40
    this.rawMap.fitBounds(googleBounds, padding)
    if (Number.isFinite(Number(options.maxZoom))) {
      const listener = window.google.maps.event.addListenerOnce(this.rawMap, 'idle', () => {
        const zoom = Number(this.rawMap.getZoom?.() || 0)
        if (zoom > Number(options.maxZoom)) this.rawMap.setZoom(Number(options.maxZoom))
      })
      if (listener) this.listeners.push(listener)
    }
    return this
  }

  resize() {
    window.google?.maps?.event?.trigger?.(this.rawMap, 'resize')
    return this
  }

  addSource(id: string, source: AnyRecord) {
    const existing = this.sources.get(id)
    if (existing) existing.remove()
    const wrapper = new GoogleGeoJsonSourceAdapter(this, id, source?.data)
    this.sources.set(id, wrapper)
    const layer = [...this.layers.values()].find(row => row.source === id)
    wrapper.setStyle(layer?.paint || {})
    return this
  }

  getSource(id: string) {
    return this.sources.get(id)
  }

  addLayer(layer: AnyRecord) {
    this.layers.set(layer.id, layer)
    this.sources.get(layer.source)?.setStyle(layer.paint || {})
    return this
  }

  isStyleLoaded() {
    return true
  }

  remove() {
    for (const listener of this.listeners) listener?.remove?.()
    this.listeners = []
    for (const source of this.sources.values()) source.remove()
    this.sources.clear()
    this.layers.clear()
    window.google?.maps?.event?.clearInstanceListeners?.(this.rawMap)
    this.container.replaceChildren()
  }
}

class GoogleNavigationControl {
  constructor(_options: AnyRecord = {}) {}
}

async function buildGoogleAdapter() {
  await loadGoogleMapsApi()
  if (window.google?.maps?.importLibrary) {
    await window.google.maps.importLibrary('maps')
    try {
      await window.google.maps.importLibrary('marker')
    } catch {
      // Legacy Marker remains available as a fallback.
    }
  }

  const adapter = {
    __achiltGoogleAdapter: true,
    Map: GoogleMapAdapter,
    Marker: GoogleMarkerAdapter,
    Popup: GooglePopupAdapter,
    LngLatBounds: GoogleBoundsAdapter,
    NavigationControl: GoogleNavigationControl,
  }
  window.maplibregl = adapter as unknown as MapLibre & { __achiltGoogleAdapter?: boolean }
  return adapter
}

export async function loadFreeMap(): Promise<MapLibre> {
  if (typeof window === 'undefined') throw new Error('Map is browser-only')

  if (GOOGLE_KEY) {
    try {
      return await buildGoogleAdapter() as unknown as MapLibre
    } catch (error) {
      console.warn('[Achilt] Google Maps failed; using OpenFreeMap fallback.', error)
      if (window.maplibregl?.__achiltGoogleAdapter) delete window.maplibregl
    }
  }

  return loadMapLibre()
}

export function freeMapStyle() {
  return OPENFREEMAP_STYLE
}

export function mapProviderName() {
  return GOOGLE_KEY ? 'Google Maps' : 'OpenFreeMap'
}

export function createDotMarker(color = '#2563eb', size = 22, label?: string) {
  const wrap = document.createElement('div')
  wrap.style.display = 'flex'
  wrap.style.flexDirection = 'column'
  wrap.style.alignItems = 'center'
  wrap.style.gap = '4px'
  wrap.style.cursor = 'grab'

  const dot = document.createElement('div')
  dot.style.width = `${size}px`
  dot.style.height = `${size}px`
  dot.style.borderRadius = '999px'
  dot.style.background = color
  dot.style.border = '4px solid white'
  dot.style.boxShadow = '0 4px 16px rgba(0,0,0,.38)'
  wrap.appendChild(dot)

  if (label) {
    const tag = document.createElement('div')
    tag.textContent = label
    tag.style.padding = '4px 8px'
    tag.style.borderRadius = '10px'
    tag.style.background = 'rgba(7,10,16,.92)'
    tag.style.color = 'white'
    tag.style.fontSize = '11px'
    tag.style.fontWeight = '800'
    tag.style.whiteSpace = 'nowrap'
    tag.style.border = '1px solid rgba(255,255,255,.18)'
    wrap.appendChild(tag)
  }

  return wrap
}

export function createTruckMarker(label?: string) {
  const wrap = document.createElement('div')
  wrap.style.display = 'flex'
  wrap.style.flexDirection = 'column'
  wrap.style.alignItems = 'center'
  wrap.style.gap = '3px'
  wrap.style.filter = 'drop-shadow(0 4px 7px rgba(0,0,0,.55))'

  const truck = document.createElement('div')
  truck.textContent = '🚛'
  truck.style.fontSize = '31px'
  truck.style.lineHeight = '1'
  wrap.appendChild(truck)

  if (label) {
    const tag = document.createElement('div')
    tag.textContent = label
    tag.style.padding = '4px 8px'
    tag.style.borderRadius = '10px'
    tag.style.background = '#e8433a'
    tag.style.color = 'white'
    tag.style.fontSize = '11px'
    tag.style.fontWeight = '900'
    tag.style.whiteSpace = 'nowrap'
    tag.style.border = '1px solid rgba(255,255,255,.2)'
    wrap.appendChild(tag)
  }

  return wrap
}

export function validCoords(lat: unknown, lng: unknown) {
  if (lat == null || lng == null || String(lat).trim() === '' || String(lng).trim() === '') return false
  const a = Number(lat)
  const b = Number(lng)
  return Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180
}

export const ULAANBAATAR = { lat: 47.9184, lng: 106.9177 }

export function mapErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /webgl|graphics context/i.test(message)
    ? 'Энэ browser 3D газрын зураг дэмжихгүй байна. Chrome/Safari-г шинэчлэх эсвэл өөр browser ашиглана уу.'
    : 'Газрын зураг ачаалагдсангүй. Интернэтээ шалгаад хуудсыг дахин нээнэ үү.'
}
