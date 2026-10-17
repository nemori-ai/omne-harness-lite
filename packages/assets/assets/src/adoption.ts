import type { JsonValue } from '@omne-harness/json-text'
import type { CapabilityId } from './identity.ts'
import { copyReadBody } from './read-body.ts'

export type PinnedBody = {
  readonly identity: CapabilityId
  readonly version: string
  readonly source: string
  readonly body: JsonValue
}

export function pinBody(input: {
  readonly identity: CapabilityId
  readonly version: string
  readonly source: string
  readonly body: unknown
}): PinnedBody {
  const body = copyReadBody(input.body)
  if (body === undefined) throw new TypeError('body was not read')
  return Object.freeze({
    identity: input.identity,
    version: input.version,
    source: input.source,
    body,
  })
}
