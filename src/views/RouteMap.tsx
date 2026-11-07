/* La mappa dei percorsi. Sta in un file a parte: la libreria è pesante e si scarica solo quando serve. */
import { useEffect, useRef, useState } from 'preact/hooks'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LngLat, Pt } from '../../shared/route'

const STYLE = (window as any).BTR_MAP_STYLE ?? 'https://tiles.openfreemap.org/styles/liberty'
const line = (c: Pt[]) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: c.map(p => [p[0], p[1]]) } })
interface Props { track: Pt[]; way: LngLat[]; center: LngLat; fit?: number; edit?: boolean; onTap?: (p: LngLat) => void; onMove?: (i: number, p: LngLat) => void }
export function RouteMap({ track, way, center, fit, edit, onTap, onMove }: Props) {
  const box = useRef<HTMLDivElement>(null), map = useRef<maplibregl.Map | null>(null), marks = useRef<maplibregl.Marker[]>([])
  const cb = useRef({ onTap, onMove }), [ready, setReady] = useState(false), [bad, setBad] = useState(false)
  cb.current = { onTap, onMove }
  useEffect(() => {
    let m: maplibregl.Map
    try { m = new maplibregl.Map({ container: box.current!, style: STYLE, center, zoom: 13.5 }) }
    catch { setBad(true); return }
    map.current = m
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('load', () => {
      m.addSource('r', { type: 'geojson', data: line([]) })
      m.addLayer({ id: 'r-b', type: 'line', source: 'r', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 8 } })
      m.addLayer({ id: 'r', type: 'line', source: 'r', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0b66c3', 'line-width': 5 } })
      setReady(true)
    })
    m.on('click', e => cb.current.onTap?.([Math.round(e.lngLat.lng * 1e6) / 1e6, Math.round(e.lngLat.lat * 1e6) / 1e6]))
    if (track.length > 1) { const b = new maplibregl.LngLatBounds(); track.forEach(p => b.extend([p[0], p[1]])); m.fitBounds(b, { padding: 44, duration: 0 }) }
    return () => { m.remove(); map.current = null }
  }, [])
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    ;(m.getSource('r') as maplibregl.GeoJSONSource).setData(line(track))
    marks.current.forEach(x => x.remove())
    const pts = edit ? way : way.slice(0, 1)
    marks.current = pts.map((p, i) => {
      const k = new maplibregl.Marker({ color: i ? '#0b66c3' : '#17694f', scale: i ? .55 : .7, draggable: !!edit }).setLngLat(p).addTo(m)
      k.on('dragend', () => { const q = k.getLngLat(); cb.current.onMove?.(i, [Math.round(q.lng * 1e6) / 1e6, Math.round(q.lat * 1e6) / 1e6]) })
      return k
    })
  }, [track, way, ready, edit])
  useEffect(() => { // una proposta appena scelta si vede tutta
    const m = map.current
    if (!m || !ready || !fit || track.length < 2) return
    const b = new maplibregl.LngLatBounds(); track.forEach(p => b.extend([p[0], p[1]])); m.fitBounds(b, { padding: 44, duration: 300 })
  }, [fit, ready])
  return bad ? <div class="rt-map rt-off"><p>La mappa non si apre su questo browser.</p></div> : <div ref={box} class="rt-map" role="application" aria-label="Mappa del percorso" />
}
