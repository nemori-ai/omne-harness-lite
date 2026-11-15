import { randomBytes } from 'node:crypto'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import { decodeModelInstanceId, type ModelFailure } from '@omne-harness/model-contract'
import {
  createMemoryResultPushLedger,
  type ResultPushLedger,
} from '@omne-harness/model-host-local/cordis'
import type {
  InitialTarget,
  ModelInitialExecution,
  ModelInitialHostChannel,
} from '@omne-harness/model/commands'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { currentForReader } from '../entry/runtime-context-trust.ts'
import { qualifyingObservation, type ModelObservationPair } from './observation.ts'
import type { ModelQualification } from './qualification.ts'
import { callKey } from './tenant-call.ts'

const COMPOSITION = 'model-run-composition'

const unavailable = (diagnostic: string): ModelFailure => ({
  kind: 'unavailable',
  dependency: COMPOSITION,
  diagnostic,
})

export type ModelRecordsAttachment = Readonly<{
  initial: ModelInitialExecution<unknown>
  observation: ModelObservationPair & Readonly<{ recheckMs: number }>
  qualification: ModelQualification
}>

export type ModelRecordsHandle = Readonly<{
  /** The send child the records plugin created; the host releases it before the channel. */
  captureSendChild(fiber: Fiber): void
  executionChannel(): Outcome<ModelInitialHostChannel<unknown>, ModelFailure>
  detach(): void
}>

export type ModelRecordsPort = Readonly<{
  checkOriginRead(target: InitialTarget): Outcome<void, ModelFailure>
  attach(
    ctx: Context,
    attachment: ModelRecordsAttachment,
  ): Outcome<ModelRecordsHandle, ModelFailure>
}>

export type ModelHostPort = Readonly<{
  bindHost(ctx: Context): ModelHostBinding
}>

export type ModelHostBinding = Readonly<{
  executionChannel(): Outcome<ModelInitialHostChannel<unknown>, ModelFailure>
  releaseExecution(): Promise<void>
  qualify(access: Parameters<ModelQualification['qualify']>[0]): Promise<() => void>
  qualifyRead(
    access: Parameters<ModelQualification['qualifyRead']>[0],
  ): ReturnType<ModelQualification['qualifyRead']>
  qualifyObservation(
    access: Parameters<ModelQualification['qualifyObservation']>[0],
  ): ReturnType<ModelQualification['qualifyObservation']>
  observation(): Outcome<ModelObservationPair, ModelFailure>
  ledger: ResultPushLedger
}>

export type ModelRunComposition = Readonly<{
  records: ModelRecordsPort
  host: ModelHostPort
  grantOriginRead(target: InitialTarget): () => void
  attached(): ModelRecordsAttachment | undefined
  executionChannel(): Outcome<ModelInitialHostChannel<unknown>, ModelFailure>
  hostCurrent(): (() => boolean) | undefined
}>

type Attached = ModelRecordsAttachment &
  Readonly<{
    channel: ModelInitialHostChannel<unknown>
    sendChild: { fiber: Fiber | undefined }
    end(): void
  }>

export function createModelRunComposition(): ModelRunComposition {
  const grants = new Map<string, number>()
  const readers = new WeakMap<Context, () => boolean>()
  const ledger = createMemoryResultPushLedger()
  let attached: Attached | undefined
  let hostCurrent: (() => boolean) | undefined

  const checkOriginRead: ModelRecordsPort['checkOriginRead'] = target => {
    const key = callKey(target.tenant, target.call)
    return key !== undefined && (grants.get(key) ?? 0) > 0
      ? succeed(undefined)
      : fail({ kind: 'denied', action: 'origin-read' })
  }

  const grantOriginRead: ModelRunComposition['grantOriginRead'] = target => {
    const key = callKey(target.tenant, target.call)
    if (key === undefined) return () => {}
    grants.set(key, (grants.get(key) ?? 0) + 1)
    let revoked = false
    return () => {
      if (revoked) return
      revoked = true
      const left = (grants.get(key) ?? 1) - 1
      if (left <= 0) grants.delete(key)
      else grants.set(key, left)
    }
  }

  const attach: ModelRecordsPort['attach'] = (ctx, attachment) => {
    if (attached !== undefined) return fail(unavailable('records-already-attached'))
    const decoded = decodeModelInstanceId(`minst_${randomBytes(16).toString('hex')}`)
    if ('failure' in decoded) return fail(unavailable('instance-identity'))
    const opened = attachment.initial.openHost({ instance: decoded.ok })
    if ('failure' in opened) return opened
    const current: Attached = {
      ...attachment,
      channel: opened.ok,
      sendChild: { fiber: undefined },
      end: () => {
        if (attached !== current) return
        attached = undefined
        current.channel.close()
        current.qualification.dropHostBindings()
      },
    }
    attached = current
    ctx.effect(() => current.end)
    return succeed(
      Object.freeze({
        captureSendChild: fiber => {
          current.sendChild.fiber = fiber
        },
        executionChannel: () =>
          attached === current
            ? succeed(current.channel)
            : fail(unavailable('records-not-attached')),
        detach: current.end,
      }),
    )
  }

  const executionChannel: ModelRunComposition['executionChannel'] = () =>
    attached === undefined ? fail(unavailable('records-not-attached')) : succeed(attached.channel)

  const bindHost: ModelHostPort['bindHost'] = ctx => {
    const current = currentForReader(readers, ctx)
    hostCurrent = current
    ctx.effect(() => () => {
      if (hostCurrent === current) hostCurrent = undefined
      attached?.qualification.dropHostBindings()
    })
    return Object.freeze({
      executionChannel,
      ledger,
      releaseExecution: async () => {
        const bound = attached
        if (bound === undefined) return
        const child = bound.sendChild.fiber
        bound.sendChild.fiber = undefined
        if (child !== undefined) await child.dispose()
        bound.end()
      },
      qualify: access => {
        const live = attached
        return live === undefined
          ? Promise.resolve(() => {})
          : live.qualification.qualify(access, current)
      },
      qualifyRead: async access => {
        const live = attached
        if (live === undefined)
          return {
            check: async () => fail(unavailable('records-not-attached')),
            release() {},
          }
        return live.qualification.qualifyRead(access, () => current() && attached === live)
      },
      qualifyObservation: access => {
        const live = attached
        return live === undefined
          ? Promise.resolve(fail(unavailable('records-not-attached')))
          : live.qualification.qualifyObservation(access, current)
      },
      observation: () => {
        const live = attached
        if (live === undefined) return fail(unavailable('records-not-attached'))
        const { commands, source, recheckMs } = live.observation
        return succeed(
          Object.freeze({
            commands,
            source: qualifyingObservation(
              source,
              access => live.qualification.qualify(access, current),
              recheckMs,
            ),
          }),
        )
      },
    })
  }

  return Object.freeze({
    records: Object.freeze({ checkOriginRead, attach }),
    host: Object.freeze({ bindHost }),
    grantOriginRead,
    attached: () => attached,
    executionChannel,
    hostCurrent: () => hostCurrent,
  })
}
