import { AstrailLogo } from '@/components/brand/AstrailLogo'

/* Phone brand header (<768). Placify's app has no persistent top bar at all; with the rail gone
   on phones this keeps one quiet brand line so the app is not anonymous, and nothing else: no
   controls, because every destination is in the tab bar and a second nav row would compete with
   it. Not a link, since Home is one tab away. Clears the notch with the top safe area. */
export default function PhoneBrandHeader() {
  return (
    <header className="flex flex-none items-center gap-2 bg-[color:var(--surface-0)] px-5 pb-1 pt-[calc(12px+env(safe-area-inset-top))] md:hidden">
      <AstrailLogo variant="mark" tone="brass" height={18} alt="" />
      <span className="font-display text-[length:var(--t-card-title)] font-medium leading-none tracking-[-0.01em] text-[color:var(--m-text)]">
        Astrail
      </span>
    </header>
  )
}
