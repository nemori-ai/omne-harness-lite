import { describe, expect, it } from 'vitest'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { createModelObserverQueue } from '../src/service-observer-queue.ts'
import type {
  ModelObserverQueueInput,
  ObserverDiagnostic,
  ObserverReceiveTask,
  ObserverScope,
} from '../src/service-types.ts'

function identifier<K extends 'SessionRef' | 'OrganizationId' | 'AccountId'>(
  value: string,
  kind: K,
) {
  const parsed = parseOpaqueIdentifier(value, kind)
  if ('invalidInput' in parsed) throw new Error('bad fixture identity')
  return parsed.ok
}
function deferred() {
  let finish: (() => void) | undefined
  const promise = new Promise<void>(resolve => {
    finish = resolve
  })
  return {
    promise,
    finish: () => {
      if (finish === undefined) throw new Error('deferred absent')
      finish()
    },
  }
}
const scope: ObserverScope = {
  session: identifier('session-1', 'SessionRef'),
  tenant: {
    organization: identifier('org-1', 'OrganizationId'),
    account: identifier('account-1', 'AccountId'),
  },
  target: { kind: 'model_call', callId: 'call-1', dispatch: 1 },
}
const snapshot = { blocks: [], position: 0 } as const
const event = { t: 'finish', reason: 'end' } as const

function fixture(
  receive: ModelObserverQueueInput['receiver']['receive'],
  overrides: Partial<ModelObserverQueueInput> = {},
) {
  const stopped = deferred()
  const diagnostics: ObserverDiagnostic[] = []
  const queue = createModelObserverQueue({
    scope,
    authorization: {
      check: () => ({ valid: true }),
      open: () => ({ unavailable: true }),
      close: async () => ({ released: true }),
    },
    receiver: { receive, stop: () => stopped.finish(), stopped: stopped.promise },
    maxBufferedEvents: 3,
    maxBufferedBytes: 10_000,
    diagnostic: event => diagnostics.push(event),
    ...overrides,
  })
  return { queue, diagnostics, stopped }
}

describe('per-dispatch observer queue', () => {
  it('cuts pre-start increments at the visible position and sends snapshot first', async () => {
    const delivered: string[] = []
    const { queue } = fixture(serialized => {
      delivered.push(serialized)
      return { completion: Promise.resolve(), stopped: Promise.resolve() }
    })
    expect(queue.offer(event, snapshot)).toEqual({ accepted: true })
    expect(queue.offer(event, { ...snapshot, position: 1 })).toEqual({ accepted: true })
    expect(queue.start(snapshot)).toEqual({ accepted: true })
    await Promise.resolve()
    await Promise.resolve()
    expect(delivered.map(value => JSON.parse(value).kind)).toEqual(['snapshot', 'event'])
    expect(JSON.parse(delivered[1] ?? '{}').position).toBe(1)
  })

  it('counts exact UTF-8 bytes and retains in-flight bytes until actual stopped', async () => {
    const processing = deferred()
    const actualStop = deferred()
    const received: string[] = []
    const receive = (serialized: string): ObserverReceiveTask => {
      received.push(serialized)
      return { completion: processing.promise, stopped: actualStop.promise }
    }
    const serialized = writeJsonLossless({ scope, kind: 'snapshot', snapshot })
    const bytes = new TextEncoder().encode(serialized).byteLength
    const { queue, stopped } = fixture(receive, {
      maxBufferedBytes: bytes,
      maxBufferedEvents: 1,
    })
    expect(queue.start(snapshot)).toEqual({ accepted: true })
    processing.finish()
    await Promise.resolve()
    expect(received).toHaveLength(1)
    expect(queue.offer(event, { ...snapshot, position: 1 })).toEqual({
      rejected: { reason: 'buffer_full' },
    })
    expect(await queue.close()).toEqual({ unavailable: true })
    actualStop.finish()
    stopped.finish()
    await Promise.resolve()
    await Promise.resolve()
    expect(await queue.close()).toEqual({ released: true })
  })

  it('isolates a throwing diagnostic and records one asynchronous consumer failure', async () => {
    const fail = deferred()
    const actualStop = deferred()
    const { queue } = fixture(
      () => ({
        completion: fail.promise.then(() => Promise.reject(Error('receiver'))),
        stopped: actualStop.promise,
      }),
      {
        diagnostic: () => {
          throw Error('diagnostic')
        },
      },
    )
    expect(queue.start(snapshot)).toEqual({ accepted: true })
    fail.finish()
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(queue.offer(event, { ...snapshot, position: 1 })).toEqual({
      rejected: { reason: 'consumer_failed' },
    })
    expect(await queue.close()).toEqual({ unavailable: true })
    actualStop.finish()
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(await queue.close()).toEqual({ released: true })
  })

  it('rejects a revoked target before handing text to the receiver', async () => {
    let allowed = true
    let receives = 0
    const { queue, diagnostics } = fixture(
      () => {
        receives += 1
        return { completion: Promise.resolve(), stopped: Promise.resolve() }
      },
      {
        authorization: {
          check: () =>
            allowed ? { valid: true } : { invalidInput: { reason: 'observer_scope_mismatch' } },
          open: () => ({ unavailable: true }),
          close: async () => ({ released: true }),
        },
      },
    )
    expect(queue.start(snapshot)).toEqual({ accepted: true })
    await Promise.resolve()
    allowed = false
    expect(queue.offer(event, { ...snapshot, position: 1 })).toEqual({
      invalidInput: { reason: 'observer_scope_mismatch' },
    })
    expect(receives).toBe(1)
    expect(diagnostics.at(-1)?.reason).toBe('observer_scope_mismatch')
  })
})
