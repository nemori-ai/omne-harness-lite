// The execution coordinator: the effects of the Loop for one execution, node by node, as the
// pseudocode of docs/architecture/loop-algorithm.md "正常路径伪代码" groups them (runExecution,
// settle, runIter, prepareRequest, callModel, admitMessage). Each node is one handler that runs the
// node's effect and names its outcome; where the node goes next is never decided here but looked up
// in the transition table of nodes.ts. At E4 and I8 the outcome is the pure evaluator's `Next`.
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
// - 待 #558 M04-1: the producer event is carried by the commit that follows `recordResult` at M3.
// - M04-8 的读法: the input-taken event is written by the I0 commit.
// - M04-7: `open` writes no event (the memory Journal's reading of SPEC).
// - M04-5: `recordResult.transfer` is processed without a declared participant.
//
// Every outcome that is not on the normal path stops the coordinator with a named failure. Nothing
// is retried, waited for, or turned into a success. A stop says who it belongs to, so that the wait
// and recovery of #502 1.9 can tell them apart by `owner`:
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
  mainConsumption,
  mainInvocation,
  modelOperation,
  ordinalOf,
  replyMessageId,
  stepOf,
  type Message,
} from './identities.ts'
import { successor, type Label, type LoopNode } from './nodes.ts'

/** The ports the coordinator uses. None of them depends on the content block type. */
export type LoopPorts<P> = Pick<
  AgentDependencies<P, ContentBlock>,
  'journal' | 'models' | 'conditions' | 'requests' | 'selection' | 'modelContext' | 'handoff'
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
   * E1 to E9, after `accept`: the Loop until the runtime is idle again or the run stops.
   */
  runExecution(): Promise<Outcome<void, Halted>>
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
  batch: InputBatch
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
  produced: ProducedResult | null // M3
  reply: Message | null // M3
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
function modelFailure(node: LoopNode, failure: M.ModelFailure): Failure {
  return {
    kind: 'unavailable',
    owner: 'modelRuntime',
    diagnostic: `${node}: the Model runtime answered ${failure.kind}`,
  }
}

/** A value that an earlier node of the same path sets. Its absence is a defect, so it throws. */
function required<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`coordinator defect: ${what} is not set`)
  return value
}

