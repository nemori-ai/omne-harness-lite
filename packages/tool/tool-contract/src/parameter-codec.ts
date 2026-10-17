// The default parameter codec and the admission-time judgment of both argument texts (P02).
import {
  readJsonText,
  type JsonFailure,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/kernel-basis'
import { describedAdoption } from './adoption.ts'
import type { ParameterCodec } from './authoring.ts'
import type { ToolArguments } from './definitions.ts'
import { bool, judgeUnknown, positiveSafeInteger, record, text, type Check } from './shape.ts'

const limitsShape = record({
  maxBytes: positiveSafeInteger,
  maxDepth: positiveSafeInteger,
  maxItems: positiveSafeInteger,
  maxMembers: positiveSafeInteger,
  maxStringLength: positiveSafeInteger,
  maxNumberLength: positiveSafeInteger,
})

/** The closed shape of `ToolArguments`: both texts are strings and `complete` is a boolean. */
export const toolArguments: Check<ToolArguments> = record({
  original: text,
  effective: text,
  complete: bool,
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

/** Both argument texts as json-text trees. */
export type ParsedToolArguments = Readonly<{ original: JsonValue; effective: JsonValue }>

/**
 * Why `judgeToolArguments` gave no argument value. `shape` is a boundary rejection of the input
 * or the budgets, not an argument failure of the call. `incomplete` means the block is not
 * complete yet. `invalid` names the text that failed the strict parse.
 */
export type ToolArgumentsRejection =
  | Readonly<{ kind: 'shape'; field: string; reason: string }>
  | Readonly<{ kind: 'incomplete' }>
  | Readonly<{ kind: 'invalid'; field: 'original' | 'effective'; reason: string }>

/**
 * The admission-time judgment of the fixed arguments (P02; SPEC "值、定义和固定请求"). Both the
 * original text and the effective text are parsed in full by json-text without duplicate keys.
 * `complete=false` is not parsed. A failure of either text gives no argument value at all, so
 * a partial document can never become an argument. The author's own codec still parses the
 * effective text at execution time; this judgment does not replace it.
 */
export function judgeToolArguments(
  input: unknown,
  limits: JsonLimits,
): Outcome<ParsedToolArguments, ToolArgumentsRejection> {
  const budgets = limitsShape(limits, 'limits')
  if ('failure' in budgets) return fail({ kind: 'shape', ...budgets.failure })
  const shaped = judgeUnknown(toolArguments, input, 'ToolArguments')
  if ('failure' in shaped) return fail({ kind: 'shape', ...shaped.failure })
  if (!shaped.ok.complete) return fail({ kind: 'incomplete' })
  const original = readJsonText(shaped.ok.original, budgets.ok)
  if (original.kind !== 'ok')
    return fail({ kind: 'invalid', field: 'original', reason: describeJsonFailure(original) })
  const effective = readJsonText(shaped.ok.effective, budgets.ok)
  if (effective.kind !== 'ok')
    return fail({ kind: 'invalid', field: 'effective', reason: describeJsonFailure(effective) })
  return succeed(Object.freeze({ original: original.value, effective: effective.value }))
}
