/* Shell nav icons: inline SVG, currentColor stroke so they inherit the row's or tab's text colour.
   Shared by the desktop rail (Sidebar), the phone tab bar and the Settings account rows. */
import type { ComponentType } from 'react'
import type { ShellTabId } from '@/lib/shell/nav'

export type IconProps = { className?: string }

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M3.5 10.5 12 3.5l8.5 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 9.5V20h4.5v-5.5h4V20h4.5V9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function RouteIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M6.8 18C11 18 13 6 17.2 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="5" cy="18.5" r="2.1" fill="currentColor" />
      <circle cx="19" cy="5.5" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export function CompassIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m15 9-2 4-4 2 2-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ChatIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path
        d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.3-4.1A7.5 7.5 0 1 1 20 11.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LogOutIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M9.5 4.5H6.5A2 2 0 0 0 4.5 6.5v11a2 2 0 0 0 2 2h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 12h7M17.5 8.5l3.5 3.5-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** "Opens somewhere else": trails a link that leaves the app in a new tab. */
export function ExternalLinkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M14 4.5h5.5V10M19.5 4.5 11 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 14v4a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 18V8a1.5 1.5 0 0 1 1.5-1.5H10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="m9.5 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const TAB_ICON: Record<ShellTabId, ComponentType<IconProps>> = {
  home: HomeIcon,
  trails: RouteIcon,
  sample: CompassIcon,
  settings: SettingsIcon,
}
