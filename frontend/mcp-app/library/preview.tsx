/**
 * Dev-only preview of the Trip Library with a fake ChatGPT host (real AppBridge over the SDK's
 * in-memory transport). Run `npx vite --config mcp-app/vite.config.ts` from frontend/ and open
 * /library-preview.html. `?empty=1` shows the empty account, `?long=1` serves the long-text
 * fixture for the first trip, `?theme=dark` mimics a dark ChatGPT host. Not part of the production bundle (vite.config.ts builds
 * library/main.tsx only); the root id differs from main.tsx's auto-mount on purpose.
 */
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { startTripLibrary } from './main'
import { EMPTY_TRIPS_PAGE, TRIPS_PAGE_FIXTURE } from './__fixtures__/trips-page'
import { LONG_TEXT_RESPONSE, MULTI_SOURCE_RESPONSE, OTHER_TRIP_RESPONSE } from '../src/__fixtures__/multi-source-bundle'
import { renderResult } from '../src/__tests__/tool-results'

const params = new URLSearchParams(window.location.search)
const first = params.get('long') ? LONG_TEXT_RESPONSE : MULTI_SOURCE_RESPONSE
const [appTransport, hostTransport] = InMemoryTransport.createLinkedPair()
const bridge = new AppBridge(
  null,
  { name: 'preview-host', version: '1' },
  { serverTools: {}, updateModelContext: { text: {}, structuredContent: {} }, experimental: { 'openai/modelContext': {} } },
  { hostContext: { theme: params.get('theme') === 'dark' ? 'dark' : 'light', displayMode: 'fullscreen', safeAreaInsets: { top: 47, right: 0, bottom: 34, left: 0 } } },
)
bridge.oncalltool = async (p) =>
  renderResult(p.arguments?.trip_id === OTHER_TRIP_RESPONSE.bundle.trip.id ? OTHER_TRIP_RESPONSE : first)
bridge.onupdatemodelcontext = async () => ({})
bridge.oninitialized = () =>
  void bridge.sendToolResult({
    content: [{ type: 'text', text: 'Trips shown.' }],
    structuredContent: params.get('empty') ? EMPTY_TRIPS_PAGE : TRIPS_PAGE_FIXTURE,
  })

void bridge.connect(hostTransport).then(() =>
  startTripLibrary(document.getElementById('library-preview-root')!, appTransport),
)
