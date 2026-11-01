// The shared helpers of the Journal core conformance suite (testing-journal-core.ts and
// testing-journal-finishing.ts): suite identities and evidence, the commit, submit, handoff and
// control inputs one coordinator step would write, the finish helpers that drive the ordinary and
// the cancellation path end to end, and the revision probes. Internal to the `./testing` entry.
import assert from 'node:assert/strict'
import { judgeMessage, type Message } from '@omne-harness/message'
import { decodeModelCallId } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type { AgentCheckpoint, Failure, ProducedResult, Reply } from './evaluation.ts'
import type {
  AcceptedInput,
  AgentEvent,
  CommandReceipt,
  ControlRecord,
  ExecutionSnapshot,
  FinishAuthorization,
  FinishIntent,
  FinishResult,
} from './execution.ts'
import type {
  CancellationPolicyInstallation,
  FinishCandidateContent,
  SettlementRequest,
  SettlementResult,
} from './finishing.ts'
import {
  decodeActionId,
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeInputId,
  decodePassageId,
  type Access,
  type Adoption,
  type AgentExecutionId,
  type AgentOperationId,
  type Authority,
  type ConsumptionId,
  type DurableEvidence,
} from './identity.ts'
import type {
  AgentJournal,
  ExecutionHandoff,
  JournalCommit,
  OriginalInputAcceptance,
} from './journal.ts'
import type {
  HandoffOutcome,
  HandoffReference,
  HandoffResolution,
  Passage,
  PendingHandoff,
} from './passages.ts'
import type { TestHostRecord } from './testing-cancellation.ts'
import { canonicalText, uncoveredCase } from './testing-case.ts'

/** One execution the fixture opened, with the handles the suite drives it through. */
export interface AgentJournalCoreOpened<P> {
  readonly journal: AgentJournal<P>
  readonly access: Access<P>
  readonly execution: AgentExecutionId
  readonly receipt: CommandReceipt
  readonly authority: Authority
  /** The checkpoint the execution was opened with; the suite derives every commit from it. */
  readonly checkpoint: AgentCheckpoint
  /**
   * An input the coordinator side has accepted for this execution, ready for `submit` under the
   * fixture's binding: with the coordinator's source on a coordinated binding, null on a
   * standalone one. `name` distinguishes the inputs of one case. The suite builds the submit entry,
   * the external H and the prepared outcome of the input itself; a provider that only accepts an
   * outcome of its own admission provider is the fixture's business.
   */
  readonly acceptInput: (name: string) => Promise<AcceptedInput>
  /**
   * A result the provider accepts for `recordResult` on this execution, with a transfer that
   * establishes custody or completion: the provider may require the producing call to be known
   * to the execution first. Optional; the recordResult case is uncovered without it.
   */
  readonly produceResult?: (name: string) => Promise<
    Readonly<{
      result: ProducedResult
      consumption: ConsumptionId
      transfer: Parameters<AgentJournal<P>['recordResult']>[0]['transfer']
    }>
  >
  /** Scripts the next write of `method` to answer commit-unknown with the given outcome. Optional. */
  readonly faultNext?: (
    method:
      | 'recordControl'
      | 'submit'
      | 'recordHandoff'
      | 'commit'
      | 'prepareFinish'
      | 'tryFinish'
      | 'commitSettlement',
    outcome: 'applied' | 'dropped' | 'pending',
  ) => void
  /**
   * The Access of a second tenant that owns no execution of this case, for the cases where another
   * tenant calls the Journal (SPEC "判定次序与失败映射" 1). Optional; the foreign-tenant cases are
   * uncovered without it.
   */
  readonly otherAccess?: Access<P>
  /** Attaches a new attachment that supersedes the current one, under the fixture's rules. Optional. */
  readonly takeover?: (name: string) => Promise<Authority>
  /**
   * The cancellation policy installation the Journal of this execution holds (SPEC "安装记录与资格"):
   * `testCancellationPolicyInstallation` when the fixture installed the test policy, null when it
   * opened the execution with `cancellationPolicy: 'absent'`. Absent (undefined) means the fixture
   * cannot install a policy; the cancellation cases are then uncovered.
   */
  readonly installation?: CancellationPolicyInstallation | null
  /**
   * Registers one record with the trusted host reads of the Journal and answers the source
   * evidence that resolves to it (SPEC "commitSettlement 的变体", the custody variants). Optional;
   * the custody cases are uncovered without it.
   */
  readonly hostRecord?: (record: TestHostRecord) => Promise<DurableEvidence>
  /**
   * Seeds a legacy cancelled candidate as a writer of the old protocol left it (SPEC "旧取消记录的迁移"):
   * a candidate whose conclusion is cancelled, on an author route whose before-terminal proof is
   * set, with one new revision. The fixture writes it through its own seam, not through `commit`:
   * the protocol fence does not accept such an F1 any more. Optional; the migration case is
   * uncovered without it.
   */
  readonly seedLegacyCandidate?: (
    name: string,
  ) => Promise<Readonly<{ candidate: AgentOperationId }>>
  /**
   * Scripts which of the three settlement qualifications the caller holds from now on (SPEC
   * "commitSettlement 的变体": settle, migrate-cancellation, reconcile); all three by default.
   * Optional; the qualification case is uncovered without it.
   */
  readonly qualify?: (held: readonly SettlementQualification[]) => void
  /**
   * The reply admission controls of this execution (SPEC "回复准入的已核实前缀"). Optional; the
   * cases of the verified prefix, the fixed range and the page bounds are uncovered without it.
   */
  readonly replyAdmissions?: AgentJournalReplyAdmissionControls<P>
}

