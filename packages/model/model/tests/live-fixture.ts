import { judgeContentBlock } from '@omne-harness/content-block'
import { judgePart } from '@omne-harness/message'
import {
  createModelRuntime,
  type LiveDeadlines,
  type LiveDeliveryAnswer,
  type LiveEventPort,
  type SendResources,
} from '@omne-harness/model'
import { createTestModelDependencies, testLiveHosting } from '@omne-harness/model/testing'
import type {
  LiveCommand,
  LiveModelRequest,
  MediaFrame,
  ModelInstanceId,
  ModelOperationId,
  Settlement,
} from '@omne-harness/model-contract'
import {
  requestRepresentation,
  type LiveFact,
  type LiveSession,
  type ModelCommands,
} from '@omne-harness/model-contract/provider'
import { fail, succeed } from '@omne-harness/operation-result'
import { configuration, eventually } from './runtime-fixture.ts'
import { fixture, instance, op, proof, request, unbox } from './memory-fixture.ts'

type Principal = ReturnType<typeof fixture>['principal']
export type Delivery = Parameters<LiveEventPort['deliver']>[0] &
  Readonly<{ answer: LiveDeliveryAnswer }>
/** What the upstream plays: a fact, a connection that ends without a close, or a read that throws. */
export type Played = LiveFact | 'lost' | 'throws'

export const liveRequest: LiveModelRequest = {
  kind: 'live',
  profile: request.profile,
  suppliers: request.suppliers,
  fallback: false,
  retryPolicy: request.retryPolicy,
  source: request.source,
  input: ['text', 'voice'],
  instructions: 'Answer the caller briefly.',
  history: [],
  voice: null,
  media: { via: 'link', audio: 'pcm16' },
}
/** A command showing a picture, which the live profile here does not take in. */
export function show(): LiveCommand {
  const judged = judgeContentBlock({
    kind: 'image',
    id: 'picture',
    visibility: { toHuman: true, toModel: true },
    mediaType: 'image/png',
    inline: 'iVBORw0KGgo=',
  })
  if ('rejected' in judged) throw new Error(`invalid image block: ${judged.rejected}`)
  return { type: 'say', use: 'context', about: null, content: [judged.ok] }
}
export function say(text: string): LiveCommand {
  const part = judgePart({
    kind: 'text',
    id: 'say',
    text,
    visibility: { toHuman: true, toModel: true },
  })
  if ('rejected' in part || part.ok.kind !== 'text') throw new Error('invalid text block')
  return { type: 'say', use: 'speak', about: null, content: [part.ok] }
}
export const transcript = (text: string): LiveFact => ({
  kind: 'event',
  event: { t: 'transcript', who: 'model', startMs: 0, endMs: 1, text },
})
/** The usage the upstream reports, in seconds of audio. */
export const seconds = (lexeme: string): LiveFact => ({
  kind: 'account',
  event: 'usage',
  value: {
    usage: [{ name: 'audio', state: 'known', lexeme, unit: 'second' }],
    cost: [],
    trimmed: { state: 'unknown', unit: 'token' },
    place: 'test.invalid',
    duration: { state: 'unknown' },
    revision: '1',
  },
})
const START = '2026-10-19T00:00:00Z'

/** The one upstream session of the call: what the body sent it, and the facts the test plays back. */
function upstream() {
  const queue: Played[] = []
  let wake = Promise.withResolvers<void>()
  const seen = {
    opens: 0,
    closes: 0,
    sent: [] as { id: ModelOperationId; command: LiveCommand }[],
    media: [] as MediaFrame[],
    sendThrows: false,
    /** How many times the body let go of the session's facts. */
    drops: 0,
  }
  function play(...facts: Played[]) {
    queue.push(...facts)
    wake.resolve()
    wake = Promise.withResolvers<void>()
  }
  function open(): LiveSession {
    seen.opens += 1
    return {
      facts: {
        [Symbol.asyncIterator]: () => ({
          async next() {
            while (queue.length === 0) await wake.promise
            const fact = queue.shift()
            if (fact === 'throws') throw new Error('synthetic-live-read-failure')
            if (fact === 'lost' || fact === undefined) return { done: true, value: undefined }
            return { done: false, value: fact }
          },
          async return() {
            seen.drops += 1
            play('lost')
            return { done: true, value: undefined }
          },
        }),
      },
      input: {
        send(command, id) {
          if (seen.sendThrows) throw new Error('synthetic-live-send-failure')
          seen.sent.push({ id, command })
          return 'sent'
        },
        media(frame) {
          seen.media.push(frame)
          return 'sent'
        },
        close() {
          seen.closes += 1
        },
      },
    }
  }
  return { seen, play, open, pending: () => queue.length }
}

/**
 * A live call over the memory store: a scripted upstream session, a receiver whose answers the test
 * sets, and a manual clock for the deadlines.
 */
