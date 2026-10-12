import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { judgeMessage } from '@omne-harness-lite/messages'
import { prepareToolJournalEntry } from '@omne-harness-lite/tool-execution-runtime'
import {
  composeEffect,
  inspectRunnerConclusion,
  passKeys,
  type RunnerPiece,
} from '@omne-harness-lite/loop-extension-runner'
import type { PositionedSubject } from '@omne-harness-lite/loop-extension'
import {
  checkKey,
  compareInteger,
  type LogEntry,
  type SourceToken,
} from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { RuntimeOptions } from './runtime-types.ts'
import type { ToolDeliveryInput, ToolResultStored } from './tool-result-types.ts'
import { object, ToolCustodyRefusal } from './tool-custody-values.ts'
import { checkedResultSource } from './model-result-values.ts'
import { separatePermit, InvalidStateInput } from './state-values.ts'
import { CoordinationRejection } from './coordination-values.ts'
import { runtimeSemantic } from './runtime-values.ts'

export function ownToolDelivery(
  value: ToolDeliveryInput,
  scope: SessionScope,
  limit: number,
): ToolDeliveryInput {
  const { serializable, permit } = separatePermit(value)
  if (!permit) throw new InvalidStateInput()
  const input = copiedDelivery(serializable)
  const original = input.witness.original
  const intent = prepareToolJournalEntry({
    origin: original?.origin,
    value: {
      kind: 'execution_intended',
      revision: 1,
      ref: original?.ref,
      origin: original?.origin,
      input: null,
    },
  })
  if ('invalid' in intent || !checkKey(input.witness.receipt.resultKey))
    throw new InvalidStateInput()
  const message = judgeMessage(input.message)
  if ('rejected' in message || message.ok.type !== 'tool') throw new InvalidStateInput()
  checkDeliveryKeys(input.conclusions)
  runtimeSemantic(input, limit)
  return {
    ...input,
    source: checkedResultSource(input.source, scope),
    message: message.ok,
    permit: permit.value,
  }
}
function copiedDelivery(value: object): Omit<ToolDeliveryInput, 'permit'> {
  const copy = copyJsonValue(value)
  if ('failed' in copy || !object(copy.ok)) throw new InvalidStateInput()
  const data = copy.ok
  if (Object.keys(data).length !== 5 || !object(data.witness) || !object(data.witness.receipt))
    throw new InvalidStateInput()
  return data as unknown as Omit<ToolDeliveryInput, 'permit'>
}
function checkDeliveryKeys(keys: readonly string[]) {
  if (
    !Array.isArray(keys) ||
    keys.some(key => !checkKey(key)) ||
    new Set(keys).size !== keys.length
  )
    throw new InvalidStateInput()
}
export function deliverySemantic(input: ToolDeliveryInput, limit: number) {
  return runtimeSemantic(
    {
      witness: input.witness,
      result: input.result,
      conclusions: input.conclusions,
      message: input.message,
    },
    limit,
  )
}
export function verifyToolConclusions(
  options: RuntimeOptions,
  scope: SessionScope,
  source: SourceToken,
  entries: readonly LogEntry[],
  saved: ToolResultStored,
  input: ToolDeliveryInput,
) {
  const terminal = saved.result.terminal.value,
    original = saved.witness.original
  const initial: PositionedSubject = {
    position: 'after_action',
    dimension: { scope: 'each' },
    subject: {
      callId: original.ref.callId,
      outcome: terminal.terminal.outcome,
      result: terminal.delivery.result,
    },
  }
  const { actual, conclusions } = readToolPass(options, scope, source, entries, saved, initial)
  if (
    runtimeSemantic(actual, options.policy.maxRecordBytes) !==
    runtimeSemantic(input.conclusions, options.policy.maxRecordBytes)
  )
    throw new ToolCustodyRefusal('invalidSource')
  const composed = composeEffect(initial, conclusions)
  if ('invalidInput' in composed || composed.effect.kind !== 'proceed')
    throw new CoordinationRejection('retryFromFacts')
  const subject = composed.effect.subject
  if (
    !object(subject) ||
    !('result' in subject) ||
    runtimeSemantic(subject.result, options.policy.maxRecordBytes) !==
      runtimeSemantic(input.result, options.policy.maxRecordBytes)
  )
    throw new ToolCustodyRefusal('invalidSource')
  verifyToolMessage(saved, input, options.policy.maxRecordBytes)
}
function readToolPass(
  options: RuntimeOptions,
  scope: SessionScope,
  source: SourceToken,
  entries: readonly LogEntry[],
  saved: ToolResultStored,
  initial: PositionedSubject,
) {
  const terminal = saved.result.terminal.value,
    original = saved.witness.original
  const keys = passKeys({
    position: 'after_action',
    dimension: { scope: 'each' },
    anchor: terminal.delivery.pass,
  })
  if ('invalidInput' in keys || !Array.isArray(terminal.delivery.selectedChain))
    throw new CoordinationRejection('retryFromFacts')
  const selected = entries.filter(entry => entry.readKeys.includes(keys.pass))
  const chain = terminal.delivery.selectedChain as unknown as readonly RunnerPiece[]
  const conclusions = options.toolDelivery!.readConclusions({
    initial,
    anchor: terminal.delivery.pass,
    run: original.origin.run,
    binding: { ...scope, logGeneration: source.journalGeneration },
    chain,
    entries: selected,
    tail: source.tail,
  })
  if (!Array.isArray(conclusions) || conclusions.length !== chain.length)
    throw new CoordinationRejection('retryFromFacts')
  const actual = selected.map(entry => conclusionKey(scope, entry, saved))
  return { actual, conclusions }
}
function conclusionKey(scope: SessionScope, entry: LogEntry, saved: ToolResultStored) {
  const inspected = inspectRunnerConclusion({ ...scope, entry })
  if (
    'invalid' in inspected ||
    'unrelated' in inspected ||
    inspected.occurrence.kind !== 'final' ||
    inspected.execution.kind !== 'withRun' ||
    inspected.execution.run !== saved.witness.original.origin.run ||
    compareInteger(inspected.execution.attempt, saved.witness.original.origin.attempt) !== 0 ||
    !entry.dedupeKey
  )
    throw new ToolCustodyRefusal('invalidSource')
  return entry.dedupeKey
}
function verifyToolMessage(saved: ToolResultStored, input: ToolDeliveryInput, limit: number) {
  const call = saved.witness.original.ref.callId
  if (
    input.message.callId !== call ||
    input.result.callId !== call ||
    input.result.outcome !== saved.result.terminal.value.terminal.outcome ||
    runtimeSemantic(input.message.blocks[0], limit) !== runtimeSemantic(input.result, limit)
  )
    throw new ToolCustodyRefusal('invalidSource')
}
