import {
  readJsonText,
  type JsonFailure,
  type JsonLimits,
  type JsonValue,
} from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
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

export const toolArguments: Check<ToolArguments> = record({
  original: text,
  effective: text,
  complete: bool,
})

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

export type ParsedToolArguments = Readonly<{ original: JsonValue; effective: JsonValue }>

export type ToolArgumentsRejection =
  | Readonly<{ kind: 'shape'; field: string; reason: string }>
  | Readonly<{ kind: 'incomplete' }>
  | Readonly<{ kind: 'invalid'; field: 'original' | 'effective'; reason: string }>

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
