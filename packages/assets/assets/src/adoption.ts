import type { CapabilityId } from './identity.ts'

export type PinnedBody = {
  readonly identity: CapabilityId
  readonly version: string
  readonly source: string
  readonly body: unknown
}

export function pinBody(input: PinnedBody): PinnedBody {
  return Object.freeze({
    identity: input.identity,
    version: input.version,
    source: input.source,
    body: input.body,
  })
}
