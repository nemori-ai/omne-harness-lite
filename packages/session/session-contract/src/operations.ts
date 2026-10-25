// Operation identity derivation (SPEC OP-00): two pure functions derive identities from stable
// elements. The input holds no time, random number or connection; the same elements give the
// same identity and different elements give a different one.
import { createHash } from 'node:crypto'
import type {
  Adoption,
  AdvanceRef,
  AgentInstanceRef,
  ConsumptionId,
  DurableEvidence,
  InputId,
  RunId,
  SessionId,
  SessionOperationId,
} from './identity.ts'
import type { BoundedClose, CallBinding, Participation } from './values.ts'
import type { ProducerFact } from './faces.ts'

export type SessionOperationElements =
  | Readonly<{ kind: 'startRun'; session: SessionId; first: InputId; predecessor: RunId | null }>
  | Readonly<{
      kind: 'participation'
      execution: string
      operation: string
      joint: Participation['joint']
    }>
  | Readonly<{ kind: 'claim'; run: RunId; instance: AgentInstanceRef; continuity: DurableEvidence }>
  | Readonly<{ kind: 'reload'; run: RunId; candidate: Adoption; handover: DurableEvidence }>
  | Readonly<{ kind: 'release'; advance: AdvanceRef; handover: DurableEvidence }>
  | Readonly<{ kind: 'bounded-close'; run: RunId; basis: BoundedClose }>
  | Readonly<{
      kind: 'result'
      command: 'preserveResult' | 'completeExternalConsumption'
      consumption: ConsumptionId
      version: string
    }>
  | Readonly<{ kind: 'external-call'; binding: CallBinding }>
  | Readonly<{ kind: 'context-reminder'; session: SessionId; source: DurableEvidence }>
  | Readonly<{ kind: 'idle'; session: SessionId; observation: DurableEvidence }>
  | Readonly<{ kind: 'auto-archive'; session: SessionId; idleEvidence: DurableEvidence }>
  | Readonly<{ kind: 'freeze'; session: SessionId; evidence: DurableEvidence }>
  | Readonly<{ kind: 'fact'; fact: ProducerFact }>
export type DriveOperationElements =
  | Readonly<{ kind: 'invoke'; execution: string; first: InputId; started: DurableEvidence }>
  | Readonly<{ kind: 'submit'; execution: string; input: InputId }>
  | Readonly<{ kind: 'resume'; execution: string; grant: DurableEvidence }>
  | Readonly<{ kind: 'detach'; execution: string; advance: AdvanceRef }>
  | Readonly<{ kind: 'control'; execution: string; control: SessionOperationId }>
  | Readonly<{
      kind: 'recordResult'
      execution: string
      consumption: ConsumptionId
      version: string
      transfer: 'custody' | 'processed' | 'none'
    }>

/**
 * The canonical text of a plain value: object keys sorted, array order kept. Two values with the
 * same canonical text are the same elements.
 */
export function canonicalText(value: unknown): string {
  return JSON.stringify(value, (_key, member: unknown) => {
    if (typeof member !== 'object' || member === null || Array.isArray(member)) return member
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(member).sort())
      sorted[key] = (member as Readonly<Record<string, unknown>>)[key]
    return sorted
  })
}

/** The hexadecimal SHA-256 digest of the canonical text of `value`. */
export function digestOf(value: unknown): string {
  return createHash('sha256').update(canonicalText(value)).digest('hex')
}

/**
 * The stable elements of a `receive` fact (OP-00 `receive` row): an Agent event is named by its
 * execution and sequence; a hand-over by its execution and input; the other facts by their source
 * record. The payload of the fact is not part of the identity, so the same fact resent with a
 * different payload is a `conflict`, not a second entry.
 */
function factElements(fact: ProducerFact): unknown {
  switch (fact.kind) {
    case 'agent-event':
      return fact.sequence === null
        ? { kind: fact.kind, execution: fact.execution, snapshot: fact.source.record }
        : { kind: fact.kind, execution: fact.execution, sequence: fact.sequence }
    case 'input-handover':
      return { kind: fact.kind, execution: fact.execution, input: fact.input }
    case 'agent-exit':
      return { kind: fact.kind, advance: fact.advance }
    case 'execution':
    case 'account':
      return { kind: fact.kind, producer: fact.producer, record: fact.source.record, revision: fact.source.revision }
    case 'release':
      return { kind: fact.kind, consumption: fact.consumption, version: fact.result.version }
    case 'cascade':
      return { kind: fact.kind, child: fact.child, childOperation: fact.childOperation }
    case 'routed-input':
      return { kind: fact.kind, originalOperation: fact.originalOperation }
    case 'scope-release':
      return { kind: fact.kind, archive: fact.archive, scope: fact.scope }
    case 'start-fence':
      return { kind: fact.kind, operation: fact.operation, advance: fact.advance }
  }
}

export function deriveSessionOperation(elements: SessionOperationElements): SessionOperationId {
  const stable = elements.kind === 'fact' ? { kind: 'fact', fact: factElements(elements.fact) } : elements
  return `sop_${digestOf(stable)}` as SessionOperationId
}

export function deriveDriveOperation(elements: DriveOperationElements): string {
  return `dop_${digestOf(elements)}`
}
