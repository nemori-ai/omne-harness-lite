import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import {
  isNonNegativeJsonInteger,
  copyJsonValue,
  type JsonObject,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { ReadFacts } from '@omne-harness-lite/model-request-runtime-local'
import type { ObservationProvenance, ObservedInput } from '@omne-harness-lite/model-response'
import { accountFromUsage } from './accounts.ts'
import { object, member } from './json.ts'
import type { Diagnostic } from './http.ts'

import { readerRevision, type UsageScope } from './usage-scope.ts'
export { READER_REVISION } from './usage-scope.ts'
export function emptyReadFacts(): ReadFacts {
  return Object.freeze({
    usage: Object.freeze({
      input_tokens: 'unknown',
      output_tokens: 'unknown',
      cache_read_tokens: 'unknown',
      cache_write_tokens: 'unknown',
      source: 'none',
    }),
    cost: Object.freeze({ cost_usd: 'unknown', source: 'none' }),
    observedInput: Object.freeze({ kind: 'unavailable', reason: 'missing_usage' }),
  })
}
/** All accounts and observations come from this one request-local accumulator. */
export function createReadFactsAccumulator(
  diagnostic: (event: Diagnostic) => void,
  responseCacheHit: boolean,
  scope: UsageScope,
) {
  let raw: JsonObject | undefined
  let facts = emptyReadFacts()
  if (responseCacheHit)
    facts = Object.freeze({
      ...facts,
      observedInput: Object.freeze({ kind: 'unavailable', reason: 'response_cache' }),
    })
  let inconsistent = false
  const provenanceFacts: {
    upstreamRequestId?: string
    upstreamModel?: string
    servingProvider?: string
  } = {}
  function observationProvenance(
    read: JsonValue | undefined,
    write: JsonValue | undefined,
  ): ObservationProvenance {
    const paths: [string, ...string[]] = [
      'usage.prompt_tokens',
      ...(isNonNegativeJsonInteger(read) ? ['usage.prompt_tokens_details.cached_tokens'] : []),
      ...(isNonNegativeJsonInteger(write)
        ? ['usage.prompt_tokens_details.cache_write_tokens']
        : []),
    ]
    return Object.freeze({
      adapterRevision: readerRevision(scope),
      fieldPaths: Object.freeze(paths),
      ...provenanceFacts,
    })
  }
  function refresh(): void {
    if (!raw) return
    const accounts = accountFromUsage(raw, diagnostic)
    const total = raw.prompt_tokens
    const parts = [
      accounts.usage.input_tokens,
      accounts.usage.cache_read_tokens,
      accounts.usage.cache_write_tokens,
    ]
    const read = member(raw.prompt_tokens_details, 'cached_tokens')
    const write = member(raw.prompt_tokens_details, 'cache_write_tokens')
    const malformed = [total, read, write].some(
      v => v !== undefined && !isNonNegativeJsonInteger(v),
    )
    const knownParts = parts.reduce<ExactDecimal>(
      (s, p) => (p === 'unknown' ? s : s.add(ExactDecimal.from(p))),
      ExactDecimal.from(0),
    )
    const excessive =
      isNonNegativeJsonInteger(total) && knownParts.compare(ExactDecimal.from(total)) > 0
    const provenance = observationProvenance(read, write)
    let observedInput: ObservedInput
    if (responseCacheHit) observedInput = { kind: 'unavailable', reason: 'response_cache' }
    else if (inconsistent || malformed || excessive)
      observedInput = { kind: 'unavailable', reason: 'inconsistent_usage' }
    else if (scope === 'scope_unknown' || !isNonNegativeJsonInteger(total))
      observedInput = { kind: 'unavailable', reason: 'scope_unknown' }
    else if (parts.every(p => p !== 'unknown')) observedInput = { kind: 'from_usage', provenance }
    else observedInput = { kind: 'upstream_total', tokens: total, provenance }
    facts = Object.freeze({
      usage: Object.freeze(accounts.usage),
      cost: Object.freeze(accounts.cost),
      observedInput: Object.freeze(observedInput),
    })
  }
  return Object.freeze({
    remember(values: typeof provenanceFacts) {
      Object.assign(provenanceFacts, values)
      refresh()
    },
    inconsistent() {
      inconsistent = true
      refresh()
    },
    observe(value: JsonObject) {
      const owned = copyJsonValue(value)
      if ('failed' in owned || !object(owned.ok)) throw new TypeError('invalid usage JSON')
      if (!raw) raw = owned.ok
      else {
        // Repeated cumulative facts are not summed. Fill previously absent fields only;
        // a changed fact has no established cumulative-scope rule in this reader revision.
        const merge = (a: JsonObject, b: JsonObject): JsonObject => {
          const result: Record<string, JsonValue> = { ...a }
          for (const [key, v] of Object.entries(b)) {
            const prior = a[key]
            if (prior === undefined) result[key] = v
            else if (object(prior) && object(v)) result[key] = merge(prior, v)
            else if (isNonNegativeJsonInteger(prior) && isNonNegativeJsonInteger(v)) {
              if (ExactDecimal.from(prior).compare(ExactDecimal.from(v)) !== 0) inconsistent = true
            } else if (prior !== v) inconsistent = true
          }
          return result
        }
        raw = merge(raw, owned.ok)
        diagnostic({ kind: 'model_transport.usage_repeated', level: 'info' })
      }
      refresh()
    },
    read(): ReadFacts {
      return facts
    },
  })
}
