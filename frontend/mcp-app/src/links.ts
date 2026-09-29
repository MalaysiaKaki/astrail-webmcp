/**
 * Anchor clicks inside the widget (PLAN §6 "Links").
 *
 * The reused components render plain `<a target="_blank">` evidence links. Inside a sandboxed host
 * iframe a raw navigation may be blocked or open inside the frame, so one capture-phase listener
 * on the widget root routes every link through the host's `ui/open-link` when the host says it
 * supports it. Without that capability the anchor's own `target=_blank rel=noopener` behaviour
 * stands. Nothing but an http(s) URL (`safeHref`) is ever opened either way.
 */
import { safeHref } from '@/lib/safe-href'

/** Resolves true when the host accepted the request. */
export type OpenLink = (url: string) => Promise<boolean>

export function installLinkDelegation(root: HTMLElement, openLink: OpenLink | null): () => void {
  const onClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest('a[href]')
    if (!anchor || !root.contains(anchor)) return
    const href = safeHref(anchor.getAttribute('href'))
    if (!href) {
      // The components already gate their hrefs; this is the second line, not the first.
      event.preventDefault()
      return
    }
    if (!openLink) return
    event.preventDefault()
    openLink(href)
      .then((accepted) => {
        // A host refusal is its policy (blocked domain, user cancelled) — not overridden here.
        if (!accepted) console.warn('[astrail-widget] the host declined to open a link')
      })
      .catch(() => {
        console.warn('[astrail-widget] open-link request failed')
      })
  }
  root.addEventListener('click', onClick, { capture: true })
  return () => root.removeEventListener('click', onClick, { capture: true })
}