/** Diagnostic conversion must not throw while handling a node's thrown value. */
function diagnosticOf(error: unknown): string {
  try {
    return error instanceof Error ? String(error.message) : String(error)
  } catch {
    return 'the thrown value could not be converted to diagnostic text'
  }
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
  const acknowledged: Acknowledged[] = []

  async function commit(
    node: LoopNode,
    to: LoopNode,
    write: Write,
  ): Promise<Outcome<void, Failure>> {
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
    if ('failure' in committed) return committed
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
          if ('failure' in committed) return fail({ node: at, failure: committed.failure })
        }
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
    if (read.executionAttachment?.executionAttachment !== own.executionAttachment)
      return { kind: 'superseded', source }
    return { kind: 'current', source }
  }

  /** E2: the decision facts of the snapshot, the inputs within its watermark and the conditions. */
  async function readFacts(read: ExecutionSnapshot): Promise<Outcome<LoopFacts, Failure>> {
    const current = required(checkpoint, 'checkpoint')
    // Producer projection (ProducerDecisionView) comes with E2's full reading in #502 1.4.
    if (current.calls.length > 0) return fail(notYet('E2', 'a pending call', '#502 1.4'))
    const inputs = await ports.journal.inputs({
      ...access,
      execution,
      watermark: read.inputWatermark,
    })
    if ('failure' in inputs) return inputs
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
      producers: [],
      consumption: read.results,
      replyAdmissions: read.replyAdmissions,
      controls: read.controls,
    })
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
     * E1: the execution state and the attachment. The access re-check comes with #502 1.4. A
     * revision that is not the last one this coordinator knows means that the Journal moved the
     * execution on without it: `open` gave back the receipt of an execution that already ran, for
     * example after a restart. This coordinator does not drive it; that is recovery (stage 5).
     */
    async E1() {
      const read = await load()
      if ('failure' in read) return read
      if (read.ok.revision !== revision) {
        entry.idle()
        return step('found-existing', null)
      }
      const advancement = advancementOf(read.ok)
      if (advancement.kind !== 'current' || read.ok.state.kind === 'ended')
        return fail(notYet('E1', `an advancement that is ${advancement.kind}`, '#502 1.4'))
      checkpoint = read.ok.checkpoint
      revision = read.ok.revision
      state = read.ok.state
      return step('allowed', null)
    },
    /** E2: the facts of the decision, read only. */
    async E2() {
      const read = await readFacts(required(snapshot, 'snapshot'))
      if ('failure' in read) return read
      facts = read.ok
      return step('reconciled', null)
    },
    /** E4: an unfinished execution-start passage goes back to E3; otherwise the evaluator decides. */
    async E4() {
      const current = required(checkpoint, 'checkpoint')
      if (current.position === 'E3') return step('passage-pending', null)
      return evaluate('E4', { ...required(facts, 'facts'), checkpoint: current })
    },
    /** E3: no extension is adopted (invoke refuses one), so the passage ends with a commit alone. */
    async E3() {
      return step('passed')
    },
    /** O0: the release of each acknowledged result is recorded. */
    async O0() {
      for (const item of acknowledged) {
        const released = await ports.journal.recordResult({
          ...access,
          execution,
          operation: journalOperation('O0', `release/${item.consumption}`, revision),
          result: item.produced,
          consumption: item.consumption,
          transfer: { kind: 'none' },
          release: { kind: 'confirmed', receipt: item.receipt },
        })
        if ('failure' in released) return released
        revision = released.ok.revision
      }
      return step('delivered', null)
    },
    /** E9: the execution is ended, so there is no attachment to detach; the runtime is idle. */
    async E9() {
      entry.idle()
      return step('idle', null)
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
        position: {
          owner: AGENT_OWNER,
          work: `${execution}/${next}`,
          position: 'I3',
          purpose: 'main',
        },
        conditions: null,
        selected: null,
        context: null,
        preparation: null,
        ready: null,
        pending: null,
        settlement: null,
        produced: null,
        reply: null,
      }
      // M04-8 的读法: the input-taken event goes with the commit that fixes the batch and the step.
      return step('taken', {
        checkpoint: { step: next, inputBatch: at.batch.id },
        events: [{ kind: 'input-taken', batch: at.batch }],
      })
    },
    /** I3: the reply enters Q1; when Q4 brings it back admitted, the call is closed and I4 follows. */
    async I3() {
      const current = required(iteration, 'iteration')
      if (admission === null) {
        const pending = required(current.pending, 'pending call')
        const produced = required(current.produced, 'produced result')
        candidate = {
          source: {
            kind: 'model-reply',
            step: current.step,
            action: current.action,
            call: invocationParts(pending.reference, access.tenant).call,
            result: produced,
          },
          candidate: required(current.reply, 'reply'),
          operation: after => journalOperation('Q2', 'handoff', after),
          returnTo: 'I3',
        }
        return step('admit', null)
      }
      admission = null
      candidate = null
      return step('admitted', { checkpoint: { calls: [] } })
    },
    /** I4: the tool call parts of the admitted reply. Actions are #502 stage 2. */
    async I4() {
      const reply = required(required(iteration, 'iteration').reply, 'reply')
      if (reply.blocks.some(block => block.kind === 'tool_call'))
        return fail(notYet('I4', 'a reply with tool calls', '#502 stage 2'))
      return step('empty')
    },
    /** I8: the full facts again, and the evaluator decides between a new iteration and completion. */
    async I8() {
      const read = await load()
      if ('failure' in read) return read
      const current = await readFacts(read.ok)
      if ('failure' in current) return current
      facts = current.ok
      const evaluated = evaluate('I8', current.ok)
      if ('failure' in evaluated) return evaluated
      return step(evaluated.ok.on)
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
      const conditions = await ports.conditions.read({
        ...access,
        advance,
        previous: required(checkpoint, 'checkpoint').priorConditions,
      })
      if ('failure' in conditions) return conditions
      const selected = await select(conditions.ok)
      if ('failure' in selected) return selected
      const context = await ports.modelContext.read({
        ...access,
        advance,
        position: current.position,
        recipient: selected.ok.recipient,
        history,
        adopted: required(checkpoint, 'checkpoint').adoptedContext,
        transition: null,
      })
      if ('failure' in context) return context
      const prepared = await prepare(conditions.ok, selected.ok, context.ok, null, null)
      if ('failure' in prepared) return prepared
      current.conditions = conditions.ok
      current.selected = selected.ok
      current.context = context.ok
      current.preparation = prepared.ok
      // What `prepare` returns, assembled or ready, goes to P0 (pseudocode prepareRequest).
      if (prepared.ok.kind !== 'assembled' && prepared.ok.kind !== 'ready')
        return fail(notYet('I1', `a ${prepared.ok.kind} preparation`, '#502 1.5 and stage 4'))
      return step('prepared', { checkpoint: { requestPreparation: prepared.ok } })
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
      inputs: current.batch,
      conditions,
      selection,
      context,
      previous,
      alterations: [],
      beforeModelCall,
    })
  }

  // ------------------------------------------------------------------------------------------
  // callModel: I2, M0, M6, M1, M3, M4, M5 (M2 is #502 1.6 and stage 3)

  const callModel = {
    /**
     * I2: the PendingCall of the main call, whose return position is I3. Its ModelInvocationRef is
     * encoded here from the call and admission that the coordinator derives, so the commit of this
     * node saves it before the first admit at M6.
     */
    async I2() {
      const current = required(iteration, 'iteration')
      const ready = required(current.ready, 'ready preparation')
      current.pending = {
        kind: 'model',
        action: current.action,
        consumption: current.consumption,
        position: current.position,
        fixed: ready.source,
        reference: mainInvocation(access.tenant, execution, current.step),
        purpose: 'main',
      }
      return step('call', { checkpoint: { calls: [current.pending] } })
    },
    /** M0: the adopted context and the effect intent are committed before the Model admits. */
    async M0() {
      const current = required(iteration, 'iteration')
      const pending = required(current.pending, 'pending call')
      // 待 #558 M04-2: the final request record has no field in JournalCommit, so it is not written.
      return step('recorded', {
        checkpoint: { adoptedContext: required(current.ready, 'ready preparation').coverage },
        effects: [{ action: current.action, pending, authority: required(authority, 'authority') }],
      })
    },
    /** M6: the Model admits the fixed request once. */
    async M6() {
      const current = required(iteration, 'iteration')
      const pending = required(current.pending, 'pending call')
      const ready = required(current.ready, 'ready preparation')
      const { call, admission } = invocationParts(pending.reference, access.tenant)
      const admitted = await ports.models.calls.admit({
        ...access,
        call,
        operation: admission,
        request: ready.request,
        consumer: pending.position,
        capacity: ready.capacity,
      })
      if ('failure' in admitted) return fail(modelFailure('M6', admitted.failure))
      // The Model returns the reference of the admitted call. It is the saved one, or the Model
      // admitted another call than the one this PendingCall names.
      if (admitted.ok.reference !== pending.reference)
        return fail({
          kind: 'unavailable',
          owner: 'modelRuntime',
          diagnostic: 'M6: the Model answered another reference than the saved one',
        })
      return step('admitted')
    },
    /** M1: the observation of the original call until it is really settled. */
    async M1() {
      const current = required(iteration, 'iteration')
      const settled = await settlementOf(required(current.pending, 'pending call').reference)
      if ('failure' in settled) return settled
      current.settlement = settled.ok
      return step('settled')
    },
    /**
     * M3: the reply is read in full and kept on the processed path (M04-5), then the Model is
     * acknowledged. 待 #558 M04-1: the producer event goes with the commit after recordResult.
     */
    async M3() {
      const current = required(iteration, 'iteration')
      const pending = required(current.pending, 'pending call')
      const settlement = required(current.settlement, 'settlement')
      const { termination } = settlement
      if (termination.kind !== 'completed' || termination.reason !== 'stop')
        return fail(notYet('M3', `a call that ended ${termination.kind}`, '#502 1.6'))
      const { call } = invocationParts(pending.reference, access.tenant)
      const parts = await readResult(pending.reference, call, current.step, settlement.version)
      if ('failure' in parts) return parts
      const blocks: Message['blocks'][number][] = []
      for (const part of parts.ok) {
        if (part.kind !== 'sealed') return fail(notYet('M3', 'a partial result part', '#502 1.6'))
        blocks.push(part.block)
      }
      const reply: Message = {
        id: replyMessageId(execution, current.step),
        role: 'assistant',
        blocks,
      }
      const produced: ProducedResult = {
        producer: { kind: 'model', call },
        version: settlement.version,
        delivery: null,
        source: settlement.source,
      }
      const completion = agentEvidence(`${execution}/${current.consumption}/processed`, reply)
      const recorded = await ports.journal.recordResult({
        ...access,
        execution,
        operation: journalOperation('M3', 'result', revision),
        result: produced,
        consumption: current.consumption,
        transfer: {
          kind: 'processed',
          result: produced,
          consumption: current.consumption,
          completion,
        },
        release: { kind: 'pending' },
      })
      if ('failure' in recorded) return recorded
      revision = recorded.ok.revision
      const acked = await ports.models.consumption.acknowledge({
        ...access,
        call,
        operation: modelOperation(execution, current.step, 'ack'),
        result: settlement.version,
        evidence: { kind: 'processed', completion },
      })
      if ('failure' in acked) return fail(modelFailure('M3', acked.failure))
      acknowledged.push({
        produced,
        consumption: current.consumption,
        receipt: acked.ok.custody.receipt,
      })
      current.produced = produced
      current.reply = reply
      return step('kept', {
        events: [{ kind: 'producer', result: produced, consumption: current.consumption }],
      })
    },
    /** M4: no extension is adopted at after_model_call, so the passage proceeds. */
    async M4() {
      return step('proceed')
    },
    /** M5: back to the return position that the PendingCall saved. */
    async M5() {
      const pending = required(required(iteration, 'iteration').pending, 'pending call')
      if (pending.position.position !== 'I3')
        return fail(notYet('M5', `a return to ${pending.position.position}`, '#502 stage 4'))
      return step('return-I3')
    },
  } satisfies Partial<Record<LoopNode, Handler>>

  /** The settlement of a call, from its live observation. Any other end stops M1. */
  async function settlementOf(
    reference: M.ModelInvocationRef,
  ): Promise<Outcome<M.Settlement, Failure>> {
    const route = await ports.models.instances.connect({ ...access, reference })
    if ('failure' in route) return fail(modelFailure('M1', route.failure))
    if (route.ok.kind !== 'live')
      return fail(notYet('M1', 'a call without a live route', '#502 1.6'))
    const controller = new AbortController()
    try {
      for await (const seen of route.ok.handle.observe({ ...access, signal: controller.signal })) {
        if (seen.kind === 'ended')
          return fail(notYet('M1', `an observation that ended ${seen.reason}`, '#502 1.6'))
        if (seen.value.state.phase === 'settled') return succeed(seen.value.state.settlement)
      }
      return fail(notYet('M1', 'an observation without an end', '#502 1.6'))
    } finally {
      controller.abort()
    }
  }

  /** Every part of the settled result, page by page; the read is closed afterwards. */
  async function readResult(
    reference: M.ModelInvocationRef,
    call: M.ModelCallId,
    of: StepId,
    version: M.ResultVersion,
  ): Promise<Outcome<readonly M.ResultPart[], Failure>> {
    const begun = await ports.models.consumption.beginRead({
      ...access,
      reference,
      operation: modelOperation(execution, of, 'read'),
      result: version,
    })
    if ('failure' in begun) return fail(modelFailure('M3', begun.failure))
    if (begun.ok.kind !== 'started')
      return fail(notYet('M3', 'a result acknowledged before it was read', '#502 1.6'))
    const read = begun.ok.read
    const parts: M.ResultPart[] = []
    let page = begun.ok.value
    for (;;) {
      if (page.kind !== 'reading')
        return fail(notYet('M3', `a read that ended ${page.reason}`, '#502 1.6'))
      parts.push(...page.page.parts)
      if (page.page.next === null) break
      const after = page.page.next
      const following = await ports.models.consumption.readNext({ ...access, call, read, after })
      if ('failure' in following) return fail(modelFailure('M3', following.failure))
      page = following.ok
    }
    const closed = await ports.models.consumption.closeRead({ ...access, call, read })
    if ('failure' in closed) return fail(modelFailure('M3', closed.failure))
    return succeed(parts)
  }

  // ------------------------------------------------------------------------------------------
  // settle: F1, F2, F3, F4 (F0 and the refusals of F3 are #502 1.8 and stage 5)

  const settle = {
    /** F1: the candidate of the evaluator is fixed with the current input boundary. */
    async F1() {
      const next = required(decided, 'decision')
      if (next.kind !== 'try-finish') throw new Error(`coordinator defect: F1 after ${next.kind}`)
      const read = await load()
      if ('failure' in read) return read
      intent = {
        conclusion: next.conclusion,
        inputWatermark: read.ok.inputWatermark,
        obligations: agentEvidence(`${execution}/obligations`, read.ok.revision),
        beforeTerminal: null,
        failure: next.failure,
      }
      return step('fixed', { state: { kind: 'settling', intent } })
    },
    /** F2: no extension is adopted at before_terminal; the passage proceeds and binds the candidate. */
    async F2() {
      const fixed = required(intent, 'finish intent')
      intent = { ...fixed, beforeTerminal: agentEvidence(`${execution}/before-terminal`, fixed) }
      return step('proceed', { state: { kind: 'settling', intent } })
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
      if ('failure' in finished) return finished
      if (finished.ok.kind !== 'ended')
        return fail(notYet('F3', `a tryFinish that answered ${finished.ok.kind}`, '#502 1.8'))
      revision = finished.ok.receipt.revision
      return step('ended', null)
    },
    /** F4: the post-terminal observations. None is pending without extensions. */
    async F4() {
      const read = await load()
      if ('failure' in read) return read
      if (read.ok.terminalObservations.length > 0)
        return fail(notYet('F4', 'a post-terminal observation', '#502 1.8 and stage 3'))
      return step('observed', null)
    },
  } satisfies Partial<Record<LoopNode, Handler>>

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
    async runExecution() {
      const ran = await drive('E1', null)
      if ('failure' in ran) return ran
      return succeed(undefined)
    },
  }
}
