/**
 * Local preview of the widget with no MCP host: renders the multi-source fixture through the same
 * pure component the host build uses. Run `npx vite --config mcp-app/vite.config.ts` from
 * frontend/ and open /preview.html. `?theme=dark`, `?fixture=truncated|day2|empty` pick a case.
 * Not part of the production bundle (vite.config.ts builds itinerary.html only).
 */
import './widget.css'
import { createRoot } from 'react-dom/client'
import { applyDocumentTheme } from '@modelcontextprotocol/ext-apps'
import type { ItineraryResponse } from '@/lib/mcp/contract'
import ItineraryWidget from './ItineraryWidget'
import {
  DAY_TWO_START_RESPONSE, MULTI_SOURCE_RESPONSE, NO_DAYS_RESPONSE, TRUNCATED_RESPONSE,
} from './__fixtures__/multi-source-bundle'

const FIXTURES: Record<string, ItineraryResponse> = {
  full: MULTI_SOURCE_RESPONSE,
  truncated: TRUNCATED_RESPONSE,
  day2: DAY_TWO_START_RESPONSE,
  empty: NO_DAYS_RESPONSE,
}

const params = new URLSearchParams(window.location.search)
applyDocumentTheme(params.get('theme') === 'dark' ? 'dark' : 'light')
const response = FIXTURES[params.get('fixture') ?? 'full'] ?? MULTI_SOURCE_RESPONSE

const mount = document.getElementById('astrail-itinerary-root')
if (mount) {
  createRoot(mount).render(
    <ItineraryWidget data={{ ...response, focusDay: null }} restored={null} />,
  )
}
