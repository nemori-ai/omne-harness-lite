import {
  admissionActionOf,
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
  type ModelRetryState,
  type Next,
  type ReplyAdmissionRead,
  type StepId,
  type Waiting,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { LoopNode } from './nodes.ts'

export const agentCheckpointSchema: Adoption = Object.freeze({
  owner: '@omne-harness/agent',
  name: 'agent-checkpoint',
  revision: '3',
  digest: 'agent:agent-checkpoint/3',
})

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
  if (facts.controls.length > 0) return unsupported
  switch (facts.checkpoint.position) {
    case 'E4':
    case 'I0':
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
      return unsupported
  }
}

function toolRound(batch: AgentCheckpoint['batch']): 'none' | 'round' | 'open' {
  if (batch === null || batch.actions.length === 0) return 'none'
  const admitted = batch.actions.every(action =>
    batch.slots.some(slot => slot.action === action.id && slot.handoff !== null),
  )
  return admitted ? 'round' : 'open'
}

function producerWaits(facts: LoopFacts): Waiting[] | null {
  const waiting: Waiting[] = facts.checkpoint.calls.map(pending => ({
    kind: 'producer',
    pending,
  }))
  for (const producer of facts.producers) {
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

function afterIteration(facts: LoopFacts): Outcome<Next, Failure> {
  const { checkpoint } = facts
  const round = toolRound(checkpoint.batch)
  if (round === 'open') return unsupported
  if (
    checkpoint.passages.some(
      passage => admissionActionOf(passage.id) === null && passage.progress.kind !== 'applied',
    )
  )
    return unsupported
  const waiting = producerWaits(facts)
  if (waiting === null) return unsupported
  if (facts.consumption.some(item => item.custody === null && item.completion === null))
    waiting.push({ kind: 'dependency', owner: 'agentJournal', position: 'I8' })
  if (waiting.length > 0) return succeed({ kind: 'wait', waiting })
  const basis =
    round === 'round' ||
    facts.batch.ordered.length > 0 ||
    facts.conditions.progression.kind === 'continue' ||
    (checkpoint.modelRetry ?? null) !== null
  if (basis) return succeed({ kind: 'take-inputs', position: 'I0' })
  return succeed({ kind: 'try-finish', conclusion: { kind: 'complete' }, failure: null })
}

type JsonValue = Continuation['value']

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

const OPTIONAL_CHECKPOINT_MEMBERS: readonly (keyof AgentCheckpoint)[] = [
  'adoptedRequest',
  'modelRetry',
]

const KNOWN_CHECKPOINT_MEMBERS: readonly string[] = [
  ...CHECKPOINT_MEMBERS,
  ...OPTIONAL_CHECKPOINT_MEMBERS,
]

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

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function retryStateOf(value: unknown): Outcome<ModelRetryState | null, Failure> {
  const field = 'checkpoint.modelRetry'
  if (value === null) return succeed(null)
  if (!isRecord(value)) return refused(field, 'type')
  for (const member of Object.keys(value))
    if (!['failures', 'since', 'notBefore'].includes(member))
      return refused(`${field}.${member}`, 'unknown-field')
  const failures = value['failures']
  if (typeof failures !== 'number' || !Number.isInteger(failures) || failures < 1)
    return refused(`${field}.failures`, 'range')
  const since = value['since']
  if (!isInstant(since)) return refused(`${field}.since`, 'type')
  const notBefore = value['notBefore']
  if (!isInstant(notBefore)) return refused(`${field}.notBefore`, 'type')
  return succeed({ failures, since, notBefore })
}

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
  const preparation = tree['requestPreparation']
  if (
    preparation !== null &&
    (!isRecord(preparation) ||
      (preparation['kind'] !== 'needs-compaction' && preparation['kind'] !== 'cannot-fit'))
  )
    return refused('checkpoint.requestPreparation', 'not a saved preparation')
  if (!Array.isArray(tree['voided'])) return refused('checkpoint.voided', 'type')
  const kinded = (item: unknown) =>
    isRecord(item) && (item['kind'] === 'model' || item['kind'] === 'tool')
  if (!tree['voided'].every(kinded)) return refused('checkpoint.voided.kind', 'type')
  const caused = (item: Record<string, unknown>) =>
    item['cause'] === 'not-accepted' || (item['kind'] === 'model' && item['cause'] === 'lost')
  if (!tree['voided'].every(caused)) return refused('checkpoint.voided.cause', 'type')
  const decoded = { ...(tree as AgentCheckpoint), step: step.ok, replyAdmissionRead: read.ok }
  if (!Object.hasOwn(tree, 'modelRetry')) return succeed(decoded)
  const retry = retryStateOf(tree['modelRetry'])
  if ('failure' in retry) return retry
  return succeed({ ...decoded, modelRetry: retry.ok })
}

export const agentEvaluator: AgentEvaluator = Object.freeze({ initial, next, encode, decode })
