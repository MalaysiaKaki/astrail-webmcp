import type { TripBundle, TripPlace } from '@/lib/trip/backend-types'
import { ChevronRight, Icon, SectionHeading } from './parts'

const SPARK = 'M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5'
const FLAG = 'M5 21V4M5 4h11l-2 4 2 4H5'

/** Astrail's own suggestions (agent_suggested stops) with their rationale, then trade-off notes. */
export default function PickedForYou({ bundle, onRevealPlace }: {
  bundle: TripBundle
  onRevealPlace: (placeId: string) => void
}) {
  // All suggestions, undayed ones last: reveal has an undayed fallback, so none is hidden here.
  const picks = bundle.places
    .filter((tp) => tp.source_type === 'agent_suggested')
    .sort((a, b) => ((a.day_number ?? Infinity) - (b.day_number ?? Infinity)) || ((a.sort_order ?? Infinity) - (b.sort_order ?? Infinity)))
  const notes = bundle.trip.tradeoffs?.notes ?? []
  return (
    <section aria-labelledby="insights-picked" className="flex flex-col gap-3">
      <SectionHeading id="insights-picked" sub={picks.length > 0 ? 'Stops Astrail added to fit how you travel.' : undefined}>
        Picked for you
      </SectionHeading>
      {picks.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {picks.map((tp) => <PickCard key={tp.id} tp={tp} onRevealPlace={onRevealPlace} />)}
        </ul>
      ) : (
        <p className="m-subcard t-meta px-4 py-3">
          Every stop on this trip came from your Reels or your requests. Astrail didn&apos;t add any of its own.
        </p>
      )}
      {notes.length > 0 ? (
        <div className="m-card flex flex-col gap-2.5 px-4 py-3.5">
          <h4 className="t-card-title text-[var(--m-text)]">Trade-offs to know about</h4>
          <ul className="flex flex-col gap-2">
            {notes.map((note, i) => (
              <li key={`${note.kind}-${i}`} className="flex items-start gap-2.5">
                <span className="mt-0.5 text-[var(--warn-day)]"><Icon d={FLAG} className="h-4 w-4" /></span>
                <p className="t-meta">
                  {note.day_number ? <span className="font-semibold text-[var(--m-text)]">Day {note.day_number}. </span> : null}
                  {note.detail}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function PickCard({ tp, onRevealPlace }: { tp: TripPlace; onRevealPlace: (placeId: string) => void }) {
  const rationale = tp.evidence_json.rationale?.trim() || null
  return (
    <li>
      <button type="button" data-picked-place className="m-card-link items-start" onClick={() => onRevealPlace(tp.place_id)}>
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--m-accent-wash)] text-[var(--m-accent)]">
          <Icon d={SPARK} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="t-card-title text-[var(--m-text)]">{tp.place.name}</span>
          <span className="t-label text-[var(--m-text-muted)]">
            {tp.day_number ? `Day ${tp.day_number}` : 'Not on a day yet'} · Astrail suggestion
          </span>
          {rationale ? <span className="t-meta mt-1">{rationale}</span> : null}
        </span>
        <ChevronRight />
      </button>
    </li>
  )
}
