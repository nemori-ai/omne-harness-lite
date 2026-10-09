import {
  modelLogJsonEqual,
  type CallKey,
  type OpenCallInput,
  type SettlementOwner,
  type SettlementCoordinatorFactory,
  type SettlementCoordinator,
} from '@omne-harness-lite/model-request-runtime'
import {
  projectMessages,
  materializeMessages,
  type ProjectionRules,
  type ProjectionOptions,
} from '@omne-harness-lite/model-message-projection'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { checkKey } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { LocalSessionIngress, SessionLifecycleStep } from './runtime-types.ts'
import type { StepReceipt } from '@omne-harness-lite/session-runtime'
import type { PendingModelResponse } from '@omne-harness-lite/model-response'
import type { SessionModelResultSource, CapturedSessionModelReply } from './model-result-source.ts'
import { createSessionRunHistory } from './run-history.ts'
import type { SessionRunModelBinding } from './model-binding.ts'

type Preparation = Extract<SessionLifecycleStep, { kind: 'prepareCall' }>
type CallInput = Pick<
  OpenCallInput,
  'creationKey' | 'target' | 'basis' | 'parameters' | 'tools' | 'host' | 'observer'
> & {
  readonly report: NonNullable<OpenCallInput['report']>
}
export interface RetainedSessionModelTurn {
  readonly stage: string
  readonly reason: unknown
  readonly captured?: CapturedSessionModelReply
  readonly coordinator?: SettlementCoordinator
}
export interface SessionModelTurnOptions {
  readonly ingress: LocalSessionIngress
  readonly scope: SessionScope
  readonly preparation: Preparation
  readonly linked: SessionRunModelBinding
  readonly source: SessionModelResultSource
  readonly call: CallInput
  readonly projection: { readonly rules: ProjectionRules; readonly options?: ProjectionOptions }
  readonly settlement: {
    readonly factory: SettlementCoordinatorFactory
    readonly owner: SettlementOwner
  }
  readonly resultKey: string
  readonly adoptionKey: string
  /** The host retains this original turn, binding and any private handles before return. */
  readonly retain: (retained: RetainedSessionModelTurn) => Promise<void>
}
export type SessionModelTurnResult =
  | {
      readonly acknowledged: true
      readonly pending: PendingModelResponse
      readonly adoption: StepReceipt
    }
  | { readonly retained: true; readonly stage: string }

