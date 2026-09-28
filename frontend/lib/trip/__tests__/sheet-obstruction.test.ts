import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  getSheetObstruction, setSheetObstruction, subscribeSheetObstruction, useSheetObstruction,
  measureObstruction, SHEET_OBSTRUCTION_SERVER_SNAPSHOT,
  dockChipBottom, DOCK_CHIP_GAP, DOCK_CHIP_HEIGHT, TOP_BAR_RESERVE,
  getSheetExpanded, setSheetExpanded, useSheetExpanded,
} from '@/lib/trip/sheet-obstruction'

afterEach(() => { setSheetObstruction(0); setSheetExpanded(false) })

describe('sheet obstruction store', () => {
  it('starts at 0 and publishes a primitive number', () => {
    expect(getSheetObstruction()).toBe(0)
    setSheetObstruction(380.6)
    expect(getSheetObstruction()).toBe(381)
    expect(typeof getSheetObstruction()).toBe('number')
  })

  it('has a deterministic server snapshot of 0', () => {
    expect(SHEET_OBSTRUCTION_SERVER_SNAPSHOT).toBe(0)
  })

  it('clamps garbage to 0 rather than publishing NaN or a negative pad', () => {
    setSheetObstruction(Number.NaN)
    expect(getSheetObstruction()).toBe(0)
    setSheetObstruction(-40)
    expect(getSheetObstruction()).toBe(0)
  })

  it('notifies subscribers only when the value changes', () => {
    const fn = vi.fn()
    const off = subscribeSheetObstruction(fn)
    setSheetObstruction(300)
    setSheetObstruction(300)
    setSheetObstruction(0)
    off()
    setSheetObstruction(200)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('re-renders a hook reader on change', () => {
    const { result } = renderHook(() => useSheetObstruction())
    expect(result.current).toBe(0)
    act(() => { setSheetObstruction(412) })
    expect(result.current).toBe(412)
  })
})

describe('measureObstruction', () => {
  it('is the part of the viewport below the sheet top', () => {
    expect(measureObstruction({ top: 464, viewportHeight: 844, hidden: false })).toBe(380)
  })

  it('is 0 when the sheet is hidden, whatever its box says mid-slide', () => {
    expect(measureObstruction({ top: 700, viewportHeight: 844, hidden: true })).toBe(0)
  })

  it('never exceeds the viewport nor goes negative', () => {
    expect(measureObstruction({ top: -20, viewportHeight: 844, hidden: false })).toBe(844)
    expect(measureObstruction({ top: 900, viewportHeight: 844, hidden: false })).toBe(0)
  })
})

describe('dockChipBottom', () => {
  it('has no opinion when nothing covers the map — the dock keeps its safe-area corner', () => {
    expect(dockChipBottom(0, 844)).toBeNull()
  })

  it('sits the chip just above the compact sheet edge', () => {
    expect(dockChipBottom(380, 844)).toBe(380 + DOCK_CHIP_GAP)
  })

  it('stops below the top bar when the sheet is expanded on a short phone', () => {
    const H = 640
    const bottom = dockChipBottom(Math.round(H * 0.88), H)!
    // The chip's top edge must clear the top bar's reserve.
    expect(H - bottom - DOCK_CHIP_HEIGHT).toBeGreaterThanOrEqual(TOP_BAR_RESERVE)
  })
})

describe('sheet expanded signal', () => {
  it('is a boolean, false by default, readable through a hook', () => {
    expect(getSheetExpanded()).toBe(false)
    const { result } = renderHook(() => useSheetExpanded())
    expect(result.current).toBe(false)
    act(() => { setSheetExpanded(true) })
    expect(result.current).toBe(true)
  })
})
