import type mapboxgl from 'mapbox-gl'

/*
 * The route line layers TripMap draws (moved out of TripMap.tsx unchanged, A10, to keep it under
 * 800 lines). Each returns the source and layer ids it added, which TripMap tracks in routeIdsRef so
 * every route cleanup removes them.
 */

/** The whole-trip trail: a soft brass casing and a dashed, per-day coloured core. */
export function addTrailLayers(map: mapboxgl.Map, trail: GeoJSON.FeatureCollection): string[] {
  const id = 'trip-trail'
  const casingId = `${id}-casing`
  const coreId = `${id}-core`
  map.addSource(id, { type: 'geojson', data: trail })
  map.addLayer({
    id: casingId,
    type: 'line',
    source: id,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#C9974E', 'line-width': 9, 'line-opacity': 0.18 },
  })
  map.addLayer({
    id: coreId,
    type: 'line',
    source: id,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 2.6,
      'line-opacity': 0.95,
      'line-dasharray': [0.1, 1.6],
    },
  })
  return [id, casingId, coreId]
}

/** The hotel hub's straight spokes out to each stop. */
export function addSpokeLayers(map: mapboxgl.Map, spokes: GeoJSON.FeatureCollection): string[] {
  const id = 'hotel-spokes'
  const casingId = `${id}-casing`
  const coreId = `${id}-core`
  map.addSource(id, { type: 'geojson', data: spokes })
  map.addLayer({
    id: casingId,
    type: 'line',
    source: id,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#C9974E', 'line-width': 6, 'line-opacity': 0.12 },
  })
  map.addLayer({
    id: coreId,
    type: 'line',
    source: id,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#C9974E', 'line-width': 1.6, 'line-opacity': 0.7 },
  })
  return [id, casingId, coreId]
}
