import type { GenerationEvent, TripBundle } from '@/lib/trip/backend-types'
import { buildSteps, fullLogEvents, type BuildStep, type BuildStepKey, type BuildStepState } from '@/lib/trip/insights/build-steps'
import { STAGE_LABEL } from '@/components/create/GenerationProgress'
import { Chip, Icon, SectionHeading } from './parts'

export interface BuildTimelineProps {
  bundle: TripBundle
}

const ICON: Record<BuildStepKey, string> = {
  reels: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5ZM10 9.2v5.6l4.6-2.8Z',
  places: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11ZM12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z',
  preferences: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z',
  dedup: 'M8 8h11v11H8ZM5 16V5h11',
  enrich: 'M4 7h16M4 12h10M4 17h13',
  days: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5ZM4 10h16M8 3v4M16 3v4',
  weather: 'M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11.2 3.5 3.5 0 0 0 7 18Z',
  transport: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  restaurants: 'M7 3v8a2 2 0 0 0 2 2v8M11 3v8M7 7h4M17 21V3c-2 0-3 3-3 7h3',
  hotels: 'M3 19V6M3 14h18v5M7 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM11 14V9h7a3 3 0 0 1 3 3v2',
  summaries: 'M6 3h9l4 4v14H6ZM15 3v4h4M9 12h7M9 16h5',
  save: 'M5 12.5l4.5 4.5L19 7.5',
}

const STATE: Record<BuildStepState, { label: string; tone: 'ok' | 'accent' | 'warn' | 'fail' | 'muted' }> = {
  done: { label: 'Done', tone: 'ok' },
  reused: { label: 'Reused', tone: 'accent' },
  warning: { label: 'Warning', tone: 'warn' },
  failed: { label: "Didn't finish", tone: 'fail' },
  not_recorded: { label: 'Not recorded', tone: 'muted' },
}

/** "How Astrail built this": one kit card per recorded step, then the raw log behind a disclosure. */
export default function BuildTimeline({ bundle }: BuildTimelineProps) {
  const steps = buildSteps(bundle)
  const log = fullLogEvents(bundle)
  return (
    <section aria-labelledby="insights-build" data-build-timeline className="flex flex-col gap-4">
      <SectionHeading id="insights-build" sub="From the steps Astrail recorded while planning. Counts show what's on the trip now.">
        How Astrail built this
      </SectionHeading>
      {steps.length > 0 ? (
        <ol className="flex flex-col">
          {steps.map((step, i) => <StepItem key={step.key} step={step} last={i === steps.length - 1} />)}
        </ol>
      ) : (
        <p className="m-subcard t-meta px-4 py-3">No build steps were recorded for this trip.</p>
      )}
      <details className="group/log">
        <summary className="m-card-link t-body list-none font-semibold [&::-webkit-details-marker]:hidden">
          <span>Show full log</span>
          <span className="t-meta ml-1 font-normal">{log.length} {log.length === 1 ? 'entry' : 'entries'}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden
            className="m-chevron transition-transform group-open/log:rotate-180 motion-reduce:transition-none">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </summary>
        <div className="m-subcard mt-2 px-4 py-3.5">
          <FullLog events={log} />
        </div>
      </details>
    </section>
  )
}

function StepItem({ step, last }: { step: BuildStep; last: boolean }) {
  const s = STATE[step.state]
  const alert = step.state === 'warning' || step.state === 'failed'
  const extraWarnings = step.warnings.filter((w) => w !== step.message)
  return (
    <li data-testid="build-step" data-state={step.state} className="relative flex gap-3 pb-3 last:pb-0">
      {/* The rail: an icon node per step joined by a line, so the cards read as one sequence. */}
      <div aria-hidden className="relative flex w-10 shrink-0 flex-col items-center">
        <span className={[
          'z-[1] grid h-10 w-10 place-items-center rounded-full shadow-[var(--m-shadow-1)]',
          alert ? 'bg-[var(--m-ink)] text-[var(--m-on-ink)]' : 'bg-[var(--m-card)] text-[var(--m-accent)]',
        ].join(' ')}>
          <Icon d={ICON[step.key]} />
        </span>
        {last ? null : <span className="absolute bottom-[-12px] top-10 w-0.5 bg-[var(--m-accent-wash)]" />}
      </div>
      <article className={[
        'm-card flex min-w-0 flex-1 flex-col gap-2 px-4 py-3.5',
        // An outline, not a ring: Tailwind's ring is a box-shadow, which m-card's shadow overrides.
        alert ? 'outline outline-2 -outline-offset-2 outline-[var(--warn)]' : '',
      ].join(' ')}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <h4 className="t-card-title text-[var(--m-text)]">{step.title}</h4>
          <Chip tone={s.tone}>{s.label}</Chip>
        </div>
        {step.count || step.context ? (
          <div className="flex flex-wrap gap-1.5">
            {step.count ? <Chip>{step.count.label}</Chip> : null}
            {step.context ? <Chip>{step.context}</Chip> : null}
          </div>
        ) : null}
        {step.message ? <p className="t-meta break-words">{step.message}</p> : null}
        {extraWarnings.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {extraWarnings.map((w) => <li key={w} className="t-meta break-words">{w}</li>)}
          </ul>
        ) : null}
      </article>
    </li>
  )
}

/**
 * The raw filtered log, in kit tokens. Same content as the old AgentDecisionRail (stage label,
 * warning/error flag, stored message), which is styled for the night palette and unreadable here.
 */
function FullLog({ events }: { events: GenerationEvent[] }) {
  if (events.length === 0) return <p className="t-meta">No agent activity recorded.</p>
  return (
    <ol className="flex flex-col gap-3">
      {events.map((ev) => {
        const flagged = ev.event_type === 'warning' || ev.event_type === 'error'
        return (
          <li key={ev.id} className="flex gap-3">
            <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: flagged ? 'var(--warn-day)' : ev.event_type === 'decision' ? 'var(--m-accent)' : 'var(--m-text-muted)' }} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="t-label text-[var(--m-text)]">
                {STAGE_LABEL[ev.stage] ?? String(ev.stage).replaceAll('_', ' ')}
                {flagged ? <span> · {ev.event_type === 'error' ? 'Error' : 'Warning'}</span> : null}
              </span>
              <p className="t-meta break-words">{ev.message}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
