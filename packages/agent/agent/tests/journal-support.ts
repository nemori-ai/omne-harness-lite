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
  type AgentJournal,
  type Authority,
  type CommandReceipt,
  type Evidence,
  type ExecutionSnapshot,
  type JournalCommit,
  type ModelReplyAdmission,
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

export function evidence(record: string): Evidence {
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
    await journal.open({
      ...access,
      execution: execution(id),
      operation: operation(`open-${id}`),
      instance: instance(),
      grant: null,
      initial: acceptedInput(initial),
      checkpoint: checkpoint(),
    }),
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
