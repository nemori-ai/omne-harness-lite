import type { SessionCommand } from './ports.ts'
import type { WorkSnapshot } from './values.ts'
import type { AdvanceRef } from './identity.ts'
import type { Decision } from './judgments.ts'
import { encodeEntry } from './entries.ts'
import { completeEvidence, entries, invalid, originOf, rejected } from './decision-support.ts'
import { digestOf } from './operations.ts'
import { resultRefusal } from './decide-results.ts'
import { equalValue } from './session-validation.ts'

export function decideProducerFact(
  snapshot: WorkSnapshot,
  command: Extract<SessionCommand, { kind: 'receive' }>,
): Decision {
  const { fact } = command.input
  if (fact.kind === 'input-handover') return invalid('fact', 'input handover uses its own decision')
  if (!completeEvidence(fact.source)) return invalid('fact.source', 'incomplete source')
  const origin = originOf(fact.source)
  switch (fact.kind) {
    case 'agent-exit':
      if (!startedAttempt(snapshot, fact.advance))
        return invalid('fact.advance', 'not an attempt this session started')
      return entries([encodeEntry({ kind: 'run.attempt-exited', advance: fact.advance }, origin)])
    case 'execution':
    case 'account':
      if (
        !snapshot.consumptions.some(
          item => digestOf(item.binding.producer) === digestOf(fact.producer),
        )
      )
        return invalid('fact.producer', 'no original binding')
      return entries([
        encodeEntry(
          { kind: fact.kind === 'account' ? 'account.linked' : 'call.execution-fact', fact },
          origin,
        ),
      ])
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

/**
 * The exit report keeps its original association: the current advance proves run, attempt and
 * instance. An attempt that no longer holds the advance is proved by its original SE15 in the
 * history index, which records run and attempt only.
 */
function startedAttempt(snapshot: WorkSnapshot, advance: AdvanceRef): boolean {
  const current = snapshot.run.kind === 'active' ? snapshot.run.advance : null
  if (current !== null && current.attempt === advance.attempt) return equalValue(current, advance)
  return (
    snapshot.historyIndex?.attempts.some(
      item => item.attempt === advance.attempt && item.run === advance.run,
    ) ?? false
  )
}