/** A removal of reply admission material, as a storage fault or an operator error leaves it. */
export type ReplyAdmissionDamage =
  | Readonly<{ kind: 'missing-fact'; sequence: number }>
  | Readonly<{ kind: 'missing-basis'; sequence: number }>
  | Readonly<{ kind: 'retention'; from: number }>
  | Readonly<{ kind: 'range-unavailable'; below: number }>

/**
 * What the reads of a provider did since it was created: range positions (`seeks`), rows touched
 * (`scanned`), facts decoded into pages, pages, facts folded by a projection rebuild, loads and
 * commits that wrote a checkpoint. The complexity cases compare the differences of two scales.
 */
export type ReplyAdmissionReadStatistics = Readonly<{
  seeks: number
  scanned: number
  decoded: number
  pages: number
  folds: number
  loads: number
  checkpointWrites: number
}>

/** The reply admission controls a fixture gives for one opened execution. */
export interface AgentJournalReplyAdmissionControls<P> {
  /**
   * Admits `count` new admitted model reply facts at once, through the provider's own seam, as
   * the original Ja commits would: each with its sequence, prefix basis, publication and the
   * incremental projection.
   */
  seed(count: number): Promise<void>
  /** Removes the named material of this execution. */
  damage(damage: ReplyAdmissionDamage): Promise<void>
  /** Sets the provider's own page bounds: at most `items` facts, at most `bytes` of its encoding. */
  limitPages(limits: Readonly<{ items: number | null; bytes: number | null }>): void
  /** The read counters of the provider. */
  statistics(): ReplyAdmissionReadStatistics
  /** Changes the projection rule: `rebuild` converts the projection, `none` leaves it as it is. */
  changeRule(rule: Adoption, conversion: 'rebuild' | 'none'): Promise<void>
  /** Whether the caller is qualified to read the execution from now on; qualified by default. */
  readable(allowed: boolean): void
  /** Opens another execution of the same tenant on the same Journal. */
  sibling(name: string): Promise<AgentJournalCoreOpened<P>>
  /**
   * Opens an execution of another tenant under that tenant's Access, on the same Journal when the
   * provider holds every tenant in one Journal.
   */
  foreign(name: string): Promise<AgentJournalCoreOpened<P>>
}

/** The three qualifications the settlement operations check (SPEC "commitSettlement 的变体"). */
export type SettlementQualification = 'settle' | 'migrate-cancellation' | 'reconcile'

/** The options of one `open` of the core fixture. */
export type AgentJournalCoreOpenOptions = Readonly<{
  /** Whether the Journal holds the test cancellation policy installation; `installed` by default. */
  cancellationPolicy?: 'installed' | 'absent'
}>

/** What a provider gives the core suite. */
export interface AgentJournalCoreFixture<P> {
  /** Opens a fresh execution for the case `name`; every call is independent of the others. */
  open(name: string, options?: AgentJournalCoreOpenOptions): Promise<AgentJournalCoreOpened<P>>
}

export function identity<T>(decoded: Outcome<T, unknown>, what: string): T {
  if (!('ok' in decoded)) throw new TypeError(`the suite value ${what} is invalid`)
  return decoded.ok
}
export const operation = (name: string): AgentOperationId =>
  identity(decodeAgentOperationId(`core-${name}`), name)
export const evidence = (record: string): DurableEvidence => ({
  owner: 'suite',
  record,
  revision: '1',
  digest: `suite:${record}`,
})
export const PROVIDER = {
  owner: 'suite',
  name: 'message-handoff',
  revision: '1',
  digest: 'suite:handoff',
}

