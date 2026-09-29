/* The phone tab bar (<768). It is the only nav on a phone now, so every tab must be a labelled
   link with the right aria-current, and it publishes the strip it covers so the agent chip (Tab A)
   can sit above it. The publish/cleanup contract is what the dock depends on. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import BottomTabBar from '@/components/dashboard/BottomTabBar'
import { getBottomNavHeight, setBottomNavHeight } from '@/lib/shell/bottom-nav'

const path = { value: '/app' }
vi.mock('next/navigation', () => ({ usePathname: () => path.value }))

function stubBarRect(top: number, height: number) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top, height, bottom: top + height, left: 0, right: 390, width: 390, x: 0, y: top, toJSON: () => ({}),
  } as DOMRect)
}

beforeEach(() => {
  path.value = '/app'
  setBottomNavHeight(0)
})
afterEach(() => vi.restoreAllMocks())

const tab = (name: string) => screen.getByRole('link', { name })

describe('BottomTabBar', () => {
  it('renders four labelled tabs inside a named nav', () => {
    render(<BottomTabBar />)
    const nav = screen.getByRole('navigation', { name: 'Tabs' })
    expect(nav).toBeInTheDocument()
    expect(tab('Home')).toHaveAttribute('href', '/app')
    expect(tab('Trails')).toHaveAttribute('href', '/app/trips')
    expect(tab('Sample')).toHaveAttribute('href', '/app/trip/demo')
    expect(tab('Settings')).toHaveAttribute('href', '/app/settings')
  })

  it.each([
    ['/app', 'Home'],
    ['/app/trips', 'Trails'],
    ['/app/settings', 'Settings'],
  ])('on %s only %s is current', (pathname, active) => {
    path.value = pathname
    render(<BottomTabBar />)
    for (const name of ['Home', 'Trails', 'Sample', 'Settings']) {
      expect(tab(name).getAttribute('aria-current')).toBe(name === active ? 'page' : null)
    }
  })

  it('publishes the covered strip on mount and clears it on unmount', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
    stubBarRect(762, 64)
    const view = render(<BottomTabBar />)
    expect(getBottomNavHeight()).toBe(82)
    view.unmount()
    expect(getBottomNavHeight()).toBe(0)
  })

  it('publishes 0 while CSS hides it (desktop widths report a zero box)', () => {
    stubBarRect(0, 0)
    render(<BottomTabBar />)
    expect(getBottomNavHeight()).toBe(0)
  })
})
