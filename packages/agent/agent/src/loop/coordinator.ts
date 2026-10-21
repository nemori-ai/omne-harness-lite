// The execution coordinator: the effects of the Loop for one execution, node by node, as the
// pseudocode of docs/architecture/loop-algorithm.md "正常路径伪代码" groups them (runExecution,
// settle, runIter, prepareRequest, callModel, admitMessage). Each node is one handler that runs the
// node's effect and names its outcome; where the node goes next is never decided here but looked up
// in the transition table of nodes.ts. E4 uses a pure recovery route (J5), and delegates input
// boundaries and iteration decisions to the evaluator. I8 uses the evaluator's Next.
//
// #502 1.2 is the skeleton of the normal path. Its temporary choices, each also named where it is
// made and in tests/README.md:
//
// - 临时简化，1.3–1.9 按节点表收紧: every node from E3 on writes one commit when it ends, and the
//   commit moves `position` to the next node. The exact commit points of the node table are not
//   followed yet. Q1 never writes one (NA-Q1-1). Three groups write no commit: U0 to Q4 run before
//   the execution exists; E1, E2 and
//   E4 only read, because a commit there would overwrite the `position` that E4 reads (the initial
//   E3); and after F3 the execution is ended, so F4, O0 and E9 use their own records only.
// - #514: I2 is local; M0 commits PendingCall, the fixed request adoption and the effect together.
//   M6, M1 settlement, M4 (without extensions) and M5 make no checkpoint commit. M3 carries producer.
// - M04-8 的读法: the input-taken event is written by the I0 commit.
// - M04-7: `open` writes no event (the memory Journal's reading of SPEC).
// - M04-5: `recordResult.transfer` is processed without a declared participant.
//
// E1/E2 dependency failures save a W0 wait. Unknown R0 operations keep their original revision. Other
// Unsupported outcomes stop with a named failure. Its owner distinguishes a port failure,
// an unimplemented stage and a coordinator defect:
//
// - a port's failure (Journal, Model, handoff, conditions, ...) is passed on as the port gave it;
// - `AGENT_OWNER` (`unavailable`): an outcome the contract defines but a later #502 card handles;
// - `DEFECT_OWNER` (`unavailable`): a defect of this coordinator: a thrown error, a value an earlier
//   node should have set, a node without a handler or an outcome without a table row. A defect is
//   never a dependency being unavailable and is never waited on.
import type { ContentBlock } from '@omne-harness/content-block'
import type {
  AcceptedInput,
  Access,
  AgentCheckpoint,
  AgentEvaluator,
  AgentEventBody,
  AgentExecutionId,
  AgentInstant,
  AgentOperationId,
  Authority,
  ConsumerRef,
  ConsumptionId,
  ActionId,
  EffectIntent,
  Evidence,
  ExecutionRevision,
  ExecutionSnapshot,
  ExecutionState,
  Failure,
  FailureCandidate,
  FinishIntent,
  InputBatch,
  LoopFacts,
  MessageSource,
  ModelContextRead,
  ModelReplyAdmission,
  Next,
  PendingCall,
  Preparation,
  ProducedResult,
  RuntimeConditions,
  SelectedModel,
  StepId,
  Waiting,
} from '@omne-harness/agent-contract'
import type * as M from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentDependencies, AgentRuntimeBinding } from '../construction.ts'
import {
  AGENT_OWNER,
  agentEvidence,
  invocationParts,
  invokeOperation,
  journalOperation,
  mainAction,
  mainBatch,
  mainConsumption,
  mainInvocation,
  modelOperation,
  ordinalOf,
  stepOf,
  type Message,
} from './identities.ts'
import { canonical } from '../canonical.ts'
import { waitForExecutionChange } from './wait.ts'
import { diagnosticOf } from './diagnostic.ts'
import { LOOP_NODES, successor, type Label, type LoopNode } from './nodes.ts'
import { consumeModelResult, type ModelResult, type ModelOutcome } from './model-result.ts'
import {
  processedModelMaterial,
  readProcessedModelMaterial,
  type ProcessedModelIdentity,
} from './processed-result.ts'

/** The ports the coordinator uses. None of them depends on the content block type. */
export type LoopPorts<P> = Pick<
  AgentDependencies<P, ContentBlock>,
  | 'journal'
  | 'models'
  | 'conditions'
  | 'requests'
  | 'selection'
  | 'modelContext'
  | 'handoff'
  | 'clock'
  | 'materials'
>

export type ExecutionEntry<P> = Readonly<{
  ports: LoopPorts<P>
  binding: AgentRuntimeBinding
  evaluator: AgentEvaluator
  /** The Access of the invoke; every operation of the execution runs under it. */
  access: Access<P>
  execution: AgentExecutionId
  /** The operation of the invoke, which `open` uses as its own. */
  operation: AgentOperationId
  initial: AcceptedInput
  grant: Evidence | null
  /** E9, or E1 finding an advanced execution: give the slot back and return to idle. */
  idle(): void
}>

/** Where and why the coordinator stopped. The execution stays where its last commit put it. */
export type Halted = Readonly<{ node: LoopNode; failure: Failure }>

export interface ExecutionCoordinator {
  /** U0 to E0: the input is admitted and `open` accepts the execution. Resolves at E1. */
  accept(): Promise<Outcome<Authority, Halted>>
  /**
   * After a legally accepted operation: run from E1 until idle, a saved wait or a failure.
   */
  runExecution(): Promise<Outcome<void, Halted>>
  /** W0's local resources belong to this awaited window, never to the producer. */
  waitForWake(
    input: Readonly<{ reconciliationDelayMs: number; signal: AbortSignal }>,
  ): Promise<Outcome<'ready' | 'stopped' | 'cancelled', Halted>>
  /** Original runtime only, after its old driver stopped. No attach, takeover or public resume. */
  continueExecution(authority: Authority): Promise<Outcome<void, Halted>>
}

type ReadyPreparation = Extract<Preparation, { kind: 'ready' }>
type ModelPendingCall = Extract<PendingCall, { kind: 'model' }>
type OpenState = Exclude<ExecutionState, { kind: 'ended' }>
type CommitEvent = Exclude<AgentEventBody, { kind: 'ended' }>

/** What one node commits besides the move of `position`. */
type Write = Readonly<{
  checkpoint?: Partial<Omit<AgentCheckpoint, 'position'>>
  state?: OpenState
  events?: readonly CommitEvent[]
  effects?: readonly EffectIntent[]
  replyAdmission?: ModelReplyAdmission
}>

/** The outcome of one node and the commit it writes; `commit: null` writes no commit. */
type Step = Readonly<{ on: Label; commit: Write | null }>
type Handler = () => Promise<Outcome<Step, Failure>>

/**
 * A candidate that Q1 to Q4 admit, and the fixed call position that Q4 returns to. The type ties
 * each source to its call position (Q1): an external input to U0, a Model reply to I3.
 */
type Candidate = Readonly<{
  candidate: Message
  operation: (after: ExecutionRevision | null) => AgentOperationId
}> &
  (
    | Readonly<{ source: Extract<MessageSource, { kind: 'external-input' }>; returnTo: 'U0' }>
    | Readonly<{ source: Extract<MessageSource, { kind: 'model-reply' }>; returnTo: 'I3' }>
  )

/** The facts of one iteration, filled as its nodes run. Each field is set by the node named. */
type Iteration = {
  step: StepId
  batch: InputBatch | null
  action: ActionId
  consumption: ConsumptionId
  position: ConsumerRef
  conditions: RuntimeConditions | null // I1
  selected: SelectedModel | null // I1, P1
  context: ModelContextRead | null // I1
  preparation: Preparation | null // I1
  ready: ReadyPreparation | null // P1
  pending: ModelPendingCall | null // I2
  settlement: M.Settlement | null // M1
  result: ModelOutcome | null // restored from the Journal-bound completion, not a Model cache
  processing: ModelResult | null
  read: ResultReadFrame | null
}

type ResultReadFrame = {
  attempt: number
  read: M.ReadId | null
  parts: M.ResultPart[]
  complete: boolean
}

/** A result whose Model acknowledgement O0 records as the release of its responsibility. */
type Acknowledged = Readonly<{
  produced: ProducedResult
  consumption: ConsumptionId
  receipt: Evidence
}>

const step = (on: Label, commit: Write | null = {}): Outcome<Step, Failure> =>
  succeed({ on, commit })

/** The owner of a failure that is a defect of this coordinator, not of a port; see the header. */
export const DEFECT_OWNER = `${AGENT_OWNER}#defect`

function defect(diagnostic: string): Failure {
  return { kind: 'unavailable', owner: DEFECT_OWNER, diagnostic }
}

