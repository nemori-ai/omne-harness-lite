import { tenantEquals } from '@omne-harness/legal-identity'
import type { SessionCallRegistration, SessionCallWait } from './call-values.ts'
import type { SessionHistoryReads } from './history-values.ts'
import type {
  DurableEvidence,
  RunId,
  SessionAccess,
  ConsumptionId,
  SessionOperationId,
} from './identity.ts'
import type {
  CallBinding,
  ControlProgress,
  InputBatch,
  RunTerminal,
  Waiting,
  WorkSnapshot,
  ProducedResult,
} from './values.ts'
import type { Decision, EncodedEntry } from './judgments.ts'
import { validateReplayedConsequences } from './replay-validation.ts'
import { validateObservation } from './observation-validation.ts'
import { applyExtended } from './reduce-extended.ts'
import {
  CallConflict,
  associated,
  legacyRegistration,
  validateBinding,
  validateRegistration,
  validateResult,
} from './call-state.ts'
import { validateControlProgress } from './control-state.ts'
import {
  SessionValidationFailure,
  equalValue,
  evidenceFields,
  inconsistent,
  invalidAt,
  nonempty,
  unavailableAt,
} from './session-validation.ts'
import { encodeEntry, type SessionEntry } from './entries.ts'
import { entries, invalid, originOf, rejected, terminalEntries } from './decision-support.ts'

/** Session consequences normalized by the adapter from the same log's public Agent read shapes. */
export type SessionLogConsequence =
  | Readonly<{
      kind: 'call-registration'
      consumption: ConsumptionId
      registration: SessionCallRegistration
    }>
  | Readonly<{
      kind: 'call-association'
      consumption: ConsumptionId
      binding: CallBinding
      source: DurableEvidence
    }>
  | Readonly<{
      kind: 'registered-waiting'
      calls: readonly SessionCallWait[]
      other: readonly Exclude<Waiting, { kind: 'producer' }>[]
    }>
  | Readonly<{ kind: 'input-taken'; batch: InputBatch }>
  | Readonly<{ kind: 'call'; consumption: ConsumptionId; binding: CallBinding }>
  | Readonly<{
      kind: 'producer'
      consumption: ConsumptionId
      binding: CallBinding
      result: ProducedResult | null
    }>
  | Readonly<{ kind: 'waiting'; waiting: readonly Waiting[] }>
  | Readonly<{ kind: 'control'; progress: ControlProgress }>
  | Readonly<{
      kind: 'ended'
      outcome: RunTerminal['outcome']
      cause: DurableEvidence | null
      disposition: DurableEvidence
    }>
  | Readonly<{ kind: 'observed' }>
export type SessionLogObservation = Omit<SessionAccess<never>, 'principal'> &
  Readonly<{
    run: RunId
    execution: string
    /** Only the public AgentEvent sequence. Snapshot reads leave this null. */
    sequence: string | null
    revision: string
    executionEvidence?: DurableEvidence
    operation?: SessionOperationId
    source: DurableEvidence
    consequences: readonly SessionLogConsequence[]
  }>

/** Pure preparation for one atomic Session interpretation commit. */
export function projectSessionLog(
  snapshot: WorkSnapshot,
  observation: SessionLogObservation,
  reads?: SessionHistoryReads,
): Decision {
  if (
    !tenantEquals(snapshot.tenant, observation.tenant) ||
    snapshot.session !== observation.session
  )
    return rejected({ kind: 'denied', action: 'projectSessionLog' })
  try {
    if ('operation' in observation) nonempty(observation.operation, 'operation')
    return projectObservation(snapshot, observation, reads)
  } catch (error) {
    if (error instanceof SessionValidationFailure) return rejected(error.failure)
    if (error instanceof CallConflict)
      return observation.operation === undefined
        ? rejected({
            kind: 'unavailable',
            owner: '@omne-harness/session-contract',
            diagnostic: 'missing current interpretation operation',
          })
        : rejected({ kind: 'conflict', operation: observation.operation })
    if (error instanceof TypeError || error instanceof RangeError)
      return invalid('observation', error.message)
    throw error
  }
}