export function message(
  text: string,
  suffix: string,
  role: 'user' | 'assistant' = 'user',
): Message {
  const judged = judgeMessage({
    id: `msg_${'c'.repeat(22 - suffix.length)}${suffix}`,
    role,
    blocks: [
      { kind: 'text', id: `blk_${suffix}`, visibility: { toHuman: true, toModel: true }, text },
    ],
  })
  if (!('ok' in judged)) throw new TypeError(`the suite message ${text} is invalid`)
  return judged.ok
}

export function input(id: string, text = id): AcceptedInput {
  return {
    id: identity(decodeInputId(`core-${id}`), id),
    content: message(text, id.padStart(2, '0').slice(-2)),
    source: null,
    priority: 'ordinary',
  }
}

export async function ok<T>(reply: Reply<T>, what: string): Promise<T> {
  const outcome = await reply
  assert.ok('ok' in outcome, `${what} should succeed, got ${JSON.stringify(outcome)}`)
  return outcome.ok
}

export async function refused<T>(
  reply: Reply<T>,
  kind: Failure['kind'],
  what: string,
): Promise<Failure> {
  const outcome = await reply
  assert.ok('failure' in outcome, `${what} should fail with ${kind}, got success`)
  assert.equal(outcome.failure.kind, kind, `${what} should fail with ${kind}`)
  return outcome.failure
}

export async function notSuccessful<T>(reply: Reply<T>, what: string): Promise<void> {
  const outcome = await reply
  assert.ok('failure' in outcome, `${what} should not succeed`)
}

export async function load<P>(opened: AgentJournalCoreOpened<P>): Promise<ExecutionSnapshot> {
  return ok(opened.journal.load({ ...opened.access, execution: opened.execution }), 'load')
}

export async function revision<P>(opened: AgentJournalCoreOpened<P>): Promise<number> {
  return Number((await load(opened)).revision)
}

export async function events<P>(opened: AgentJournalCoreOpened<P>): Promise<readonly AgentEvent[]> {
  const page = await ok(
    opened.journal.output.read({
      ...opened.access,
      execution: opened.execution,
      after: null,
      limit: 100,
    }),
    'read',
  )
  assert.equal(page.kind, 'page', 'the suite reads within the retained window')
  return page.kind === 'page' ? page.events : []
}

export function query<P>(opened: AgentJournalCoreOpened<P>, id: AgentOperationId) {
  return ok(
    opened.journal.query({ ...opened.access, execution: opened.execution, operation: id }),
    `query ${id}`,
  )
}

/** A conditional commit at the current snapshot, as one coordinator step would write it. */
export function commitAt<P>(
  opened: AgentJournalCoreOpened<P>,
  snapshot: ExecutionSnapshot,
  name: string,
  authority: Authority = opened.authority,
  overrides: Partial<JournalCommit<P>> = {},
): JournalCommit<P> {
  return {
    ...opened.access,
    execution: opened.execution,
    operation: operation(name),
    authority,
    expected: snapshot.revision,
    checkpoint: { ...snapshot.checkpoint, position: name },
    state: { kind: 'advancing' },
    events: [],
    effects: [],
    caller: { kind: 'none' },
    replyAdmission: null,
    handoff: null,
    finish: null,
    ...overrides,
  }
}

/** The external submit entry, H and prepared outcome of one accepted input, built by the suite. */
export function submitAcceptance<P>(
  opened: AgentJournalCoreOpened<P>,
  name: string,
  value: AcceptedInput,
  decision: HandoffOutcome['decision'] = {
    kind: 'prepared',
    message: value.content,
    admission: evidence(`admission/${name}`),
  },
): OriginalInputAcceptance {
  const handoff: Extract<HandoffReference, { kind: 'input' }> = {
    kind: 'input',
    execution: opened.execution,
    entry: operation(name),
    input: value.id,
  }
  return {
    entry: { kind: 'submit', operation: operation(name), execution: opened.execution, value },
    handoff,
    outcome: {
      request: {
        kind: 'input',
        reference: handoff,
        entry: { kind: 'submit', operation: operation(name), execution: opened.execution, value },
        source: { kind: 'external-input', input: value.id },
      },
      origin: {
        kind: 'submit',
        executionBinding: evidence(`binding/${opened.execution}`),
        delivery: { kind: 'durable-view' },
      },
      provider: PROVIDER,
      qualification: evidence(`qualification/${name}`),
      record: evidence(`record/${name}`),
      decision,
    },
  }
}

/** A first submit of `value` under the operation `name`, with its new-input lineage. */
export function newSubmit<P>(
  opened: AgentJournalCoreOpened<P>,
  name: string,
  value: AcceptedInput,
) {
  return {
    ...opened.access,
    execution: opened.execution,
    operation: operation(name),
    value,
    lineage: { kind: 'new-input' as const, original: submitAcceptance(opened, name, value) },
  }
}

