import type { Principal } from '@omne-harness/access-cordis-contract'
import type { Access } from '@omne-harness/legal-identity'
import type { EndpointRef } from '@omne-harness/mcp-contract'
import type { McpFaces } from './ports.ts'

/** The event types of an endpoint as mcp/v1 says them; a read that fails is unavailable, one not for the asker is not visible. */
export async function eventTypesOn(
  discovery: McpFaces['discovery'],
  access: Access<Principal>,
  ref: EndpointRef,
) {
  try {
    const view = await discovery.eventTypes(access, ref)
    if ('failure' in view)
      return view.failure.kind === 'not-available-to-you'
        ? ({ outcome: 'not-visible', body: {} } as const)
        : ({ outcome: 'basis-unavailable' } as const)
    const events =
      view.ok.kind === 'acquired'
        ? {
            kind: 'acquired' as const,
            types: view.ok.types.map(type => ({
              name: type.name,
              description: type.description.untrusted,
              delivery: type.delivery,
            })),
          }
        : { kind: view.ok.kind }
    return { outcome: 'succeeded', body: { events } } as const
  } catch {
    return { outcome: 'basis-unavailable' } as const
  }
}
