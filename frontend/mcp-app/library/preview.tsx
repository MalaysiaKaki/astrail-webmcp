/// <reference types="vite/client" />
/**
 * Dev-only preview of the Trip Library with a fake ChatGPT host (real AppBridge over the SDK's
 * in-memory transport). Run `npx vite --config mcp-app/vite.config.ts` from frontend/ and open
 * /library-preview.html. `?empty=1` shows the empty account, `?long=1` serves the long-text
 * fixture for the first trip, `?theme=dark` mimics a dark ChatGPT host, `?inline=1` reports the
 * inline display mode. Not part of the production bundle (vite.config.ts builds
 * library/main.tsx only); the root id differs from main.tsx's auto-mount on purpose.
 *
 * The live map: set VITE_MAPBOX_PREVIEW_TOKEN (a `pk.` token) in the dev server's environment and
 * the entrypoint result carries it in `_meta`, as the real entrypoint tools do. Never commit it.
 */
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { startTripLibrary } from './main'
import { EMPTY_TRIPS_PAGE, TRIPS_PAGE_FIXTURE } from './__fixtures__/trips-page'
import { LONG_TEXT_RESPONSE, MULTI_SOURCE_RESPONSE, OTHER_TRIP_RESPONSE } from '../src/__fixtures__/multi-source-bundle'
import { renderResult } from '../src/__tests__/tool-results'
import { MAPBOX_TOKEN_META_KEY, type ItineraryResponse } from '@/lib/mcp/contract'

/* The fixture puts every place on one coordinate, which stacks all pins in one spot on the live
   map. The preview spreads them over real places (Tokyo for the first trip, Osaka for the other)
   so framing, pin taps and trip switching can be seen. Fixture-only; matched by name prefix. */
type Spot = [lat: number, lng: number]
const TOKYO: Record<string, Spot> = {
  'Sensō-ji': [35.7148, 139.7967], 'Nakamise-dori': [35.7117, 139.7963], 'Kappabashi': [35.7126, 139.7880],
  'teamLab Planets': [35.6491, 139.7898], 'Tsukiji': [35.6655, 139.7707], 'Shibuya Sky': [35.6585, 139.7023],
}
const OSAKA: Record<string, Spot> = {
  'Sensō-ji': [34.6873, 135.5262], 'Nakamise-dori': [34.6687, 135.5013], 'Kappabashi': [34.6658, 135.5061],
  'teamLab Planets': [34.6525, 135.5063], 'Tsukiji': [34.6687, 135.5062], 'Shibuya Sky': [34.7055, 135.4983],
}
function spread(response: ItineraryResponse, spots: Record<string, Spot>): ItineraryResponse {
  const spotFor = (name: string) => Object.entries(spots).find(([prefix]) => name.startsWith(prefix))?.[1]
  const places = response.bundle.places.map((tp) => {
    const spot = tp.place ? spotFor(tp.place.name) : undefined
    return spot && tp.place ? { ...tp, place: { ...tp.place, lat: spot[0], lng: spot[1] } } : tp
  })
  return { ...response, bundle: { ...response.bundle, places } }
}

const params = new URLSearchParams(window.location.search)
const first = spread(params.get('long') ? LONG_TEXT_RESPONSE : MULTI_SOURCE_RESPONSE, TOKYO)
const other = spread(OTHER_TRIP_RESPONSE, OSAKA)
const previewToken: unknown = import.meta.env.VITE_MAPBOX_PREVIEW_TOKEN
const tokenMeta = typeof previewToken === 'string' && previewToken ? { _meta: { [MAPBOX_TOKEN_META_KEY]: previewToken } } : {}
const displayMode = params.get('inline') ? 'inline' : 'fullscreen'
const [appTransport, hostTransport] = InMemoryTransport.createLinkedPair()
const bridge = new AppBridge(
  null,
  { name: 'preview-host', version: '1' },
  { serverTools: {}, updateModelContext: { text: {}, structuredContent: {} }, experimental: { 'openai/modelContext': {} } },
  { hostContext: { theme: params.get('theme') === 'dark' ? 'dark' : 'light', displayMode, safeAreaInsets: { top: 47, right: 0, bottom: 34, left: 0 } } },
)
bridge.oncalltool = async (p) =>
  renderResult(p.arguments?.trip_id === other.bundle.trip.id ? other : first)
bridge.onupdatemodelcontext = async () => ({})
// QA hook: the app's auto-resize reports, so a browser run can see whether the inline height settles.
bridge.onsizechange = (size) => void window.dispatchEvent(new CustomEvent('preview-size', { detail: size }))
bridge.oninitialized = () =>
  void bridge.sendToolResult({
    content: [{ type: 'text', text: 'Trips shown.' }],
    structuredContent: params.get('empty') ? EMPTY_TRIPS_PAGE : TRIPS_PAGE_FIXTURE,
    ...tokenMeta,
  })

void bridge.connect(hostTransport).then(() =>
  startTripLibrary(document.getElementById('library-preview-root')!, appTransport),
)