export function liveFixture(
  options: Readonly<{
    capacity?: number
    deadlines?: Partial<LiveDeadlines>
    wrap?: (commands: ModelCommands<Principal>) => ModelCommands<Principal>
    /** Runs just after the session opens, before the body that reads it is held. */
    onOpen?: (commands: ModelCommands<Principal>) => void
  }> = {},
) {
  const f = fixture()
  const admit = { ...f.admit, request: liveRequest }
  const up = upstream()
  const deliveries: Delivery[] = []
  const exits: unknown[] = []
  let answer: (frames: Delivery['frames']) => LiveDeliveryAnswer = () => 'saved'
  const live = testLiveHosting({
    events: {
      async deliver(input) {
        const given = answer(input.frames)
        deliveries.push({ ...input, frames: structuredClone(input.frames), answer: given })
        return given
      },
      exited(target) {
        exits.push(target)
      },
    },
    capacity: options.capacity ?? 64,
    deadlines: { ...testLiveHosting().deadlines, ...options.deadlines },
  })
  const assembly = createTestModelDependencies({
    ...f.options,
    start: START,
    maxWaiters: 100,
    maxQueued: 100,
    sends: [],
    sending: {
      maxRetainedAttempts: 100,
      credentials: {
        layerOf: () => fail({ kind: 'unavailable' }),
        resolve: () => succeed(new Map([['apiKey', 'synthetic']])),
      },
      sources: [
        {
          profile: liveRequest.profile,
          supplier: liveRequest.suppliers[0].adoption,
          provider: liveRequest.suppliers[0].provider,
          model: liveRequest.suppliers[0].model,
          official: true,
          current: () => ({ ok: { authorized: true } }),
        },
      ],
    },
  })
  const base = assembly.dependencies.commands
  const resources: SendResources<Principal> = {
    async acquire(demand) {
      const receipt = {
        supplier: demand.supplier.adoption,
        representation: requestRepresentation(demand.request),
        payloadDigest: 'a'.repeat(64),
      }
      return {
        ok: {
          transport: {
            async prepare() {
              return {
                ok: {
                  async materialize() {
                    return { ok: { receipt, open: () => up.open(), close: async () => {} } }
                  },
                  close: async () => {},
                },
              }
            },
          },
          openWithCredential(materialized, _secrets, signal) {
            const session = materialized.open(signal)
            queueMicrotask(() => options.onOpen?.(base))
            return session
          },
          startWithCredential() {
            throw new Error('a live fixture starts no request')
          },
          release: async () => {},
        },
      }
    },
  }
  /** One process: a runtime and a sender of its own over the shared store and upstream. */
  function process(commands: ModelCommands<Principal>) {
    const send = assembly.controls.send.createSender({ resources, commands })
    return createModelRuntime({ ...assembly.dependencies, commands, send, live }, configuration)
  }
  const provider = process(options.wrap?.(base) ?? base)
  function drive(runtime: typeof provider, at: ModelInstanceId, signal?: AbortSignal) {
    return runtime.driver.drive(
      {
        principal: f.principal,
        tenant: f.tenant,
        call: admit.call,
        operation: op(`claim-${at}`),
        instance: at,
        continuity: proof(admit.call),
      },
      signal ?? new AbortController().signal,
    )
  }
  const target = { principal: f.principal, tenant: f.tenant, call: admit.call }
  async function state() {
    return unbox(await base.loadRecovery(target)).state
  }
  return {
    ...f,
    admit,
    assembly,
    provider,
    upstream: up,
    deliveries,
    answer(next: (frames: Delivery['frames']) => LiveDeliveryAnswer) {
      answer = next
    },
    advance(ms: number) {
      assembly.controls.clock.advanceTo(new Date(Date.parse(START) + ms).toISOString())
    },
    async admitted() {
      return unbox(await provider.runtime.calls.admit(admit))
    },
    drive: (signal?: AbortSignal) => drive(provider, instance('first'), signal),
    /** Drives the call from a new process over the same store, as a successor of a lost one. */
    restart: (next = instance('second')) => drive(process(base), next),
    /** Another process over the same store, which holds no body. */
    elsewhere: () => process(base),
    /** The call of the fixture, with the principal and tenant that admitted it. */
    target,
    holds: () => provider.holdsLiveBody(target),
    exits: () => exits,
    state,
    async settlement(): Promise<Settlement> {
      const current = await state()
      if (current.phase !== 'settled') throw new Error(`call is ${current.phase}`)
      return current.settlement
    },
    async open() {
      await eventually(() => up.seen.opens === 1)
      up.play({ kind: 'opened', expiresAt: null })
      await eventually(() => deliveries.length > 0)
    },
    command(id: ModelOperationId, command: LiveCommand = say('hello')) {
      return provider.live.command({ ...target, operation: id, command })
    },
    cancel() {
      return provider.runtime.calls.cancel({ ...target, operation: op('cancel') })
    },
  }
}
/** The event numbers the receiver saved, in order, with each gap written as its range. */
export function saved(deliveries: readonly Delivery[]): string[] {
  const seen = new Map<number, string>()
  for (const delivery of deliveries.filter(each => each.answer === 'saved'))
    for (const frame of delivery.frames)
      if ('gap' in frame) seen.set(frame.gap.from, `gap ${frame.gap.from}-${frame.gap.to}`)
      else seen.set(frame.seq, `${frame.seq} ${frame.event.t}`)
  return [...seen.entries()].sort(([a], [b]) => a - b).map(([, text]) => text)
}
