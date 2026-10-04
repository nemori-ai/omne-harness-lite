import { ExactDecimal, type AttemptId } from '@omne-harness-lite/call-accounts'
import { compareRfc3339Instants } from '@omne-harness-lite/offer-expiry'
import type { InspectedRunnerConclusion } from '@omne-harness-lite/loop-extension-runner'
import { compareInteger, type LogEntry } from '@omne-harness-lite/session-log'
import type { DriverValue } from './tool-driver-types.ts'
import type { DriverModelHistory } from './tool-driver-model-history.ts'
import { requireHistory } from './tool-driver-model-history.ts'

export interface DriverRecord {
  readonly value: DriverValue
  readonly key: string
  readonly entry: LogEntry
}
export type AdoptedAttempt = DriverRecord & { readonly value: Extract<DriverValue, { kind: 'attempt_adopted' }> }
export interface DriverRun {
  readonly start: DriverRecord
  readonly adoptions: Map<string, AdoptedAttempt>
  latest?: AdoptedAttempt
  end?: DriverRecord
}
export interface DriverRunnerRecord {
  readonly entry: LogEntry
  readonly inspected: InspectedRunnerConclusion
}
export function attemptIdentity(value: AttemptId): string {
  return ExactDecimal.from(value).toCanonicalString()
}
function sameInstant(left: string, right: string): boolean {
  const compared = compareRfc3339Instants(left, right)
  return 'ok' in compared && compared.ok === 0
}
function sameAttempt(entry: LogEntry, run: string, attempt: AttemptId): boolean {
  return entry.run === run && entry.attempt !== undefined && compareInteger(entry.attempt, attempt) === 0
}

function terminalBasis(
  record: DriverRecord & { readonly value: Extract<DriverValue, { kind: 'run_ended' }> },
  latest: AdoptedAttempt | undefined,
  models: DriverModelHistory,
  runners: readonly DriverRunnerRecord[],
): boolean {
  const value = record.value
  if (latest === undefined) return false
  const scopeMatches = (entry: LogEntry) => sameAttempt(entry, value.run, latest.value.attempt) &&
    compareInteger(entry.position, record.entry.position) < 0
  const basis = value.basis.map(key => {
    const model = models.byKey.get(key)
    if (model !== undefined && scopeMatches(model.entry)) {
      if (value.reason === 'completed') {
        const message = model.captured.message
        return message?.type === 'assistant' && message.ending === 'complete' &&
          !message.blocks.some(block => block.kind === 'tool_call') && models.replies.has(message.id)
      }
      if (value.reason === 'failed') return model.captured.response?.outcome === 'failed'
      const message = model.captured.message, item = model.captured.record
      return (message?.type === 'system_reminder' && message.source.kind === 'interrupted' && message.source.what === 'run') ||
        (item?.kind === 'model_call_interrupt_intent' && item.initiator === 'user')
    }
    const runner = runners.find(item => item.entry.dedupeKey === key)
    return value.reason === 'failed' && runner !== undefined && scopeMatches(runner.entry) &&
      runner.inspected.conclusion.output?.kind === 'stop' && runner.inspected.conclusion.output.terminal === 'failed'
  })
  return basis.length > 0 && basis.every(Boolean)
}

/** Projects the Run axis. The enclosing driver projection additionally checks every action route. */
export function projectDriverRuns(
  records: readonly DriverRecord[],
  models: DriverModelHistory,
  runners: readonly DriverRunnerRecord[],
): ReadonlyMap<string, DriverRun> {
  const runs = new Map<string, DriverRun>()
  const inbounds = new Set<string>()
  let open: string | undefined
  for (const record of records) {
    const value = record.value
    if (value.kind === 'run_started') {
      const inbound = models.byKey.get(value.inboundKey)
      requireHistory(open === undefined && !runs.has(value.run) && !inbounds.has(value.inboundKey) &&
        inbound?.captured.message?.type === 'user' && compareInteger(inbound.entry.position, record.entry.position) < 0,
        'Run requires an unclaimed earlier user ingress and no open Run')
      inbounds.add(value.inboundKey)
      runs.set(value.run, { start: record, adoptions: new Map() })
      open = value.run
    } else if (value.kind === 'attempt_adopted') {
      const run = runs.get(value.run)
      const started = models.byKey.get(value.startedMessageKey)
      const message = started?.captured.message
      requireHistory(run !== undefined && open === value.run && run.end === undefined &&
        (run.latest === undefined || compareInteger(value.attempt, run.latest.value.attempt) > 0),
        'attempt does not advance an open Run')
      requireHistory(started !== undefined && message?.type === 'system_reminder' &&
        message.source.kind === 'attempt_started' && sameAttempt(started.entry, value.run, value.attempt) &&
        compareInteger(message.source.attempt, value.attempt) === 0 &&
        sameInstant(message.createdAt, message.source.at),
        'attempt has no matching started message')
      // Presence/order are observable here. The writer owns their one-append publication.
      requireHistory(compareInteger(started.entry.position, run.start.entry.position) > 0,
        'attempt message predates Run')
      const attempt: AdoptedAttempt = { ...record, value }
      run.adoptions.set(attemptIdentity(value.attempt), attempt)
      run.latest = attempt
    } else if (value.kind === 'run_ended') {
      const run = runs.get(value.run)
      requireHistory(run !== undefined && open === value.run && run.end === undefined &&
        terminalBasis({ ...record, value }, run.latest, models, runners), 'Run ending lacks actual current basis')
      run.end = record
      open = undefined
    }
  }
  // These facts can arrive late, but they cannot invent a never-adopted Run/attempt.
  for (const item of models.entries) {
    if (item.entry.run === undefined) continue
    const run = runs.get(item.entry.run)
    const attempt = item.entry.attempt === undefined ? undefined : run?.adoptions.get(attemptIdentity(item.entry.attempt))
    requireHistory(attempt !== undefined, 'model fact has no adopted attempt')
    const started = item.captured.message?.type === 'system_reminder' && item.captured.message.source.kind === 'attempt_started'
    requireHistory(started ? item.entry.dedupeKey === attempt.value.startedMessageKey :
      compareInteger(item.entry.position, attempt.entry.position) > 0, 'model fact predates or conflicts with adoption')
  }
  return runs
}
