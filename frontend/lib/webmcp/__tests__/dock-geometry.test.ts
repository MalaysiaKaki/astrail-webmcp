import { describe, it, expect } from 'vitest'
import { approvalBottomOverNav, dockBottomOverNav, dockRoomUnderControls } from '@/lib/webmcp/dock-geometry'

describe('dock geometry', () => {
  it('rides one gap above the bottom bar, and the approval card above the chip too', () => {
    expect(dockBottomOverNav(0)).toBeNull()
    expect(dockBottomOverNav(90)).toBe(102)
    expect(approvalBottomOverNav(90)).toBe(90 + 12 + 44 + 12)
    expect(approvalBottomOverNav(0)).toBeNull()
  })

  /* A7: at 1024x768 the dock column grew up over the zoom/3D/Fit stack. The room it may use is
     measured from the right-hand controls; the back button and the panel on the left never count. */
  it('gives the dock the height under the right-hand control stack', () => {
    const stack = [0, 1, 2, 3].map((i) => ({ x: 964, y: 16 + i * 52, w: 44, h: 44 }))   // bottom at 216
    expect(dockRoomUnderControls(stack, 1024, 768)).toBe(768 - 216 - 16)
    const withHotel = [...stack, { x: 964, y: 224, w: 44, h: 44 }]                       // bottom at 268
    expect(dockRoomUnderControls(withHotel, 1024, 768)).toBe(768 - 268 - 16)
  })

  it('ignores controls on the left half, and is null with nothing measured on the right', () => {
    expect(dockRoomUnderControls([{ x: 32, y: 32, w: 44, h: 44 }], 1440, 900)).toBeNull()
    expect(dockRoomUnderControls([], 1440, 900)).toBeNull()
  })

  it('never goes negative', () => {
    expect(dockRoomUnderControls([{ x: 900, y: 0, w: 44, h: 1000 }], 1024, 768)).toBe(0)
  })
})
