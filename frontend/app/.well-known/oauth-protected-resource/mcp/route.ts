// RFC 9728 metadata for the /mcp resource — public by design (no user data).
import { protectedResourceMetadata } from '@/lib/mcp/resource-metadata'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(): Response {
  return protectedResourceMetadata()
}
