import {
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeAgentOperationId,
  decodeConsumptionId,
  decodeInputId,
  decodePassageId,
  decodeStepId,
  decodeActionId,
  decodeExecutionAttachmentId,
  type AcceptedInput,
  type Adoption,
  type AgentCheckpoint,
  type AgentExecutionId,
  type AgentInstanceId,
  type AgentJournal,
  type AgentJournalEntries,
  type AgentJournalEntry,
  type AgentOperationId,
  type FinishAuthorization,
  type FinishCandidateContent,
  type FinishIntent,
  type Authority,
  type CommandReceipt,
  type DurableEvidence,
  type ExecutionSnapshot,
  type HandoffOutcome,
  type InvokeRuntimeContext,
  type JournalCommit,
  type JournalSubmitLineage,
  type ModelReplyAdmission,
  type OriginalInputAcceptance,
  type Passage,
  type ProducedResult,
} from '@omne-harness/agent-contract'
import { judgeMessage, type Message } from '@omne-harness/message'
import { decodeModelCallId } from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import { testCancellationPolicyInstallation } from '@omne-harness/agent-contract/testing'

export type Principal = string
export type Journal = AgentJournal<Principal>

export const tenantA = testingTenant(`org_${'0'.repeat(26)}`, `acc_${'1'.repeat(26)}`)
export const tenantB = testingTenant(`org_${'2'.repeat(26)}`, `acc_${'3'.repeat(26)}`)
export const access = { principal: 'alice', tenant: tenantA } as const
export const otherTenant = { principal: 'mallory', tenant: tenantB } as const

