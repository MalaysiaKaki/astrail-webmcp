import type { EvidenceKind } from './backend-types'

/** The short name of where a stop's evidence came from, as the confidence chip prints it. Moved
 *  from the retired desktop EvidenceChip (plan A6); the mapping is unchanged. */
const KIND_LABEL: Record<EvidenceKind, string> = {
  reel_quote: 'Reel',
  requested_by_you: 'You',
  suggested_by_astrail: 'Astrail',
  research: 'Research',
  mapbox_route: 'Mapbox',
  open_meteo: 'Weather',
  travala_hotel_search: 'Travala',
  memory_preference: 'Memory',
  inferred_default: 'Default',
}

export function evidenceKindLabel(kind: EvidenceKind): string {
  return KIND_LABEL[kind] ?? 'Source'
}