/** A new operation `name` that recognizes the acceptance `original` of `value`. */
export function recognizingSubmit<P>(
  opened: AgentJournalCoreOpened<P>,
  name: string,
  value: AcceptedInput,
  original: OriginalInputAcceptance,
) {
  return {
    ...opened.access,
    execution: opened.execution,
    operation: operation(name),
    value,
    lineage: { kind: 'recognize-input' as const, original },
  }
}

/** The internal request of a model reply at the position I3 of the opened checkpoint's step. */
export function pendingHandoff<P>(
  opened: AgentJournalCoreOpened<P>,
  snapshot: ExecutionSnapshot,
  name: string,
  predecessorHandoff: PendingHandoff['predecessorHandoff'] = null,
): PendingHandoff {
  const call = identity(decodeModelCallId(`mcall_${'0'.repeat(20)}${name.slice(-2)}`), 'call')
  return {
    kind: 'execution',
    reference: { kind: 'execution', execution: opened.execution, operation: operation(name) },
    predecessor: snapshot.revision,
    position: { step: snapshot.checkpoint.step, node: 'I3', slot: null },
    source: {
      kind: 'model-reply',
      step: snapshot.checkpoint.step,
      action: identity(decodeActionId(`core-${name}/action`), name),
      call,
      result: {
        producer: { kind: 'model', call },
        version: 'v1',
        delivery: null,
        source: evidence(`result/${name}`),
      },
    },
    candidate: message(`reply ${name}`, name.padStart(2, '0').slice(-2), 'assistant'),
    originalAdvance: opened.authority,
    predecessorHandoff,
  }
}

export function outcomeOf(
  request: PendingHandoff,
  decision: HandoffOutcome['decision'],
): HandoffOutcome {
  const name = request.reference.operation
  return {
    request,
    origin: null,
    provider: PROVIDER,
    qualification: evidence(`qualification/${name}`),
    record: evidence(`record/${name}`),
    decision,
  }
}

export function prepared(request: PendingHandoff): HandoffOutcome {
  return outcomeOf(request, {
    kind: 'prepared',
    message: request.candidate,
    admission: evidence(`admission/${request.reference.operation}`),
  })
}

export function excluded(
  request: PendingHandoff,
): Extract<HandoffResolution, { kind: 'excluded' }> {
  return {
    kind: 'excluded',
    request,
    origin: null,
    exclusion: evidence(`exclusion/${request.reference.operation}`),
  }
}

/** The P commit of `request` at `snapshot`: `handoff.prepare` and `currentHandoff` set to H. */
export function prepareCommit<P>(
  opened: AgentJournalCoreOpened<P>,
  snapshot: ExecutionSnapshot,
  name: string,
  request: PendingHandoff,
): JournalCommit<P> {
  return commitAt(opened, snapshot, name, opened.authority, {
    checkpoint: { ...snapshot.checkpoint, position: 'Q2', currentHandoff: request.reference },
    handoff: { kind: 'prepare', request },
  })
}

/** The Ja commit of `outcome` at `snapshot`: the message event of a prepared outcome, no event otherwise. */
export function resolveCommit<P>(
  opened: AgentJournalCoreOpened<P>,
  snapshot: ExecutionSnapshot,
  name: string,
  outcome: HandoffOutcome,
  overrides: Partial<JournalCommit<P>> = {},
): JournalCommit<P> {
  const decision = outcome.decision
  const source = outcome.request.source
  return commitAt(opened, snapshot, name, opened.authority, {
    checkpoint: { ...snapshot.checkpoint, position: 'Q4', currentHandoff: null },
    events:
      decision.kind === 'prepared'
        ? [{ kind: 'message', message: decision.message, source: decision.admission }]
        : [],
    // The Ja of a model reply carries the admission fact of that reply (SPEC "消息准入").
    replyAdmission:
      source.kind === 'model-reply'
        ? {
            step: source.step,
            action: source.action,
            call: source.call,
            resultVersion: source.result.version,
            decision: decision.kind === 'prepared' ? 'admitted' : 'rejected',
            source: decision.kind === 'prepared' ? decision.admission : decision.evidence,
          }
        : null,
    handoff: { kind: 'resolve', outcome },
    ...overrides,
  })
}

export function handoffOf(
  snapshot: ExecutionSnapshot,
  reference: HandoffReference,
): ExecutionHandoff {
  const found = snapshot.handoffs.find(
    item => canonicalText(item.handoff) === canonicalText(reference),
  )
  assert.ok(found !== undefined, `load.handoffs should list ${JSON.stringify(reference)}`)
  return found
}

