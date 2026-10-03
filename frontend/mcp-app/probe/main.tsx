/**
 * SPIKE (throwaway): can Mapbox GL JS run inside ChatGPT's widget sandbox? Plain DOM, reports live.
 * Logs nothing to the console except fixed strings. Delete after the live test.
 */
import './probe.css'
import mapboxgl from 'mapbox-gl'
import { App } from '@modelcontextprotocol/ext-apps'
import { QuietPostMessageTransport } from '../src/quiet-transport'

const TOKEN_KEY = 'astrail/mapbox_token'
const STOPS: [number, number][] = [[139.7027, 35.6702], [139.7123, 35.6652], [139.7016, 35.658]]
const CAP = { violations: 20, errors: 5 }

function mountProbe(root: HTMLElement): void {
  const report = document.createElement('ul')
  report.id = 'report'
  const mapBox = document.createElement('div')
  mapBox.id = 'map'
  const button = document.createElement('button')
  button.textContent = 'Try streets-v12 style'
  root.append(mapBox, button, report)

  const rows = new Map<string, HTMLLIElement>()
  const set = (key: string, value: string) => {
    let li = rows.get(key)
    if (!li) {
      li = document.createElement('li')
      rows.set(key, li)
      report.append(li)
    }
    li.textContent = `${key}: ${value}`
  }

  set('origin', location.origin)
  set('referrer', document.referrer || '(empty)')
  set('userAgent', navigator.userAgent.slice(0, 80))
  set('platform', 'pending')
  set('token', 'waiting')

  let violations = 0
  document.addEventListener('securitypolicyviolation', (e) => {
    if (violations >= CAP.violations) return
    violations += 1
    set(`csp#${violations}`, `${e.violatedDirective} ${e.blockedURI}`)
  })

  const canvas = document.createElement('canvas')
  const supported = typeof mapboxgl.supported === 'function' ? mapboxgl.supported() : !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  set('webgl', String(supported))

  try {
    const w = new Worker(URL.createObjectURL(new Blob(['postMessage(1)'])))
    set('worker', 'pending')
    const timer = setTimeout(() => { set('worker', 'no reply in 3s'); w.terminate() }, 3000)
    w.onmessage = () => { clearTimeout(timer); set('worker', 'ok'); w.terminate() }
    w.onerror = (e) => { clearTimeout(timer); set('worker', `error ${e.message || '(no message)'}`) }
  } catch (err) {
    set('worker', `blocked ${err instanceof Error ? err.message : 'unknown'}`)
  }

  let map: mapboxgl.Map | null = null
  const start = (token: string) => {
    if (map) return
    const t0 = performance.now()
    let errors = 0
    map = new mapboxgl.Map({ container: mapBox, style: 'mapbox://styles/mapbox/standard', center: [139.7, 35.67], zoom: 12, accessToken: token })
    const m = map
    const noLoad = setTimeout(() => set('map', 'NO LOAD after 15s'), 15000)
    m.on('error', (e) => {
      if (errors >= CAP.errors) return
      errors += 1
      set(`map-error#${errors}`, e.error?.message ?? 'unknown')
    })
    m.on('load', () => {
      clearTimeout(noLoad)
      set('map', `loaded in ${Math.round(performance.now() - t0)} ms`)
      STOPS.forEach((c) => new mapboxgl.Marker().setLngLat(c).addTo(m))
      m.addSource('probe-line', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: STOPS } } })
      m.addLayer({ id: 'probe-line', type: 'line', source: 'probe-line', paint: { 'line-color': '#C9974E', 'line-width': 4 } })
    })
  }
  button.addEventListener('click', () => map?.setStyle('mapbox://styles/mapbox/streets-v12'))

  const app = new App({ name: 'astrail-map-probe', version: '1' })
  app.addEventListener('toolresult', (result) => {
    const token = result._meta?.[TOKEN_KEY]
    if (typeof token === 'string' && token) {
      set('token', 'present')
      start(token)
    } else {
      set('token', 'missing')
    }
  })
  app.connect(new QuietPostMessageTransport()).then(
    () => set('platform', String(app.getHostContext()?.platform ?? '(unknown)')),
    () => set('platform', 'connect failed'),
  )
}

const mount = document.getElementById('astrail-probe-root')
if (mount) mountProbe(mount)
