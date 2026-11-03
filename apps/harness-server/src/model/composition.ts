// The run-level composition of the Model rows (`tmp/wire-model/design.md` §5, model-host-local SPEC
// 「首次执行与公共观察接线」): the entry object `modelHostAuthority` holds one of these per run in its own
// closure. No public service carries it: the two rows get only their narrow ports (`records`, `host`)
// through `src/model/ports.ts`, keyed by the root context of the run; `resolve` alone reads the rest.
// It owns:
// - the origin read grants of `resolve` (`checkOriginRead` of the first-execution run);
// - the attachment of one records activation (its `initial` and its qualification registry);
// - the one execution channel both the host and the send stage capture;
// - the host binding: the host fiber's retirement closure and the ordered release of the send child
//   and the channel;
// - the result push ledger the host keeps across its own reloads.
// It hands out no issuer, no standing port and no write access to the registry.
import { randomBytes } from 'node:crypto'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
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
import type { ModelQualification } from './qualification.ts'

const COMPOSITION = 'model-run-composition'

const unavailable = (diagnostic: string): ModelFailure => ({
  kind: 'unavailable',
  dependency: COMPOSITION,
  diagnostic,
})

export type ModelRecordsAttachment = Readonly<{
  initial: ModelInitialExecution<unknown>
  qualification: ModelQualification
}>

/** What the records row holds after a successful attachment. */
export type ModelRecordsHandle = Readonly<{
  /** The send child the records plugin created; the host releases it before the channel. */
  captureSendChild(fiber: Fiber): void
  /** The channel of this attachment, for the send stage; unavailable once the attachment ended. */
  executionChannel(): Outcome<ModelInitialHostChannel<unknown>, ModelFailure>
  /** Ends the attachment: closes the channel and forgets the activation. */
  detach(): void
}>

/** The port of the `model-records` row: the origin read check of its first-execution run and one attachment. */
export type ModelRecordsPort = Readonly<{
  /** The origin read check of the first-execution run: only a granted target may be read. */
  checkOriginRead(target: InitialTarget): Outcome<void, ModelFailure>
  /** One attachment per records activation; a second one is refused. */
  attach(
    ctx: Context,
    attachment: ModelRecordsAttachment,
  ): Outcome<ModelRecordsHandle, ModelFailure>
}>

/** The port of the `model-host` row: one binding per host activation. */
export type ModelHostPort = Readonly<{
  /** Binds the host row's fiber: its retirement is the `current` of every host capture. */
  bindHost(ctx: Context): ModelHostBinding
}>

/** What the host row takes from the composition for one of its activations. */
export type ModelHostBinding = Readonly<{
  executionChannel(): Outcome<ModelInitialHostChannel<unknown>, ModelFailure>
  releaseExecution(): Promise<void>
  qualify(access: Parameters<ModelQualification['qualify']>[0]): Promise<() => void>
  qualifyObservation(
    access: Parameters<ModelQualification['qualifyObservation']>[0],
  ): ReturnType<ModelQualification['qualifyObservation']>
  ledger: ResultPushLedger
}>

/** The whole composition: the two row ports, and what only `resolve` reads. Never on a service. */
export type ModelRunComposition = Readonly<{
  records: ModelRecordsPort
  host: ModelHostPort
  /** Grants the origin read of one target to the caller; the return revokes it. */
  grantOriginRead(target: InitialTarget): () => void
  /** The current attachment, for `resolve`. */
  attached(): ModelRecordsAttachment | undefined
  /** The one channel of the current attachment, for `resolve`. */
  executionChannel(): Outcome<ModelInitialHostChannel<unknown>, ModelFailure>
  /** The retirement closure of the bound host, for `resolve`; absent while no host is bound. */
  hostCurrent(): (() => boolean) | undefined
}>

function keyOf(target: InitialTarget): string | undefined {
  const text = tenantCodec.encode(target.tenant)
  return text.ok ? JSON.stringify([text.value, target.call]) : undefined
}

type Attached = ModelRecordsAttachment &
  Readonly<{ channel: ModelInitialHostChannel<unknown>; sendChild: { fiber: Fiber | undefined } }>

export function createModelRunComposition(): ModelRunComposition {
  const grants = new Map<string, number>()
  const readers = new WeakMap<Context, () => boolean>()
  const ledger = createMemoryResultPushLedger()
  let attached: Attached | undefined
  let hostCurrent: (() => boolean) | undefined

  const checkOriginRead: ModelRecordsPort['checkOriginRead'] = target => {
    const key = keyOf(target)
    return key !== undefined && (grants.get(key) ?? 0) > 0
      ? succeed(undefined)
      : fail({ kind: 'denied', action: 'origin-read' })
  }

  const grantOriginRead: ModelRunComposition['grantOriginRead'] = target => {
    const key = keyOf(target)
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
    const current: Attached = { ...attachment, channel: opened.ok, sendChild: { fiber: undefined } }
    attached = current
    const end = () => {
      if (attached !== current) return
      attached = undefined
      current.channel.close()
      current.qualification.dropHostBindings()
    }
    ctx.effect(() => end)
    return succeed(
      Object.freeze({
        captureSendChild: fiber => {
          current.sendChild.fiber = fiber
        },
        executionChannel: () =>
          attached === current
            ? succeed(current.channel)
            : fail(unavailable('records-not-attached')),
        detach: end,
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
      // Every binding recorded while this host was bound carries its `current`; none is live now.
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
        bound.channel.close()
      },
      qualify: access => {
        const live = attached
        return live === undefined
          ? Promise.resolve(() => {})
          : live.qualification.qualify(access, current)
      },
      qualifyObservation: access => {
        const live = attached
        return live === undefined
          ? Promise.resolve(fail(unavailable('records-not-attached')))
          : live.qualification.qualifyObservation(access, current)
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
