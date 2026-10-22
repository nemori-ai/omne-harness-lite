// The closed vocabulary of gateway request fields: how each field is written into the body and how
// an extension value is read for it.
import type { JsonValue } from '@omne-harness/json-text'
import { bool, finite, lexeme, list, object, text } from './json.ts'
import type { GatewayField, GatewayParam } from './vocabulary.ts'

const DECIMAL = /^(0|[1-9][0-9]*)$/
const EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const

/** Every field of the vocabulary, for the checks of a record. */
export const GATEWAY_FIELDS = [
  'temperature',
  'top_p',
  'frequency_penalty',
  'presence_penalty',
  'max_tokens',
  'seed',
  'stop',
  'reasoning.effort',
  'reasoning.enabled',
  'store',
] as const satisfies readonly GatewayField[]

/** The JSON value of a gateway parameter. */
function valueOf(param: GatewayParam): JsonValue {
  switch (param.field) {
    case 'temperature':
    case 'top_p':
    case 'frequency_penalty':
    case 'presence_penalty':
      return finite(param.value)
    case 'max_tokens':
    case 'seed':
      if (!DECIMAL.test(param.value)) throw new RangeError(`${param.field} must be decimal text`)
      return lexeme(param.value)
    case 'stop':
      return list(param.value.map(text))
    case 'reasoning.effort':
      return text(param.value)
    case 'reasoning.enabled':
    case 'store':
      return bool(param.value)
    default: {
      const _exhaustive: never = param
      return _exhaustive
    }
  }
}

/**
 * The body members of a list of gateway parameters. A field with a dot nests one level. A field
 * written twice is a defect of the record or the engine and throws.
 */
export function gatewayMembers(
  params: readonly GatewayParam[],
): Readonly<Record<string, JsonValue>> {
  const flat = new Map<string, JsonValue>()
  const nested = new Map<string, Map<string, JsonValue>>()
  for (const param of params) {
    const [head, tail] = splitField(param.field)
    const taken =
      tail === null
        ? flat.has(head) || nested.has(head)
        : flat.has(head) || nested.get(head)?.has(tail) === true
    if (taken) throw new Error(`gateway field ${param.field} is written twice`)
    if (tail === null) {
      flat.set(head, valueOf(param))
      continue
    }
    const group = nested.get(head) ?? new Map<string, JsonValue>()
    group.set(tail, valueOf(param))
    nested.set(head, group)
  }
  const members: Record<string, JsonValue> = Object.fromEntries(flat)
  for (const [head, group] of nested) members[head] = object(Object.fromEntries(group))
  return members
}

function splitField(field: GatewayField): readonly [string, string | null] {
  const dot = field.indexOf('.')
  return dot < 0 ? [field, null] : [field.slice(0, dot), field.slice(dot + 1)]
}

/** The gateway parameter that an extension value gives for `field`, or `null` when it does not fit. */
export function readGatewayParam(field: GatewayField, value: JsonValue): GatewayParam | null {
  switch (field) {
    case 'temperature':
    case 'top_p':
    case 'frequency_penalty':
    case 'presence_penalty': {
      if (value.kind !== 'number') return null
      const number = Number(value.lexeme)
      return Number.isFinite(number) ? { field, value: number } : null
    }
    case 'max_tokens':
    case 'seed':
      return value.kind === 'number' && DECIMAL.test(value.lexeme)
        ? { field, value: value.lexeme }
        : null
    case 'stop':
      if (value.kind !== 'array') return null
      return value.items.every(item => item.kind === 'string')
        ? {
            field,
            value: value.items.flatMap(item => (item.kind === 'string' ? [item.value] : [])),
          }
        : null
    case 'reasoning.effort': {
      if (value.kind !== 'string') return null
      const effort = EFFORTS.find(item => item === value.value)
      return effort === undefined ? null : { field, value: effort }
    }
    case 'reasoning.enabled':
    case 'store':
      return value.kind === 'boolean' && !value.value ? { field, value: false } : null
    default: {
      const _exhaustive: never = field
      return _exhaustive
    }
  }
}
