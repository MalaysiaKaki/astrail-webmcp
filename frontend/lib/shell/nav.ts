/* The /app shell's destinations, shared by the desktop rail (Sidebar) and the phone tab bar so the
   two can never disagree about where a route lives or which one is current. */

export type ShellTabId = 'home' | 'trails' | 'sample' | 'settings'

export type ShellTab = { id: ShellTabId; href: string; label: string }

/* "Sample" is the finished demo trip, reachable with no generation. It is not under /app/trips
   (the list of the user's own trails), which is why the match below needs a segment boundary. */
export const SHELL_TABS: readonly ShellTab[] = [
  { id: 'home', href: '/app', label: 'Home' },
  { id: 'trails', href: '/app/trips', label: 'Trails' },
  { id: 'sample', href: '/app/trip/demo', label: 'Sample' },
  { id: 'settings', href: '/app/settings', label: 'Settings' },
]

/** Home matches /app exactly; every other tab matches itself and its nested segments. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/app') return pathname === '/app'
  return pathname === href || pathname.startsWith(`${href}/`)
}
