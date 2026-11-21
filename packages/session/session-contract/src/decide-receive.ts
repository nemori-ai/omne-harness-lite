import type { SessionCommand } from './ports.ts'
import type { WorkSnapshot } from './values.ts'
import type { AdvanceRef } from './identity.ts'
import type { Decision } from './judgments.ts'
import type { HistoryEntry } from './faces.ts'
import { encodeEntry } from './entries.ts'
import { completeEvidence, entries, invalid, originOf, rejected } from './decision-support.ts'
import { digestOf } from './operations.ts'
import { NOT_INTERPRETED, resultRefusal, uninterpretedBinding } from './decide-results.ts'
import type { SessionHistoryReads } from './history-values.ts'
import { equalValue } from './session-validation.ts'

export function decideProducerFact(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'receive' }>,
  entryOrigin?: HistoryEntry['origin'],
  history?: SessionHistoryReads,
): Decision {
  const { fact } = command.input
  if (fact.kind === 'input-handover') return invalid('fact', 'input handover uses its own decision')
  if (!completeEvidence(fact.source)) return invalid('fact.source', 'incomplete source')
  const origin = entryOrigin ?? originOf(fact.source)
  switch (fact.kind) {
    case 'agent-exit':
      switch (startedAttempt(snapshot, fact.advance)) {
        case 'forged':
          return invalid('fact.advance', 'not an attempt this session started')
        case 'unknown':
          return rejected({
            kind: 'unavailable',
            owner: 'session-history',
            diagnostic: 'the history index does not cover this attempt',
          })
        case 'started':
          break
      }
      return entries([encodeEntry({ kind: 'run.attempt-exited', advance: fact.advance }, origin)])
    case 'execution':
    case 'account': {
      const consumption = snapshot.consumptions.find(
        item => digestOf(item.binding.producer) === digestOf(fact.producer),
      )
      if (consumption === undefined)
        return uninterpretedBinding(
          history,
          call => call.producer !== null && digestOf(call.producer) === digestOf(fact.producer),
        )
          ? NOT_INTERPRETED
          : invalid('fact.producer', 'no original binding')
      return entries([
        encodeEntry(
          fact.kind === 'account'
            ? { kind: 'account.linked', fact }
            : { kind: 'call.execution-fact', fact, delivered: consumption.id },
          origin,
        ),
      ])
    }
    case 'release': {
      if (fact.result.producer.kind === 'model')
        return rejected({
          kind: 'unavailable',
          owner: 'agent-contract',
          diagnostic: 'MODEL-ACK-ARRIVAL: no adopted public confirmation fact',
        })
      const refusal = resultRefusal(
        snapshot,
        fact.consumption,
        fact.result,
        command.input.operation,
        history,
      )
      if (refusal !== null) return refusal
      const result = snapshot.consumptions
        .find(item => item.id === fact.consumption)
        ?.results.find(item => item.result.version === fact.result.version)
      if (result === undefined || (result.custody === null && result.completion === null))
        return invalid('fact.result', 'result has not been reliably retained or processed')
      return entries([encodeEntry({ kind: 'call.execution-fact', fact }, origin)])
    }
    case 'cascade':
      if (
        !snapshot.tasks.some(
          task =>
            task.kind === 'cascade' &&
            task.child === fact.child &&
            task.childOperation === fact.childOperation,
        )
      )
        return invalid('fact.child', 'no matching cascade task')
      break
    case 'routed-input':
      if (
        !snapshot.tasks.some(
          task => task.kind === 'routed-input' && task.originalOperation === fact.originalOperation,
        )
      )
        return invalid('fact.originalOperation', 'no matching routed input')
      break
    case 'scope-release':
      if (
        !snapshot.tasks.some(
          task =>
            task.kind === 'scope-release' &&
            task.archive === fact.archive &&
            task.scope === fact.scope,
        )
      )
        return invalid('fact.scope', 'no matching release task')
      break
  }
  return entries([encodeEntry({ kind: 'control.progress', progress: null, fact }, origin)])
}

function startedAttempt(
  snapshot: WorkSnapshot,
  advance: AdvanceRef,
): 'started' | 'forged' | 'unknown' {
  const current = snapshot.run.kind === 'active' ? snapshot.run.advance : null
  if (current !== null && current.attempt === advance.attempt)
    return equalValue(current, advance) ? 'started' : 'forged'
  const original = snapshot.historyIndex?.attempts.find(item => item.attempt === advance.attempt)
  if (original === undefined) return 'unknown'
  return original.run === advance.run ? 'started' : 'forged'
}
