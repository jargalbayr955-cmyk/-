'use client'

type MapLibre = typeof import('maplibre-gl')
const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
let loaderPromise: Promise<MapLibre> | null = null

declare global {
  interface Window { maplibregl?: MapLibre }
}

export async function loadFreeMap(): Promise<MapLibre> {
  if (typeof window === 'undefined') throw new Error('Map is browser-only')
  if (window.maplibregl) return window.maplibregl
  loaderPromise ??= import('maplibre-gl').then(ml => {
    window.maplibregl = ml
    return ml
  }).catch(error => {
    loaderPromise = null
    throw error
  })
  return loaderPromise
}

export function freeMapStyle() {
  return OPENFREEMAP_STYLE
}

export function createDotMarker(color = '#2563eb', size = 22, label?: string) {
  const wrap = document.createElement('div')
  wrap.style.display = 'flex'
  wrap.style.flexDirection = 'column'
  wrap.style.alignItems = 'center'
  wrap.style.gap = '4px'

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
