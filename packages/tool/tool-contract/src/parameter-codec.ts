// The default parameter codec: strict JSON text through @omne-harness/json-text (P02).
import {
  readJsonText,
  type JsonFailure,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/kernel-basis'
import { describedAdoption } from './adoption.ts'
import type { ParameterCodec } from './authoring.ts'
import { positiveSafeInteger, record } from './shape.ts'

const limitsShape = record({
  maxBytes: positiveSafeInteger,
  maxDepth: positiveSafeInteger,
  maxItems: positiveSafeInteger,
  maxMembers: positiveSafeInteger,
  maxStringLength: positiveSafeInteger,
  maxNumberLength: positiveSafeInteger,
})

/** The invalid-argument reason of a json-text failure. json-text already rejects duplicate keys. */
function describeJsonFailure(failure: JsonFailure): string {
  switch (failure.kind) {
    case 'utf8':
    case 'bom':
    case 'empty':
    case 'duplicate-key':
      return failure.kind
    case 'syntax':
      return `syntax:${failure.reason}`
    case 'budget':
      return `budget:${failure.name}`
    default: {
      const exhaustive: never = failure
      return exhaustive
    }
  }
}

/**
 * Makes the default parameter codec for the given json-text budgets. The codec parses the
 * effective arguments into a json-text tree. `complete=false` is `incomplete` and is not
 * parsed. A duplicate key, a truncated document or any other json-text failure is `invalid`.
 * No failure carries a partial argument value. The adoption digest covers the budgets, because
 * two codecs with different budgets can give different answers for the same text.
 */
export function createDefaultParameterCodec(
  limits: JsonLimits,
): Outcome<ParameterCodec<JsonValue>, Readonly<{ field: string; reason: string }>> {
  const checked = limitsShape(limits, 'limits')
  if ('failure' in checked) return checked
  const budgets: JsonLimits = checked.ok
  const adoption = describedAdoption({
    owner: '@omne-harness/tool-contract',
    name: 'default-parameter-codec',
    revision: '1',
    limits: budgets,
  })
  return succeed(
    Object.freeze({
      adoption,
      parse(input: Parameters<ParameterCodec<JsonValue>['parse']>[0]) {
        // The binding may pass any value here, so a non-object is invalid, not a thrown error.
        if (typeof input !== 'object' || input === null)
          return fail({ kind: 'invalid', reason: 'type' } as const)
        if (input.complete !== true)
          return fail({ kind: 'incomplete', reason: 'incomplete' } as const)
        if (typeof input.effective !== 'string')
          return fail({ kind: 'invalid', reason: 'type' } as const)
        const read = readJsonText(input.effective, budgets)
        if (read.kind === 'ok') return succeed(read.value)
        return fail({ kind: 'invalid', reason: describeJsonFailure(read) } as const)
      },
    }),
  )
}