function projectObservation(
  snapshot: WorkSnapshot,
  observation: SessionLogObservation,
  reads?: SessionHistoryReads,
): Decision {
  const checked = validateObservation(snapshot, observation, reads)
  if (
    observation.consequences.some(
      consequence => consequence.kind === 'ended' && consequence.outcome === 'cancelled',
    )
  )
    requireSessionCancellation(snapshot, observation)
  if (checked.repeated) {
    validateReplayedConsequences(snapshot, observation)
    return entries([])
  }
  const draft = { ...snapshot }
  const out: EncodedEntry[] = []
  const origin = { ...originOf(observation.source), owner: 'agent', via: 'same-log' }
  const append = (entry: SessionEntry) => {
    const diagnostic = applyExtended(draft, entry, observation.source)
    if (diagnostic !== null) invalidAt(entry.kind, diagnostic)
    out.push(encodeEntry(entry, origin))
  }
  for (const consequence of observation.consequences) {
    switch (consequence.kind) {
      case 'observed':
        break
      case 'input-taken':
        append({ kind: 'run.batch-taken', run: observation.run, batch: consequence.batch })
        break
      case 'call-registration':
        validateRegistration(draft, consequence.registration, observation.run)
        append({
          kind: 'call.bound',
          consumption: consequence.consumption,
          registration: consequence.registration,
          association: null,
        })
        break
      case 'call-association': {
        validateBinding(draft, consequence.binding, observation.run)
        evidenceFields(consequence.source, 'association.source')
        const original = draft.callRegistrations?.find(
          item => item.consumption === consequence.consumption,
        )
        if (original === undefined) unavailableAt('association.registration')
        append({
          kind: 'call.bound',
          consumption: consequence.consumption,
          registration: associated(consequence.binding, 'action'),
          association: consequence.source,
        })
        break
      }
      case 'call':
        validateBinding(draft, consequence.binding, observation.run)
        append({
          kind: 'call.bound',
          consumption: consequence.consumption,
          registration: legacyRegistration(draft, consequence.consumption, consequence.binding),
          association: null,
        })
        break
      case 'producer': {
        validateBinding(draft, consequence.binding, observation.run)
        const registration = legacyRegistration(draft, consequence.consumption, consequence.binding)
        if (consequence.result !== null) validateResult(consequence.binding, consequence.result)
        const prior = draft.consumptions.find(item => item.id === consequence.consumption)
        if (prior === undefined)
          append({
            kind: 'call.bound',
            consumption: consequence.consumption,
            registration,
            association: null,
          })
        const priorResult = prior?.results.find(
          item => item.result.version === consequence.result?.version,
        )
        if (priorResult !== undefined && !equalValue(priorResult.result, consequence.result))
          throw new CallConflict('result')
        append({
          kind: 'call.execution-fact',
          fact: {
            kind: 'execution',
            producer: consequence.binding.producer,
            source: observation.source,
          },
          consumption: consequence.consumption,
          result: consequence.result,
        })
        break
      }
      case 'registered-waiting':
        append({
          kind: 'extension.passage',
          run: observation.run,
          calls: consequence.calls,
          other: consequence.other,
        })
        break
      case 'waiting': {
        const calls = consequence.waiting.flatMap(wait => {
          if (wait.kind !== 'producer') return []
          const record = draft.callRegistrations?.find(
            item =>
              item.registration.kind === 'associated' &&
              equalValue(item.registration.binding, wait.binding),
          )
          if (record === undefined) unavailableAt('waiting.registration')
          return [{ consumption: record.consumption, position: wait.position }]
        })
        append({
          kind: 'extension.passage',
          run: observation.run,
          calls,
          other: consequence.waiting.filter(wait => wait.kind !== 'producer'),
        })
        break
      }
      case 'control':
        validateControlProgress(draft, consequence.progress)
        append({ kind: 'control.progress', progress: consequence.progress, fact: null })
        break
      case 'ended': {
        evidenceFields(consequence.disposition, 'ended.disposition')
        if (consequence.cause !== null) evidenceFields(consequence.cause, 'ended.cause')
        const terminal: RunTerminal = {
          run: observation.run,
          outcome: consequence.outcome,
          evidence: consequence.disposition,
        }
        if (draft.run.kind !== 'active' || draft.run.run !== observation.run)
          out.push(
            encodeEntry({ kind: 'history.annotated', run: observation.run, terminal }, origin),
          )
        else {
          out.push(
            ...terminalEntries(draft, terminal, observation.source, {
              sequence: observation.sequence,
              cause: consequence.cause,
              disposition: consequence.disposition,
            }).map(entry => ({ ...entry, origin })),
          )
        }
        break
      }
      default: {
        const exhaustive: never = consequence
        return exhaustive
      }
    }
  }
  if (out.length === 0) return entries([])
  out.push(
    encodeEntry(
      {
        kind: 'history.annotated',
        run: observation.run,
        execution: {
          execution: observation.execution,
          revision: observation.revision,
          evidence: checked.head,
          readThrough: observation.sequence ?? checked.boundary.readThrough,
        },
      },
      origin,
    ),
  )
  return entries(out)
}

function requireSessionCancellation(
  snapshot: WorkSnapshot,
  observation: SessionLogObservation,
): void {
  const historical = snapshot.executions?.find(
    item => item.run === observation.run && item.execution.execution === observation.execution,
  )?.terminal
  const current =
    snapshot.run.kind === 'terminal' && snapshot.run.terminal.run === observation.run
      ? snapshot.run.terminal
      : null
  if (
    historical != null &&
    (historical.run !== observation.run ||
      (current !== null && !equalValue(current, historical)) ||
      (snapshot.run.kind === 'active' && snapshot.run.run === observation.run))
  )
    inconsistent('ended.cancelled: conflicting Session terminal')
  if ((current ?? historical)?.outcome !== 'cancelled')
    invalidAt('outcome', 'Agent cancellation requires committed Session cancellation')
}