/** The failure of an outcome that a later #502 card handles, named so that nobody reads it as done. */
function notYet(node: LoopNode, what: string, card: string): Failure {
  return {
    kind: 'unavailable',
    owner: AGENT_OWNER,
    diagnostic: `${node}: ${what} is not handled until ${card}`,
  }
}

/** A Model failure, kept as what it is: the Model runtime did not give the step its answer. */
function modelFailure(
  node: LoopNode,
  failure: M.ModelFailure,
): Extract<Failure, { kind: 'unavailable' }> {
  return {
    kind: 'unavailable',
    owner: 'modelRuntime',
    diagnostic:
      failure.kind === 'unavailable'
        ? `${node}: ${failure.dependency}: ${failure.diagnostic}`
        : `${node}: the Model runtime answered ${failure.kind}`,
  }
}

/** A value that an earlier node of the same path sets. Its absence is a defect, so it throws. */
function required<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`coordinator defect: ${what} is not set`)
  return value
}

function sameRecipient(left: SelectedModel, right: SelectedModel): boolean {
  const a = left.recipient
  const b = right.recipient
  return (
    a.route === b.route &&
    a.profile.owner === b.profile.owner &&
    a.profile.name === b.profile.name &&
    a.profile.revision === b.profile.revision &&
    a.profile.digest === b.profile.digest
  )
}

