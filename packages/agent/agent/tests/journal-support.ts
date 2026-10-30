// Values and steps that the Journal tests share. They build well-formed contract values; they are not
// a Loop and decide nothing about how a coordinator uses the Journal.
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
  type AgentOperationId,
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

export type Principal = string
export type Journal = AgentJournal<Principal>

export const tenantA = testingTenant(`org_${'0'.repeat(26)}`, `acc_${'1'.repeat(26)}`)
export const tenantB = testingTenant(`org_${'2'.repeat(26)}`, `acc_${'3'.repeat(26)}`)
export const access = { principal: 'alice', tenant: tenantA } as const
export const otherTenant = { principal: 'mallory', tenant: tenantB } as const

/** The success value of an outcome; a failure fails the test with the failure in the message. */
export function ok<T, F>(outcome: Outcome<T, F>): T {
  if ('failure' in outcome)
    throw new Error(`expected success, got ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

/** The failure of an outcome; a success fails the test. */
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
  }
}

/** The prepared outcome that the test's admission provider fixed for one external entry. */
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

/** The runtime context of an invoke: the test instance, scope and definition, and the grant. */
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

/** The original acceptance of one invoke, as `open` receives it: the entry, its H and the prepared outcome. */
export function invokeAcceptance(
  id: AgentExecutionId,
  op: AgentOperationId,
  initial: AcceptedInput,
  initialCheckpoint: AgentCheckpoint = checkpoint(),
  runtime: InvokeRuntimeContext = runtimeContext(),
): OriginalInputAcceptance {
  const entry = {
    kind: 'invoke' as const,
    operation: op,
    execution: id,
    initial,
    checkpoint: initialCheckpoint,
  }
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

/** The new-input lineage of one submit: the entry of this operation, its H and the prepared outcome. */
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

/** A submit input with the new-input lineage of its own operation, unless one is given. */
export function withLineage(input: PlainSubmit): SubmitInput {
  const { lineage, ...rest } = input
  return { ...rest, lineage: lineage ?? newInput(rest.execution, rest.operation, rest.value) }
}

type OpenInput = Parameters<Journal['open']>[0]
type PlainOpen = Omit<OpenInput, 'original' | 'runtime'> &
  Readonly<{
    instance?: AgentInstanceId
    grant?: DurableEvidence | null
    initial?: AcceptedInput
    checkpoint?: AgentCheckpoint
  }>

/** An open input from its plain parts: the acceptance of the invoke and the runtime context. */
export function openInput(input: PlainOpen): OpenInput {
  const { instance: instanceId, grant, initial, checkpoint: initialCheckpoint, ...rest } = input
  const runtime = runtimeContext(instanceId ?? instance(), grant ?? null)
  return {
    ...rest,
    original: invokeAcceptance(
      rest.execution,
      rest.operation,
      initial ?? acceptedInput('input-1'),
      initialCheckpoint ?? checkpoint(),
      runtime,
    ),
    runtime,
  }
}

/** A post-terminal passage that `tryFinish` turns into a pending observation. */
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

/** Opens one execution on the independent path (null grant) and returns its first authority. */
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

/** A conditional commit at the current revision, as one coordinator step would write it. */
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
    ...overrides,
  }
}

/** The `tryFinish` input of an ordinary completion at the current revision. */
export async function finishInput(journal: Journal, opened: Opened, name = 'finish') {
  const snapshot = await load(journal, opened.execution)
  return {
    ...access,
    execution: opened.execution,
    operation: operation(name),
    authorization: { kind: 'advancement', authority: opened.authority },
    expected: snapshot.revision,
    intent: {
      conclusion: { kind: 'complete' },
      inputWatermark: snapshot.inputWatermark,
      obligations: evidence('obligations'),
      beforeTerminal: evidence('before-terminal'),
      failure: null,
    },
  } as const
}

/**
 * Takes every accepted input into one batch, as I0 would: reads the batch at the current watermark
 * and commits the checkpoint that names it. An ordinary end is blocked while inputs are untaken.
 */
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
      checkpoint: { ...snapshot.checkpoint, inputBatch: taken.batch.id },
    }),
  )
}

/** Takes the inputs, then ends through `tryFinish` with an ordinary completion. */
export async function finish(journal: Journal, opened: Opened, name = 'finish') {
  ok(await takeInputs(journal, opened))
  return journal.tryFinish(await finishInput(journal, opened, name))
}
