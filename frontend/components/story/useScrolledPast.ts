'use client'

import { useEffect, useState } from 'react'

/* True once the window has scrolled strictly more than `threshold` px.

   Starts false so the server render and the first client paint agree (the phone header's flat
   state is the SSR state), then reads the real position on mount, which covers a page restored
   mid-scroll or opened on an anchor. No rAF batching: the handler only compares one number, and
   React drops the re-render when the boolean does not change. */
export function useScrolledPast(threshold: number): boolean {
  const [past, setPast] = useState(false)

  useEffect(() => {
    const update = () => setPast(window.scrollY > threshold)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [threshold])

  return past
}
