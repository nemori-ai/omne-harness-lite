import {
  isOwnedSettlementPrefix,
  settlementGenerationCurrent,
  type RunHistoryReader,
  type SettlementPrefix,
} from '@omne-harness-lite/model-request-runtime'
import {
  parseTenantId,
  parseOpaqueIdentifier,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { readSessionFact, type SessionFact } from '@omne-harness-lite/session-runtime'
import {
  compareInteger,
  checkKey,
  positiveInteger,
  type LogEntry,
} from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { AttemptId } from '@omne-harness-lite/call-accounts'

/** Read-only G28 projection from the exact owned native prefix. It grants no execution capability. */
export function createSessionRunHistory(requested: SessionScope): RunHistoryReader {
  const tenant = parseTenantId(requested.tenant)
  const session = parseOpaqueIdentifier(requested.session, 'SessionRef')
  if (!('ok' in tenant) || !('ok' in session))
    throw new TypeError('valid fixed Session scope required')
  const scope = Object.freeze({ tenant: tenant.ok, session: session.ok })
  return (prefix, run, attempt) => {
    if (!validPrefix(prefix, scope) || !checkKey(run) || !positiveInteger(attempt))
      return { unavailable: true }
    const state = readDriverRunState(prefix.entries, run, attempt)
    if (!state || !state.original || state.latest === undefined) return { unavailable: true }
    return {
      known: Object.freeze({
        run,
        originalAttempt: attempt,
        latestAttempt: state.latest,
        terminal: state.ended ? 'ended' : 'open',
      }),
    }
  }
}
function validPrefix(prefix: SettlementPrefix, scope: SessionScope) {
  return (
    isOwnedSettlementPrefix(prefix) &&
    settlementGenerationCurrent(prefix.binding) &&
    prefix.binding.session === scope.session &&
    prefix.source.session === scope.session &&
    tenantIdEquals(prefix.binding.tenant, scope.tenant) &&
    tenantIdEquals(prefix.source.tenant, scope.tenant)
  )
}
interface RunState {
  started: boolean
  original: boolean
  latest?: AttemptId
  ended: boolean
}
export function readDriverRunState(
  entries: readonly LogEntry[],
  run: string,
  attempt: AttemptId,
): RunState | undefined {
  const state: RunState = { started: false, original: false, ended: false }
  for (const entry of entries) {
    const parsed = readSessionFact(entry)
    if ('failure' in parsed) return undefined
    if (parsed.kind === 'other' || !('run' in parsed.fact) || parsed.fact.run !== run) continue
    if (!applyFact(state, parsed.fact, attempt)) return undefined
  }
  return state.started ? state : undefined
}
function applyFact(
  state: RunState,
  fact: Extract<SessionFact, { run: string }>,
  original: AttemptId,
) {
  if (fact.kind === 'run_started') {
    if (state.started) return false
    state.started = true
    return true
  }
  if (!state.started) return false
  if (fact.kind === 'attempt_started') return startAttempt(state, fact.attempt, original)
  if (fact.kind !== 'run_finished') return true
  if (state.ended || state.latest === undefined || compareInteger(fact.attempt, state.latest) !== 0)
    return false
  state.ended = true
  return true
}
function startAttempt(state: RunState, attempt: AttemptId, original: AttemptId) {
  if (state.ended || (state.latest !== undefined && compareInteger(attempt, state.latest) <= 0))
    return false
  state.latest = attempt
  if (compareInteger(attempt, original) === 0) state.original = true
  return true
}