export function ok<T, F>(outcome: Outcome<T, F>): T {
  if ('failure' in outcome)
    throw new Error(`expected success, got ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

export function failure<T, F>(outcome: Outcome<T, F>): F {
  if (!('failure' in outcome))
    throw new Error(`expected failure, got ${JSON.stringify(outcome.ok)}`)
  return outcome.failure
}

function decoded<T>(outcome: Outcome<T, unknown>): T {
  return ok(outcome)
}

export const execution = (text = 'exec-1'): AgentExecutionId =>
  decoded(decodeAgentExecutionId(text))
export const operation = (text: string) => decoded(decodeAgentOperationId(text))
export const instance = (text = 'instance-1') => decoded(decodeAgentInstanceId(text))
export const inputId = (text: string) => decoded(decodeInputId(text))
export const consumption = (text: string) => decoded(decodeConsumptionId(text))
export const passageId = (text: string) => decoded(decodePassageId(text))
export const attachment = (text = 'attachment-1') => decoded(decodeExecutionAttachmentId(text))
export const modelCall = (text: string) => decoded(decodeModelCallId(`mcall_${text}`))

export function evidence(record: string): DurableEvidence {
  return { owner: 'journal-test', record, revision: '1', digest: `test:${record}` }
}

export function adoption(name: string): Adoption {
  return { owner: 'journal-test', name, revision: '1', digest: `test:${name}` }
}

export function message(text: string, suffix = '01'): Message {
  const judged = judgeMessage({
    id: `msg_${'a'.repeat(22)}${suffix}`,
    role: 'user',
    blocks: [
      { kind: 'text', id: `blk_${suffix}`, visibility: { toHuman: true, toModel: true }, text },
    ],
  })
  if (!('ok' in judged)) throw new Error(`test message rejected: ${JSON.stringify(judged)}`)
  return judged.ok
}

export function acceptedInput(id: string, text = id): AcceptedInput {
  return { id: inputId(id), content: message(text), source: null, priority: 'ordinary' }
}

export function checkpoint(position = 'E3', passages: readonly Passage[] = []): AgentCheckpoint {
  return {
    schema: adoption('checkpoint'),
    definition: adoption('definition'),
    step: decoded(decodeStepId('step-1')),
    position,
    calls: [],
    passages,
    batch: null,
    inputBatch: null,
    requestPreparation: null,
    compaction: null,
    adoptedContext: null,
    guard: null,
    completedPassages: [],
    priorConditions: null,
    currentHandoff: null,
    replyAdmissionRead: { kind: 'unverified' },
    voided: [],
  }
}

function preparedOutcome(
  request: Extract<HandoffOutcome['request'], { kind: 'input' }>,
  origin: HandoffOutcome['origin'],
): HandoffOutcome {
  const entry = request.entry
  const value = entry.kind === 'invoke' ? entry.initial : entry.value
  return {
    request,
    origin,
    provider: adoption('message-handoff'),
    qualification: evidence(`qualification/${entry.operation}`),
    record: evidence(`handoff/${entry.operation}`),
    decision: {
      kind: 'prepared',
      message: value.content,
      admission: evidence(`admission/${entry.operation}`),
    },
  }
}

export function runtimeContext(
  instanceId: AgentInstanceId = instance(),
  grant: DurableEvidence | null = null,
): InvokeRuntimeContext {
  return {
    instance: instanceId,
    scope: evidence('scope'),
    definition: adoption('definition'),
    grant,
  }
}

export function invokeAcceptance(
  id: AgentExecutionId,
  op: AgentOperationId,
  initial: AcceptedInput,
  runtime: InvokeRuntimeContext = runtimeContext(),
): OriginalInputAcceptance {
  const entry = { kind: 'invoke' as const, operation: op, execution: id, initial }
  const handoff = { kind: 'input' as const, execution: id, entry: op, input: initial.id }
  return {
    entry,
    handoff,
    outcome: preparedOutcome(
      {
        kind: 'input',
        reference: handoff,
        entry,
        source: { kind: 'external-input', input: initial.id },
      },
      { kind: 'invoke', ...runtime },
    ),
  }
}

export function newInput(
  id: AgentExecutionId,
  op: AgentOperationId,
  value: AcceptedInput,
): JournalSubmitLineage {
  const entry = { kind: 'submit' as const, operation: op, execution: id, value }
  const handoff = { kind: 'input' as const, execution: id, entry: op, input: value.id }
  return {
    kind: 'new-input',
    original: {
      entry,
      handoff,
      outcome: preparedOutcome(
        {
          kind: 'input',
          reference: handoff,
          entry,
          source: { kind: 'external-input', input: value.id },
        },
        {
          kind: 'submit',
          executionBinding: evidence(`binding/${id}`),
          delivery: { kind: 'durable-view' },
        },
      ),
    },
  }
}

type SubmitInput = Parameters<Journal['submit']>[0]
type PlainSubmit = Omit<SubmitInput, 'lineage'> & Readonly<{ lineage?: JournalSubmitLineage }>

export function withLineage(input: PlainSubmit): SubmitInput {
  const { lineage, ...rest } = input
  return { ...rest, lineage: lineage ?? newInput(rest.execution, rest.operation, rest.value) }
}

type OpenInput = Parameters<Journal['open']>[0]
type PlainOpen = Omit<OpenInput, 'original' | 'runtime' | 'checkpoint'> &
  Readonly<{
    instance?: AgentInstanceId
    grant?: DurableEvidence | null
    initial?: AcceptedInput
    checkpoint?: AgentCheckpoint
  }>

export function openInput(input: PlainOpen): OpenInput {
  const { instance: instanceId, grant, initial, checkpoint: initialCheckpoint, ...rest } = input
  const runtime = runtimeContext(instanceId ?? instance(), grant ?? null)
  return {
    ...rest,
    original: invokeAcceptance(
      rest.execution,
      rest.operation,
      initial ?? acceptedInput('input-1'),
      runtime,
    ),
    runtime,
    checkpoint: initialCheckpoint ?? checkpoint(),
  }
}

export function afterTerminalPassage(id: string): Passage {
  return {
    id: passageId(id),
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
    implementation: adoption('observer'),
    input: evidence(`passage/${id}/input`),
    effective: evidence(`passage/${id}/effective`),
    operations: [],
    progress: { kind: 'requested', mode: { kind: 'fresh' } },
  }
}

export function producedResult(call: string, version = 'v1'): ProducedResult {
  return {
    producer: { kind: 'model', call: modelCall(call) },
    version,
    delivery: null,
    source: evidence(`result/${call}/${version}`),
  }
}

export function replyAdmission(
  call: string,
  decision: ModelReplyAdmission['decision'],
  version = 'v1',
): ModelReplyAdmission {
  return {
    step: decoded(decodeStepId('step-1')),
    action: decoded(decodeActionId(`action-${call}`)),
    call: modelCall(call),
    resultVersion: version,
    decision,
    source: evidence(`admission/${call}/${version}/${decision}`),
  }
}

export type Opened = Readonly<{
  execution: AgentExecutionId
  receipt: CommandReceipt
  authority: Authority
}>

export async function open(journal: Journal, id = 'exec-1', initial = 'input-1'): Promise<Opened> {
  const opened = ok(
    await journal.open(
      openInput({
        ...access,
        execution: execution(id),
        operation: operation(`open-${id}`),
        initial: acceptedInput(initial),
      }),
    ),
  )
  return { execution: execution(id), ...opened }
}

export async function load(journal: Journal, id: AgentExecutionId): Promise<ExecutionSnapshot> {
  return ok(await journal.load({ ...access, execution: id }))
}

export function commitAt(
  snapshot: ExecutionSnapshot,
  authority: Authority,
  name: string,
  overrides: Partial<JournalCommit<Principal>> = {},
): JournalCommit<Principal> {
  return {
    ...access,
    execution: snapshot.execution,
    operation: operation(name),
    authority,
    expected: snapshot.revision,
    checkpoint: checkpoint(name),
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

export async function fixCandidate(
  journal: Journal,
  opened: Opened,
  name = 'finish',
  overrides: Partial<FinishCandidateContent> = {},
) {
  const snapshot = await load(journal, opened.execution)
  return journal.commit(
    commitAt(snapshot, snapshot.executionAttachment ?? opened.authority, `${name}/F1`, {
      checkpoint: { ...snapshot.checkpoint, position: 'F1' },
      state: { kind: 'settling' },
      finish: candidateContent(snapshot, name, overrides),
    }),
  )
}

export async function proveBeforeTerminal(journal: Journal, opened: Opened, name = 'finish') {
  const snapshot = await load(journal, opened.execution)
  return journal.commit(
    commitAt(snapshot, snapshot.executionAttachment ?? opened.authority, `${name}/F2`, {
      checkpoint: { ...snapshot.checkpoint, position: 'F2' },
      state: { kind: 'settling' },
    }),
  )
}

export async function prepareFinish(
  journal: Journal,
  opened: Opened,
  name = 'finish',
  authorization: FinishAuthorization = {
    kind: 'advancement',
    authority: opened.authority,
  },
) {
  const snapshot = await load(journal, opened.execution)
  const candidate = snapshot.settlement.candidate
  if (candidate === null) throw new Error('no current candidate to prepare')
  return journal.prepareFinish({
    ...access,
    execution: opened.execution,
    operation: operation(`${name}/prepare`),
    authorization,
    expected: snapshot.revision,
    candidate: candidate.candidate,
  })
}

export function cancelAuthorization(
  snapshot: ExecutionSnapshot,
  control: AgentOperationId,
): Extract<FinishAuthorization, { kind: 'cancel' }> {
  const found = snapshot.controls.find(record => record.operation === control)
  if (found === undefined) throw new Error(`the control ${control} is not saved`)
  return { kind: 'cancel', control, source: found.stages.accepted.source }
}

export async function establishCancellation(
  journal: Journal,
  opened: Opened,
  control: AgentOperationId,
  name = 'establish',
) {
  const snapshot = await load(journal, opened.execution)
  return journal.commitSettlement({
    ...access,
    execution: opened.execution,
    operation: operation(name),
    kind: 'establish-cancellation',
    authorization: cancelAuthorization(snapshot, control),
    expected: snapshot.revision,
    installation: testCancellationPolicyInstallation.record,
    predecessor: snapshot.settlement.candidate?.candidate ?? null,
  })
}

export async function judgeCancellation(
  journal: Journal,
  opened: Opened,
  control: AgentOperationId,
  name = 'judge',
) {
  const snapshot = await load(journal, opened.execution)
  const candidate = snapshot.settlement.candidate
  const route = snapshot.settlement.route
  if (candidate === null || route === null) throw new Error('no cancellation candidate to judge')
  return journal.commitSettlement({
    ...access,
    execution: opened.execution,
    operation: operation(name),
    kind: 'judge-cancellation',
    authorization: cancelAuthorization(snapshot, control),
    expected: snapshot.revision,
    candidate: candidate.candidate,
    route: route.record,
    installation: testCancellationPolicyInstallation.record,
  })
}

export async function cancelledInput(
  journal: Journal,
  opened: Opened,
  control: AgentOperationId,
  name = 'cancelled',
) {
  if ((await load(journal, opened.execution)).state.kind !== 'ended') {
    ok(await establishCancellation(journal, opened, control, `${name}/establish`))
    ok(await judgeCancellation(journal, opened, control, `${name}/judge`))
    const prepared = await load(journal, opened.execution)
    ok(await prepareFinish(journal, opened, name, cancelAuthorization(prepared, control)))
  }
  const snapshot = await load(journal, opened.execution)
  return {
    ...access,
    execution: opened.execution,
    operation: operation(name),
    authorization: cancelAuthorization(snapshot, control),
    expected: snapshot.revision,
    intent: intentOf(snapshot),
  } as const
}

export async function finishCancelled(
  journal: Journal,
  opened: Opened,
  control: AgentOperationId,
  name = 'cancelled',
) {
  return journal.tryFinish(await cancelledInput(journal, opened, control, name))
}

export function intentOf(snapshot: ExecutionSnapshot): FinishIntent {
  if (snapshot.state.kind === 'settling') return snapshot.state.intent
  const candidate = snapshot.settlement.candidate
  if (candidate === null) throw new Error('the snapshot has no candidate')
  const route = snapshot.settlement.route
  return {
    candidate: candidate.candidate,
    conclusion: candidate.conclusion,
    inputWatermark: candidate.inputWatermark,
    obligations: snapshot.finishObligations?.evidence ?? null,
    beforeTerminal:
      route?.kind === 'author'
        ? route.beforeTerminal
        : (snapshot.settlement.judgments.find(
            item => item.operation === snapshot.settlement.currentJudgment,
          )?.evidence ?? null),
    failure: candidate.failure,
  }
}

export async function finishInput(journal: Journal, opened: Opened, name = 'finish') {
  if ((await load(journal, opened.execution)).state.kind !== 'ended') {
    ok(await fixCandidate(journal, opened, name))
    ok(await proveBeforeTerminal(journal, opened, name))
    await prepareFinish(journal, opened, name)
  }
  const snapshot = await load(journal, opened.execution)
  return {
    ...access,
    execution: opened.execution,
    operation: operation(name),
    authorization: { kind: 'advancement', authority: opened.authority },
    expected: snapshot.revision,
    intent: intentOf(snapshot),
  } as const
}

export async function takeInputs(journal: Journal, opened: Opened) {
  const snapshot = await load(journal, opened.execution)
  const taken = ok(
    await journal.inputs({
      ...access,
      execution: opened.execution,
      watermark: snapshot.inputWatermark,
    }),
  )
  return journal.commit(
    commitAt(snapshot, opened.authority, `take-inputs-${snapshot.revision}`, {
      checkpoint: { ...snapshot.checkpoint, inputBatch: taken.batch },
      events: [{ kind: 'input-taken', batch: taken.batch }],
    }),
  )
}

export async function finish(journal: Journal, opened: Opened, name = 'finish') {
  ok(await takeInputs(journal, opened))
  return journal.tryFinish(await finishInput(journal, opened, name))
}

export async function entriesOf<P>(
  entries: AgentJournalEntries<P>,
  input: Readonly<{
    principal: P
    tenant: Parameters<AgentJournalEntries<P>['read']>[0]['tenant']
  }> &
    Readonly<{ execution: AgentExecutionId }>,
): Promise<readonly AgentJournalEntry[]> {
  const found: AgentJournalEntry[] = []
  let after: string | null = null
  for (;;) {
    const page = await entries.read({ ...input, after, limit: 50 })
    if ('failure' in page) throw new Error(`entries read failed: ${JSON.stringify(page.failure)}`)
    found.push(...page.ok.items.map(item => item.entry))
    if (page.ok.caughtUp) return found
    after = page.ok.next
  }
}

export type LoadedWithEntries = ExecutionSnapshot &
  Readonly<{ entries: readonly AgentJournalEntry[] }>

export async function loadWithEntries<P>(
  ports: Readonly<{ journal: AgentJournal<P>; entries: AgentJournalEntries<P> }>,
  input: Parameters<AgentJournal<P>['load']>[0],
): Promise<LoadedWithEntries> {
  const snapshot = await ports.journal.load(input)
  if ('failure' in snapshot) throw new Error(`load failed: ${JSON.stringify(snapshot.failure)}`)
  return { ...snapshot.ok, entries: await entriesOf(ports.entries, input) }
}