/** Takes every accepted input into one batch, as I0 would, so an ordinary end is not blocked. */
export async function takeInputs<P>(
  opened: AgentJournalCoreOpened<P>,
  name = 'take',
): Promise<void> {
  const snapshot = await load(opened)
  const taken = await ok(
    opened.journal.inputs({
      ...opened.access,
      execution: opened.execution,
      watermark: snapshot.inputWatermark,
    }),
    'inputs',
  )
  await ok(
    opened.journal.commit(
      commitAt(opened, snapshot, name, opened.authority, {
        checkpoint: { ...snapshot.checkpoint, inputBatch: taken.batch.id },
        events: [{ kind: 'input-taken', batch: taken.batch }],
      }),
    ),
    'the I0 commit',
  )
}

export function cancelControl<P>(opened: AgentJournalCoreOpened<P>, name = 'cancel') {
  return {
    ...opened.access,
    execution: opened.execution,
    operation: operation(name),
    command: { kind: 'cancel' as const, reason: evidence(`reason/${name}`) },
  }
}

export function stage<P>(
  opened: AgentJournalCoreOpened<P>,
  name: string,
  target: AgentOperationId,
  which:
    | 'intent-established'
    | 'qualification-revoked'
    | 'producer-confirmed'
    | 'physically-stopped'
    | 'duty-released',
  state: 'reached' | 'unresolved' = 'reached',
  source = evidence(`stage/${which}`),
) {
  return {
    ...opened.access,
    execution: opened.execution,
    operation: operation(name),
    target,
    stage: which,
    state,
    source,
  }
}

export function controlEvents(all: readonly AgentEvent[]) {
  return all.flatMap(event =>
    event.body.kind === 'control'
      ? [[event.body.operation, event.body.stage, event.body.state] as const]
      : [],
  )
}

/** A post-terminal passage that `tryFinish` turns into a pending observation. */
export function afterTerminalPassage(name: string): Passage {
  return {
    id: identity(decodePassageId(`core-${name}`), name),
    position: 'after_terminal',
    dimension: null,
    purpose: null,
    action: null,
    ordinal: 1,
    declaration: {
      name: 'observer',
      position: 'after_terminal',
      power: 'observe',
      implementation: { kind: 'builtin', builtinName: 'observer' },
    },
    implementation: PROVIDER,
    input: evidence(`passage/${name}/input`),
    effective: evidence(`passage/${name}/effective`),
    operations: [],
    progress: { kind: 'requested', mode: { kind: 'fresh' } },
  }
}

/**
 * Runs `write` twice and returns how much the revision advanced after the first and after the
 * second call: a new fact advances it by one, and the same operation recognizes without a second.
 * The second call must answer exactly what the first did (SPEC "判定次序与失败映射" 2).
 */
export async function advances<P>(
  opened: AgentJournalCoreOpened<P>,
  write: () => Promise<unknown>,
): Promise<readonly [number, number]> {
  const before = await revision(opened)
  const first = await write()
  const middle = await revision(opened)
  const second = await write()
  assert.deepEqual(second, first, 'the retry of the same operation answers the original result')
  return [middle - before, (await revision(opened)) - middle]
}

// ------------------------------------------------------------------------------------------
// Finishing (SPEC "条件终结", "取消判断与路线", "终结责任清单", "commitSettlement 的变体")

/** The candidate content an F1 commit writes for an ordinary completion at `snapshot`. */
export function candidateContent(
  snapshot: ExecutionSnapshot,
  name: string,
  overrides: Partial<FinishCandidateContent> = {},
): FinishCandidateContent {
  return {
    origin: evidence(`origin/${name}`),
    conclusion: { kind: 'complete' },
    failure: null,
    inputWatermark: snapshot.inputWatermark,
    conditions: evidence(`conditions/${name}`),
    ...overrides,
  }
}

/** The F1 commit: settling, with the candidate content, at `snapshot`. */
export function f1Commit<P>(
  opened: AgentJournalCoreOpened<P>,
  snapshot: ExecutionSnapshot,
  name: string,
  authority: Authority = opened.authority,
  finish: FinishCandidateContent = candidateContent(snapshot, name),
): JournalCommit<P> {
  return commitAt(opened, snapshot, name, authority, {
    checkpoint: { ...snapshot.checkpoint, position: 'F1' },
    state: { kind: 'settling' },
    finish,
  })
}

/** The F2 commit: the plain settling commit that completes the before-terminal passage at `snapshot`. */
export function f2Commit<P>(
  opened: AgentJournalCoreOpened<P>,
  snapshot: ExecutionSnapshot,
  name: string,
  authority: Authority = opened.authority,
): JournalCommit<P> {
  return commitAt(opened, snapshot, name, authority, {
    checkpoint: { ...snapshot.checkpoint, position: 'F2' },
    state: { kind: 'settling' },
  })
}

