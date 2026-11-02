import { expect, it, vi } from 'vitest'
import {
  decodeDispatchId,
  decodeOutputCursor,
  decodeRevision,
  type CallState,
} from '@omne-harness/model-contract'
import type { Publication } from '@omne-harness/model-contract/provider'
import { createModelObservationSource } from '../src/stream-source.ts'
import type {
  ModelObservationLimits,
  ModelObservationTiming,
  ObservationFacts,
} from '../src/stream-types.ts'
import { fixture, instance, unbox } from './memory-fixture.ts'

export function streamFixture(overrides: Partial<ModelObservationLimits> = {}) {
  const f = fixture()
  let now = 0
  const waits = new Set<{ deadline: number; finish(value: 'elapsed' | 'cancelled'): void }>()
  const timing: ModelObservationTiming = {
    nowMs: () => now,
    waitUntil(deadline, signal) {
      return new Promise(resolve => {
        const wait = {
          deadline,
          finish(value: 'elapsed' | 'cancelled') {
            waits.delete(wait)
            signal.removeEventListener('abort', abort)
            resolve(value)
          },
        }
        const abort = () => wait.finish('cancelled')
        waits.add(wait)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      })
    },
  }
  const limits: ModelObservationLimits = {
    maxSnapshotBytes: 100000,
    maxDeltaBytes: 100000,
    maxQueuedFrames: 4,
    maxQueuedBytes: 400000,
    maxObserversPerTenant: 8,
    maxObservers: 8,
    maxPendingSourceOperations: 4,
    maxRetainedCalls: 8,
    maxRetainedBytes: 1000000,
    maxTotalBytes: 4000000,
    maxQueueResidenceMs: 100,
    checkIntervalMs: 10,
    ...overrides,
  }
  let refresh = async (): Promise<{ ok: void }> => ({ ok: undefined })
  const source = createModelObservationSource({
    authority: f.options.authority,
    timing,
    limits,
    refresh: () => refresh(),
  })
  const host = unbox(source.source.openHost())
  const execution = { tenant: f.tenant, call: f.admit.call, instance: instance(), generation: '1' }
  const publication: Publication = { execution, registration: 'one' }
  const dispatch = unbox(decodeDispatchId('mdisp_one'))
  const state: CallState = {
    call: f.admit.call,
    revision: unbox(decodeRevision('1')),
    consumer: f.admit.consumer,
    control: { kind: 'none' },
    custody: { kind: 'producer' },
    phase: 'running',
    dispatch,
    firstContent: 'none-proven',
  }
  function facts(revision = '1', cursor = '0'): ObservationFacts {
    const next = { ...state, revision: unbox(decodeRevision(revision)) }
    return {
      tenant: f.tenant,
      reference: f.reference,
      admission: f.admit.operation,
      execution,
      state: next,
      material: {
        kind: 'retained',
        dispatch,
        snapshot: {
          call: state.call,
          cursor: unbox(decodeOutputCursor(cursor)),
          state: next,
          blocks: [],
        },
      },
    }
  }
  const access = { tenant: f.tenant, principal: f.principal }
  const current = () => host.references.current({ access, reference: f.reference })
  return {
    ...f,
    ...source,
    host,
    access,
    publication,
    facts,
    current,
    setRefresh(value: typeof refresh) {
      refresh = value
    },
    advance(value: number) {
      now = value
      for (const wait of waits) if (wait.deadline <= now) wait.finish('elapsed')
    },
    waits,
  }
}

it('copies only changed content and preserves the frozen blocks across state-only updates', async () => {
  const f = streamFixture()
  f.host.attach(f.publication)
  const large = f.facts()
  if (large.material.kind !== 'retained') throw new Error('fixture material')
  const blocks = [
    { kind: 'growing', index: '0', mode: 'append', content: 'text', value: 'a'.repeat(30000) },
  ] satisfies typeof large.material.snapshot.blocks
  f.confirm({
    ...large,
    material: { ...large.material, snapshot: { ...large.material.snapshot, blocks } },
  })
  const current = unbox(await f.current()).current
  if (!current) throw new Error('fixture target')
  const iterator = f.host.observation
    .observe({ ref: current.ref, access: f.access, signal: new AbortController().signal })
    [Symbol.asyncIterator]()
  const first = (await iterator.next()).value
  const clone = vi.spyOn(globalThis, 'structuredClone')
  f.confirm({
    ...large,
    material: { ...large.material, snapshot: { ...large.material.snapshot, blocks } },
  })
  expect(clone).not.toHaveBeenCalled()
  const next = f.facts('2')
  if (next.material.kind !== 'retained') throw new Error('fixture material')
  f.confirm({
    ...next,
    material: { ...next.material, snapshot: { ...next.material.snapshot, blocks } },
  })
  const delta = (await iterator.next()).value
  expect(delta.value.blocks).toEqual([])
  expect(
    clone.mock.calls.every(([value]) => !JSON.stringify(value).includes('a'.repeat(30000))),
  ).toBe(true)
  clone.mockRestore()
  const later = f.host.observation
    .observe({ ref: current.ref, access: f.access, signal: new AbortController().signal })
    [Symbol.asyncIterator]()
  const after = (await later.next()).value
  expect(after.value.value.blocks).toBe(first.value.value.blocks)
  expect(Object.isFrozen(after.value.value.blocks)).toBe(true)
  expect(after.value.value.state).toBe(unbox(await f.current()).state)
  const content = f.facts('3', '1')
  if (content.material.kind !== 'retained') throw new Error('fixture material')
  f.confirm({
    ...content,
    material: {
      ...content.material,
      snapshot: {
        ...content.material.snapshot,
        blocks: [
          {
            ...blocks[0],
            kind: 'growing',
            index: '0',
            mode: 'append',
            content: 'text',
            value: 'a'.repeat(30000) + 'b',
          },
        ],
      },
    },
  })
  const changed = (await later.next()).value
  expect(changed.kind).toBe('delta')
  expect(changed.value.blocks[0]?.value).toBe('a'.repeat(30000) + 'b')
  await iterator.return?.()
  await later.return?.()
  f.source.close()
})

