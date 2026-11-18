import type { JsonValue } from '@omne-harness/json-text'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { decodeCandidateRef, type CandidateRef, type ContextTarget } from './refs.js'
import { isCoverage } from './coverage-validation.js'
import { record } from './schema-primitives.js'
import type { ContinuationBasis, Coverage } from './values.js'

const SCHEMA = 'request-context/fixed-request/1'

export type FixedRequestRecord = Readonly<{
  schema: 'request-context/fixed-request/1'
  target: ContextTarget
  candidate: CandidateRef
  coverage: Coverage
  continuation: ContinuationBasis | null
}>
export type FixedRequestRecordRejection = Readonly<{ field: string; reason: 'unsupported-format' }>

const KEYS = ['schema', 'target', 'candidate', 'coverage', 'continuation'] as const

function exactKeys(v: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(v)
  return own.length === keys.length && keys.every(k => Object.hasOwn(v, k))
}
const bad = (field: string): Outcome<never, FixedRequestRecordRejection> => ({
  failure: { field, reason: 'unsupported-format' },
})

function decodeTarget(value: unknown): ContextTarget | undefined {
  if (!record(value) || !exactKeys(value, ['tenant', 'scope']) || typeof value.tenant !== 'string')
    return undefined
  const tenant = tenantCodec.parse(value.tenant)
  const scope = decodeScopeRef(value.scope)
  return tenant.ok && 'ok' in scope ? { tenant: tenant.value, scope: scope.ok } : undefined
}

export function encodeFixedRequestRecord(value: FixedRequestRecord): JsonValue {
  const tenant = tenantCodec.encode(value.target.tenant)
  if (!tenant.ok) throw new TypeError('The tenant of a fixed request record is not a minted tenant')
  return JSON.parse(
    JSON.stringify({
      schema: value.schema,
      target: { tenant: tenant.value, scope: value.target.scope },
      candidate: value.candidate,
      coverage: value.coverage,
      continuation: value.continuation,
    }),
  ) as JsonValue
}

export function decodeFixedRequestRecord(
  value: unknown,
): Outcome<FixedRequestRecord, FixedRequestRecordRejection> {
  if (!record(value) || !exactKeys(value, KEYS)) return bad('record')
  if (value.schema !== SCHEMA) return bad('schema')
  const target = decodeTarget(value.target)
  if (target === undefined) return bad('target')
  const candidate = decodeCandidateRef(value.candidate)
  if ('failure' in candidate) return bad('candidate')
  if (!isCoverage(value.coverage)) return bad('coverage')
  if (value.continuation !== null) return bad('continuation')
  return {
    ok: {
      schema: SCHEMA,
      target,
      candidate: candidate.ok,
      coverage: structuredClone(value.coverage),
      continuation: null,
    },
  }
}
