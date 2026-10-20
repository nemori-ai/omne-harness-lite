// The pure evaluator of the generic Agent (SPEC "身份、原位置与纯求值"): it reads `LoopFacts` and
// returns the `Next` step. It reads no clock, registration or store, sends nothing and changes no
// input, so the same facts give the same `Next`. It imports the contract's types and pure judgments
// and the node vocabulary, and nothing that runs an effect.
//
// The evaluator decides at the two decision segments of the node table, E4 and I8 (column 并发与次序:
// 单一决策段). Every other node goes on by the outcome of its own effect, through the transition table
// in nodes.ts. #502 1.2 covers the decisions of the normal path only: E4 after the execution-start
// passage opens the first iteration, and I8 opens the next one or proposes completion. Facts that
// only a later card handles (controls, an advancement that is stopping, producers still owed, a
// position that is a continuation point) answer `unsupported`: a named failure, never a guessed step.
import {
  decodeStepId,
  judgeAdoption,
  type Adoption,
  type AgentCheckpoint,
  type AgentEvaluator,
  type Continuation,
  type Failure,
  type LoopFacts,
  type Next,
  type StepId,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { LoopNode } from './nodes.ts'

/** The schema of the checkpoint that this evaluator writes and reads. */
export const CHECKPOINT_SCHEMA: Adoption = {
  owner: '@omne-harness/agent',
  name: 'agent-checkpoint',
  revision: '1',
  digest: 'agent:agent-checkpoint/1',
}

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
    schema: CHECKPOINT_SCHEMA,
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
    guard: null,
    completedPassages: [],
    priorConditions: null,
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
      // The execution-start passage has ended, so this is the first iteration (node table E4).
      return succeed({ kind: 'take-inputs', position: 'I0' })
    case 'I8':
      return afterIteration(facts)
    default:
      // A continuation point of another node is E4's mapping to R0 (#502 1.4).
      return unsupported
  }
}

/** Node table I8: a lawful basis to go on opens a new iteration; otherwise completion is proposed. */
function afterIteration(facts: LoopFacts): Outcome<Next, Failure> {
  const { checkpoint } = facts
  const owed = facts.consumption.some(item => item.custody === null && item.completion === null)
  // An open call, an action batch, a producer or a result that is still owed is waited on or
  // consumed first; those nodes are not in this card.
  if (
    checkpoint.calls.length > 0 ||
    checkpoint.batch !== null ||
    facts.producers.length > 0 ||
    owed
  )
    return unsupported
  if (facts.batch.ordered.length > 0 || facts.conditions.progression.kind === 'continue')
    return succeed({ kind: 'take-inputs', position: 'I0' })
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

/**
 * Stage-temporary (#502 stage 5): decode must judge the exact adoption, the identity relations and
 * the completeness of every facet (SPEC "身份、原位置与纯求值"). Until resume brings that judgment,
 * no continuation is taken as a checkpoint.
 */
function decode(_value: Continuation): Outcome<AgentCheckpoint, Failure> {
  return unsupported
}

/** The evaluator of the generic Agent. An assembly resolves it through `AgentAdoptions`. */
export const agentEvaluator: AgentEvaluator = Object.freeze({ initial, next, encode, decode })
