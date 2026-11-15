import { accessProtocol, type AvailabilityFrame } from '@omne-harness/public-contract'
import type { CallReport, CallRequest, ObserveEnd, Transport } from '@omne-harness/sdk/core'

type JsonValue = CallRequest['body']

const limits = {
  maxBytes: 65_536,
  maxDepth: 16,
  maxItems: 1_024,
  maxMembers: 64,
  maxStringLength: 1_024,
  maxNumberLength: 32,
}

type Subscription = {
  readonly frames: JsonValue[]
  ended: ObserveEnd | undefined
  wake: (() => void) | undefined
  readonly signal: AbortSignal
}

export type FakeTransport = {
  readonly transport: Transport
  readonly subscriptions: Subscription[]
  readonly push: (frame: AvailabilityFrame) => void
  readonly breakStream: () => void
  readonly calls: CallRequest[]
  readonly sent: CallRequest[]
  readonly script: CallReport[]
  hold: { readonly settle: (report: CallReport) => void } | undefined
  heldOnAbort: 'uncertain' | 'not-sent'
}

export function fakeTransport(): FakeTransport {
  const subscriptions: Subscription[] = []
  const calls: CallRequest[] = []
  const sent: CallRequest[] = []
  const script: CallReport[] = []
  const live = (): Subscription => {
    const last = subscriptions.at(-1)
    if (last === undefined) throw new Error('nobody subscribed to the availability')
    return last
  }
  const fake: FakeTransport = {
    subscriptions,
    calls,
    sent,
    script,
    hold: undefined,
    heldOnAbort: 'uncertain',
    push(frame) {
      const written = accessProtocol.observations.availability.frame.write(frame, limits)
      if (!written.ok) throw new Error('a frame outside access/v1')
      const subscription = live()
      subscription.frames.push(written.value)
      subscription.wake?.()
    },
    breakStream() {
      const subscription = live()
      subscription.ended = { kind: 'uncertain' }
      subscription.wake?.()
    },
    transport: {
      async call(request) {
        calls.push(request)
        if (request.signal?.aborted === true) return { kind: 'not-sent' }
        const scripted = script.shift()
        if (scripted !== undefined) {
          if (scripted.kind !== 'not-sent') sent.push(request)
          return scripted
        }
        if (request.operation === 'hold') {
          if (fake.heldOnAbort === 'uncertain') sent.push(request)
          return new Promise(settle => {
            fake.hold = { settle }
            request.signal?.addEventListener('abort', () => settle({ kind: fake.heldOnAbort }), {
              once: true,
            })
          })
        }
        sent.push(request)
        return { kind: 'answered', outcome: 'succeeded', body: { kind: 'object', entries: [] } }
      },
      async *observe(request): AsyncGenerator<JsonValue, ObserveEnd> {
        if (request.protocol.name !== 'access') {
          if (!request.signal.aborted)
            await new Promise(resolve => request.signal.addEventListener('abort', resolve))
          return { kind: 'aborted' }
        }
        const subscription: Subscription = {
          frames: [],
          ended: undefined,
          wake: undefined,
          signal: request.signal,
        }
        subscriptions.push(subscription)
        const awake = (): void => subscription.wake?.()
        request.signal.addEventListener('abort', awake)
        try {
          for (;;) {
            const frame = subscription.frames.shift()
            if (frame !== undefined) {
              yield frame
              continue
            }
            if (request.signal.aborted) return { kind: 'aborted' }
            if (subscription.ended !== undefined) return subscription.ended
            await new Promise<void>(resolve => {
              subscription.wake = resolve
            })
          }
        } finally {
          request.signal.removeEventListener('abort', awake)
        }
      },
    },
  }
  return fake
}

export async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await new Promise(resolve => setImmediate(resolve))
}
