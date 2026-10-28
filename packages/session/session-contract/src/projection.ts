import { tenantEquals } from '@omne-harness/legal-identity'
import type { DurableEvidence, InputId, RunId, SessionAccess, ConsumptionId } from './identity.ts'
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
import { encodeEntry } from './entries.ts'
import {
  completeEvidence,
  entries,
  invalid,
  originOf,
  rejected,
  terminalEntries,
} from './decision-support.ts'

/** Session consequences normalized by the adapter from the same log's public Agent read shapes. */
export type SessionLogConsequence =
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
    source: DurableEvidence
    consequences: readonly SessionLogConsequence[]
  }>

/** Pure preparation for the second Session commit. The caller atomically saves entries, cursor and operation reply. */
export function projectSessionLog(
  snapshot: WorkSnapshot,
  observation: SessionLogObservation,
): Decision {
  if (
    !tenantEquals(snapshot.tenant, observation.tenant) ||
    snapshot.session !== observation.session
  )
    return rejected({ kind: 'denied', action: 'projectSessionLog' })
  const historical = snapshot.executions?.find(
    item => item.run === observation.run && item.execution.execution === observation.execution,
  )
  const current =
    snapshot.run.kind === 'active' &&
    snapshot.run.run === observation.run &&
    snapshot.run.execution.execution === observation.execution
      ? snapshot.run
      : null
  if (historical === undefined && current === null)
    return invalid('execution', 'no historical Session/Run binding')
  if (!completeEvidence(observation.source)) return invalid('source', 'incomplete evidence')
  const previous = current?.execution ?? historical?.execution
  if (previous === undefined) return invalid('execution', 'missing execution reference')
  if (
    !/^\d+$/u.test(observation.revision) ||
    (previous.revision !== null && BigInt(observation.revision) < BigInt(previous.revision))
  )
    return invalid('revision', 'invalid or regressing execution revision')
  if (observation.sequence !== null) {
    if (!/^\d+$/u.test(observation.sequence))
      return invalid('sequence', 'not a positive event sequence')
    if (BigInt(observation.sequence) <= BigInt(previous.readThrough)) return entries([])
    if (BigInt(observation.sequence) !== BigInt(previous.readThrough) + 1n)
      return rejected({ kind: 'quarantined', diagnostic: 'Agent event sequence has a gap' })
  }
  const out: EncodedEntry[] = []
  const origin = { ...originOf(observation.source), owner: 'agent', via: 'same-log' }
  const removed = new Set<InputId>()
  for (const consequence of observation.consequences) {
    switch (consequence.kind) {
      case 'observed':
        break
      case 'input-taken':
        if (observation.sequence === null)
          return invalid('sequence', 'input batch requires its public event sequence')
        if (
          current === null ||
          consequence.batch.ordered.length === 0 ||
          new Set(consequence.batch.ordered).size !== consequence.batch.ordered.length ||
          consequence.batch.ordered.some(
            input =>
              removed.has(input) ||
              !snapshot.pending.includes(input) ||
              !snapshot.handed.includes(input),
          )
        )
          return invalid('batch', 'batch is not pending and handed to the original Run')
        for (const input of consequence.batch.ordered) removed.add(input)
        out.push(
          encodeEntry(
            { kind: 'run.batch-taken', run: observation.run, batch: consequence.batch },
            origin,
          ),
        )
        break
      case 'call':
        out.push(
          encodeEntry(
            {
              kind: 'call.bound',
              consumption: consequence.consumption,
              binding: consequence.binding,
              reference: consequence.binding.producer.call,
              purpose: consequence.binding.producer.kind === 'model' ? 'main' : 'action',
            },
            origin,
          ),
        )
        break
      case 'producer':
        if (!snapshot.consumptions.some(item => item.id === consequence.consumption))
          out.push(
            encodeEntry(
              {
                kind: 'call.bound',
                consumption: consequence.consumption,
                binding: consequence.binding,
                reference: consequence.binding.producer.call,
                purpose: consequence.binding.producer.kind === 'model' ? 'main' : 'action',
              },
              origin,
            ),
          )
        out.push(
          encodeEntry(
            {
              kind: 'call.execution-fact',
              fact: {
                kind: 'execution',
                producer: consequence.binding.producer,
                source: observation.source,
              },
              consumption: consequence.consumption,
              result: consequence.result,
            },
            origin,
          ),
        )
        break
      case 'waiting':
        out.push(
          encodeEntry(
            { kind: 'extension.passage', run: observation.run, waiting: consequence.waiting },
            origin,
          ),
        )
        break
      case 'control':
        if (!snapshot.controls.some(item => item.operation === consequence.progress.operation))
          return invalid('control', 'unknown control operation')
        out.push(
          encodeEntry(
            { kind: 'control.progress', progress: consequence.progress, fact: null },
            origin,
          ),
        )
        break
      case 'ended': {
        if (
          !completeEvidence(consequence.disposition) ||
          (consequence.cause !== null && !completeEvidence(consequence.cause))
        )
          return invalid('ended', 'incomplete terminal evidence')
        const terminal: RunTerminal = {
          run: observation.run,
          outcome: consequence.outcome,
          evidence: consequence.disposition,
        }
        if (current === null || historical?.terminal != null)
          out.push(
            encodeEntry({ kind: 'history.annotated', run: observation.run, terminal }, origin),
          )
        else {
          if (terminal.outcome === 'cancelled')
            return invalid(
              'outcome',
              'Agent cancellation requires a committed Session cancellation',
            )
          out.push(
            ...terminalEntries(snapshot, terminal, observation.source, {
              sequence: observation.sequence,
              cause: consequence.cause,
              disposition: consequence.disposition,
            }),
          )
        }
        break
      }
    }
  }
  out.push(
    encodeEntry(
      {
        kind: 'history.annotated',
        run: observation.run,
        execution: {
          execution: observation.execution,
          revision: observation.revision,
          evidence: observation.source,
          readThrough: observation.sequence ?? previous.readThrough,
        },
      },
      origin,
    ),
  )
  return entries(out)
}