/** The FinishIntent projection of a settling snapshot. */
export function intentOf(snapshot: ExecutionSnapshot): FinishIntent {
  assert.equal(snapshot.state.kind, 'settling', 'the execution should be settling')
  if (snapshot.state.kind !== 'settling') throw new Error('unreachable')
  return snapshot.state.intent
}

/** The current candidate of the settlement projection; fails when there is none. */
export function candidateOf(snapshot: ExecutionSnapshot): AgentOperationId {
  const candidate = snapshot.settlement.candidate
  assert.ok(candidate !== null, 'the settlement should carry a current candidate')
  return candidate.candidate
}

export function advancement(authority: Authority): FinishAuthorization {
  return { kind: 'advancement', authority }
}

/** The cancel authorization bound to the saved control `control` of `snapshot`. */
export function cancelAuthorization(
  snapshot: ExecutionSnapshot,
  control: AgentOperationId,
): Extract<FinishAuthorization, { kind: 'cancel' }> {
  return { kind: 'cancel', control, source: controlOf(snapshot, control).stages.accepted.source }
}

export function controlOf(snapshot: ExecutionSnapshot, control: AgentOperationId): ControlRecord {
  const found = snapshot.controls.find(record => record.operation === control)
  assert.ok(found !== undefined, `the control ${control} should be saved`)
  return found
}

/** The prepareFinish input of the current candidate at `snapshot`. */
export function prepareInput<P>(
  opened: AgentJournalCoreOpened<P>,
  snapshot: ExecutionSnapshot,
  name: string,
  authorization: FinishAuthorization = advancement(opened.authority),
  candidate: AgentOperationId = candidateOf(snapshot),
) {
  return {
    ...opened.access,
    execution: opened.execution,
    operation: operation(name),
    authorization,
    expected: snapshot.revision,
    candidate,
  }
}

/** The tryFinish input that presents the projection of `snapshot` for the equality check. */
export function finishInput<P>(
  opened: AgentJournalCoreOpened<P>,
  snapshot: ExecutionSnapshot,
  name: string,
  authorization: FinishAuthorization = advancement(opened.authority),
  intent: FinishIntent = intentOf(snapshot),
) {
  return {
    ...opened.access,
    execution: opened.execution,
    operation: operation(name),
    authorization,
    expected: snapshot.revision,
    intent,
  }
}

/** The content of a failed candidate: the conclusion `fail` with its cause. */
export function failedContent(name: string): Partial<FinishCandidateContent> {
  return { conclusion: { kind: 'fail', cause: evidence(`cause/${name}`) } }
}

/** F1, F2 and prepareFinish of an ordinary completion or failure; answers the snapshot to end from. */
export async function prepareOrdinaryEnd<P>(
  opened: AgentJournalCoreOpened<P>,
  name: string,
  authority: Authority = opened.authority,
  content: Partial<FinishCandidateContent> = {},
): Promise<ExecutionSnapshot> {
  const at = await load(opened)
  await ok(
    opened.journal.commit(
      f1Commit(opened, at, `${name}/F1`, authority, candidateContent(at, `${name}/F1`, content)),
    ),
    'F1',
  )
  await ok(
    opened.journal.commit(f2Commit(opened, await load(opened), `${name}/F2`, authority)),
    'F2',
  )
  await ok(
    opened.journal.prepareFinish(
      prepareInput(opened, await load(opened), `${name}/prepare`, advancement(authority)),
    ),
    'prepareFinish',
  )
  return load(opened)
}

/** Takes the inputs, then F1, F2, prepareFinish, load and tryFinish of an ordinary completion or failure. */
export async function end<P>(
  opened: AgentJournalCoreOpened<P>,
  name = 'end',
  authority: Authority = opened.authority,
  content: Partial<FinishCandidateContent> = {},
): Promise<CommandReceipt> {
  await takeInputs(opened, `take-${name}`)
  const ready = await prepareOrdinaryEnd(opened, name, authority, content)
  const finished = await ok(
    opened.journal.tryFinish(finishInput(opened, ready, name, advancement(authority))),
    'tryFinish',
  )
  assert.equal(
    finished.kind,
    'ended',
    `the ordinary end should succeed, got ${JSON.stringify(finished)}`,
  )
  return (finished as Extract<FinishResult, { kind: 'ended' }>).receipt
}

