import type { Custody, PutFailure } from '@omne-harness/media-contract'
import type { ToolMediaStore, ToolPrimitiveFailure } from '@omne-harness/tool-contract/provider'

const PUT = 'media.put'

type Refusal = Extract<Awaited<ReturnType<Custody['put']>>, { failure: unknown }>['failure']

const REFUSALS: {
  readonly [K in PutFailure['kind']]: (
    failure: Extract<PutFailure, { kind: K }>,
  ) => ToolPrimitiveFailure
} = {
  'too-large': ({ limit }) => ({
    kind: 'too-large',
    reason: `over the ${limit} byte limit of media for this type`,
  }),
  'over-budget': () => ({ kind: 'too-large', reason: 'over the image budget of media' }),
  'unsupported-type': () => ({ kind: 'unsupported', reason: 'media does not take this type' }),
  'type-mismatch': () => ({ kind: 'invalid', reason: 'the bytes are not of the named type' }),
}

function refusalOf(failure: Refusal): ToolPrimitiveFailure {
  if (failure.kind === 'unavailable')
    return {
      kind: 'unavailable',
      operation: PUT,
      reason: `media: ${failure.dependency} is unavailable`,
    }
  if (failure.kind === 'outcome-unknown')
    return {
      kind: 'unknown',
      operation: PUT,
      reason: 'media did not say whether the product was stored',
    }
  return (REFUSALS[failure.kind] as (failure: PutFailure) => ToolPrimitiveFailure)(failure)
}

/** Stores for Tool what a call produced: custody takes it and holds it for the call in one step. */
export function createToolMediaStore<P>(
  custody: () => Pick<Custody, 'put'> | undefined,
): ToolMediaStore<P> {
  return {
    async put({ tenant, holder, mediaType, bytes }) {
      const media = custody()
      if (media === undefined)
        return { failure: { kind: 'unavailable', operation: PUT, reason: 'media is not there' } }
      async function* whole() {
        yield bytes
      }
      const stored = await media.put({ tenant, mediaType, bytes: whole(), holder })
      return 'ok' in stored ? stored : { failure: refusalOf(stored.failure) }
    },
  }
}
