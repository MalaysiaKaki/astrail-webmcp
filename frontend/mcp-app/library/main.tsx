/**
 * MCP Apps lifecycle for the Trip Library (ChatGPT sidebar and conversation panel).
 *
 * Same order contract as src/main.tsx: construct → handlers → connect() → initial host context.
 * A trip opens in place through `render_itinerary`; a result for a superseded open changes
 * nothing, and the model context (trip id, day, bounded summary) is published only while the
 * user has not removed it. All state lives in this closure.
 */
import './library.css'
import { createRoot } from 'react-dom/client'
import { App, type McpUiHostCapabilities } from '@modelcontextprotocol/ext-apps'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import TripLibrary from './TripLibrary'
import {
  backToList, contextRemoved, initialLibraryState, LIBRARY_ERRORS, openTrip, tripModelContext,
  withListError, withTripError, withTripResult, withTripsResult, type LibraryState,
} from './state'
import { availableDayNumbers, initialDayNumber, type WidgetDayState } from '../src/day-view'
import { applyHostContext } from '../src/host-context'
import { installLinkDelegation } from '../src/links'
import { QuietPostMessageTransport } from '../src/quiet-transport'
import { GENERIC_ERROR, type WidgetData } from '../src/tool-result'

export async function startTripLibrary(
  container: HTMLElement,
  transport?: Transport,
): Promise<{ app: App; dispose: () => void }> {
  const app = new App({ name: 'astrail-library', version: '1' })
  const root = createRoot(container)
  let state = initialLibraryState()
  let disposed = false
  let contextOn = true // false after the user removes our chip
  let removals = 0 // bumped on each removal; an open that spans one never publishes
  let canCall = false
  let ctxCaps: McpUiHostCapabilities['updateModelContext']
  let removeLinks: () => void = () => {}

  const set = (next: LibraryState) => {
    if (disposed) return
    state = next
    root.render(<TripLibrary state={state} onOpenTrip={onOpenTrip} onBack={() => set(backToList(state))} onDayChange={onDayChange} />)
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    removeLinks()
    root.unmount()
  }

  const pushContext = (data: WidgetData, day: number | null) => {
    if (!ctxCaps?.text || disposed) return
    const ctx = tripModelContext(data, day)
    app.updateModelContext(ctxCaps.structuredContent ? ctx : { content: ctx.content }).catch(() => {
      console.warn('[astrail-library] context update failed')
    })
  }

  // A stale (superseded) or post-dispose result has no side effects at all.
  const settle = (next: LibraryState) => {
    if (disposed || next === state) return false
    set(next)
    return true
  }

  function onOpenTrip(tripId: string) {
    set(openTrip(state, tripId))
    const seq = state.seq
    const removalsAtOpen = removals
    if (!canCall) return set(withTripError(state, seq, LIBRARY_ERRORS.noToolCalls))
    app.callServerTool({ name: 'render_itinerary', arguments: { trip_id: tripId } }).then(
      (result) => {
        if (!settle(withTripResult(state, seq, result))) return
        const phase = state.detail?.phase
        if (phase?.kind !== 'ready' || removals !== removalsAtOpen) return
        const { data } = phase
        contextOn = true
        pushContext(data, initialDayNumber({
          available: availableDayNumbers(data.bundle), focusDay: data.focusDay, tripId: data.bundle.trip.id, restored: null,
        }))
      },
      () => {
        if (settle(withTripError(state, seq, GENERIC_ERROR))) console.warn('[astrail-library] trip load failed')
      },
    )
  }

  function onDayChange({ trip_id, day }: WidgetDayState) {
    const detail = state.detail
    if (contextOn && detail?.tripId === trip_id && detail.phase.kind === 'ready') pushContext(detail.phase.data, day)
  }

  app.addEventListener('toolresult', (result) => set(withTripsResult(state, result)))
  app.addEventListener('toolcancelled', () => set(withListError(state, 'Cancelled.')))
  app.addEventListener('hostcontextchanged', (params) => {
    if (disposed) return
    applyHostContext(app.getHostContext(), document.documentElement)
    // Only the event's own partial update: the merged context keeps a removal's null forever.
    if (contextRemoved(params)) {
      contextOn = false
      removals += 1
    }
  })
  app.onteardown = () => {
    dispose()
    return {}
  }

  set(state)
  try {
    // Never the SDK default transport: it console.debug()s every message.
    await app.connect(transport ?? new QuietPostMessageTransport())
  } catch {
    console.error('[astrail-library] could not connect to the host')
    set(withListError(state, LIBRARY_ERRORS.connect))
    return { app, dispose }
  }
  applyHostContext(app.getHostContext(), document.documentElement)
  const caps = app.getHostCapabilities()
  const openLink = caps?.openLinks ? async (url: string) => !(await app.openLink({ url })).isError : null
  removeLinks = installLinkDelegation(container, openLink)
  canCall = !!caps?.serverTools
  ctxCaps = caps?.updateModelContext
  return { app, dispose }
}

const mount = document.getElementById('astrail-library-root')
if (mount) void startTripLibrary(mount)