/** Execute one already-prepared turn. The running host, not the terminal client, owns it. */
export async function runSessionModelTurn(
  options: SessionModelTurnOptions,
): Promise<SessionModelTurnResult> {
  checkTurn(options)
  const turn = new ModelTurn(options)
  try {
    return await turn.run()
  } catch (error) {
    if (turn.retentionAttempted) throw error
    try {
      await turn.retain(error)
    } catch (retentionError) {
      throw new AggregateError(
        [error, retentionError],
        'model turn and responsibility retention failed',
      )
    }
    throw error
  }
}
function checkTurn(options: SessionModelTurnOptions) {
  const log = options.linked.binding.log
  if (
    !checkKey(options.resultKey) ||
    !checkKey(options.adoptionKey) ||
    typeof options.retain !== 'function'
  )
    throw new TypeError('original result, adoption keys and host retention required')
  if (log.session !== options.scope.session || !tenantIdEquals(log.tenant, options.scope.tenant))
    throw new TypeError('original Session model binding required')
}
class ModelTurn {
  stage = 'projection'
  retentionAttempted = false
  captured?: CapturedSessionModelReply
  coordinator?: SettlementCoordinator
  constructor(readonly options: SessionModelTurnOptions) {}
  async retain(reason: unknown): Promise<Extract<SessionModelTurnResult, { retained: true }>> {
    this.retentionAttempted = true
    await this.options.retain({
      stage: this.stage,
      reason,
      ...(this.captured ? { captured: this.captured } : {}),
      ...(this.coordinator ? { coordinator: this.coordinator } : {}),
    })
    return { retained: true, stage: this.stage }
  }
  async prefix() {
    return await this.options.linked.binding.log.readPrefix?.()
  }
  async run(): Promise<SessionModelTurnResult> {
    const started = await this.start()
    if ('retained' in started) return started
    const adopted = await this.adopt()
    if ('retained' in adopted) return adopted
    const settled = await this.settle()
    if ('retained' in settled) return settled
    return await this.finish(started.ref, started.pending, adopted.adoption)
  }
  async messages(): Promise<
    { messages: OpenCallInput['messages'] } | Extract<SessionModelTurnResult, { retained: true }>
  > {
    const prefix = await this.prefix()
    if (!prefix || 'failure' in prefix) return await this.retain(prefix)
    const projected = projectMessages(
      { source: prefix.source, entries: prefix.entries, rules: this.options.projection.rules },
      this.options.projection.options,
    )
    if (!('projected' in projected)) return await this.retain(projected)
    const messages = materializeMessages(projected.projected)
    if (!('materialized' in messages)) return await this.retain(messages)
    return { messages: messages.materialized }
  }
  async start(): Promise<
    | { ref: CallKey; pending: PendingModelResponse }
    | Extract<SessionModelTurnResult, { retained: true }>
  > {
    const { options } = this
    const projected = await this.messages()
    if ('retained' in projected) return projected
    this.stage = 'open'
    const opened = await options.linked.operations.openCall({
      ...options.call,
      session: options.scope.session,
      run: options.preparation.run,
      attempt: options.preparation.attempt,
      messages: projected.messages,
    })
    if (!('ref' in opened)) return await this.retain(opened)
    if (opened.ref.callId !== options.preparation.call)
      throw new TypeError('native call does not match the original Session preparation')
    this.stage = 'dispatch'
    const dispatched = await options.linked.operations.dispatch({
      ...opened.ref,
      attempt: options.preparation.attempt,
    })
    if (!('replyPending' in dispatched)) return await this.retain(dispatched)
    this.stage = 'capture'
    const capture = await options.source.capture(options.scope, opened.ref.callId)
    if ('failure' in capture) return await this.retain(capture)
    this.captured = capture.captured
    if (!modelLogJsonEqual(this.captured.pending, dispatched.replyPending))
      throw new TypeError('native result capture does not match the original dispatch')
    return { ref: opened.ref, pending: dispatched.replyPending }
  }
  async finish(
    ref: CallKey,
    pending: PendingModelResponse,
    adoption: StepReceipt,
  ): Promise<SessionModelTurnResult> {
    this.stage = 'release'
    const released = await this.options.source.release(this.captured!)
    if (!('released' in released)) return await this.retain(released)
    delete this.captured
    this.stage = 'ack'
    const ack = await this.options.linked.operations.acknowledgeCall({
      ref,
      expectedResult: { kind: 'response', response: pending.id },
    })
    if (!('acknowledged' in ack)) return await this.retain(ack)
    return { acknowledged: true, pending, adoption }
  }
  async adopt(): Promise<
    { adoption: StepReceipt } | Extract<SessionModelTurnResult, { retained: true }>
  > {
    const { options } = this
    this.stage = 'custody'
    const prefix = await this.prefix()
    if (!prefix || 'failure' in prefix) return await this.retain(prefix)
    const saved = await options.ingress.modelResults.store(
      options.ingress.coordinationAuthority,
      options.scope,
      {
        resultKey: options.resultKey,
        source: prefix.source,
        pending: this.captured!.pending,
      },
    )
    if (!('pending' in saved)) return await this.retain(saved)
    this.stage = 'adoption'
    const adopted = await options.ingress.lifecycle.commitStep(
      options.ingress.coordinationAuthority,
      options.scope,
      saved.witness.receipt.source,
      {
        kind: 'adoptResult',
        stepKey: options.adoptionKey,
        run: options.preparation.run,
        attempt: options.preparation.attempt,
        permit: options.preparation.permit,
        result: saved.witness.receipt,
      },
    )
    if (!('kind' in adopted) || adopted.kind !== 'committed') return await this.retain(adopted)
    return { adoption: adopted.receipt }
  }
  async settle(): Promise<{ settled: true } | Extract<SessionModelTurnResult, { retained: true }>> {
    const { options } = this,
      pending = this.captured!.pending
    this.stage = 'settlement'
    this.coordinator = options.settlement.factory.create({
      owner: options.settlement.owner,
      binding: options.linked.binding.log,
      run: createSessionRunHistory(options.scope),
    })
    const task = this.coordinator.settle({
      target: { call: pending.call.callId, dispatch: pending.dispatch, response: pending.id },
      current: { messageId: pending.reply.id, disposition: 'persisted' },
      response: { ...pending, replyDisposition: 'persisted' },
    })
    // Stopped is independent of the public result; do not release resources on completion alone.
    const [result, stopped] = await Promise.allSettled([task.completion, task.stopped])
    if (result.status === 'rejected' || stopped.status === 'rejected') {
      const errors = [result, stopped].flatMap(item =>
        item.status === 'rejected' ? [item.reason] : [],
      )
      throw new AggregateError(errors, 'original model settlement failed to stop')
    }
    if (!('settled' in result.value)) return await this.retain(result.value)
    await this.coordinator.close()
    delete this.coordinator
    return { settled: true }
  }
}
