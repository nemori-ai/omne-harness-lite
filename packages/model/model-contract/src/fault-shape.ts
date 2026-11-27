import { OVER_LIMIT_METRICS } from './profile.ts'
import type { ModelFaultCause } from './result.ts'

const CAUSES: ReadonlySet<string> = new Set<ModelFaultCause>([
  'profile-withdrawn',
  'excluded',
  'modality',
  'credential',
  'input-rejected',
  'input-over-limit',
  'replay-rejected',
  'upstream-unavailable',
  'stream-lost',
  'runtime-lost',
  'persistence',
  'policy-unavailable',
  'upstream-protocol',
  'unclassified',
])
const METRICS: ReadonlySet<string> = new Set(OVER_LIMIT_METRICS)
const DECIMAL = /^(0|[1-9][0-9]*)$/
const STATUS = /^[0-9]{3}$/
const MAX_DIAGNOSTIC = 200

function fields(value: unknown, names: readonly string[]): ReadonlyMap<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const entries = Object.entries(value)
  return entries.every(([key]) => names.includes(key)) ? new Map(entries) : null
}

/** A safe short text: one line, at most 200 characters, and no URL. */
function safeText(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_DIAGNOSTIC &&
    [...value].every(char => char >= ' ' && char !== '\u007f') &&
    !value.includes('://')
  )
}

function decimalOrNull(value: unknown): boolean {
  return value === null || (typeof value === 'string' && DECIMAL.test(value))
}

function reportedProblem(value: unknown): string | null {
  const reported = fields(value, ['metric', 'limit', 'actual'])
  if (reported === null) return 'reported'
  const metric = reported.get('metric')
  if (metric !== null && !(typeof metric === 'string' && METRICS.has(metric))) return 'reported'
  return decimalOrNull(reported.get('limit')) && decimalOrNull(reported.get('actual'))
    ? null
    : 'reported'
}

/** Why a failure cause taken from outside is not one this contract describes; null when it is. */
export function faultProblem(value: unknown): string | null {
  const fault = fields(value, [
    'cause',
    'diagnostic',
    'upstreamStatus',
    'replayCarried',
    'reported',
    'throttled',
  ])
  if (fault === null) return 'fault'
  const cause = fault.get('cause')
  if (typeof cause !== 'string' || !CAUSES.has(cause)) return 'cause'
  if (!safeText(fault.get('diagnostic'))) return 'diagnostic'
  const status = fault.get('upstreamStatus')
  if (status !== null && !(typeof status === 'string' && STATUS.test(status)))
    return 'upstream-status'
  if (
    fault.has('throttled') &&
    !(cause === 'upstream-unavailable' && fault.get('throttled') === true)
  )
    return 'throttled'
  return marksProblem(cause, fault)
}

function marksProblem(cause: string, fault: ReadonlyMap<string, unknown>): string | null {
  const carried = fault.get('replayCarried')
  if ((cause === 'replay-rejected' || fault.has('replayCarried')) && carried !== true)
    return 'replay-carried'
  if (cause === 'input-over-limit') return reportedProblem(fault.get('reported'))
  return fault.has('reported') ? 'reported' : null
}
