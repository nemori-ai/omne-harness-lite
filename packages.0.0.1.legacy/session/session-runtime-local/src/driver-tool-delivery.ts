import { judgeMessage } from '@omne-harness-lite/messages'
import { modelLogJsonEqual as equal } from '@omne-harness-lite/model-request-runtime'
import {
  composeEffect,
  inspectRunnerConclusion,
  passKeys,
  type RunnerDispatchRequest,
} from '@omne-harness-lite/loop-extension-runner'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { SessionLifecycleStep } from '@omne-harness-lite/session-runtime'
import type { BorrowedRunJournal } from './run-journal-types.ts'
import type { LocalSessionDriverOptions, SessionDriverRunSources } from './driver-types.ts'
import type { DriverToolWork } from './driver-tool-run.ts'
import { DriverHistoryInvalid, requireHistory } from './driver-model-history.ts'
import type { ToolDeliveryInput } from './tool-result-types.ts'
import { compareInteger } from '@omne-harness-lite/session-log'

type AfterRequest = Extract<
  RunnerDispatchRequest,
  { readonly position: 'after_action'; readonly dimension: { readonly scope: 'each' } }
>

type Input = {
  readonly ingress: LocalSessionDriverOptions['ingress']
  readonly journal: BorrowedRunJournal
  readonly scope: SessionScope
  readonly runner: SessionDriverRunSources['actions']['runner']
  readonly permit: Extract<SessionLifecycleStep, { kind: 'prepareCall' }>['permit']
  readonly signal: AbortSignal
  readonly work: DriverToolWork
}
/** Dispatch the original after-action pass only after actual immutable custody, then confirm one ordinary message. */
export async function deliverDriverToolWork(input: Input) {
  try {
    const work = input.work
    requireHistory(
      work.custody !== undefined && work.stopped,
      'original stopped and custodied Tool required',
    )
    if (input.signal.aborted) return { failure: 'withdrawn' as const }
    const request = afterAction(input)
    const dispatched = await input.runner.dispatch(request, input.signal)
    if ('failure' in dispatched || dispatched.effect.kind !== 'proceed')
      return { failure: 'unavailable' as const }
    requireHistory(
      equal(dispatched.chain, work.custody.result.terminal.value.delivery.selectedChain),
      'original selected after-action chain required',
    )
    const { attempt: _attempt, ...replayRequest } = request
    const replay = await input.runner.replay(replayRequest)
    requireHistory(Array.isArray(replay), 'actual original after-action replay required')
    const effect = composeEffect(
      { position: request.position, dimension: request.dimension, subject: request.subject },
      replay,
    )
    requireHistory(
      'effect' in effect && equal(effect.effect, dispatched.effect),
      'original after-action effect changed',
    )
    const read = await input.journal.readPrefix()
    requireHistory(!('failure' in read), 'actual delivery prefix required')
    const keys = conclusionKeys(input, request, read.entries)
    const message = judgeMessage({
      id: `${work.identities.adoptionKey}:message`,
      type: 'tool',
      callId: work.request.call.callId,
      createdAt: work.custody.result.terminal.value.account.wallClock.endedAt,
      blocks: [
        'result' in dispatched.effect.subject ? dispatched.effect.subject.result : undefined,
      ],
    })
    requireHistory(
      'ok' in message && message.ok.type === 'tool',
      'ordinary original Tool message required',
    )
    const delivery: ToolDeliveryInput = Object.freeze({
      witness: work.custody.witness,
      source: read.source,
      permit: input.permit,
      result: message.ok.blocks[0],
      conclusions: keys,
      message: message.ok,
    })
    work.deliveryInput = delivery
    const confirmed = await input.ingress.toolDelivery.confirm(
      input.ingress.coordinationAuthority,
      input.scope,
      delivery,
    )
    work.deliveryResult = confirmed
    return confirmed
  } catch (error) {
    if (error instanceof DriverHistoryInvalid) return { failure: 'unavailable' as const }
    throw error
  }
}
function afterAction(input: Input): AfterRequest {
  const original = input.work.custody!.witness.original,
    terminal = input.work.custody!.result.terminal.value
  return {
    position: 'after_action',
    dimension: { scope: 'each' },
    subject: {
      callId: original.ref.callId,
      outcome: terminal.terminal.outcome,
      result: terminal.delivery.result,
    },
    anchor: terminal.delivery.pass,
    manifest: input.scope.session,
    run: original.origin.run,
    attempt: original.origin.attempt,
  }
}
function conclusionKeys(
  input: Input,
  request: AfterRequest,
  entries: readonly import('@omne-harness-lite/session-log').LogEntry[],
) {
  const keys = passKeys({
    position: request.position,
    dimension: request.dimension,
    anchor: request.anchor,
  })
  requireHistory(!('invalidInput' in keys), 'original after-action pass keys required')
  const original = input.work.custody!.witness.original
  return entries
    .filter(entry => entry.readKeys.includes(keys.pass))
    .map(entry => {
      const inspected = inspectRunnerConclusion({ ...input.scope, entry })
      requireHistory(
        'conclusion' in inspected &&
          inspected.occurrence.kind === 'final' &&
          inspected.execution.kind === 'withRun' &&
          inspected.execution.run === original.origin.run &&
          compareInteger(inspected.execution.attempt, original.origin.attempt) === 0 &&
          entry.dedupeKey !== undefined,
        'original complete after-action conclusion required',
      )
      return entry.dedupeKey
    })
}
