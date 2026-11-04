// The durable record of one fixed request (RQ-14): the coordinator side keeps it at the moment of
// fixing, and the narrow adopted source reads it back as an `AdoptedRequestFact`. The carrier
// stores the JSON value without decoding it; this file owns the format.
import type * as M from '@omne-harness/model-contract'
import type { JsonValue } from '@omne-harness/json-text'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { measuredAmount } from './internal.js'
import { decodeCandidateRef, type CandidateRef, type ContextTarget } from './refs.js'
import { isCoverage } from './coverage-validation.js'
import { record } from './schema-primitives.js'
import type { ContinuationBasis, Coverage } from './values.js'

/** The format name that a record carries; a reader refuses any other. */
const SCHEMA = 'request-context/fixed-request/1'

/** 协调者一侧在固定时刻保存、窄采用来源读回的固定请求记录（RQ-14）。 */
export type FixedRequestRecord = Readonly<{
  schema: 'request-context/fixed-request/1'
  target: ContextTarget
  candidate: CandidateRef
  coverage: Coverage
  /** The `context.window.provided` of the profile used at fixing, canonical positive decimal text. */
  windowTokens: string
  /** The `input-tokens` measurement of the whole request at fixing; null without such a check. */
  forecast: Readonly<{ kind: 'estimate'; usedTokens: string }> | null
  continuation: ContinuationBasis | null
}>
export type FixedRequestRecordRejection = Readonly<{ field: string; reason: 'unsupported-format' }>

const POSITIVE = /^[1-9][0-9]*$/u
const INTEGER = /^(0|[1-9][0-9]*)$/u
const KEYS = [
  'schema',
  'target',
  'candidate',
  'coverage',
  'windowTokens',
  'forecast',
  'continuation',
] as const

function exactKeys(v: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(v)
  return own.length === keys.length && keys.every(k => Object.hasOwn(v, k))
}
const bad = (field: string): Outcome<never, FixedRequestRecordRejection> => ({
  failure: { field, reason: 'unsupported-format' },
})

/** `undefined` marks a value that is not a forecast; null is the valid absent forecast. */
function decodeForecast(value: unknown): FixedRequestRecord['forecast'] | undefined {
  if (value === null) return null
  if (
    record(value) &&
    exactKeys(value, ['kind', 'usedTokens']) &&
    value.kind === 'estimate' &&
    typeof value.usedTokens === 'string' &&
    INTEGER.test(value.usedTokens)
  )
    return { kind: 'estimate', usedTokens: value.usedTokens }
  return undefined
}

/** `undefined` marks a value that is not a target. */
function decodeTarget(value: unknown): ContextTarget | undefined {
  if (!record(value) || !exactKeys(value, ['tenant', 'scope']) || typeof value.tenant !== 'string')
    return undefined
  const tenant = tenantCodec.parse(value.tenant)
  const scope = decodeScopeRef(value.scope)
  return tenant.ok && 'ok' in scope ? { tenant: tenant.value, scope: scope.ok } : undefined
}

/**
 * The forecast of one request: the largest `input-tokens` measurement of the report, each one at
 * its upper bound (an estimate carries its margin). Null when the report has no such check.
 */
export function forecastOf(report: M.RequestBudget): FixedRequestRecord['forecast'] {
  const amounts = report.checks.filter(c => c.metric === 'input-tokens').map(measuredAmount)
  if (amounts.length === 0) return null
  return { kind: 'estimate', usedTokens: amounts.reduce((a, b) => (a > b ? a : b)).toString() }
}

/** The JSON value of a record; the tenant is its canonical text. */
export function encodeFixedRequestRecord(value: FixedRequestRecord): JsonValue {
  const tenant = tenantCodec.encode(value.target.tenant)
  if (!tenant.ok) throw new TypeError('The tenant of a fixed request record is not a minted tenant')
  return JSON.parse(
    JSON.stringify({
      schema: value.schema,
      target: { tenant: tenant.value, scope: value.target.scope },
      candidate: value.candidate,
      coverage: value.coverage,
      windowTokens: value.windowTokens,
      forecast: value.forecast,
      continuation: value.continuation,
    }),
  ) as JsonValue
}

/**
 * Reads a record from stored JSON. Every unknown key, every other format name and every field of
 * the wrong shape is `unsupported-format`. A continuation basis is not stored yet (F7), so a
 * non-null `continuation` is refused rather than passed unchecked.
 */
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
  if (typeof value.windowTokens !== 'string' || !POSITIVE.test(value.windowTokens))
    return bad('windowTokens')
  const forecast = decodeForecast(value.forecast)
  if (forecast === undefined) return bad('forecast')
  if (value.continuation !== null) return bad('continuation')
  return {
    ok: {
      schema: SCHEMA,
      target,
      candidate: candidate.ok,
      coverage: structuredClone(value.coverage),
      windowTokens: value.windowTokens,
      forecast,
      continuation: null,
    },
  }
}
