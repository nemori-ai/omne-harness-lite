import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { judgeModelCallCreatedPayload } from '@omne-harness-lite/messages'
import type { CallReadView, RetainedCallReadView } from '../src/reference-types.ts'
import {
  createIndependentCallConsumer,
  notifyReferenceConsumers,
} from '../src/reference-consumer.ts'

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>(accept => {
    resolve = accept
  })
  return { promise, resolve }
}
function view(container: object): RetainedCallReadView {
  const parsed = readJsonStrict(
    readFileSync(
      new URL(
        '../../../../.meta_harness/design/spec/data/messages/v7/reference-examples.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  if ('failed' in parsed || !Array.isArray(parsed.ok)) throw new Error('normative rows')
  const row = parsed.ok.find(
    row =>
      row !== null &&
      typeof row === 'object' &&
      'name' in row &&
      row.name === 'created-original-input',
  )
  if (row === null || row === undefined || typeof row !== 'object' || !('value' in row))
    throw new Error('normative row')
  const judged = judgeModelCallCreatedPayload(row.value)
  if ('rejected' in judged) throw new Error('created relation')
  const source = { generation: Object.freeze({}), progress: 1 }
  return {
    ref: judged.ok.ref,
    origin: judged.ok.origin,
    state: 'in_flight',
    source,
    presence: {
      kind: 'live',
      source,
      executionGeneration: container,
      sourceVersion: 'actual-test-owner',
    },
  }
}

describe('independent receiver ownership (controlled source; not full R20 integration)', () => {
  it('release closes pending waits immediately but stopped drains the original source read', async () => {
    const container = Object.freeze({})
    const current = view(container)
    const entered = deferred<void>(),
      finish = deferred<{ view: CallReadView }>()
    let stops = 0
    const consumer = createIndependentCallConsumer({
      container,
      revoked: new AbortController().signal,
      valid: () => true,
      read: async () => {
        entered.resolve()
        return await finish.promise
      },
      onStopped: () => {
        stops++
      },
    })
    const waiting = consumer.wait({})
    await entered.promise
    consumer.release()
    expect(await waiting).toEqual({ released: true })
    let stopped = false
    consumer.stopped.then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)
    finish.resolve({ view: current })
    await consumer.stopped
    expect(stops).toBe(1)
    expect(await consumer.wait({})).toEqual({ released: true })
  })
  it('one wait abort never releases its consumer or another consumer', async () => {
    const container = Object.freeze({})
    let current = view(container)
    const initial = deferred<void>()
    let stops = 0
    const make = () =>
      createIndependentCallConsumer({
        container,
        revoked: new AbortController().signal,
        valid: () => true,
        read: async () => {
          initial.resolve()
          return { view: current }
        },
        onStopped: () => {
          stops++
        },
      })
    const a = make(),
      b = make()
    const abort = new AbortController()
    const first = a.wait({ signal: abort.signal })
    await initial.promise
    abort.abort()
    expect(await first).toEqual({ aborted: true })
    expect(stops).toBe(0)
    const again = a.wait({}),
      other = b.wait({})
    current = {
      ...current,
      state: 'interrupted',
      presence: { ...current.presence, kind: 'stopped', target: null, unknownBatches: [] },
    }
    notifyReferenceConsumers(container)
    expect(await again).toEqual({ view: current })
    expect(await other).toEqual({ view: current })
    a.release()
    b.release()
    await Promise.all([a.stopped, b.stopped])
    expect(stops).toBe(2)
  })
  it('real revoked signal terminates an idle no-result wait without a model event', async () => {
    const container = Object.freeze({})
    const current = view(container)
    const read = deferred<void>()
    const revoked = new AbortController()
    const consumer = createIndependentCallConsumer({
      container,
      revoked: revoked.signal,
      valid: () => !revoked.signal.aborted,
      read: async () => {
        read.resolve()
        return { view: current }
      },
      onStopped() {},
    })
    const waiting = consumer.wait({})
    await read.promise
    revoked.abort()
    expect(await waiting).toEqual({ unavailable: true })
    await consumer.stopped
  })
  it('late cleanup of generation A cannot remove same-ref generation B', async () => {
    const original = Object.freeze({}),
      successor = Object.freeze({})
    const first = view(original)
    let second = view(successor)
    const a = createIndependentCallConsumer({
      container: original,
      revoked: new AbortController().signal,
      valid: () => true,
      read: async () => ({ view: first }),
      onStopped() {},
    })
    const b = createIndependentCallConsumer({
      container: successor,
      revoked: new AbortController().signal,
      valid: () => true,
      read: async () => ({ view: second }),
      onStopped() {},
    })
    a.release()
    await a.stopped
    const waiting = b.wait({})
    second = {
      ...second,
      state: 'interrupted',
      presence: { ...second.presence, kind: 'stopped', target: null, unknownBatches: [] },
    }
    notifyReferenceConsumers(successor)
    expect(await waiting).toEqual({ view: second })
    b.release()
    await b.stopped
  })
})