/** The settlement request `name` of `kind` with the given fields. */
export function settlement<P, K extends SettlementRequest<P>['kind']>(
  opened: AgentJournalCoreOpened<P>,
  name: string,
  body: Omit<
    Extract<SettlementRequest<P>, { kind: K }>,
    keyof Access<P> | 'execution' | 'operation'
  >,
): Extract<SettlementRequest<P>, { kind: K }> {
  return {
    ...opened.access,
    execution: opened.execution,
    operation: operation(name),
    ...body,
  } as Extract<SettlementRequest<P>, { kind: K }>
}

/** The installation of `opened`; fails the case when the fixture has none installed. */
export function installationOf<P>(
  opened: AgentJournalCoreOpened<P>,
): CancellationPolicyInstallation {
  assert.ok(
    opened.installation !== undefined && opened.installation !== null,
    'the fixture should hold the test installation',
  )
  return opened.installation
}

/** Resolves the uncovered case when the fixture cannot install a cancellation policy. */
export async function requireInstallation<P>(opened: AgentJournalCoreOpened<P>): Promise<boolean> {
  if (opened.installation !== undefined) return true
  await uncoveredCase('', 'cancellation policy installation').run()
  return false
}

/** A cancel control whose intent is reached: the control that an effective cancel needs. */
export async function effectiveCancel<P>(
  opened: AgentJournalCoreOpened<P>,
  name = 'cancel',
): Promise<AgentOperationId> {
  const control = cancelControl(opened, name)
  await ok(opened.journal.control(control), 'control')
  await ok(
    opened.journal.recordControl(
      stage(opened, `${name}/intent`, control.operation, 'intent-established'),
    ),
    'the intent',
  )
  return control.operation
}

/** Establishes the cancellation candidate of `control` natively; answers the result. */
export async function establish<P>(
  opened: AgentJournalCoreOpened<P>,
  control: AgentOperationId,
  name = 'establish',
): Promise<Extract<SettlementResult, { kind: 'establish-cancellation' }>> {
  const snapshot = await load(opened)
  const result = await ok(
    opened.journal.commitSettlement(
      settlement<P, 'establish-cancellation'>(opened, name, {
        kind: 'establish-cancellation',
        authorization: cancelAuthorization(snapshot, control),
        expected: snapshot.revision,
        installation: installationOf(opened).record,
        predecessor: snapshot.settlement.candidate?.candidate ?? null,
      }),
    ),
    'establish-cancellation',
  )
  assert.equal(result.kind, 'establish-cancellation')
  return result as Extract<SettlementResult, { kind: 'establish-cancellation' }>
}

/** Judges the current cancellation candidate of `control`; answers the judgment result. */
export async function judge<P>(
  opened: AgentJournalCoreOpened<P>,
  control: AgentOperationId,
  name = 'judge',
): Promise<Extract<SettlementResult, { kind: 'judge-cancellation' }>> {
  const snapshot = await load(opened)
  const route = snapshot.settlement.route
  assert.ok(route !== null && route.kind === 'cancellation', 'a cancellation route is current')
  const result = await ok(
    opened.journal.commitSettlement(
      settlement<P, 'judge-cancellation'>(opened, name, {
        kind: 'judge-cancellation',
        authorization: cancelAuthorization(snapshot, control),
        expected: snapshot.revision,
        candidate: candidateOf(snapshot),
        route: route.record,
        installation: installationOf(opened).record,
      }),
    ),
    'judge-cancellation',
  )
  assert.equal(result.kind, 'judge-cancellation')
  return result as Extract<SettlementResult, { kind: 'judge-cancellation' }>
}

/**
 * Ends under the cancel `control`: establish, judge, prepareFinish, load, tryFinish. With
 * `establish: false` the current candidate is already cancelled (natively or after a migration)
 * and the end starts at the judgment: establish-cancellation is not a step of that route.
 */
export async function endCancelled<P>(
  opened: AgentJournalCoreOpened<P>,
  control: AgentOperationId,
  name = 'end-cancelled',
  options: Readonly<{ establish?: boolean }> = {},
): Promise<CommandReceipt> {
  if (options.establish !== false) await establish(opened, control, `${name}/establish`)
  await judge(opened, control, `${name}/judge`)
  const prepared = await load(opened)
  await ok(
    opened.journal.prepareFinish(
      prepareInput(opened, prepared, `${name}/prepare`, cancelAuthorization(prepared, control)),
    ),
    'prepareFinish',
  )
  const ready = await load(opened)
  const finished = await ok(
    opened.journal.tryFinish(finishInput(opened, ready, name, cancelAuthorization(ready, control))),
    'tryFinish',
  )
  assert.equal(
    finished.kind,
    'ended',
    `the cancelled end should succeed, got ${JSON.stringify(finished)}`,
  )
  return (finished as Extract<FinishResult, { kind: 'ended' }>).receipt
}