it('rejects replacement metadata at the same revision and ignores older confirmations', async () => {
  const f = streamFixture()
  f.confirm(f.facts('2'))
  f.confirm(f.facts('1'))
  expect(unbox(await f.current()).state.revision).toBe('2')
  const conflict = f.facts('2')
  f.confirm({ ...conflict, execution: { ...f.publication.execution, generation: '2' } })
  expect(await f.current()).toHaveProperty('failure.kind', 'unavailable')
  f.source.close()
})

it('preserves publication identity, rejects a second host and never lets old retirement remove a successor', async () => {
  const f = streamFixture()
  f.confirm(f.facts())
  f.host.attach(f.publication)
  expect(f.source.openHost()).toHaveProperty('failure.kind', 'unavailable')
  const first = unbox(await f.current()).current
  f.host.attach({ ...f.publication, registration: 'two' })
  const successor = unbox(await f.current()).current
  expect(successor?.ref).not.toBe(first?.ref)
  f.host.retire(f.publication)
  expect(unbox(await f.current()).current).toEqual(successor)
  f.host.close()
  const host = unbox(f.source.openHost())
  host.attach(f.publication)
  expect(
    unbox(await host.references.current({ access: f.access, reference: f.reference })).current?.ref,
  ).not.toBe(successor?.ref)
  f.source.close()
})

it('bounds cold read promises before invoking refresh', async () => {
  const f = streamFixture({ maxPendingSourceOperations: 1 })
  const barrier = Promise.withResolvers<void>()
  let reads = 0
  f.setRefresh(async () => {
    reads += 1
    await barrier.promise
    f.confirm(f.facts())
    return { ok: undefined }
  })
  const first = f.current()
  expect(await f.current()).toHaveProperty('failure.diagnostic', 'read-capacity')
  expect(reads).toBe(1)
  barrier.resolve()
  expect(await first).toHaveProperty('ok.state')
  f.source.close()
})

it('retains a released stream only with a matching saved cursor and fails closed on invalid content', async () => {
  const f = streamFixture()
  f.confirm(f.facts())
  f.host.attach(f.publication)
  const first = unbox(await f.current()).current
  const facts = f.facts('2')
  if (facts.material.kind !== 'retained') throw new Error('fixture material')
  f.confirm({
    ...facts,
    material: {
      kind: 'released',
      dispatch: facts.material.dispatch,
      cursor: facts.material.snapshot.cursor,
    },
  })
  expect(unbox(await f.current()).current).toEqual(first)
  const bad = f.facts('3', '1')
  if (bad.material.kind !== 'retained') throw new Error('fixture material')
  f.confirm({
    ...bad,
    material: {
      ...bad.material,
      snapshot: {
        ...bad.material.snapshot,
        blocks: [
          { kind: 'growing', index: 'not-decimal', mode: 'append', content: 'text', value: 'bad' },
        ],
      },
    },
  })
  expect(await f.current()).toHaveProperty('failure.kind', 'unavailable')
  f.source.close()
})

it('does not reuse released material in a cold source and refuses snapshots above its finite source budget', async () => {
  const f = streamFixture()
  const facts = f.facts()
  if (facts.material.kind !== 'retained') throw new Error('fixture material')
  f.confirm({
    ...facts,
    material: {
      kind: 'released',
      dispatch: facts.material.dispatch,
      cursor: facts.material.snapshot.cursor,
    },
  })
  f.host.attach(f.publication)
  expect(unbox(await f.current()).current).toBeNull()
  f.source.close()
  const tiny = streamFixture({ maxRetainedBytes: 1 })
  tiny.confirm(tiny.facts())
  expect(await tiny.current()).toHaveProperty('failure.kind', 'unavailable')
  tiny.source.close()
})

it('refreshes a cold source, reuses unchanged versions and retains state when a target retires', async () => {
  const f = streamFixture()
  f.host.attach(f.publication)
  f.setRefresh(async () => {
    f.confirm(f.facts())
    return { ok: undefined }
  })
  const first = unbox(await f.current())
  expect(first.current).not.toBeNull()
  const second = unbox(await f.current())
  expect(second.state).toBe(first.state)
  expect(second.current?.ref).toBe(first.current?.ref)
  f.host.retire(f.publication)
  expect(unbox(await f.current())).toEqual({ state: first.state, current: null })
  f.source.close()
})

it('rechecks authorization and host lifetime after a held refresh', async () => {
  const f = streamFixture()
  const barrier = Promise.withResolvers<void>()
  f.setRefresh(async () => {
    await barrier.promise
    f.confirm(f.facts())
    return { ok: undefined }
  })
  const pending = f.current()
  f.denied.add('facts')
  barrier.resolve()
  expect(await pending).toEqual({ failure: { kind: 'denied', action: 'current' } })
  f.denied.clear()
  f.host.close()
  expect(await f.current()).toHaveProperty('failure.kind', 'unavailable')
  f.source.close()
})
