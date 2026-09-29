'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLayoutEffect, useRef } from 'react'
import { isNavActive, SHELL_TABS } from '@/lib/shell/nav'
import { measureBottomNav, setBottomNavHeight } from '@/lib/shell/bottom-nav'
import { TAB_ICON } from '@/components/dashboard/nav-icons'

/* Phone tab bar (<768), the Placify floating pill: a frosted capsule centred above the home
   indicator, four icon + label tabs, the current one lifted onto a white lens in ink and bold while
   the rest stay muted. It is the only nav on a phone; the desktop rail (Sidebar) takes over at 768.
   Mounted by the (shell) layout only, so trip routes, which have their own map chrome, never get it.

   Geometry is mirrored by the layout's --shell-nav-clear (bar 60 + float 12 + breathing 16 + safe
   area): change one, change the other. The real covered strip is measured and published through
   lib/shell/bottom-nav so the agent dock can sit above the bar. z-30 keeps it under the dock (z-40)
   and every dialog (z-50). The label size is the kit's --t-label token rather than the .t-label
   class: the kit is unlayered CSS, so its font-weight would beat the bold/medium utilities here. */
export default function BottomTabBar() {
  const pathname = usePathname()
  const ref = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const publish = () => setBottomNavHeight(measureBottomNav(el.getBoundingClientRect(), window.innerHeight))
    publish()
    window.addEventListener('resize', publish)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null
    observer?.observe(el)
    return () => {
      window.removeEventListener('resize', publish)
      observer?.disconnect()
      setBottomNavHeight(0)
    }
  }, [])

  return (
    <nav
      ref={ref}
      aria-label="Tabs"
      className="m-frost fixed inset-x-0 bottom-[calc(12px+env(safe-area-inset-bottom))] z-30 mx-auto flex h-[60px] w-[min(calc(100%-32px),400px)] items-stretch gap-1 rounded-[var(--m-r-pill)] p-1 shadow-[var(--m-shadow-2)] md:hidden"
    >
      {SHELL_TABS.map(({ id, href, label }) => {
        const active = isNavActive(pathname, href)
        const Icon = TAB_ICON[id]
        return (
          <Link
            key={id}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-w-0 font-[family-name:var(--font-ui)] text-[length:var(--t-label)] leading-[1.3] flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--m-r-pill)] [-webkit-tap-highlight-color:transparent] transition-[transform,background-color] duration-[var(--m-dur-press)] ease-[var(--m-ease)] focus-visible:shadow-[var(--m-focus)] focus-visible:outline-none active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${
              active
                ? 'bg-[color:var(--m-card)] font-bold text-[color:var(--m-ink)] shadow-[var(--m-shadow-1)]'
                : 'font-medium text-[color:var(--m-text-muted)]'
            }`}
          >
            <Icon className="h-[22px] w-[22px] shrink-0" />
            <span className="max-w-full truncate">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
