// The pure evaluator of the generic Agent (SPEC "身份、原位置与纯求值"): it reads `LoopFacts` and
// returns the `Next` step. It reads no clock, registration or store, sends nothing and changes no
// input, so the same facts give the same `Next`. It imports the contract's types and pure judgments
// and the node vocabulary, and nothing that runs an effect.
//
// The evaluator decides at the two decision segments of the node table, E4 and I8 (column 并发与次序:
// 单一决策段). Every other node goes on by the outcome of its own effect, through the transition table
// in nodes.ts. #502 1.2 covers the decisions of the normal path only: E4 after the execution-start
// passage opens the first iteration, and I8 opens the next one, saves a wait or proposes completion. Facts that
// only a later card handles (controls, an advancement that is stopping, a
// position that is a continuation point) answer `unsupported`. J5 routes those positions in the
// coordinator without extending LoopFacts or Next.
import {
  decodeReplyAdmissionSequence,
  decodeStepId,
  judgeAdoption,
  judgeEvidence,
  type Adoption,
  type AgentCheckpoint,
  type AgentEvaluator,
  type Continuation,
  type Failure,
  type LoopFacts,
  type Next,
  type ReplyAdmissionRead,
  type StepId,
  type Waiting,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { LoopNode } from './nodes.ts'

/**
 * The schema of the checkpoint that this evaluator writes and reads. Its `position` holds a node of
 * nodes.ts, which is what the coordinator of this package can continue from.
 */
export const agentCheckpointSchema: Adoption = Object.freeze({
  owner: '@omne-harness/agent',
  name: 'agent-checkpoint',
  revision: '3',
  digest: 'agent:agent-checkpoint/3',
})

/** The position of a new checkpoint: every new logical execution passes E3 once (node table E3). */
const INITIAL_POSITION: LoopNode = 'E3'

const unsupported: Outcome<never, Failure> = fail({ kind: 'unsupported' })

function initial(
  input: Readonly<{ definition: Adoption; step: StepId }>,
): Outcome<AgentCheckpoint, Failure> {
  const definition = judgeAdoption(input.definition)
  if ('failure' in definition)
    return fail({ kind: 'invalid', field: 'definition', reason: definition.failure.reason })
  const step = decodeStepId(input.step)
  if ('failure' in step)
    return fail({ kind: 'invalid', field: 'step', reason: step.failure.reason })
  return succeed({
    schema: agentCheckpointSchema,
    definition: definition.ok,
    step: step.ok,
    position: INITIAL_POSITION,
    calls: [],
    passages: [],
    batch: null,
    inputBatch: null,
    requestPreparation: null,
    compaction: null,
    adoptedContext: null,
    adoptedRequest: null,
    guard: null,
    completedPassages: [],
    priorConditions: null,
    currentHandoff: null,
    replyAdmissionRead: { kind: 'unverified' },
    voided: [],
  })
}

function next(facts: LoopFacts): Outcome<Next, Failure> {
  switch (facts.advancement.kind) {
    case 'ended':
      return succeed({ kind: 'stop', reason: 'terminal' })
    case 'superseded':
      return succeed({ kind: 'stop', reason: 'superseded' })
    case 'stopping':
      return unsupported
    case 'current':
      break
    default: {
      const _exhaustive: never = facts.advancement.kind
      return _exhaustive
    }
  }
  // Controls take precedence over every other step (SPEC "身份、原位置与纯求值", 优先级); their nodes
  // come with the control cards.
  if (facts.controls.length > 0) return unsupported
  switch (facts.checkpoint.position) {
    case 'E4':
    case 'I0':
      // J5: only an empty input boundary is delegated here. The coordinator routes recovery.
      if (
        facts.checkpoint.calls.length > 0 ||
        facts.checkpoint.passages.length > 0 ||
        facts.checkpoint.batch !== null ||
        facts.checkpoint.compaction !== null ||
        facts.checkpoint.requestPreparation !== null ||
        facts.checkpoint.inputBatch !== null
      )
        return unsupported
      return succeed({ kind: 'take-inputs', position: 'I0' })
    case 'I8':
      return afterIteration(facts)
    default:
      // The coordinator routes stored continuation points (J5).
      return unsupported
  }
}

/**
 * A batch with actions reaches I8 only from T5, after every slot's message was admitted: 'round'.
 * Its results or denials are new history the model has not seen. A batch in any other state
 * belongs to its own nodes: 'open'. No batch, or one without actions: 'none'.
 */
function toolRound(batch: AgentCheckpoint['batch']): 'none' | 'round' | 'open' {
  if (batch === null || batch.actions.length === 0) return 'none'
  const admitted = batch.actions.every(action =>
    batch.slots.some(slot => slot.action === action.id && slot.handoff !== null),
  )
  return admitted ? 'round' : 'open'
}

/** The producer waits of I8, or null when a ready result needs its later consumption nodes. */
function producerWaits(facts: LoopFacts): Waiting[] | null {
  const waiting: Waiting[] = facts.checkpoint.calls.map(pending => ({
    kind: 'producer',
    pending,
  }))
  for (const producer of facts.producers) {
    // Ready results need their later consumption nodes, never an idle producer wait.
    if (
      producer.kind === 'model-settled' ||
      producer.kind === 'tool-result' ||
      producer.kind === 'tool-background'
    )
      return null
    const known = waiting.some(
      item => item.kind === 'producer' && item.pending.consumption === producer.pending.consumption,
    )
    if (!known) waiting.push({ kind: 'producer', pending: producer.pending })
  }
  return waiting
}

/** Node table I8: a lawful basis to go on opens a new iteration; otherwise completion is proposed. */
function afterIteration(facts: LoopFacts): Outcome<Next, Failure> {
  const { checkpoint } = facts
  const round = toolRound(checkpoint.batch)
  if (round === 'open') return unsupported
  if (checkpoint.passages.some(passage => passage.progress.kind !== 'applied')) return unsupported
  const waiting = producerWaits(facts)
  if (waiting === null) return unsupported
  if (facts.consumption.some(item => item.custody === null && item.completion === null))
    waiting.push({ kind: 'dependency', owner: 'agentJournal', position: 'I8' })
  if (waiting.length > 0) return succeed({ kind: 'wait', waiting })
  const basis =
    round === 'round' ||
    facts.batch.ordered.length > 0 ||
    facts.conditions.progression.kind === 'continue'
  if (basis) return succeed({ kind: 'take-inputs', position: 'I0' })
  // Neither an action nor an empty queue ends the execution by itself: this is only a candidate,
  // which F1 fixes and F3 commits or refuses.
  return succeed({ kind: 'try-finish', conclusion: { kind: 'complete' }, failure: null })
}

type JsonValue = Continuation['value']

/**
 * The checkpoint as a JSON value tree. A checkpoint is data only, so every member is a string,
 * a finite number, a boolean, null, an array or a plain object; an absent optional member is left
 * out. Anything else is not a checkpoint, and encoding it throws instead of writing a lossy value.
 */
function toJson(value: unknown): JsonValue {
  if (value === null) return { kind: 'null' }
  switch (typeof value) {
    case 'string':
      return { kind: 'string', value }
    case 'boolean':
      return { kind: 'boolean', value }
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('a checkpoint holds a non-finite number')
      return { kind: 'number', lexeme: String(value) }
    case 'object':
      if (Array.isArray(value)) return { kind: 'array', items: value.map(toJson) }
      return {
        kind: 'object',
        entries: Object.entries(value)
          .filter(([, member]) => member !== undefined)
          .map(([key, member]) => ({ key, value: toJson(member) })),
      }
    default:
      throw new TypeError(`a checkpoint holds a ${typeof value}`)
  }
}

function encode(value: AgentCheckpoint): Continuation {
  return {
    position: value.position,
    definition: value.definition,
    schema: value.schema,
    value: toJson(value),
  }
}

/** The members of the checkpoint this evaluator writes and always requires on decode. */
const CHECKPOINT_MEMBERS: readonly (keyof AgentCheckpoint)[] = [
  'schema',
  'definition',
  'step',
  'position',
  'calls',
  'passages',
  'batch',
  'inputBatch',
  'requestPreparation',
  'compaction',
  'adoptedContext',
  'guard',
  'completedPassages',
  'priorConditions',
  'currentHandoff',
  'replyAdmissionRead',
  'voided',
]

/**
 * The members the contract declares optional: `initial` writes them, and decode keeps them when
 * present and leaves them out when absent (R2-D18: optional until Reduce makes them required).
 */
const OPTIONAL_CHECKPOINT_MEMBERS: readonly (keyof AgentCheckpoint)[] = ['adoptedRequest']

/** Every member a decoded checkpoint may hold; any other member is unknown. */
const KNOWN_CHECKPOINT_MEMBERS: readonly string[] = [
  ...CHECKPOINT_MEMBERS,
  ...OPTIONAL_CHECKPOINT_MEMBERS,
]

/** The plain value of a JSON value tree: the inverse of `toJson`. */
function fromJson(value: JsonValue): unknown {
  switch (value.kind) {
    case 'null':
      return null
    case 'boolean':
    case 'string':
      return value.value
    case 'number':
      return Number(value.lexeme)
    case 'array':
      return value.items.map(fromJson)
    case 'object':
      return Object.fromEntries(value.entries.map(entry => [entry.key, fromJson(entry.value)]))
    default: {
      const _exhaustive: never = value
      return _exhaustive
    }
  }
}

/** Whether `value` is exactly the adoption `expected`: the same four members and no other. */
function sameAdoption(value: unknown, expected: Adoption): boolean {
  const judged = judgeAdoption(value)
  return (
    'ok' in judged &&
    judged.ok.owner === expected.owner &&
    judged.ok.name === expected.name &&
    judged.ok.revision === expected.revision &&
    judged.ok.digest === expected.digest
  )
}

function refused(field: string, reason: string): Outcome<never, Failure> {
  return fail({ kind: 'invalid', field, reason })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The read position exactly: `unverified`, or `verified` with a canonical sequence and a basis. */
function readPositionOf(value: unknown): Outcome<ReplyAdmissionRead, Failure> {
  const field = 'checkpoint.replyAdmissionRead'
  if (!isRecord(value)) return refused(field, 'type')
  if (value['kind'] === 'unverified' && Object.keys(value).length === 1)
    return succeed({ kind: 'unverified' })
  if (value['kind'] !== 'verified' || Object.keys(value).length !== 2)
    return refused(field, 'not a read position')
  const prefix = value['prefix']
  if (!isRecord(prefix) || Object.keys(prefix).length !== 2)
    return refused(`${field}.prefix`, 'type')
  const sequence = decodeReplyAdmissionSequence(prefix['sequence'])
  if ('failure' in sequence) return refused(`${field}.prefix.sequence`, sequence.failure.reason)
  const basis = judgeEvidence(prefix['basis'])
  if ('failure' in basis) return refused(`${field}.prefix.basis`, basis.failure.reason)
  return succeed({ kind: 'verified', prefix: { sequence: sequence.ok, basis: basis.ok } })
}

/**
 * Decodes a continuation this evaluator encoded: the exact schema adoption, every required member
 * present, an optional one kept only when present, and no other member, the definition, step and
 * position of the continuation, and the read position of the reply admission facts exactly (D5: a
 * missing required member or an unknown schema is refused, never taken as `unverified` or as zero). There is no named migration of an older schema. The other
 * facets keep their encoded shape: judging their identity relations is #502 stage 5 (resume).
 */
function decode(value: Continuation): Outcome<AgentCheckpoint, Failure> {
  if (!sameAdoption(value.schema, agentCheckpointSchema))
    return refused('schema', 'not the checkpoint schema of this evaluator')
  const tree = fromJson(value.value)
  if (!isRecord(tree)) return refused('checkpoint', 'type')
  for (const member of CHECKPOINT_MEMBERS)
    if (!Object.hasOwn(tree, member)) return refused(`checkpoint.${member}`, 'missing')
  for (const member of Object.keys(tree))
    if (!KNOWN_CHECKPOINT_MEMBERS.includes(member))
      return refused(`checkpoint.${member}`, 'unknown-field')
  if (!sameAdoption(tree['schema'], value.schema))
    return refused('checkpoint.schema', 'not the schema of the continuation')
  const definition = judgeAdoption(tree['definition'])
  if ('failure' in definition) return refused('checkpoint.definition', definition.failure.reason)
  if (!sameAdoption(definition.ok, value.definition))
    return refused('checkpoint.definition', 'not the definition of the continuation')
  if (tree['position'] !== value.position)
    return refused('checkpoint.position', 'not the position of the continuation')
  const step = decodeStepId(tree['step'])
  if ('failure' in step) return refused('checkpoint.step', step.failure.reason)
  const read = readPositionOf(tree['replyAdmissionRead'])
  if ('failure' in read) return read
  // R2-D292: a checkpoint keeps no assembled or ready preparation; one that holds it is not ours.
  const preparation = tree['requestPreparation']
  if (
    preparation !== null &&
    (!isRecord(preparation) ||
      (preparation['kind'] !== 'needs-compaction' && preparation['kind'] !== 'cannot-fit'))
  )
    return refused('checkpoint.requestPreparation', 'not a saved preparation')
  if (!Array.isArray(tree['voided'])) return refused('checkpoint.voided', 'type')
  // The members were checked one by one above; the other facets keep the shape encode wrote.
  return succeed({ ...(tree as AgentCheckpoint), step: step.ok, replyAdmissionRead: read.ok })
}

/** The evaluator of the generic Agent. An assembly resolves it through `AgentAdoptions`. */
export const agentEvaluator: AgentEvaluator = Object.freeze({ initial, next, encode, decode })
