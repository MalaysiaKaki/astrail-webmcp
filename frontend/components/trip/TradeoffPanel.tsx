import type { TradeoffOption, TripTradeoffs } from '@/lib/trip/backend-types'

function humanizeAxis(axis: string): string {
  const words = axis.replaceAll('_', ' ').trim()
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : 'Tradeoff'
}

function OptionCard({ option, phone = false }: { option: TradeoffOption; phone?: boolean }) {
  if (phone) {
    return (
      <div className="m-subcard px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <span className="type-body text-[15px] font-semibold text-[var(--m-text)]">{option.label}</span>
          <span className="type-body shrink-0 text-[13px] text-[var(--m-text-muted)]">{option.value}</span>
        </div>
        <p className="type-body mt-1.5 text-[14px] leading-snug text-[var(--m-text-muted)]">
          <span className="font-medium text-[var(--m-text)]">Upside:</span> {option.pro}
        </p>
        <p className="type-body mt-1 text-[14px] leading-snug text-[var(--m-text-muted)]">
          <span className="font-medium text-[var(--m-text)]">Tradeoff:</span> {option.con}
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line)] p-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="type-body text-sm text-[var(--starlight)]">{option.label}</span>
        <span className="type-evidence shrink-0 text-[10px] text-[var(--faint)]">{option.value}</span>
      </div>
      <p className="type-body mt-2 text-xs text-[var(--muted)]">
        <span className="text-[var(--starlight)]">Upside:</span> {option.pro}
      </p>
      <p className="type-body mt-1 text-xs text-[var(--muted)]">
        <span className="text-[var(--starlight)]">Tradeoff:</span> {option.con}
      </p>
    </div>
  )
}

// `variant` splits the panel across its two real audiences (pre-beta merge-lite, 2026-08-06):
// the day-pacing `notes` stay at the top of the trip panel ("Heads up"), while the hotel
// `comparisons` render inside "Where to stay" — WITH the hotel list they're about, so the user
// has one hotel decision surface instead of two competing sections. In the comparisons variant
// the outer heading is dropped entirely: the Section already says "Where to stay" and each card
// carries its own axis heading ("Price vs rating").
export default function TradeoffPanel({
  tradeoffs,
  variant = 'all',
  tone = 'default',
}: {
  tradeoffs: TripTradeoffs | null | undefined
  variant?: 'all' | 'notes' | 'comparisons'
  /** 'phone': comparison cards drawn with the phone kit (Stay list). Default is desktop's look. */
  tone?: 'default' | 'phone'
}) {
  const phone = tone === 'phone'
  const notes = variant === 'comparisons' ? [] : tradeoffs?.notes ?? []
  const comparisons = variant === 'notes' ? [] : tradeoffs?.comparisons ?? []
  if (notes.length === 0 && comparisons.length === 0) {
    return null
  }

  return (
    // Variant-suffixed testid: both variants render simultaneously in TripWorkspace, and a
    // shared testid is an RTL found-multiple-elements footgun (review nit 2026-08-06).
    <section className={variant === 'comparisons' ? '' : 'mt-4'} data-testid={`tradeoff-panel-${variant}`}>
      {variant !== 'comparisons' ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="type-display text-[15px] text-[var(--starlight)]">
            {variant === 'notes' ? 'Heads up' : 'Tradeoffs'}
          </h3>
        </div>
      ) : null}

      {notes.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {notes.map((note, index) => (
            <li key={`${note.kind}-${index}`} className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warn)]" />
              <p className="type-body text-sm text-[var(--muted)]">{note.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {comparisons.length > 0 ? (
        <div className={notes.length > 0 ? 'mt-3 flex flex-col gap-2' : 'flex flex-col gap-2'}>
          {comparisons.map((comparison, index) => (
            <article key={`${comparison.axis}-${index}`} className={phone ? 'm-card px-4 py-4' : 'surface rounded-[var(--radius-card)] p-3'} data-testid="tradeoff-comparison">
              <div className="flex items-center justify-between gap-2">
                <h4 className={phone ? 'type-body text-[16px] font-semibold text-[var(--m-text)]' : 'type-body text-sm text-[var(--starlight)]'}>{humanizeAxis(comparison.axis)}</h4>
                <span className={phone
                  ? 'type-body rounded-full bg-[var(--m-subcard)] px-2.5 text-[12px] font-semibold leading-6 text-[var(--m-text)]'
                  : 'type-evidence rounded-[var(--radius-chip)] bg-[var(--chip-bg)] px-2 py-0.5 text-[10px] tracking-wide text-[var(--muted)]'}>
                  Astrail
                </span>
              </div>
              <div className={phone ? 'mt-3 grid gap-2' : 'mt-2 grid gap-2'}>
                <OptionCard option={comparison.option_a} phone={phone} />
                <OptionCard option={comparison.option_b} phone={phone} />
              </div>
              {comparison.recommendation ? (
                <p className={phone ? 'type-body mt-3 text-[14px] leading-snug text-[var(--m-text-muted)]' : 'type-body mt-2 text-xs text-[var(--muted)]'}>
                  <span className={phone ? 'font-medium text-[var(--m-text)]' : 'text-[var(--starlight)]'}>Astrail&apos;s read:</span> {comparison.recommendation}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}
