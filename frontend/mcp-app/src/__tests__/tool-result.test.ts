import { describe, expect, it } from 'vitest'
import { BUNDLE_META_KEY } from '@/lib/mcp/contract'
import { GENERIC_ERROR, phaseForToolResult } from '../tool-result'
import { MULTI_SOURCE_RESPONSE, OTHER_TRIP_RESPONSE } from '../__fixtures__/multi-source-bundle'
import { renderResult } from './tool-results'

describe('phaseForToolResult', () => {
  it('accepts a valid summary + bundle and carries focus_day', () => {
    const phase = phaseForToolResult(renderResult(MULTI_SOURCE_RESPONSE, 2))
    expect(phase.kind).toBe('ready')
    if (phase.kind === 'ready') {
      expect(phase.data.focusDay).toBe(2)
      expect(phase.data.bundle.trip.id).toBe(MULTI_SOURCE_RESPONSE.bundle.trip.id)
    }
  })

  it('shows the tool error text for isError results', () => {
    const phase = phaseForToolResult({
      isError: true,
      content: [{ type: 'text', text: 'No trip with that id in your account.' }],
    })
    expect(phase).toEqual({ kind: 'error', message: 'No trip with that id in your account.' })
  })

  it('falls back to a generic message for an isError result with no text', () => {
    expect(phaseForToolResult({ isError: true, content: [] })).toEqual({ kind: 'error', message: GENERIC_ERROR })
  })

  it('treats a missing bundle as malformed', () => {
    const result = renderResult(MULTI_SOURCE_RESPONSE)
    expect(phaseForToolResult({ ...result, _meta: {} }).kind).toBe('malformed')
  })

  it('treats a bundle that fails the schema as malformed', () => {
    const result = renderResult(MULTI_SOURCE_RESPONSE)
    const broken = { ...MULTI_SOURCE_RESPONSE, bundle: { ...MULTI_SOURCE_RESPONSE.bundle, days: 'nope' } }
    expect(phaseForToolResult({ ...result, _meta: { [BUNDLE_META_KEY]: broken } }).kind).toBe('malformed')
  })

  it('treats a missing or invalid structuredContent as malformed', () => {
    const result = renderResult(MULTI_SOURCE_RESPONSE)
    expect(phaseForToolResult({ ...result, structuredContent: undefined }).kind).toBe('malformed')
    expect(phaseForToolResult({ ...result, structuredContent: { trip: {} } }).kind).toBe('malformed')
  })

  it('treats a summary and bundle for different trips as malformed', () => {
    const result = renderResult(MULTI_SOURCE_RESPONSE)
    const mismatched = { ...result, _meta: { [BUNDLE_META_KEY]: OTHER_TRIP_RESPONSE } }
    expect(phaseForToolResult(mismatched).kind).toBe('malformed')
  })
})
