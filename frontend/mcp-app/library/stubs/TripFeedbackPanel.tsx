// Stand-in for components/trip/TripFeedbackPanel: the widget passes feedback={null} (no feedback row)
// and has no Astrail/Supabase network access, so the real panel (session + API imports) is not bundled.
import type { TripFeedbackDraft } from '@/lib/trip/api'
import type { Signal } from '@/components/trip/use-feedback-composer'

export function buildDraft(_signal: Signal | null, _note: string): TripFeedbackDraft | null {
  return null
}

export default function TripFeedbackPanel(_props: { tripId: string }) {
  return null
}
