import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  ControlProgress,
  ControlReceipt,
  ControlRecord,
  DurableEvidence,
  ToolControl,
  ToolOperationId,
} from '@omne-harness/tool-contract'
import type { ControlDispatch } from '@omne-harness/tool-contract/provider'
import { invalid, type MutationInput } from './boundary.ts'
import { mintEvidence } from './evidence.ts'
import {
  operationRecord,
  put,
  recall,
  reply,
  type Decision,
  type Mint,
  type Snapshot,
} from './ledger-decider.ts'
import { sameFactValue } from './ledger-facts.ts'
import { taskKey, type CallRecord } from './ledger-store.ts'

type Command = MutationInput<unknown> & Readonly<{ inputDigest: string }>
type ControlCommand = Command & Readonly<{ intent: ToolControl }>
type ProgressCommand = Command &
  Readonly<{
    control: ToolOperationId
    source: DurableEvidence
    progress: ControlProgress
    qualificationDenied: boolean
  }>

function withControls(
  call: CallRecord,
  controls: readonly ControlRecord[],
  mint: Mint,
): CallRecord {
  const { source: _source, ...body } = call.state
  const state = { ...body, controls, revision: mint.revision }
  return {
    ...call,
    state: {
      ...state,
      source: mintEvidence('state', { tenant: call.tenant, call: call.call }, mint.revision, state),
    },
  }
}

export function decideControl<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: ControlCommand,
  mint: Mint,
): Decision<ControlReceipt, B> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'control')
  if ('failure' in known) return reply(known)
  if (known.ok?.receipt.kind === 'control') return reply(succeed(known.ok.receipt.control))
  const call = snapshot.call
  if (call === null) return reply(invalid('call', 'unknown-call'))
  if (
    command.intent.kind !== 'stop' ||
    call.start === null ||
    (call.state.execution.kind !== 'live' && call.state.execution.kind !== 'ended')
  )
    return reply(
      fail({
        kind: 'unsupported',
        adoption: call.request.availability.definition.adoption,
        reason: 'control currently requires a stop of an original started invocation',
      }),
    )
  const source = mintEvidence(
    'operation',
    { tenant: call.tenant, call: call.call, operation: command.operation },
    mint.revision,
    { intent: command.intent, start: call.start },
  )
  const ended = call.state.execution.kind === 'ended'
  const control: ControlRecord = {
    operation: command.operation,
    intent: command.intent,
    source,
    progress: ended
      ? { kind: 'already-ended', evidence: call.state.source }
      : { kind: 'pending', diagnostic: 'stop-not-dispatched' },
  }
  const revised = withControls(call, [...call.state.controls, control], mint)
  const receipt: ControlReceipt = {
    operation: command.operation,
    state: revised.state,
    progress: control.progress,
  }
  const dispatch: ControlDispatch = {
    tenant: call.tenant,
    call: call.call,
    operation: command.operation,
    adoption: call.start.executor,
    inputDigest: command.inputDigest,
    start: call.start,
    intent: command.intent,
    source,
  }
  return {
    kind: 'commit',
    value: receipt,
    writes: [
      put({ kind: 'call', call: revised }),
      put(operationRecord(command, { kind: 'control', control: receipt }, mint)),
      ...(ended
        ? []
        : [
            put<B>({
              kind: 'task',
              task: {
                kind: 'stop',
                operation: command.operation,
                state: 'pending',
                diagnostic: null,
                control: dispatch,
              },
            }),
          ]),
    ],
  }
}

export function controlFinished(progress: ControlProgress): boolean {
  return (
    progress.kind === 'stopped' ||
    progress.kind === 'already-ended' ||
    progress.kind === 'rejected' ||
    progress.kind === 'relation-changed'
  )
}

export function decideRecordControl<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  command: ProgressCommand,
  mint: Mint,
): Decision<ControlRecord, B> {
  const known = recall(snapshot, command.operation, command.inputDigest, 'record-control')
  if ('failure' in known) return reply(known)
  if (known.ok?.receipt.kind === 'record-control') return reply(succeed(known.ok.receipt.control))
  const call = snapshot.call
  if (call === null) return reply(invalid('call', 'unknown-call'))
  const original = call.state.controls.find(item => item.operation === command.control)
  if (original === undefined || !sameFactValue(original.source, command.source))
    return reply(invalid('control', 'not-original-control'))
  if (controlFinished(original.progress)) {
    return sameFactValue(original.progress, command.progress)
      ? reply(succeed(original))
      : reply(fail({ kind: 'conflict', operation: command.control }))
  }
  const task = snapshot.tasks.find(
    item => item.kind === 'stop' && item.operation === command.control,
  )
  if (task?.kind !== 'stop' || !sameFactValue(task.control.start, call.start))
    return reply(invalid('control', 'not-original-execution'))
  if (command.progress.kind === 'relation-changed')
    return reply(invalid('progress', 'stop-cannot-change-relation'))
  const progress: ControlProgress = command.qualificationDenied
    ? {
        kind: 'rejected',
        reason: 'control-qualification-denied',
        evidence: mintEvidence(
          'operation',
          { tenant: call.tenant, call: call.call, operation: command.operation },
          mint.revision,
          { control: command.control, reason: 'control-qualification-denied' },
        ),
      }
    : command.progress
  const control: ControlRecord = { ...original, progress }
  const revised = withControls(
    call,
    call.state.controls.map(item => (item.operation === command.control ? control : item)),
    mint,
  )
  return {
    kind: 'commit',
    value: control,
    writes: [
      put({ kind: 'call', call: revised }),
      put(operationRecord(command, { kind: 'record-control', control }, mint)),
      controlFinished(control.progress)
        ? { kind: 'delete', key: taskKey(task) }
        : put({
            kind: 'task',
            task: {
              ...task,
              diagnostic: 'diagnostic' in control.progress ? control.progress.diagnostic : null,
            },
          }),
    ],
  }
}
