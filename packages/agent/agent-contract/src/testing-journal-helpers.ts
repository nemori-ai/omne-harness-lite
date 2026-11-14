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

export interface AgentJournalCoreOpened<P> {
  readonly journal: AgentJournal<P>
  readonly access: Access<P>
  readonly execution: AgentExecutionId
  readonly receipt: CommandReceipt
  readonly authority: Authority
  readonly checkpoint: AgentCheckpoint
  readonly acceptInput: (name: string) => Promise<AcceptedInput>
  readonly produceResult?: (name: string) => Promise<
    Readonly<{
      result: ProducedResult
      consumption: ConsumptionId
      transfer: Parameters<AgentJournal<P>['recordResult']>[0]['transfer']
    }>
  >
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
  readonly otherAccess?: Access<P>
  readonly takeover?: (name: string) => Promise<Authority>
  readonly installation?: CancellationPolicyInstallation | null
  readonly hostRecord?: (record: TestHostRecord) => Promise<DurableEvidence>
  readonly seedLegacyCandidate?: (
    name: string,
  ) => Promise<Readonly<{ candidate: AgentOperationId }>>
  readonly qualify?: (held: readonly SettlementQualification[]) => void
  readonly replyAdmissions?: AgentJournalReplyAdmissionControls<P>
}

export type ReplyAdmissionDamage =
  | Readonly<{ kind: 'missing-fact'; sequence: number }>
  | Readonly<{ kind: 'missing-basis'; sequence: number }>
  | Readonly<{ kind: 'retention'; from: number }>
  | Readonly<{ kind: 'range-unavailable'; below: number }>

export type ReplyAdmissionReadStatistics = Readonly<{
  seeks: number
  scanned: number
  decoded: number
  pages: number
  folds: number
  loads: number
  checkpointWrites: number
}>

export interface AgentJournalReplyAdmissionControls<P> {
  seed(count: number): Promise<void>
  damage(damage: ReplyAdmissionDamage): Promise<void>
  limitPages(limits: Readonly<{ items: number | null; bytes: number | null }>): void
  statistics(): ReplyAdmissionReadStatistics
  changeRule(rule: Adoption, conversion: 'rebuild' | 'none'): Promise<void>
  readable(allowed: boolean): void
  sibling(name: string): Promise<AgentJournalCoreOpened<P>>
  foreign(name: string): Promise<AgentJournalCoreOpened<P>>
}

export type SettlementQualification = 'settle' | 'migrate-cancellation' | 'reconcile'

export type AgentJournalCoreOpenOptions = Readonly<{
  cancellationPolicy?: 'installed' | 'absent'
}>

export interface AgentJournalCoreFixture<P> {
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
        checkpoint: { ...snapshot.checkpoint, inputBatch: taken.batch },
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

export function intentOf(snapshot: ExecutionSnapshot): FinishIntent {
  assert.equal(snapshot.state.kind, 'settling', 'the execution should be settling')
  if (snapshot.state.kind !== 'settling') throw new Error('unreachable')
  return snapshot.state.intent
}

export function candidateOf(snapshot: ExecutionSnapshot): AgentOperationId {
  const candidate = snapshot.settlement.candidate
  assert.ok(candidate !== null, 'the settlement should carry a current candidate')
  return candidate.candidate
}

export function advancement(authority: Authority): FinishAuthorization {
  return { kind: 'advancement', authority }
}

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

export function failedContent(name: string): Partial<FinishCandidateContent> {
  return { conclusion: { kind: 'fail', cause: evidence(`cause/${name}`) } }
}

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

export function installationOf<P>(
  opened: AgentJournalCoreOpened<P>,
): CancellationPolicyInstallation {
  assert.ok(
    opened.installation !== undefined && opened.installation !== null,
    'the fixture should hold the test installation',
  )
  return opened.installation
}

export async function requireInstallation<P>(opened: AgentJournalCoreOpened<P>): Promise<boolean> {
  if (opened.installation !== undefined) return true
  await uncoveredCase('', 'cancellation policy installation').run()
  return false
}

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

export const MISSING_EXECUTION: AgentExecutionId = identity(
  decodeAgentExecutionId('core-missing-execution'),
  'missing execution',
)

export async function requireOtherAccess<P>(
  opened: AgentJournalCoreOpened<P>,
): Promise<Access<P> | undefined> {
  if (opened.otherAccess !== undefined) return opened.otherAccess
  await uncoveredCase('', 'otherAccess control').run()
  return undefined
}

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
