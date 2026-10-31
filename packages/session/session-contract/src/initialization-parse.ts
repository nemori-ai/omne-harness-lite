import { judgeJsonValue, type JsonValue } from '@omne-harness/json-text'
import type { Adoption, DurableEvidence } from './identity.ts'
import type { ContextMaterial, InitializationResult } from './values.ts'

export class InitializationInvalid extends Error {}

export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new InitializationInvalid('expected an object')
  const fields = Object.getOwnPropertyDescriptors(value)
  if (
    Reflect.ownKeys(value).length !== keys.length ||
    keys.some(key => {
      const descriptor = fields[key]
      return descriptor === undefined || !('value' in descriptor)
    })
  )
    throw new InitializationInvalid(`expected exactly ${keys.join(', ')}`)
  return value as Record<string, unknown>
}

export function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new InitializationInvalid('expected nonempty text')
  return value
}

export function list<T>(value: unknown, parse: (item: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new InitializationInvalid('expected an array')
  return Array.from(value, parse)
}

export function adoption(value: unknown): Adoption {
  const fields = object(value, ['owner', 'name', 'revision', 'digest'])
  return {
    owner: text(fields['owner']),
    name: text(fields['name']),
    revision: text(fields['revision']),
    digest: text(fields['digest']),
  }
}

export function evidence(value: unknown): DurableEvidence {
  const fields = object(value, ['owner', 'record', 'revision', 'digest'])
  return {
    owner: text(fields['owner']),
    record: text(fields['record']),
    revision: text(fields['revision']),
    digest: text(fields['digest']),
  }
}

export function json(value: unknown): JsonValue {
  const judged = judgeJsonValue(value)
  if ('rejected' in judged)
    throw new InitializationInvalid(`invalid JSON value: ${judged.rejected}`)
  return judged.ok
}

export function material(value: unknown): ContextMaterial {
  const fields = object(value, ['schema', 'value'])
  return { schema: adoption(fields['schema']), value: json(fields['value']) }
}

export function result(value: unknown): InitializationResult {
  const fields = object(value, ['owner', 'item', 'result'])
  const outcome = fields['result']
  if (typeof outcome !== 'object' || outcome === null || !('kind' in outcome))
    throw new InitializationInvalid('missing initialization result kind')
  const owner = text(fields['owner'])
  const item = text(fields['item'])
  switch (outcome.kind) {
    case 'ready': {
      const ready = object(outcome, ['kind', 'evidence'])
      return { owner, item, result: { kind: 'ready', evidence: evidence(ready['evidence']) } }
    }
    case 'failed': {
      const failed = object(outcome, ['kind', 'diagnostic', 'recovery'])
      if (typeof failed['diagnostic'] !== 'string')
        throw new InitializationInvalid('expected a diagnostic string')
      return {
        owner,
        item,
        result: {
          kind: 'failed',
          diagnostic: failed['diagnostic'],
          recovery: evidence(failed['recovery']),
        },
      }
    }
    default:
      throw new InitializationInvalid('unknown initialization result kind')
  }
}
