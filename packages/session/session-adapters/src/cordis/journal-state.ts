// The durable form of the Agent records of one session: the executions, the operation records,
// the joint facts, the received state and the Authority to attempt relation that the Journal core
// keeps in its root. The `execution-record` participant stores this form as opaque state; the
// provider rebuilds its in-process root from it. Maps, sets, minted identities and bigints have
// marked forms, so a decoded value equals the encoded one. A function is not data: it is refused.
import { tenantCodec, workspaceCodec } from '@omne-harness/legal-identity'
import type { JsonValue } from '@omne-harness/sql-contract'
import type { CommonRoot } from '../testing/root.ts'

const MARKS = ['$map', '$set', '$tenant', '$workspace', '$bigint', '$undefined', '$number'] as const

function isPlain(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as unknown
  return prototype === Object.prototype || prototype === null
}

export function encodeState(value: unknown): JsonValue {
  if (value === null) return null
  if (value === undefined) return { $undefined: true }
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value
    case 'number':
      return Number.isFinite(value) ? value : { $number: String(value) }
    case 'bigint':
      return { $bigint: value.toString() }
    case 'object':
      break
    default:
      throw new TypeError(`a ${typeof value} is not durable Journal data`)
  }
  if (Array.isArray(value)) return value.map(item => encodeState(item))
  if (value instanceof Map)
    return { $map: [...value].map(([key, item]) => [encodeState(key), encodeState(item)]) }
  if (value instanceof Set) return { $set: [...value].map(item => encodeState(item)) }
  const named = (value as { name?: unknown }).name
  if (named === 'TenantId') {
    const text = tenantCodec.encode(value as never)
    if (text.ok) return { $tenant: text.value }
  }
  if (named === 'WorkspaceId') {
    const text = workspaceCodec.encode(value as never)
    if (text.ok) return { $workspace: text.value }
  }
  if (!isPlain(value)) throw new TypeError('a class instance is not durable Journal data')
  const out: Record<string, JsonValue> = {}
  for (const [key, member] of Object.entries(value)) {
    if (key.startsWith('$')) throw new TypeError(`the member name ${key} is reserved`)
    out[key] = encodeState(member)
  }
  return out
}

function markOf(value: Readonly<Record<string, JsonValue>>): (typeof MARKS)[number] | null {
  const keys = Object.keys(value)
  if (keys.length !== 1) return null
  const key = keys[0] as (typeof MARKS)[number]
  return MARKS.includes(key) ? key : null
}

export function decodeState(value: JsonValue): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => decodeState(item as JsonValue))
  const record = value as Readonly<Record<string, JsonValue>>
  switch (markOf(record)) {
    case '$map':
      return new Map(
        (record['$map'] as readonly (readonly JsonValue[])[]).map(([key, item]) => [
          decodeState(key ?? null),
          decodeState(item ?? null),
        ]),
      )
    case '$set':
      return new Set((record['$set'] as readonly JsonValue[]).map(item => decodeState(item)))
    case '$tenant': {
      const parsed = tenantCodec.parse(String(record['$tenant']))
      if (!parsed.ok) throw new TypeError('the tenant text does not parse')
      return parsed.value
    }
    case '$workspace': {
      const parsed = workspaceCodec.parse(String(record['$workspace']))
      if (!parsed.ok) throw new TypeError('the workspace text does not parse')
      return parsed.value
    }
    case '$bigint':
      return BigInt(String(record['$bigint']))
    case '$undefined':
      return undefined
    case '$number':
      return Number(record['$number'])
    case null: {
      const out: Record<string, unknown> = {}
      for (const [key, member] of Object.entries(record)) out[key] = decodeState(member)
      return out
    }
  }
}

/** The part of the Journal core's root that is durable. */
export type DurableAgentRecords = Readonly<{
  executions: CommonRoot['agent']['executions']
  operations: CommonRoot['agent']['operations']
  jointFacts: CommonRoot['agent']['jointFacts']
  authorities: CommonRoot['agent']['authorities']
  receiving: CommonRoot['receiving']
}>

export function recordsOf(root: CommonRoot): DurableAgentRecords {
  return {
    executions: root.agent.executions,
    operations: root.agent.operations,
    jointFacts: root.agent.jointFacts,
    authorities: root.agent.authorities,
    receiving: root.receiving,
  }
}
