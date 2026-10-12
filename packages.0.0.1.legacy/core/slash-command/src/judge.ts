import {
  isJsonNumber,
  jsonNumberSource,
  type JsonNumber,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { snapshot, object } from './json.ts'
import { validate, type SchemaDefName } from './schema.ts'
import { recognize } from './recognize.ts'
import { templateLegal } from './template.ts'
import type {
  CommandInvocation,
  SlashCommandDefinition,
  SlashCommandJudgeContext,
  SlashCommandJudgment,
} from './types.ts'

const ok: SlashCommandJudgment = Object.freeze({ ok: true })
const malformed: SlashCommandJudgment = Object.freeze({ rejected: 'malformed' })
const bindingKinds: readonly string[] = ['prompt', 'skill', 'command']
function reserved(name: string): boolean {
  return /^[Oo][Mm][Nn][Ee]-[Oo][Ff][Ff][Ii][Cc][Ii][Aa][Ll]:/u.test(name)
}
/** Exact non-negative integer comparison without expanding a potentially huge exponent. */
function compare(a: JsonNumber, b: JsonNumber): number {
  function components(value: JsonNumber) {
    const source = jsonNumberSource(value)
    const match = /^-?([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/u.exec(source)
    if (match === null || match[1] === undefined) throw new Error('invalid checked JSON number')
    const fraction = match[2] ?? ''
    const digits = (match[1] + fraction).replace(/^0+/u, '')
    return {
      digits,
      order: BigInt(match[3] ?? '0') - BigInt(fraction.length) + BigInt(digits.length),
    }
  }
  const left = components(a),
    right = components(b)
  if (left.digits === '') return right.digits === '' ? 0 : -1
  if (right.digits === '') return 1
  if (left.order !== right.order) return left.order < right.order ? -1 : 1
  const length = Math.max(left.digits.length, right.digits.length)
  const l = left.digits.padEnd(length, '0'),
    r = right.digits.padEnd(length, '0')
  return l === r ? 0 : l < r ? -1 : 1
}
function legalSpan(span: JsonObject, raw?: string): boolean {
  if (!validate('Span', span).valid || !isJsonNumber(span.start) || !isJsonNumber(span.end))
    return false
  if (compare(span.start, span.end) > 0) return false
  return raw === undefined || (raw.isWellFormed() && compare(span.end, Array.from(raw).length) <= 0)
}
function invocationLegal(value: JsonObject): boolean {
  if (
    !validate('CommandInvocation', value).valid ||
    typeof value.raw !== 'string' ||
    !value.raw.isWellFormed() ||
    !object(value.span)
  )
    return false
  const actual = recognize(value.raw)
  if (
    actual.kind !== 'invocation' ||
    !isJsonNumber(value.span.start) ||
    !isJsonNumber(value.span.end)
  )
    return false
  return (
    actual.invocation.name === value.name &&
    actual.invocation.argumentText === value.argumentText &&
    compare(value.span.start, 0) === 0 &&
    compare(value.span.end, actual.invocation.span.end) === 0
  )
}
export function judgeInvocation(value: unknown): SlashCommandJudgment {
  const copied = snapshot(value)
  return object(copied) && invocationLegal(copied) ? ok : malformed
}
export function isCommandInvocation(value: unknown): value is CommandInvocation {
  return 'ok' in judgeInvocation(value)
}
export function judgeSlashCommand(
  value: unknown,
  context?: SlashCommandJudgeContext,
): SlashCommandJudgment {
  const copied = snapshot(value)
  if (!object(copied)) return malformed
  const binding = object(copied.binding) ? copied.binding : undefined
  const kind = binding?.kind
  if (
    binding !== undefined &&
    Object.hasOwn(binding, 'kind') &&
    (typeof kind !== 'string' || !bindingKinds.includes(kind))
  )
    return Object.freeze({ rejected: 'binding_unknown' })
  const name = context?.capabilityName
  if (typeof name === 'string' && !validate('CommandName', name).valid)
    return Object.freeze({ rejected: 'name_invalid' })
  if (typeof kind === 'string' && bindingKinds.includes(kind)) {
    if (
      (name !== undefined && reserved(name) !== (kind === 'command')) ||
      (kind === 'command' && context?.origin !== undefined && context.origin !== 'official')
    )
      return Object.freeze({ rejected: 'name_reserved' })
  }
  const parameters = Array.isArray(copied.parameters) ? copied.parameters : []
  const names = new Set<string>()
  for (const item of parameters) {
    if (object(item) && typeof item.name === 'string') {
      if (names.has(item.name)) return Object.freeze({ rejected: 'parameter_duplicate' })
      names.add(item.name)
    }
  }
  let named = false
  for (const item of parameters) {
    if (!object(item)) continue
    if (item.positional === true && named)
      return Object.freeze({ rejected: 'positional_after_named' })
    if (!Object.hasOwn(item, 'positional')) named = true
  }
  if (!validate('SlashCommandDefinition', copied).valid) return malformed
  let optional = false
  for (const item of parameters) {
    if (!object(item) || item.positional !== true) continue
    if (item.required === true && optional) return malformed
    if (item.required === false) optional = true
  }
  // The fixed Schema plus the checks above establish this body's typed shape.
  if (!definitionShape(copied)) throw new Error('inconsistent slash-command Schema')
  if (
    copied.binding.kind === 'prompt' &&
    !templateLegal(copied.binding.template, copied.parameters)
  )
    return malformed
  return ok
}
/** Shape-only guard after fixed Schema; no assertion substitutes for the receiver judge. */
function definitionShape(value: unknown): value is SlashCommandDefinition {
  return validate('SlashCommandDefinition', value).valid
}
export function isSlashCommandDefinition(value: unknown): value is SlashCommandDefinition {
  return 'ok' in judgeSlashCommand(value)
}
export function judgeSlashCommandValue(
  definition: SchemaDefName,
  value: unknown,
  context?: SlashCommandJudgeContext,
): SlashCommandJudgment {
  if (definition === 'SlashCommandDefinition') return judgeSlashCommand(value, context)
  if (definition === 'CommandInvocation') return judgeInvocation(value)
  const copied = snapshot(value)
  if (copied === undefined) return malformed
  if (
    definition === 'CommandName' &&
    typeof copied === 'string' &&
    !validate(definition, copied).valid
  )
    return Object.freeze({ rejected: 'name_invalid' })
  if (
    definition === 'CommandBinding' &&
    object(copied) &&
    Object.hasOwn(copied, 'kind') &&
    (typeof copied.kind !== 'string' || !bindingKinds.includes(copied.kind))
  )
    return Object.freeze({ rejected: 'binding_unknown' })
  if (!validate(definition, copied).valid) return malformed
  if (definition === 'Span')
    return object(copied) && legalSpan(copied, context?.raw) ? ok : malformed
  if (definition === 'Recognition' && object(copied) && copied.kind === 'invocation')
    return judgeInvocation(copied.invocation)
  if (definition === 'ParseResult' && object(copied) && copied.kind === 'failed') {
    if (!Object.hasOwn(copied, 'at')) return copied.reason === 'missing_required' ? ok : malformed
    return object(copied.at) && legalSpan(copied.at, context?.raw) ? ok : malformed
  }
  return ok
}
