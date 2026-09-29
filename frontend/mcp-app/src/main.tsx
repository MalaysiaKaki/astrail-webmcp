/**
 * MCP Apps lifecycle for the itinerary widget (docs/mcp-app/PLAN.md §6).
 *
 * Order matters and is the contract:
 *   1. construct the App;
 *   2. register every handler BEFORE connect() — hosts may send the tool input/result the moment
 *      the handshake completes, and a late handler misses it;
 *   3. connect(), then apply getHostContext() — the INITIAL theme, styles and safe-area insets
 *      arrive in the initialize result, never as a change notification;
 *   4. on each host-context-changed, re-apply the merged context (the SDK merges before firing).
 *
 * Each call owns its own App, React root and state, so two widgets never share a selection.
 */
import './widget.css'
import { createRoot } from 'react-dom/client'
import { App } from '@modelcontextprotocol/ext-apps'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { WidgetView } from './ItineraryWidget'
import { persistWidgetDayState, readWidgetDayState } from './day-view'
import { applyHostContext, canRequestFullscreen } from './host-context'
import { installLinkDelegation } from './links'
import { phaseForToolResult, type WidgetPhase } from './tool-result'
import { QuietPostMessageTransport } from './quiet-transport'

export type StartedWidget = { app: App; dispose: () => void }

export async function startItineraryWidget(
  container: HTMLElement,
  transport?: Transport,
): Promise<StartedWidget> {
  const app = new App({ name: 'astrail-itinerary', version: '1' })
  const root = createRoot(container)
  let phase: WidgetPhase = { kind: 'waiting' }
  // Bumped per phase change: a new tool result remounts the card, so a previous trip's selected
  // day or highlight can never leak into the next one.
  let generation = 0
  let removeLinks: () => void = () => {}
  let disposed = false

  const requestFullscreen = () => {
    app.requestDisplayMode({ mode: 'fullscreen' }).catch(() => {
      console.warn('[astrail-widget] fullscreen request failed')
    })
  }

  const render = () => {
    if (disposed) return
    root.render(
      <WidgetView
        key={generation}
        phase={phase}
        restored={readWidgetDayState()}
        onDayChange={persistWidgetDayState}
        canFullscreen={canRequestFullscreen(app.getHostContext())}
        onRequestFullscreen={requestFullscreen}
      />,
    )
  }
  const setPhase = (next: WidgetPhase) => {
    phase = next
    generation += 1
    render()
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    removeLinks()
    root.unmount()
  }

  app.addEventListener('toolinput', () => setPhase({ kind: 'loading' }))
  app.addEventListener('toolresult', (result) => setPhase(phaseForToolResult(result)))
  app.addEventListener('toolcancelled', () => setPhase({ kind: 'cancelled' }))
  app.addEventListener('hostcontextchanged', () => {
    applyHostContext(app.getHostContext(), document.documentElement)
    render()
  })
  app.onteardown = () => {
    dispose()
    return {}
  }

  render()
  try {
    // Never the SDK default transport: it console.debug()s every message, i.e. the private bundle.
    await app.connect(transport ?? new QuietPostMessageTransport())
  } catch {
    console.error('[astrail-widget] could not connect to the host')
    setPhase({ kind: 'error', message: "This itinerary couldn't connect to the chat app." })
    return { app, dispose }
  }
  applyHostContext(app.getHostContext(), document.documentElement)
  // Link routing depends on a capability the host only states in the initialize result.
  const openLink = app.getHostCapabilities()?.openLinks
    ? async (url: string) => !(await app.openLink({ url })).isError
    : null
  removeLinks = installLinkDelegation(container, openLink)
  render()
  return { app, dispose }
}

const mount = document.getElementById('astrail-itinerary-root')
if (mount) void startItineraryWidget(mount)
