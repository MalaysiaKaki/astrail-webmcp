/**
 * Local preview of the widget with no MCP host: renders the multi-source fixture through the same
 * pure component the host build uses. Run `npx vite --config mcp-app/vite.config.ts` from
 * frontend/ and open /preview.html. `?theme=dark`, `?fixture=truncated|day2|empty|long|twelve` pick
 * a case, and `?focus=N` opens on Day N as a host's focus_day would.
 * Not part of the production bundle (vite.config.ts builds itinerary.html only).
 */
import './widget.css'
import { createRoot } from 'react-dom/client'
import { applyDocumentTheme } from '@modelcontextprotocol/ext-apps'
import type { ItineraryResponse } from '@/lib/mcp/contract'
import ItineraryWidget from './ItineraryWidget'
import {
  DAY_TWO_START_RESPONSE, LONG_TEXT_RESPONSE, MULTI_SOURCE_RESPONSE, NO_DAYS_RESPONSE,
  TRUNCATED_RESPONSE, TWELVE_DAY_RESPONSE,
} from './__fixtures__/multi-source-bundle'

const FIXTURES: Record<string, ItineraryResponse> = {
  full: MULTI_SOURCE_RESPONSE,
  truncated: TRUNCATED_RESPONSE,
  day2: DAY_TWO_START_RESPONSE,
  empty: NO_DAYS_RESPONSE,
  long: LONG_TEXT_RESPONSE,
  twelve: TWELVE_DAY_RESPONSE,
}

const params = new URLSearchParams(window.location.search)
applyDocumentTheme(params.get('theme') === 'dark' ? 'dark' : 'light')
const response = FIXTURES[params.get('fixture') ?? 'full'] ?? MULTI_SOURCE_RESPONSE
const focusParam = Number(params.get('focus'))
const focus = Number.isInteger(focusParam) && focusParam > 0 ? focusParam : null

const mount = document.getElementById('astrail-itinerary-root')
if (mount) {
  createRoot(mount).render(
    <ItineraryWidget data={{ ...response, focusDay: focus }} restored={null} />,
  )
}