function sameEvidence(left: Evidence, right: Evidence): boolean {
  return (
    left.owner === right.owner &&
    left.record === right.record &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

function sameAuthority(left: Authority | null, right: Authority): boolean {
  return (
    left !== null &&
    left.execution === right.execution &&
    left.executionAttachment === right.executionAttachment &&
    left.instance === right.instance &&
    left.generation === right.generation &&
    sameEvidence(left.source, right.source)
  )
}

type UnsupportedRecovery = Readonly<{ kind: 'unsupported'; node: string; card: string }>

/** J5: snapshot facts that LoopFacts cannot carry stay in this pure recovery decision. */
export function recoveryRoute(
  read: Pick<ExecutionSnapshot, 'checkpoint' | 'state' | 'unresolved'>,
): Outcome<LoopNode | 'evaluate', UnsupportedRecovery> {
  const at = read.checkpoint
  function target(node: string): Outcome<LoopNode | 'evaluate', UnsupportedRecovery> {
    const card = node.startsWith('X')
      ? '#502 stage 3'
      : node.startsWith('C')
        ? '#502 stage 4'
        : /^[AT]/u.test(node)
          ? '#502 stage 2'
          : '#502 stage 5'
    if (
      /^[ACTX]/u.test(node) ||
      !LOOP_NODES.includes(node as LoopNode) ||
      ['E0', 'E1', 'E2', 'U0', 'Q1', 'R0', 'W0', 'F0', 'H0', 'M2', 'Q5'].includes(node)
    )
      return fail({ kind: 'unsupported', node, card })
    return succeed(node as LoopNode)
  }
  if (read.state.kind === 'ended') return succeed('F4')
  // A lost receipt must be reconciled before any dependent business continuation can run.
  if (read.unresolved.length > 0) return succeed('R0')
  if (read.state.kind === 'settling') return succeed(at.position === 'F3' ? 'F3' : 'F2')
  const passage = at.passages.find(item => item.progress.kind !== 'applied')
  if (passage !== undefined)
    return target(
      passage.progress.kind === 'resolved' ? 'X5' : passage.progress.kind === 'asked' ? 'X4' : 'X2',
    )
  if (at.batch !== null && at.batch.actions.length > 0) {
    if (at.batch.barrier.kind === 'closed') return target('A1')
    if (at.batch.barrier.kind === 'open')
      return target(at.position.startsWith('T') ? at.position : 'A2')
    return target(['T2', 'T3', 'T5'].includes(at.position) ? at.position : 'T2')
  }
  const call = at.calls[0]
  if (call !== undefined) {
    if (call.purpose === 'compaction')
      return fail({ kind: 'unsupported', node: 'M1', card: '#502 stage 4' })
    if (call.purpose === 'action') return target('T0')
    if (call.purpose === 'extension') return target('X2')
    // A saved call survives request admission and result consumption. Its presence alone does
    // not mean that observation at M1 is still pending.
    if (['M0', 'M6', 'M1', 'M3', 'M4', 'M5', 'I3', 'Q2', 'Q4'].includes(at.position))
      return target(at.position)
    return target('M1')
  }
  // The input batch remains a consumption watermark after I3 closes the call. It does not rewind
  // a later node to request preparation. Position records that these earlier facets are consumed.
  if (['I3', 'I4', 'I8', 'F1', 'F2', 'F3', 'F4', 'O0', 'E9'].includes(at.position))
    return target(at.position)
  if (at.compaction !== null)
    return target(
      at.compaction.ended === 'committed' ? 'I1' : at.compaction.ended === 'failed' ? 'F1' : 'C1',
    )
  const prepared = at.requestPreparation
  if (prepared !== null) {
    if (prepared.kind === 'assembled') return succeed('P0')
    if (prepared.kind === 'ready') return succeed('P1')
    if (prepared.kind === 'cannot-fit') return succeed('F1')
    return target('C0')
  }
  if (at.inputBatch !== null) return succeed('I1')
  if (['E4', 'I0', 'I8'].includes(at.position)) return succeed('evaluate')
  return target(at.position)
}

export function createExecutionCoordinator<P>(entry: ExecutionEntry<P>): ExecutionCoordinator {
  const { ports, binding, evaluator, execution } = entry
  const access: Access<P> = { principal: entry.access.principal, tenant: entry.access.tenant }

  // The frame of this coordinator. The authority over it is the Journal: E1 reloads it, and every
  // commit replaces checkpoint and revision only after the Journal accepted them.
  let authority: Authority | null = null
  let revision: ExecutionRevision | null = null
  let checkpoint: AgentCheckpoint | null = null
  let state: OpenState = { kind: 'advancing' }
  let snapshot: ExecutionSnapshot | null = null
  let facts: LoopFacts | null = null
  let decided: Next | null = null
  let candidate: Candidate | null = null
  let admission: Evidence | null = null
  let iteration: Iteration | null = null
  let intent: FinishIntent | null = null
  // Only the identity and original node of this coordinator's uncertain conditional commit.
  // Journal query remains the authority over whether that operation actually committed.
  let pendingCommit: Readonly<{ operation: AgentOperationId; node: LoopNode }> | null = null
  let excludedNode: LoopNode | null = null
  let finishRefused = false
  let waits: readonly Waiting[] = []
  let waitingAt: LoopNode = 'E1'
  let yieldedWait = false
  let waking = false
  let resumeState: OpenState = state
  let reconciliationOperations: readonly AgentOperationId[] = []
  let recheckDependency: ((read: ExecutionSnapshot) => Promise<Outcome<unknown, Failure>>) | null =
    null
  let activeDrive = false
  let activeWait = false

  async function exclusive<T>(
    node: LoopNode,
    run: () => Promise<Outcome<T, Halted>>,
  ): Promise<Outcome<T, Halted>> {
    if (activeDrive || activeWait) return fail({ node, failure: { kind: 'busy' } })
    activeDrive = true
    try {
      return await run()
    } finally {
      activeDrive = false
    }
  }
  const acknowledged: Acknowledged[] = []
  const unknownReleases = new Set<AgentOperationId>()

  async function commit(node: LoopNode, to: string, write: Write): Promise<Outcome<void, Failure>> {
    const base = required(checkpoint, 'checkpoint')
    const after = required(revision, 'revision')
    const next: AgentCheckpoint = { ...base, ...write.checkpoint, position: to }
    const nextState = write.state ?? state
    const committed = await ports.journal.commit({
      ...access,
      execution,
      operation: journalOperation(node, 'commit', after),
      authority: required(authority, 'authority'),
      expected: after,
      checkpoint: next,
      state: nextState,
      events: write.events ?? [],
      effects: write.effects ?? [],
      caller: { kind: 'none' },
      replyAdmission: write.replyAdmission ?? null,
    })
    if ('failure' in committed) {
      if (committed.failure.kind === 'commit-unknown')
        pendingCommit = { operation: committed.failure.operation, node }
      return committed
    }
    revision = committed.ok.revision
    checkpoint = next
    state = nextState
    return succeed(undefined)
  }

  /**
   * Runs nodes from `from` until `until` is the next node or the Loop ends. Each handler names its
   * outcome; the table says where it goes; the commit moves `position` there. A handler that
   * fails, an outcome without a row, a refused commit or a thrown defect stops the run where it is.
   */
  async function drive(
    from: LoopNode,
    until: LoopNode | null,
  ): Promise<Outcome<LoopNode | null, Halted>> {
    let node: LoopNode | null = from
    while (node !== null && node !== until) {
      const at: LoopNode = node
      const handler: Handler | undefined = handlers[at]
      if (handler === undefined) return fail({ node: at, failure: defect(`${at} has no handler`) })
      try {
        const ran = await handler()
        if ('failure' in ran) return fail({ node: at, failure: ran.failure })
        const to = successor(at, ran.ok.on)
        if (to === undefined)
          return fail({ node: at, failure: defect(`${at} has no transition on ${ran.ok.on}`) })
        if (ran.ok.commit !== null && to !== null) {
          const committed = await commit(at, to, ran.ok.commit)
          if ('failure' in committed) {
            if (committed.failure.kind === 'changed' && ['F1', 'F2'].includes(at)) {
              finishRefused = true
              node = 'R0'
              continue
            }
            if (committed.failure.kind === 'changed' && ['M0', 'M3'].includes(at)) {
              const refreshed = await currentAttachment()
              if ('failure' in refreshed) return fail({ node: at, failure: refreshed.failure })
              node = at
              continue
            }
            return fail({ node: at, failure: committed.failure })
          }
        }
        // W0 yields this segment. The sole driver waits before taking its E1 successor.
        if (at === 'W0' && ran.ok.on === 'saved-wait') return succeed(to)
        node = to
      } catch (error) {
        return fail({ node: at, failure: defect(diagnosticOf(error)) })
      }
    }
    return succeed(node)
  }

  // ------------------------------------------------------------------------------------------
  // Reads shared by E1, E2, I8 and F1

  async function load(): Promise<Outcome<ExecutionSnapshot, Failure>> {
    const loaded = await ports.journal.load({ ...access, execution })
    if ('failure' in loaded) return loaded
    snapshot = loaded.ok
    return loaded
  }

  /** E1's reading of the snapshot: the advancement of this attachment. */
  function advancementOf(read: ExecutionSnapshot): LoopFacts['advancement'] {
    const own = required(authority, 'authority')
    const source = read.executionAttachment?.source ?? own.source
    if (read.state.kind === 'ended') return { kind: 'ended', source }
    if (!sameAuthority(read.executionAttachment, own)) return { kind: 'superseded', source }
    return { kind: 'current', source }
  }

  /** E2: the decision facts of the snapshot, the inputs within its watermark and the conditions. */
  async function readFacts(read: ExecutionSnapshot): Promise<Outcome<LoopFacts, Failure>> {
    const current = required(checkpoint, 'checkpoint')
    for (const operation of read.unresolved) {
      const queried = await ports.journal.query({ ...access, execution, operation })
      if ('failure' in queried) return queried
    }
    const inputs = await ports.journal.inputs({
      ...access,
      execution,
      watermark: read.inputWatermark,
    })
    if ('failure' in inputs) return inputs
    let after: string | null = null
    const cursors = new Set<string>()
    for (;;) {
      const admissions = await ports.journal.readReplyAdmissions({
        ...access,
        execution,
        through: read.replyAdmissions.through,
        after,
        limit: 100,
      })
      if ('failure' in admissions) return admissions
      if (admissions.ok.kind === 'gap')
        return fail({
          kind: 'unavailable',
          owner: 'agentJournal',
          diagnostic: 'reply admission projection has a gap',
        })
      if (admissions.ok.complete) break
      const next = admissions.ok.next
      if (next === null || cursors.has(next))
        return fail({
          kind: 'unavailable',
          owner: 'agentJournal',
          diagnostic: 'reply admission projection does not advance',
        })
      cursors.add(next)
      after = next
    }
    const conditions = await ports.conditions.read({
      ...access,
      advance: required(authority, 'authority'),
      previous: current.priorConditions,
    })
    if ('failure' in conditions) return conditions
    return succeed({
      advancement: advancementOf(read),
      checkpoint: current,
      conditions: conditions.ok,
      batch: inputs.ok.batch,
      inputs: inputs.ok.messages,
      // Public Model/Tool status queries belong to stage 5 (J4).
      producers: current.calls.map(pending => ({
        kind: 'unresolved',
        pending,
        source: read.history,
      })),
      consumption: read.results,
      replyAdmissions: read.replyAdmissions,
      controls: [], // Control interpretation belongs to stage 5 (J4).
    })
  }

  function waitFor(
    node: LoopNode,
    failure: Extract<Failure, { kind: 'unavailable' }>,
    recheck: (read: ExecutionSnapshot) => Promise<Outcome<unknown, Failure>>,
  ) {
    waitingAt = node
    recheckDependency = recheck
    waits = [{ kind: 'dependency', owner: failure.owner, position: node }]
    return step('wait', null)
  }

  /**
   * The evaluator at a decision segment; its `Next` is the outcome of the node. A stop (ended or
   * superseded) is a contract outcome whose nodes come with #502 1.4 and stage 5, so it stops here
   * by name instead of reaching the table as a defect.
   */
  function evaluate(node: 'E4' | 'I8', at: LoopFacts): Outcome<Step, Failure> {
    const evaluated = evaluator.next(at)
    if ('failure' in evaluated) return evaluated
    if (evaluated.ok.kind === 'stop')
      return fail(notYet(node, `a stop (${evaluated.ok.reason})`, '#502 1.4 and stage 5'))
    decided = evaluated.ok
    if (evaluated.ok.kind === 'wait') {
      recheckDependency = null
      waits = evaluated.ok.waiting
      waitingAt = node
    }
    return step(evaluated.ok.kind, null)
  }

  // ------------------------------------------------------------------------------------------
  // admitMessage: U0, Q1, Q2, Q4 (Q5 is #502 4.1)

  const admitMessage = {
    /** U0: the input of invoke becomes a candidate; once admitted it goes to E0. */
    async U0() {
      if (admission === null) {
        candidate = {
          source: { kind: 'external-input', input: entry.initial.id },
          candidate: entry.initial.content,
          operation: () => invokeOperation(entry.operation, 'Q2'),
          returnTo: 'U0',
        }
        return step('candidate', null)
      }
      admission = null
      candidate = null
      return step('admitted', null)
    },
    /**
     * Q1: a candidate whose source fits its call position (the type of Candidate ensures it) goes
     * straight to Q2, with no commit. The lawfulness checks that reject to Q5 are #502 4.1.
     */
    async Q1() {
      return step('valid', null)
    },
    /** Q2: MessageHandoff.accept; the main reply's admission fact goes with the commit. */
    async Q2() {
      const subject = required(candidate, 'candidate')
      const accepted = await ports.handoff.accept({
        ...access,
        execution,
        operation: subject.operation(revision),
        advance: authority,
        source: subject.source,
        candidate: subject.candidate,
      })
      if ('failure' in accepted) return accepted
      if (accepted.ok.kind !== 'accepted')
        return fail(notYet('Q2', 'a rejected candidate', 'Q5 (#502 4.1 and 1.7)'))
      admission = accepted.ok.admission
      if (subject.source.kind !== 'model-reply') return step('accepted', null)
      const { step: of, action, call, result } = subject.source
      return step('accepted', {
        events: [{ kind: 'message', message: subject.candidate, source: admission }],
        replyAdmission: {
          step: of,
          action,
          call,
          resultVersion: result.version,
          decision: 'admitted',
          source: admission,
        },
      })
    },
    /** Q4: back to the fixed call position of the source, once; nothing is retried. */
    async Q4() {
      const subject = required(candidate, 'candidate')
      return step(`return-${subject.returnTo}`, authority === null ? null : {})
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  // ------------------------------------------------------------------------------------------
  // runExecution: E0, E1, E2, E3, E4, O0, E9

  const runExecutionNodes = {
    /** E0: `open` saves the input and the initial checkpoint and grants the attachment. */
    async E0() {
      const initial = evaluator.initial({ definition: binding.definition, step: stepOf(0) })
      if ('failure' in initial) return initial
      const opened = await ports.journal.open({
        ...access,
        execution,
        operation: entry.operation,
        instance: binding.instance,
        grant: entry.grant,
        initial: entry.initial,
        checkpoint: initial.ok,
      })
      if ('failure' in opened) return opened
      authority = opened.ok.authority
      revision = opened.ok.receipt.revision
      checkpoint = initial.ok
      return step('authority', null)
    },
    /**
     * E1 reads the state and attachment of an already accepted operation. A revision that is
     * not the last one this coordinator knows means that another driver moved the execution on,
     * unless this coordinator still has its own unknown commit to reconcile.
     */
    async E1() {
      const read = await load()
      if ('failure' in read)
        return read.failure.kind === 'unavailable'
          ? waitFor('E1', read.failure, async latest => succeed(latest))
          : read
      const advancement = advancementOf(read.ok)
      if (advancement.kind === 'ended') return step('terminal', null)
      if (advancement.kind === 'superseded') return step('superseded', null)
      if (read.ok.revision !== revision && pendingCommit === null && !waking) {
        entry.idle()
        return step('found-existing', null)
      }
      if (advancement.kind !== 'current')
        return fail(notYet('E1', `an advancement that is ${advancement.kind}`, '#502 1.4'))
      checkpoint = read.ok.checkpoint
      revision = read.ok.revision
      if (read.ok.state.kind !== 'ended')
        state = waking && read.ok.state.kind === 'waiting' ? resumeState : read.ok.state
      waking = false
      return step('allowed', null)
    },
    /** E2: the facts of the decision, read only. */
    async E2() {
      const loaded = await load()
      if ('failure' in loaded)
        return loaded.failure.kind === 'unavailable'
          ? waitFor('E2', loaded.failure, async latest => succeed(latest))
          : loaded
      checkpoint = loaded.ok.checkpoint
      revision = loaded.ok.revision
      if (loaded.ok.state.kind !== 'ended' && loaded.ok.state.kind !== 'waiting')
        state = loaded.ok.state
      // Do not read business facts under an attachment the latest snapshot has already revoked.
      if (advancementOf(loaded.ok).kind !== 'current') return step('reconciled', null)
      const unresolved = loaded.ok.unresolved
      snapshot =
        pendingCommit === null || unresolved.includes(pendingCommit.operation)
          ? loaded.ok
          : { ...loaded.ok, unresolved: [...unresolved, pendingCommit.operation] }
      // Reconcile every original slot before loading business facts or saving another revision.
      if (snapshot.unresolved.length > 0) return step('reconciled', null)
      const read = await readFacts(snapshot)
      if ('failure' in read)
        return read.failure.kind === 'unavailable' ? waitFor('E2', read.failure, readFacts) : read
      facts = read.ok
      return step('reconciled', null)
    },
    /** E4: J5 routes snapshot continuations before delegating an input or iteration decision. */
    async E4() {
      const current = required(checkpoint, 'checkpoint')
      const latest = required(snapshot, 'snapshot')
      const advancement = advancementOf(latest)
      if (advancement.kind === 'ended') return step('resume-F4', null)
      if (advancement.kind === 'superseded') return step('resume-E9', null)
      const route =
        excludedNode === null
          ? recoveryRoute({ ...latest, checkpoint: current })
          : succeed(excludedNode)
      excludedNode = null
      if ('failure' in route) return route
      const to = route.ok
      if (to === 'evaluate')
        return evaluate('E4', { ...required(facts, 'facts'), checkpoint: current })
      if (state.kind === 'settling' && to !== 'I8' && to !== 'F1') intent = state.intent
      return step(to === 'E3' ? 'passage-pending' : `resume-${to}`, null)
    },
    /** E3: no extension is adopted (invoke refuses one), so the passage ends with a commit alone. */
    async E3() {
      return step('passed')
    },
    /** O0: the release of each acknowledged result is recorded. */
    async O0() {
      const read = await load()
      if ('failure' in read) return read
      // Journal custody survives this coordinator. Restore only our own processed main results,
      // and only from a producer's real ACK confirmation, without business advancement or ACK.
      for (const item of read.ok.results) {
        if (
          item.release.kind === 'confirmed' ||
          item.completion === null ||
          item.result.producer.kind !== 'model' ||
          acknowledged.some(known => known.consumption === item.consumption)
        )
          continue
        const match = /^step-(0|[1-9][0-9]*)\/main\/reply$/u.exec(item.consumption)
        if (match?.[1] === undefined || !Number.isSafeInteger(Number(match[1]))) continue
        const of = stepOf(Number(match[1]))
        const reference = mainInvocation(access.tenant, execution, of)
        if (invocationParts(reference, access.tenant).call !== item.result.producer.call) continue
        const material = await ports.materials.read({ ...access, source: item.completion })
        if ('failure' in material) return material
        const result = readProcessedModelMaterial(material.ok, {
          tenant: access.tenant,
          execution,
          step: of,
          consumption: item.consumption,
          consumer: mainPosition(of),
          produced: item.result,
        })
        if ('failure' in result) return result
        const restored = await confirmAcknowledgement(
          {
            step: of,
            consumption: item.consumption,
            reference,
            position: mainPosition(of),
          },
          result.ok,
          item.completion,
          'O0',
        )
        if ('failure' in restored) return restored
      }
      for (const operation of read.ok.unresolved)
        if (
          acknowledged.some(
            item => operation === journalOperation('O0', `release/${item.consumption}`, null),
          )
        )
          unknownReleases.add(operation)
      for (const item of acknowledged) {
        const operation = journalOperation('O0', `release/${item.consumption}`, null)
        if (unknownReleases.has(operation)) {
          const queried = await ports.journal.query({ ...access, execution, operation })
          if ('failure' in queried) return queried
          if (queried.ok.kind === 'unknown') return fail({ kind: 'commit-unknown', operation })
          unknownReleases.delete(operation)
          if (queried.ok.kind === 'committed') {
            revision = queried.ok.receipt.revision
            continue
          }
        }
        const released = await ports.journal.recordResult({
          ...access,
          execution,
          operation,
          result: item.produced,
          consumption: item.consumption,
          transfer: { kind: 'none' },
          release: { kind: 'confirmed', receipt: item.receipt },
        })
        if ('failure' in released) {
          if (released.failure.kind === 'commit-unknown') unknownReleases.add(operation)
          return released
        }
        revision = released.ok.revision
      }
      return step('delivered', null)
    },
    /** E9: the execution is ended, so there is no attachment to detach; the runtime is idle. */
    async E9() {
      entry.idle()
      return step('idle', null)
    },
    /** J2: one atomic wait record, retaining the original continuation and the occupied slot. */
    async W0() {
      // No alternate waiting write may invalidate an original conditional operation.
      const original =
        pendingCommit?.operation ?? reconciliationOperations[0] ?? snapshot?.unresolved[0]
      if (original !== undefined) return fail({ kind: 'commit-unknown', operation: original })
      resumeState = state.kind === 'waiting' ? resumeState : state
      if (
        snapshot?.state.kind === 'waiting' &&
        canonical(snapshot.state.waits) === canonical(waits)
      ) {
        yieldedWait = true
        return step('saved-wait', null)
      }
      const saved = await commit('W0', required(checkpoint, 'checkpoint').position, {
        state: { kind: 'waiting', waits },
        events: [{ kind: 'waiting', waits }],
      })
      if ('failure' in saved) {
        if (saved.failure.kind !== 'changed') return saved
        waking = true
        return step('reconciled', null)
      }
      yieldedWait = true
      return step('saved-wait', null)
    },
    /** R0: committed follows the saved successor; excluded re-evaluates the original local node. */
    async R0() {
      const originalCommit = pendingCommit
      const terminalQuery = originalCommit?.node === 'F3'
      const terminalExpected = revision
      let resolvedOriginal = false
      let before = required(snapshot, 'snapshot')
      if (finishRefused) {
        const latest = await load()
        if ('failure' in latest) return latest
        before = latest.ok
      }
      const original = originalCommit?.operation
      if (original !== undefined && !before.unresolved.includes(original))
        before = { ...before, unresolved: [original, ...before.unresolved] }
      reconciliationOperations = before.unresolved
      for (const operation of before.unresolved) {
        const queried = await ports.journal.query({ ...access, execution, operation })
        if ('failure' in queried) return queried
        if (queried.ok.kind !== 'unknown' && pendingCommit?.operation === operation) {
          excludedNode = queried.ok.kind === 'excluded' ? pendingCommit.node : null
          resolvedOriginal = true
        }
        if (queried.ok.kind === 'unknown') {
          // A waiting commit must not change the expected revision of the original operation.
          return fail({ kind: 'commit-unknown', operation })
        }
      }
      const loaded = await load()
      if ('failure' in loaded) return loaded
      if (resolvedOriginal) pendingCommit = null
      reconciliationOperations = []
      snapshot = {
        ...loaded.ok,
        unresolved: loaded.ok.unresolved.filter(
          operation => !before.unresolved.includes(operation),
        ),
      }
      if (terminalQuery && excludedNode === 'F3' && snapshot.revision !== terminalExpected) {
        excludedNode = null
        finishRefused = true
      }
      checkpoint = snapshot.checkpoint
      revision = snapshot.revision
      if (snapshot.state.kind !== 'ended')
        state = snapshot.state.kind === 'waiting' ? resumeState : snapshot.state
      if (advancementOf(snapshot).kind !== 'current') return step('reconciled', null)
      const read = await readFacts(snapshot)
      if ('failure' in read)
        return read.failure.kind === 'unavailable' ? waitFor('R0', read.failure, readFacts) : read
      facts = read.ok
      if (finishRefused) {
        finishRefused = false
        intent = null
        // Controls and extensions are still owned by their later cards. Never retry an unchanged
        // refusal in a loop, or mistake an unimplemented responsibility for an empty queue.
        if (snapshot.controls.length > 0)
          return fail(notYet('R0', 'a terminal control responsibility', '#502 stage 5'))
        if (snapshot.checkpoint.passages.some(passage => passage.progress.kind !== 'applied'))
          return fail(notYet('R0', 'a pending passage', '#502 stage 3'))
        if (
          read.ok.batch.ordered.length === 0 &&
          decided?.kind === 'try-finish' &&
          decided.failure !== null &&
          !read.ok.consumption.some(item => item.custody === null && item.completion === null)
        )
          excludedNode = 'F1'
        else {
          decided = null
          excludedNode = 'I8'
        }
        return step('reconciled', null)
      }
      return step('reconciled', null)
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  // ------------------------------------------------------------------------------------------
  // runIter: I0, I3, I4, I8

  const runIter = {
    /** I0: the inputs within the watermark become the batch of a new step. */
    async I0() {
      const at = required(facts, 'facts')
      const next = stepOf(ordinalOf(required(checkpoint, 'checkpoint').step) + 1)
      iteration = {
        step: next,
        batch: at.batch,
        action: mainAction(next),
        consumption: mainConsumption(next),
        position: mainPosition(next),
        conditions: null,
        selected: null,
        context: null,
        preparation: null,
        ready: null,
        pending: null,
        settlement: null,
        result: null,
        processing: null,
        read: null,
      }
      // M04-8 的读法: the input-taken event goes with the commit that fixes the batch and the step.
      return step('taken', {
        checkpoint: {
          step: next,
          inputBatch: at.batch.id,
          requestPreparation: null,
          compaction: null,
        },
        events: [{ kind: 'input-taken', batch: at.batch }],
      })
    },
    /** I3: the reply enters Q1; when Q4 brings it back admitted, the call is closed and I4 follows. */
    async I3() {
      const current = required(iteration, 'iteration')
      const restored = await readCompletion(current)
      if ('failure' in restored) return restored
      const result = restored.ok.result
      current.result = result
      const recalled = await recallAcknowledgement(current, result, restored.ok.completion)
      if ('failure' in recalled) return recalled
      if (result.kind === 'no-reply') {
        if (decided?.kind !== 'try-finish' || decided.failure?.kind !== 'no-reply') {
          const instant = await ports.clock.now()
          if ('failure' in instant) return instant
          const call = invocationParts(
            required(current.pending, 'pending call').reference,
            access.tenant,
          ).call
          const failure: FailureCandidate = {
            kind: 'no-reply',
            step: current.step,
            at: instant.ok,
            source: result.settlement.source,
            call,
            result: result.produced,
          }
          decided = {
            kind: 'try-finish',
            conclusion: {
              kind: 'fail',
              cause: agentEvidence(`${execution}/${current.step}/no-reply`, failure),
            },
            failure,
          }
        }
        return step('try-finish', null)
      }
      if (result.kind === 'partial') return step('partial', { checkpoint: { calls: [] } })
      if (admission === null) {
        const pending = required(current.pending, 'pending call')
        const produced = result.produced
        candidate = {
          source: {
            kind: 'model-reply',
            step: current.step,
            action: current.action,
            call: invocationParts(pending.reference, access.tenant).call,
            result: produced,
          },
          candidate: result.reply,
          operation: after => journalOperation('Q2', 'handoff', after),
          returnTo: 'I3',
        }
        return step('admit', null)
      }
      // Keep the admitted reply until this conditional commit is known to hold. An excluded
      // I3 commit must re-evaluate the same admission rather than admit the reply a second time.
      return step('admitted', { checkpoint: { calls: [] } })
    },
    /** I4: the tool call parts of the admitted reply. Actions are #502 stage 2. */
    async I4() {
      admission = null
      candidate = null
      const result = required(required(iteration, 'iteration').result, 'model result')
      if (result.kind !== 'reply') return fail(defect('I4 without a complete reply'))
      const reply = result.reply
      if (reply.blocks.some(block => block.kind === 'tool_call'))
        return fail(notYet('I4', 'a reply with tool calls', '#502 stage 2'))
      return step('empty', {
        checkpoint: {
          batch: {
            id: mainBatch(required(iteration, 'iteration').step),
            source: result.produced,
            actions: [],
            barrier: { kind: 'closed', judging: [], asked: [] },
            slots: [],
            batchPass: null,
          },
        },
      })
    },
    /** I8: the full facts again, and the evaluator decides between a new iteration and completion. */
    async I8() {
      const read = await load()
      if ('failure' in read) return read
      // Input submission and result records can advance the revision while Model runs. Use the
      // complete latest snapshot, under the same attachment, before deciding or committing I8.
      if (advancementOf(read.ok).kind !== 'current') return fail({ kind: 'stale-advance' })
      // R0 can reconsider a refused terminal while F3 is still the saved continuation.
      // Evaluate at I8 now; only this decision's commit (or W0) saves the new position.
      checkpoint = {
        ...read.ok.checkpoint,
        calls: callsAfterConsumedNoReply(read.ok),
        position: 'I8',
      }
      revision = read.ok.revision
      if (read.ok.state.kind !== 'ended') state = read.ok.state
      const current = await readFacts(read.ok)
      if ('failure' in current) return current
      facts = current.ok
      const evaluated = evaluate('I8', current.ok)
      if ('failure' in evaluated) return evaluated
      // W0 saves the wait while retaining I8 as the continuation. It does not claim a wakeup.
      return evaluated.ok.on === 'wait'
        ? step('wait', null)
        : step(evaluated.ok.on, { checkpoint: { batch: null }, state: { kind: 'advancing' } })
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  // ------------------------------------------------------------------------------------------
  // prepareRequest: I1, P0, P1 (C0 to C4 are #502 stage 4)

  const prepareRequest = {
    /** I1: conditions, selection, context, then `prepare` without passages. */
    async I1() {
      const current = required(iteration, 'iteration')
      const advance = required(authority, 'authority')
      const history = required(snapshot, 'snapshot').history
      const readConditions = () =>
        ports.conditions.read({
          ...access,
          advance,
          previous: required(checkpoint, 'checkpoint').priorConditions,
        })
      const conditions = await readConditions()
      if ('failure' in conditions)
        return conditions.failure.kind === 'unavailable'
          ? waitFor('I1', conditions.failure, readConditions)
          : conditions
      const selected = await select(conditions.ok)
      if ('failure' in selected)
        return selected.failure.kind === 'unavailable'
          ? waitFor('I1', selected.failure, () => select(conditions.ok))
          : selected
      const readContext = () =>
        ports.modelContext.read({
          ...access,
          advance,
          position: current.position,
          recipient: selected.ok.recipient,
          history,
          adopted: required(checkpoint, 'checkpoint').adoptedContext,
          transition: null,
        })
      const context = await readContext()
      if ('failure' in context)
        return context.failure.kind === 'unavailable'
          ? waitFor('I1', context.failure, readContext)
          : context
      const prepared = await prepare(conditions.ok, selected.ok, context.ok, null, null)
      if ('failure' in prepared)
        return prepared.failure.kind === 'unavailable'
          ? waitFor('I1', prepared.failure, () =>
              prepare(conditions.ok, selected.ok, context.ok, null, null),
            )
          : prepared
      current.conditions = conditions.ok
      current.selected = selected.ok
      current.context = context.ok
      current.preparation = prepared.ok
      // #558 S-11: only P1's review can yield ready on the phase 1 path.
      if (prepared.ok.kind === 'ready')
        return fail({
          kind: 'unavailable',
          owner: 'requestPreparation',
          diagnostic: 'I1: the first prepare returned ready before the before-model passage',
        })
      const write = {
        checkpoint: { requestPreparation: prepared.ok, priorConditions: conditions.ok.source },
      }
      if (prepared.ok.kind === 'needs-compaction') {
        // #513 revision 2: preserve Context's answer without inventing a cannot-fit cause.
        // Stage 4 owns the C subgraph. Keep I1 as the unsupported continuation in this phase.
        const saved = await commit('I1', 'I1', write)
        return 'failure' in saved ? saved : fail({ kind: 'unsupported' as const })
      }
      return step(prepared.ok.kind === 'cannot-fit' ? 'try-finish' : 'prepared', write)
    },
    /** P0: no extension is adopted at before_model_call, so the passage proceeds. */
    async P0() {
      return step('proceed')
    },
    /** P1: select again and prepare with the previous preparation; the result must be ready. */
    async P1() {
      const current = required(iteration, 'iteration')
      const conditions = required(current.conditions, 'conditions')
      const selected = await select(conditions)
      if ('failure' in selected) return selected
      if (!sameRecipient(selected.ok, required(current.selected, 'selection')))
        return fail(notYet('P1', 'a changed selection', '#502 1.5'))
      const prepared = await prepare(
        conditions,
        selected.ok,
        required(current.context, 'context'),
        current.preparation,
        [],
      )
      if ('failure' in prepared) return prepared
      if (prepared.ok.kind !== 'ready')
        return fail(notYet('P1', `a ${prepared.ok.kind} preparation`, '#502 1.5 and stage 4'))
      current.ready = prepared.ok
      return step('ready', { checkpoint: { requestPreparation: prepared.ok } })
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  function select(conditions: RuntimeConditions) {
    const current = required(iteration, 'iteration')
    return ports.selection.select({
      ...access,
      advance: required(authority, 'authority'),
      scope: binding.scope,
      purpose: 'main',
      position: current.position,
      history: required(snapshot, 'snapshot').history,
      conditions,
      alterations: [],
    })
  }

  function prepare(
    conditions: RuntimeConditions,
    selection: SelectedModel,
    context: ModelContextRead,
    previous: Preparation | null,
    beforeModelCall: readonly never[] | null,
  ) {
    const current = required(iteration, 'iteration')
    return ports.requests.prepare({
      ...access,
      advance: required(authority, 'authority'),
      action: current.action,
      purpose: 'main',
      position: current.position,
      history: required(snapshot, 'snapshot').history,
      inputs: required(current.batch, 'input batch'),
      conditions,
      selection,
      context,
      previous,
      alterations: [],
      beforeModelCall,
    })
  }

  // ------------------------------------------------------------------------------------------
  // callModel: I2, M0, M6, M1, M3, M4, M5 (M2 remains stage 3)

  function mainPosition(step: StepId): ConsumerRef {
    return { owner: AGENT_OWNER, work: `${execution}/${step}`, position: 'I3', purpose: 'main' }
  }

  function mainPending(step: StepId, ready: ReadyPreparation): ModelPendingCall {
    return {
      kind: 'model',
      action: mainAction(step),
      consumption: mainConsumption(step),
      position: mainPosition(step),
      fixed: ready.source,
      reference: mainInvocation(access.tenant, execution, step),
      purpose: 'main',
    }
  }

  const callModel = {
    /**
     * I2: the PendingCall of the main call, whose return position is I3. Its ModelInvocationRef is
     * encoded here from the call and admission that the coordinator derives, so the commit of this
     * M0 saves it with the effect before the first admit at M6.
     */
    async I2() {
      const current = required(iteration, 'iteration')
      const ready = required(current.ready, 'ready preparation')
      current.pending = mainPending(current.step, ready)
      return step('call', null)
    },
    /** M0: the adopted context and the effect intent are committed before the Model admits. */
    async M0() {
      const current = required(iteration, 'iteration')
      const pending = required(current.pending, 'pending call')
      // #558 M04-2: the inherited ready preparation records the final request in this commit.
      return step('recorded', {
        checkpoint: {
          calls: [pending],
          adoptedContext: required(current.ready, 'ready preparation').coverage,
        },
        effects: [{ action: current.action, pending, authority: required(authority, 'authority') }],
      })
    },
    /** M6: inspect the saved reference before admitting the fixed request. */
    async M6() {
      const current = required(iteration, 'iteration')
      const pending = required(current.pending, 'pending call')
      const found = await ports.models.calls.inspect({ ...access, reference: pending.reference })
      if ('failure' in found) return modelWait('M6', found.failure)
      if (found.ok.kind === 'found') {
        state = { kind: 'advancing' }
        return step('admitted', null)
      }
      const { call, admission } = invocationParts(pending.reference, access.tenant)
      if (found.ok.operation !== admission)
        return fail(defect('M6: not-accepted names another admission'))
      const eligible = await currentAttachment()
      if ('failure' in eligible) return eligible
      const ready = required(current.ready, 'ready preparation')
      const admitted = await ports.models.calls.admit({
        ...access,
        call,
        operation: admission,
        request: ready.request,
        consumer: pending.position,
        capacity: ready.capacity,
      })
      if ('failure' in admitted) {
        if (admitted.failure.kind !== 'commit-unknown')
          return fail(modelFailure('M6', admitted.failure))
        const recalled = await ports.models.calls.inspect({
          ...access,
          reference: pending.reference,
        })
        if ('failure' in recalled) return modelWait('M6', recalled.failure)
        // An unknown write is never repeated in this turn, even if inspection cannot yet find it.
        if (recalled.ok.kind !== 'found') return producerWait('M6', pending)
      } else if (admitted.ok.reference !== pending.reference) {
        return fail(defect('M6: admission returned another reference'))
      }
      state = { kind: 'advancing' }
      return step('admitted', null)
    },
    /** M1 waits for the original call, without interpreting or publishing its content. */
    async M1() {
      const current = required(iteration, 'iteration')
      const settled = await settlementOf(required(current.pending, 'pending call').reference)
      if ('failure' in settled)
        return settled.failure.kind === 'unavailable'
          ? waitFor('M1', settled.failure, () =>
              settlementOf(required(current.pending, 'pending call').reference),
            )
          : settled
      if (settled.ok === null) return producerWait('M1', required(current.pending, 'pending call'))
      current.settlement = settled.ok
      return step('settled', null)
    },
    /** M3 processes one real result, saves its completion, then releases the Model responsibility. */
    async M3() {
      const current = required(iteration, 'iteration')
      const pending = required(current.pending, 'pending call')
      const { call } = invocationParts(pending.reference, access.tenant)
      const saved = await completionOf(current)
      if ('failure' in saved) return saved
      if (saved.ok === null && current.processing === null) {
        const settlement = required(current.settlement, 'settlement')
        const parts = await readResult(current, pending.reference, call, settlement.version)
        if ('failure' in parts) return parts
        const dispatches = await ports.models.calls.dispatches({ ...access, call })
        if ('failure' in dispatches) return fail(modelFailure('M3', dispatches.failure))
        const produced: ProducedResult = {
          producer: { kind: 'model', call },
          version: settlement.version,
          delivery: null,
          source: settlement.source,
        }
        const consumed = consumeModelResult([execution, current.step], {
          produced,
          settlement,
          parts: parts.ok,
          dispatches: dispatches.ok,
        })
        if ('failure' in consumed) return consumed
        current.processing = consumed.ok
      }
      if (!acknowledged.some(item => item.consumption === current.consumption)) {
        if (saved.ok === null) {
          const result = required(current.processing, 'processed result')
          const preserved = await ports.materials.preserve({
            ...access,
            identity: `${execution}/${current.consumption}/processed/1`,
            consumer: pending.position,
            value: processedModelMaterial(processedIdentity(current, result.produced), result),
          })
          if ('failure' in preserved) return preserved
          const completion = preserved.ok
          if (completion.owner !== pending.position.owner)
            return fail({
              kind: 'invalid',
              field: 'materials.owner',
              reason: 'completion owner differs from original consumer',
            })
          const recorded = await ports.journal.recordResult({
            ...access,
            execution,
            operation: journalOperation('M3', `result/${current.consumption}`, null),
            result: result.produced,
            consumption: current.consumption,
            transfer: {
              kind: 'processed',
              result: result.produced,
              consumption: current.consumption,
              completion,
            },
            release: { kind: 'pending' },
          })
          if ('failure' in recorded) {
            if (recorded.failure.kind === 'commit-unknown')
              pendingCommit = { operation: recorded.failure.operation, node: 'M3' }
            return recorded
          }
          revision = recorded.ok.revision
        }
        // Record the binding's revision before a material read can fail. A later retry must not
        // mistake this coordinator's own successful binding for another driver's progress.
        const bound = await currentAttachment()
        if ('failure' in bound) return bound
        const restored = await readCompletion(current)
        if ('failure' in restored) return restored
        const { result, completion } = restored.ok
        current.result = result
        // Material reads can suspend while the current attachment changes. Check again before ACK.
        const refreshed = await currentAttachment()
        if ('failure' in refreshed) return refreshed
        const acked = await ports.models.consumption.acknowledge({
          ...access,
          call,
          operation: modelOperation(execution, current.step, 'ack'),
          result: result.settlement.version,
          evidence: { kind: 'processed', completion },
        })
        if ('failure' in acked) return fail(modelFailure('M3', acked.failure))
        acknowledged.push({
          produced: result.produced,
          consumption: current.consumption,
          receipt: acked.ok.custody.receipt,
        })
      }
      const restored = await readCompletion(current)
      if ('failure' in restored) return restored
      current.result = restored.ok.result
      return step('kept', {
        events: [
          {
            kind: 'producer',
            result: restored.ok.result.produced,
            consumption: current.consumption,
          },
        ],
      })
    },
    /** M4: no extension is adopted at after_model_call, so the passage proceeds. */
    async M4() {
      return step('proceed', null)
    },
    /** M5: back to the return position that the PendingCall saved. */
    async M5() {
      const pending = required(required(iteration, 'iteration').pending, 'pending call')
      if (pending.position.position !== 'I3')
        return fail(notYet('M5', `a return to ${pending.position.position}`, '#502 stage 4'))
      return step('return-I3', null)
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  function processedIdentity(current: Iteration, produced: ProducedResult): ProcessedModelIdentity {
    return {
      tenant: access.tenant,
      execution,
      step: current.step,
      consumption: current.consumption,
      consumer: required(current.pending, 'pending call').position,
      produced,
    }
  }

  async function completionOf(current: Iteration) {
    const read = await load()
    if ('failure' in read) return read
    return succeed(read.ok.results.find(item => item.consumption === current.consumption) ?? null)
  }

  async function readCompletion(
    current: Iteration,
  ): Promise<Outcome<{ result: ModelOutcome; completion: Evidence }, Failure>> {
    const saved = await completionOf(current)
    if ('failure' in saved) return saved
    const item = saved.ok
    const pending = required(current.pending, 'pending call')
    const call = invocationParts(pending.reference, access.tenant).call
    if (
      !item?.completion ||
      item.result.producer.kind !== 'model' ||
      item.result.producer.call !== call ||
      item.completion.owner !== pending.position.owner
    )
      return fail({
        kind: 'invalid',
        field: 'processed-result',
        reason: 'missing original Journal completion binding',
      })
    const material = await ports.materials.read({ ...access, source: item.completion })
    if ('failure' in material) return material
    const result = readProcessedModelMaterial(material.ok, processedIdentity(current, item.result))
    if ('failure' in result) return result
    if (
      current.settlement !== null &&
      (current.settlement.version !== result.ok.settlement.version ||
        !sameEvidence(current.settlement.source, result.ok.settlement.source))
    )
      return fail({
        kind: 'invalid',
        field: 'processed-result',
        reason: 'settlement differs from original call',
      })
    return succeed({ result: result.ok, completion: item.completion })
  }

  /** I3 has consumed this no-reply result. A refused F1 must not turn its retained call
   * continuation back into production. The Journal completion and real ACK remain O0's duty. */
  function callsAfterConsumedNoReply(read: ExecutionSnapshot): readonly PendingCall[] {
    const current = iteration
    if (current?.result?.kind !== 'no-reply' || current.pending === null)
      return read.checkpoint.calls
    const pending = current.pending
    const result = current.result
    const completed = read.results.find(item => item.consumption === pending.consumption)
    if (completed?.completion == null) return read.checkpoint.calls
    const completion = completed.completion
    if (
      completed.result.version !== result.produced.version ||
      !sameEvidence(completed.result.source, result.produced.source) ||
      !acknowledged.some(
        item => item.consumption === pending.consumption && sameEvidence(item.receipt, completion),
      )
    )
      return read.checkpoint.calls
    return read.checkpoint.calls.filter(
      call =>
        call.kind !== 'model' ||
        call.consumption !== pending.consumption ||
        call.reference !== pending.reference,
    )
  }

  /** M4/M5/I3 continuation can bypass M3 after producer committed. Recover the real original ACK
   * confirmation for this main consumption, so existing O0 can close its Journal responsibility. */
  async function recallAcknowledgement(
    current: Iteration,
    result: ModelOutcome,
    completion: Evidence,
  ): Promise<Outcome<void, Failure>> {
    if (acknowledged.some(item => item.consumption === current.consumption))
      return succeed(undefined)
    const eligible = await currentAttachment()
    if ('failure' in eligible) return eligible
    const pending = required(current.pending, 'pending call')
    return confirmAcknowledgement({ ...pending, step: current.step }, result, completion, 'I3')
  }

  async function confirmAcknowledgement(
    pending: Pick<ModelPendingCall, 'consumption' | 'reference' | 'position'> &
      Readonly<{ step: StepId }>,
    result: ModelOutcome,
    completion: Evidence,
    node: 'I3' | 'O0',
  ): Promise<Outcome<void, Failure>> {
    const call = invocationParts(pending.reference, access.tenant).call
    const inspected = await ports.models.calls.inspect({ ...access, reference: pending.reference })
    if ('failure' in inspected) return fail(modelFailure(node, inspected.failure))
    if (
      inspected.ok.kind !== 'found' ||
      inspected.ok.state.phase !== 'settled' ||
      inspected.ok.state.custody.kind !== 'acknowledged'
    )
      return fail({
        kind: 'unavailable',
        owner: 'modelRuntime',
        diagnostic: `${node}: original acknowledgement is not confirmed`,
      })
    const state = inspected.ok.state
    const consumer = state.consumer
    const custody = inspected.ok.state.custody
    if (
      state.call !== call ||
      state.settlement.version !== result.settlement.version ||
      !sameEvidence(state.settlement.source, result.settlement.source) ||
      consumer.owner !== pending.position.owner ||
      consumer.work !== pending.position.work ||
      consumer.position !== pending.position.position ||
      consumer.purpose !== pending.position.purpose ||
      custody.operation !== modelOperation(execution, pending.step, 'ack') ||
      !sameEvidence(custody.receipt, completion)
    )
      return fail({
        kind: 'invalid',
        field: 'model-acknowledgement',
        reason: 'confirmation differs from original result or consumer',
      })
    acknowledged.push({
      produced: result.produced,
      consumption: pending.consumption,
      receipt: custody.receipt,
    })
    return succeed(undefined)
  }

  function producerWait(node: 'M1' | 'M6', pending: PendingCall) {
    waitingAt = node
    recheckDependency = null
    waits = [{ kind: 'producer', pending }]
    return step('wait', null)
  }

  function modelWait(node: LoopNode, failure: M.ModelFailure) {
    const converted = modelFailure(node, failure)
    return failure.kind === 'unavailable' || failure.kind === 'commit-unknown'
      ? waitFor(node, converted, async () => {
          const pending = required(required(iteration, 'iteration').pending, 'pending call')
          const read = await ports.models.calls.inspect({ ...access, reference: pending.reference })
          return 'failure' in read ? fail(modelFailure(node, read.failure)) : read
        })
      : fail(converted)
  }

  /** Recheck the actual attachment before admission/ACK, and adopt its current revision. */
  async function currentAttachment(): Promise<Outcome<void, Failure>> {
    const read = await load()
    if ('failure' in read) return read
    if (advancementOf(read.ok).kind !== 'current') return fail({ kind: 'stale-advance' })
    revision = read.ok.revision
    checkpoint = read.ok.checkpoint
    return succeed(undefined)
  }

  /** Inspect is authoritative even when the original live observation has disappeared. */
  async function settlementOf(
    reference: M.ModelInvocationRef,
  ): Promise<Outcome<M.Settlement | null, Failure>> {
    const inspected = await ports.models.calls.inspect({ ...access, reference })
    if ('failure' in inspected) return fail(modelFailure('M1', inspected.failure))
    if (inspected.ok.kind !== 'found') return succeed(null)
    if (inspected.ok.state.phase === 'settled') return succeed(inspected.ok.state.settlement)
    return succeed(null)
  }

  /** Keep acquired pages until processing is bound. A closed complete Read never needs reopening.
   * Failed incomplete reads are closed first, then a new deterministic read attempt may reread the
   * same original result. A failed close retains its Read identity and is retried before any new read. */
  async function readResult(
    current: Iteration,
    reference: M.ModelInvocationRef,
    call: M.ModelCallId,
    version: M.ResultVersion,
  ): Promise<Outcome<readonly M.ResultPart[], Failure>> {
    const frame = (current.read ??= { attempt: 0, read: null, parts: [], complete: false })
    async function close(): Promise<Outcome<void, Failure>> {
      if (frame.read === null) return succeed(undefined)
      try {
        const closed = await ports.models.consumption.closeRead({
          ...access,
          call,
          read: frame.read,
        })
        if ('failure' in closed) return fail(modelFailure('M3', closed.failure))
        if (closed.ok.kind !== 'ended') return fail(defect('M3: closeRead left a Read open'))
        frame.read = null
        if (!frame.complete) {
          frame.attempt++
          frame.parts = []
        }
        return succeed(undefined)
      } catch (error) {
        return fail(defect(diagnosticOf(error)))
      }
    }
    // A previous call could have stopped on closeRead. Finish that close before further work.
    if (frame.read !== null) {
      const closed = await close()
      if ('failure' in closed) return closed
    }
    if (frame.complete) return succeed(frame.parts)
    const begun = await ports.models.consumption.beginRead({
      ...access,
      reference,
      operation: modelOperation(
        execution,
        current.step,
        frame.attempt === 0 ? 'read' : `read_${frame.attempt}`,
      ),
      result: version,
    })
    if ('failure' in begun) return fail(modelFailure('M3', begun.failure))
    if (begun.ok.kind !== 'started')
      return fail(notYet('M3', 'a result acknowledged before processing was bound', '#502 1.6'))
    frame.read = begun.ok.read
    let page = begun.ok.value
    let failure: Failure | null = null
    try {
      for (;;) {
        if (page.kind !== 'reading') {
          failure = modelFailure('M3', {
            kind: 'unavailable',
            dependency: 'model-read',
            diagnostic: `read ended ${page.reason}`,
          })
          break
        }
        if (page.page.settlement.version !== version) {
          failure = defect('M3: result page changed its version')
          break
        }
        frame.parts.push(...page.page.parts)
        if (page.page.next === null) {
          frame.complete = true
          break
        }
        const following = await ports.models.consumption.readNext({
          ...access,
          call,
          read: frame.read,
          after: page.page.next,
        })
        if ('failure' in following) {
          failure = modelFailure('M3', following.failure)
          break
        }
        page = following.ok
      }
    } catch (error) {
      failure = defect(diagnosticOf(error))
    }
    const closed = await close()
    if ('failure' in closed) return closed
    return failure === null ? succeed(frame.parts) : fail(failure)
  }

  // ------------------------------------------------------------------------------------------
  // settle: F1, F2, F3, F4 (F0 is stage 5; extension evaluation is stage 3)

  const settle = {
    /** F1: the candidate of the evaluator is fixed with the current input boundary. */
    async F1() {
      const at = required(checkpoint, 'checkpoint')
      const preparation = at.requestPreparation
      // Derive only from the committed preparation. An unknown I1 commit therefore follows the
      // same F1 route after committed reconciliation, or prepares again only when excluded.
      if (
        preparation?.kind === 'cannot-fit' &&
        (decided?.kind !== 'try-finish' || decided.failure?.kind !== 'cannot-fit')
      ) {
        const instant = await ports.clock.now()
        if ('failure' in instant) return instant
        decided = cannotFit(at.step, preparation, instant.ok)
      }
      // Keep the same candidate, including its timestamp, if an F1 commit is excluded.
      const next = required(decided, 'decision')
      if (next.kind !== 'try-finish') throw new Error(`coordinator defect: F1 after ${next.kind}`)
      const read = await load()
      if ('failure' in read) return read
      // A newer input cannot be folded into a candidate made before it was accepted.
      if (read.ok.revision !== revision) {
        finishRefused = true
        return step('reconcile', null)
      }
      intent ??= {
        conclusion: next.conclusion,
        inputWatermark: read.ok.inputWatermark,
        obligations: agentEvidence(`${execution}/obligations`, read.ok.revision),
        beforeTerminal: null,
        failure: next.failure,
      }
      return step('fixed', {
        state: { kind: 'settling', intent },
        ...(next.failure?.kind === 'no-reply' ? { checkpoint: { calls: [] } } : {}),
      })
    },
    /** F2: no extension is adopted at before_terminal; the passage proceeds and binds the candidate. */
    async F2() {
      const fixed = required(intent, 'finish intent')
      const passed =
        fixed.beforeTerminal === null
          ? { ...fixed, beforeTerminal: agentEvidence(`${execution}/before-terminal`, fixed) }
          : fixed
      intent = passed
      return step('proceed', { state: { kind: 'settling', intent: passed } })
    },
    /** F3: tryFinish, the one terminal commit. */
    async F3() {
      const finished = await ports.journal.tryFinish({
        ...access,
        execution,
        operation: journalOperation('F3', 'finish', revision),
        authorization: { kind: 'advancement', authority: required(authority, 'authority') },
        expected: required(revision, 'revision'),
        intent: required(intent, 'finish intent'),
      })
      if ('failure' in finished) {
        if (finished.failure.kind !== 'commit-unknown') return finished
        pendingCommit = { operation: finished.failure.operation, node: 'F3' }
        return step('reconcile', null)
      }
      if (finished.ok.kind !== 'ended') {
        finishRefused = true
        return step('reconcile', null)
      }
      revision = finished.ok.receipt.revision
      return step('ended', null)
    },
    /** F4: recognize the fixed terminal ledger. Pending observations stay with the long-lived
     * Journal; extension evaluation is stage 3 and no completion is invented here. */
    async F4() {
      const read = await load()
      if ('failure' in read) return read
      if (read.ok.state.kind !== 'ended') return fail(defect('F4 without a committed terminal'))
      return step('observed', null)
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  function cannotFit(
    of: StepId,
    preparation: Extract<Preparation, { kind: 'cannot-fit' }>,
    at: AgentInstant,
  ): Extract<Next, { kind: 'try-finish' }> {
    const failure: FailureCandidate = {
      kind: 'cannot-fit',
      step: of,
      at,
      source: preparation.source,
      reason: preparation.reason,
      context: preparation.source,
    }
    const cause = agentEvidence(`${execution}/${of}/cannot-fit`, failure)
    return { kind: 'try-finish', conclusion: { kind: 'fail', cause }, failure }
  }

  const handlers: Partial<Record<LoopNode, Handler>> = {
    ...admitMessage,
    ...runExecutionNodes,
    ...runIter,
    ...prepareRequest,
    ...callModel,
    ...settle,
  }

  return {
    async accept() {
      const ran = await drive('U0', 'E1')
      if ('failure' in ran) return ran
      return succeed(required(authority, 'authority'))
    },
    async continueExecution(original) {
      return exclusive('E1', async () => {
        authority = original
        const read = await load()
        if ('failure' in read) return fail({ node: 'E1', failure: read.failure })
        if (!sameAuthority(read.ok.executionAttachment, original))
          return fail({ node: 'E1', failure: { kind: 'stale-advance' } })
        const at = read.ok.checkpoint
        const ready = at.requestPreparation
        // I2 has the ready request and step, but M0 has not saved an intent yet. The same identity
        // rule as normal I2 reconstructs its frame. Unknown Journal operations need R0, not this cut.
        const beforeIntent =
          at.position === 'I2' && at.calls.length === 0 && read.ok.unresolved.length === 0
        const pending =
          beforeIntent && ready?.kind === 'ready' ? mainPending(at.step, ready) : at.calls[0]
        if (
          (!beforeIntent && !['M6', 'M3', 'M4', 'M5', 'I3'].includes(at.position)) ||
          pending?.kind !== 'model' ||
          pending.purpose !== 'main' ||
          ready?.kind !== 'ready' ||
          !sameEvidence(pending.fixed, ready.source) ||
          (read.ok.results.some(item => item.consumption === pending.consumption) &&
            !read.ok.results.some(
              item => item.consumption === pending.consumption && item.completion !== null,
            ))
        )
          return fail({ node: 'E4', failure: { kind: 'unsupported' } })
        revision = read.ok.revision
        checkpoint = at
        if (beforeIntent) excludedNode = 'I2'
        // No input batch is reconstructed: only its ID is saved. The call path never prepares again.
        iteration = {
          step: at.step,
          batch: null,
          action: pending.action,
          consumption: pending.consumption,
          position: pending.position,
          conditions: null,
          selected: null,
          context: null,
          preparation: ready,
          ready,
          pending,
          settlement: null,
          result: null,
          processing: null,
          read: null,
        }
        // The first available recovery snapshot already owns these unknown identities. Query
        // them before another fallible read can take the normal E1 -> W0 route.
        reconciliationOperations = read.ok.unresolved
        const ran = await drive(
          pendingCommit !== null || reconciliationOperations.length > 0 ? 'R0' : 'E1',
          null,
        )
        return 'failure' in ran ? ran : succeed(undefined)
      })
    },
    async waitForWake(input) {
      if (activeDrive || activeWait) return fail({ node: 'W0', failure: { kind: 'busy' } })
      if (!yieldedWait && pendingCommit === null && reconciliationOperations.length === 0)
        return succeed('stopped')
      const operations = [
        ...new Set([
          ...reconciliationOperations,
          ...(pendingCommit === null ? [] : [pendingCommit.operation]),
        ]),
      ]
      activeWait = true
      try {
        const result = await waitForExecutionChange({
          ports,
          access,
          execution,
          expected: required(revision, 'revision'),
          operations,
          waits: operations.length > 0 ? [] : waits,
          recheck: operations.length > 0 ? null : recheckDependency,
          position: waitingAt,
          ...input,
        })
        return 'failure' in result ? fail({ node: 'W0', failure: result.failure }) : result
      } catch (error) {
        return fail({ node: 'W0', failure: defect(diagnosticOf(error)) })
      } finally {
        activeWait = false
      }
    },
    async runExecution() {
      return exclusive('E1', async () => {
        waking = yieldedWait
        yieldedWait = false
        const ran = await drive(
          pendingCommit !== null || reconciliationOperations.length > 0 ? 'R0' : 'E1',
          null,
        )
        if ('failure' in ran) return ran
        return succeed(undefined)
      })
    },
  }
}
