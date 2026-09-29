/**
 * Applies the host's environment to the document (PLAN §6 step 3): theme, the host's CSS
 * variables and fonts, and mobile safe-area insets. Called with the INITIAL context right after
 * `connect()` — hosts send it in the initialize result, not as a change notification — and again
 * with the merged context on every `host-context-changed`.
 */
import {
  applyDocumentTheme, applyHostFonts, applyHostStyleVariables,
  type McpUiDisplayMode, type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps'

const INSET_SIDES = ['top', 'right', 'bottom', 'left'] as const

export function applyHostContext(context: McpUiHostContext | undefined, root: HTMLElement): void {
  if (!context) return
  if (context.theme) applyDocumentTheme(context.theme)
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables, root)
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts)
  const insets = context.safeAreaInsets
  if (insets) {
    for (const side of INSET_SIDES) {
      const px = Number.isFinite(insets[side]) ? Math.max(0, insets[side]) : 0
      root.style.setProperty(`--safe-${side}`, `${px}px`)
    }
  }
}

/** Fullscreen is offered only when the host lists it (PLAN §6 step 5). */
export function canRequestFullscreen(context: McpUiHostContext | undefined): boolean {
  const modes: McpUiDisplayMode[] = context?.availableDisplayModes ?? []
  return modes.includes('fullscreen') && context?.displayMode !== 'fullscreen'
}
