// Full-bleed paper shell for the /app routes that are NOT map screens (dashboard,
// trails, settings). One connected surface — the persistent sidebar rail + a scrolling
// main, split by a single hairline divider, no gap and no outer frame — so the app reads
// edge-to-edge, consistent with the full-bleed map screens (trip, generation) and
// onboarding that stay outside this group. Nested inside app/app/layout.tsx (.app-shell +
// MapProvider); paints its own paper surface over the app-shell background.
//
// Below 768 the rail gives way to a compact brand header and the floating BottomTabBar. The
// shell is one viewport tall at every width, so main is always the page's scroll container.
// --shell-nav-clear is the strip the bar covers (bar 60 + float 12 + breathing 16 + safe
// area; 0 from 768), and every scroller that runs under the bar pads its end by it so its last
// item can scroll clear: main here, and the /app/trips list's own scroller.
//
// The main is padded + scrolls by default (the document pages: home, settings). A page
// that wants the whole area edge-to-edge — the /app/trips three-pane, which lets the shared
// fixed map show through a right-hand window — opts out by rendering a `[data-fullbleed]`
// child: the `has-[…]` variants drop the padding and hand scroll control to the page. This
// is scoped to that page only; the document pages never carry the attribute.
//
// main is deliberately NOT positioned: a positioned main would paint its paper background over
// the shared fixed map that /app/trips shows through its transparent window. So a page must give
// any absolutely positioned child (sr-only labels included) a positioned ancestor of its own,
// or the child escapes the scroller and stretches the document.
import Sidebar from '@/components/dashboard/Sidebar'
import BottomTabBar from '@/components/dashboard/BottomTabBar'
import PhoneBrandHeader from '@/components/dashboard/PhoneBrandHeader'

export default function DocumentShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] flex-col bg-[color:var(--bg)] [--shell-nav-clear:calc(88px+env(safe-area-inset-bottom))] md:flex-row md:[--shell-nav-clear:0px]">
      <PhoneBrandHeader />
      <Sidebar />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[color:var(--surface-0)] px-5 pb-[calc(1.5rem+var(--shell-nav-clear))] pt-6 text-[color:var(--text)] md:px-8 has-[[data-fullbleed]]:overflow-hidden has-[[data-fullbleed]]:p-0">
        {children}
      </main>
      <BottomTabBar />
    </div>
  )
}