// ------------------------------------------------------------------------------------------
// Another tenant (SPEC "判定次序与失败映射" 1)

/** An execution that no tenant of any case opens. */
export const MISSING_EXECUTION: AgentExecutionId = identity(
  decodeAgentExecutionId('core-missing-execution'),
  'missing execution',
)

/** The second tenant's Access of `opened`; resolves the uncovered case when the fixture has none. */
export async function requireOtherAccess<P>(
  opened: AgentJournalCoreOpened<P>,
): Promise<Access<P> | undefined> {
  if (opened.otherAccess !== undefined) return opened.otherAccess
  await uncoveredCase('', 'otherAccess control').run()
  return undefined
}

/**
 * Another tenant calls `method` with the operation `id`, once on the opened execution and once on
 * an execution that does not exist. Both answers are the same `denied` with the action `method`,
 * so they do not tell whether the execution exists. The caller holds no settlement qualification
 * during the calls, so the tenant is checked before the qualification. A fault scripted for the
 * method is spent on the denied call; nothing is written, nothing is left unresolved, and the
 * owner's query of `id` stays unknown. The caller then makes the owner's own call of the method,
 * which must not meet the fault.
 */
export async function foreignDenied<P>(
  opened: AgentJournalCoreOpened<P>,
  other: Access<P>,
  method: Parameters<NonNullable<AgentJournalCoreOpened<P>['faultNext']>>[0],
  id: AgentOperationId,
  call: (access: Access<P>, execution: AgentExecutionId) => Reply<unknown>,
): Promise<void> {
  const before = await load(opened)
  opened.faultNext?.(method, 'pending')
  opened.qualify?.([])
  const existing = await call(other, opened.execution)
  const missing = await call(other, MISSING_EXECUTION)
  opened.qualify?.(['settle', 'migrate-cancellation', 'reconcile'])
  assert.ok('failure' in existing, `another tenant's ${method} should fail`)
  assert.deepEqual(
    existing.failure,
    { kind: 'denied', action: method },
    `another tenant's ${method} is denied with the action ${method}`,
  )
  assert.deepEqual(missing, existing, 'the same answer for an existing and a missing execution')
  assert.deepEqual(await load(opened), before, `another tenant's ${method} wrote nothing`)
  assert.equal(
    (await query(opened, id)).kind,
    'unknown',
    `another tenant's ${method} left no record of the operation`,
  )
}

/**
 * The internal request of the model reply number `index` at I3 of the snapshot's step: its own
 * call, action and H, so that every index is a new original fact.
 */
export function replyRequest<P>(
  opened: AgentJournalCoreOpened<P>,
  snapshot: ExecutionSnapshot,
  index: number,
  call = `mcall_reply${String(index).padStart(12, '0')}`,
): PendingHandoff {
  const name = `reply-${index}-${snapshot.revision}`
  const callId = identity(decodeModelCallId(call), 'call')
  return {
    kind: 'execution',
    reference: { kind: 'execution', execution: opened.execution, operation: operation(name) },
    predecessor: snapshot.revision,
    position: { step: snapshot.checkpoint.step, node: 'I3', slot: null },
    source: {
      kind: 'model-reply',
      step: snapshot.checkpoint.step,
      action: identity(decodeActionId(`core-${name}/action`), name),
      call: callId,
      result: {
        producer: { kind: 'model', call: callId },
        version: 'v1',
        delivery: null,
        source: evidence(`result/${name}`),
      },
    },
    candidate: message(`reply ${index}`, String(index % 100).padStart(2, '0'), 'assistant'),
    originalAdvance: opened.authority,
    predecessorHandoff: null,
  }
}

/**
 * Admits the model reply `index` through the public port, as the coordinator does: the P commit
 * of its H, then the Ja that resolves it with its admission fact. Answers the Ja receipt.
 */
export async function admitReply<P>(
  opened: AgentJournalCoreOpened<P>,
  index: number,
  decision: 'admitted' | 'rejected' = 'admitted',
  call?: string,
): Promise<CommandReceipt> {
  const before = await load(opened)
  const request = replyRequest(opened, before, index, call)
  const name = request.reference.operation
  await ok(opened.journal.commit(prepareCommit(opened, before, `p-${name}`, request)), `P ${name}`)
  const outcome =
    decision === 'admitted'
      ? prepared(request)
      : outcomeOf(request, {
          kind: 'rejected',
          reason: 'rejected',
          evidence: evidence(`no/${name}`),
        })
  return ok(
    opened.journal.commit(resolveCommit(opened, await load(opened), `ja-${name}`, outcome)),
    `Ja ${name}`,
  )
}
