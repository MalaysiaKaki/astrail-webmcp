// @vitest-environment node
/** The five live tools and the v3 resource, byte-for-byte as deployed. Never update these snapshots. */
import { describe, expect, it } from 'vitest'
import { ITINERARY_RESOURCE_URI } from '../contract'
import { handleMcpPost } from '../handler'
import { ENV, fakeBackend, mintToken, rpcJson, rpcRequest, testKeys } from './helpers'

const LEGACY = ['get_itinerary', 'get_profile', 'list_saved_reels', 'list_trips', 'render_itinerary']

async function call(method: string, params: Record<string, unknown>) {
  const { keys } = await testKeys()
  const res = await handleMcpPost(rpcRequest(method, params, { token: await mintToken() }), { env: ENV, keys, fetchImpl: fakeBackend().fetchImpl })
  return rpcJson(res)
}

describe('live MCP surface is unchanged', () => {
  it('the five legacy tool descriptors', async () => {
    const tools = ((await call('tools/list', {})).result?.tools as { name: string }[])
      .filter((t) => LEGACY.includes(t.name)).sort((a, b) => a.name.localeCompare(b.name))
    expect(tools.map((t) => t.name)).toEqual(LEGACY)
    await expect(JSON.stringify(tools, null, 2)).toMatchFileSnapshot('./__snapshots__/legacy-tools.json')
  })

  it('the v3 itinerary resource', async () => {
    const res = await call('resources/read', { uri: ITINERARY_RESOURCE_URI })
    await expect(JSON.stringify(res.result, null, 2)).toMatchFileSnapshot('./__snapshots__/itinerary-resource.json')
  })
})
