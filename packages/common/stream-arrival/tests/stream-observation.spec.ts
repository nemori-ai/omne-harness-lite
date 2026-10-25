import { tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import {
  decodeStreamId,
  decodeStreamPosition,
  encodeStreamCursor,
  encodeStreamRef,
  type StreamCallCodec,
  type StreamCallFailure,
  type StreamCursor,
  type StreamFrame,
  type StreamObserver,
  type StreamProducer,
  type StreamRef,
} from '@omne-harness/stream-arrival'
import { describe, expect, it } from 'vitest'
import { createStreamFixture, type StreamLimits } from './helpers/stream-observation-fixture.ts'
import { copyObservationValue, observationBytes } from './helpers/stream-observation-values.ts'

function ok<T, F>(value: Outcome<T, F>): T {
  if ('failure' in value) throw new Error('Expected a valid fixture value')
  return value.ok
}
function mintedTenant(account: string): TenantId {
  const value = tenantCodec.parse(
    JSON.stringify({ organization: 'org_00000000000000000000000000', account }),
  )
  if (!value.ok) throw new Error('Invalid fixture tenant')
  return value.value
}
const tenant = mintedTenant('acc_00000000000000000000000000')
const foreignTenant = mintedTenant('acc_00000000000000000000000001')
const principal = { subject: 'reader' }
const access: Access<typeof principal> = { tenant, principal }
const defaults: StreamLimits = {
  snapshotBytes: 100_000,
  deltaBytes: 100_000,
  producerEndBytes: 100_000,
  queueFrames: 10,
  queueBytes: 1_000_000,
  residenceMs: 100,
  observersPerTenant: 10,
  totalMemoryBytes: 10_000_000,
}
const emptyResources = { subscriptions: 0, queuedFrames: 0, queuedBytes: 0, scheduledDeadlines: 0 }
type End = { code: string }

// This explicit call-codec substitute tests observer scheduling, not producer identity adapters.
function identity(producer: StreamProducer = 'model', owner = tenant, stream = 'str_observer') {
  const encoded = tenantCodec.encode(owner)
  if (!encoded.ok) throw new Error('Invalid fixture owner')
  const call = JSON.stringify(['fixture-call', producer, encoded.value])
  const codec: StreamCallCodec = {
    producer,
    resolve({ text, tenant: candidate }): Outcome<string, StreamCallFailure> {
      const checked = tenantCodec.encode(candidate)
      if (!checked.ok) return { failure: { kind: 'invalid-tenant' } }
      if (typeof text !== 'string') return { failure: { kind: 'malformed' } }
      let tuple: unknown
      try {
        tuple = JSON.parse(text)
      } catch {
        return { failure: { kind: 'malformed' } }
      }
      if (
        !Array.isArray(tuple) ||
        tuple.length !== 3 ||
        tuple[0] !== 'fixture-call' ||
        tuple[1] !== producer ||
        typeof tuple[2] !== 'string'
      )
        return { failure: { kind: 'malformed' } }
      if (tuple[2] !== checked.value) return { failure: { kind: 'foreign-tenant' } }
      return { ok: JSON.stringify(tuple) }
    },
  }
  const ref = ok(
    encodeStreamRef({ tenant: owner, producer, call, stream: ok(decodeStreamId(stream)) }, codec),
  )
  const cursor = (position: number) =>
    ok(encodeStreamCursor({ ref, position: ok(decodeStreamPosition(String(position))) }))
  return { ref, codec, cursor }
}
function setup(limits: Partial<StreamLimits> = {}, producer: StreamProducer = 'model') {
  const id = identity(producer)
  const fixture = createStreamFixture<typeof principal, string, string, End>({
    tenant,
    ...id,
    limits: { ...defaults, ...limits },
  })
  fixture.setAccess(access, 'allow')
  fixture.confirm({ snapshot: 's0', cursor: id.cursor(0) })
  return { ...fixture, ...id }
}
function iterator<P, S, D, E>(
  observer: StreamObserver<P, S, D, E>,
  ref: StreamRef,
  auth: Access<P>,
  signal = new AbortController().signal,
) {
  return observer.observe({ ref, access: auth, signal })[Symbol.asyncIterator]()
}
async function frame<S, D, E>(
  reader: AsyncIterator<StreamFrame<S, D, E>>,
): Promise<StreamFrame<S, D, E>> {
  const next = await reader.next()
  expect(next.done).toBe(false)
  if (next.done) throw new Error('Missing expected frame')
  return next.value
}
async function returned<S, D, E>(reader: AsyncIterator<StreamFrame<S, D, E>>): Promise<void> {
  if (reader.return === undefined) throw new Error('Fixture must implement return')
  expect(await reader.return()).toEqual({ done: true, value: undefined })
}
const ended = (reason: string) => ({ kind: 'ended', reason })
const snapshot = (cursor: StreamCursor, value: string) => ({ kind: 'snapshot', cursor, value })
const delta = (from: StreamCursor, cursor: StreamCursor, value: string) => ({
  kind: 'delta',
  from,
  cursor,
  value,
})

// Independent oracle: sorted keys spelled out, UTF-8 encoded without the fixture meter.
function snapshotSize(cursor: StreamCursor, value: string): number {
  return Buffer.byteLength(
    `{"cursor":${JSON.stringify(cursor)},"kind":"snapshot","value":${JSON.stringify(value)}}`,
    'utf8',
  )
}
function deltaSize(from: StreamCursor, cursor: StreamCursor, value: string): number {
  return Buffer.byteLength(
    `{"cursor":${JSON.stringify(cursor)},"from":${JSON.stringify(from)},"kind":"delta","value":${JSON.stringify(value)}}`,
    'utf8',
  )
}
function endSize(code: string): number {
  return Buffer.byteLength(
    `{"kind":"ended","reason":"producer-ended","value":{"code":${JSON.stringify(code)}}}`,
    'utf8',
  )
}

describe('public observation snapshot and continuity', () => {
  it('O01 starts lazily with the confirmed snapshot', async () => {
    const f = setup()
    const reader = iterator(f.observer, f.ref, access)
    expect(f.resources()).toEqual(emptyResources)
    expect(await frame(reader)).toEqual(snapshot(f.cursor(0), 's0'))
    expect(f.resources().subscriptions).toBe(1)
    await returned(reader)
    expect(f.resources()).toEqual(emptyResources)
  })

  it('O02 reads and registers together across a controlled confirmation race', async () => {
    const f = setup()
    f.pauseBeforeSnapshot()
    const reader = iterator(f.observer, f.ref, access)
    const first = reader.next()
    await f.reachedSnapshot()
    f.commit({ snapshot: 's1', delta: 'd1', cursor: f.cursor(1) })
    f.resumeSnapshot()
    f.commit({ snapshot: 's2', delta: 'd2', cursor: f.cursor(2) })
    expect(await first).toEqual({ done: false, value: snapshot(f.cursor(1), 's1') })
    expect(await frame(reader)).toEqual(delta(f.cursor(1), f.cursor(2), 'd2'))
    await returned(reader)
  })

  it('O03 advances the public cursor for a state-only change', async () => {
    const id = identity()
    const f = createStreamFixture<
      typeof principal,
      { outputCursor: string; phase: string },
      { phase: string }
    >({ tenant, ...id, limits: defaults })
    f.setAccess(access, 'allow')
    f.confirm({ snapshot: { outputCursor: 'unchanged', phase: 'running' }, cursor: id.cursor(0) })
    const reader = iterator(f.observer, id.ref, access)
    expect(await frame(reader)).toEqual({
      kind: 'snapshot',
      cursor: id.cursor(0),
      value: { outputCursor: 'unchanged', phase: 'running' },
    })
    f.commit({
      snapshot: { outputCursor: 'unchanged', phase: 'settled' },
      delta: { phase: 'settled' },
      cursor: id.cursor(1),
    })
    expect(await frame(reader)).toEqual({
      kind: 'delta',
      from: id.cursor(0),
      cursor: id.cursor(1),
      value: { phase: 'settled' },
    })
    await returned(reader)
  })

  it('O04 keeps each observer contiguous and identical delta identities equal', async () => {
    const f = setup()
    f.commit({ snapshot: 's10', delta: 'd10', cursor: f.cursor(10) })
    const a = iterator(f.observer, f.ref, access)
    expect(await frame(a)).toEqual(snapshot(f.cursor(10), 's10'))
    f.commit({ snapshot: 's11', delta: 'd11', cursor: f.cursor(11) })
    const b = iterator(f.observer, f.ref, access)
    expect(await frame(b)).toEqual(snapshot(f.cursor(11), 's11'))
    f.commit({ snapshot: 's12', delta: 'd12', cursor: f.cursor(12) })
    expect(await frame(a)).toEqual(delta(f.cursor(10), f.cursor(11), 'd11'))
    const a12 = await frame(a)
    expect(a12).toEqual(delta(f.cursor(11), f.cursor(12), 'd12'))
    expect(await frame(b)).toEqual(a12)
    await returned(a)
    await returned(b)
  })

  it('copies snapshots, deltas and end values without freezing caller trees', async () => {
    const id = identity()
    type Value = { list: { text: string }[] }
    const f = createStreamFixture<typeof principal, Value, Value, Value>({
      tenant,
      ...id,
      limits: defaults,
    })
    f.setAccess(access, 'allow')
    const initialItem = { text: 'initial' }
    const initial = { list: [initialItem] }
    f.confirm({ snapshot: initial, cursor: id.cursor(0) })
    initialItem.text = 'caller edit'
    const a = iterator(f.observer, id.ref, access)
    const first = await frame(a)
    expect(first).toEqual({
      kind: 'snapshot',
      cursor: id.cursor(0),
      value: { list: [{ text: 'initial' }] },
    })
    expect(Object.isFrozen(initial.list)).toBe(false)
    if (first.kind !== 'snapshot') throw new Error('Expected snapshot')
    expect(Object.isFrozen(first.value.list[0])).toBe(true)
    const changeItem = { text: 'delta' }
    const change = { list: [changeItem] }
    f.commit({ snapshot: initial, delta: change, cursor: id.cursor(1) })
    changeItem.text = 'caller edit'
    expect(await frame(a)).toEqual({
      kind: 'delta',
      from: id.cursor(0),
      cursor: id.cursor(1),
      value: { list: [{ text: 'delta' }] },
    })
    const endItem = { text: 'closed' }
    const end = { list: [endItem] }
    f.end({ reason: 'producer-ended', value: end })
    endItem.text = 'caller edit'
    expect(await frame(a)).toEqual({
      kind: 'ended',
      reason: 'producer-ended',
      value: { list: [{ text: 'closed' }] },
    })
    expect(await frame(iterator(f.observer, id.ref, access))).toEqual({
      kind: 'ended',
      reason: 'producer-ended',
      value: { list: [{ text: 'closed' }] },
    })
  })

  it('rejects foreign or nonadvancing control cursors before changing confirmed state', async () => {
    const f = setup()
    for (const cursor of [f.cursor(0), identity('model', tenant, 'str_other').cursor(1)])
      expect(() => f.commit({ snapshot: 'bad', delta: 'bad', cursor })).toThrow()
    const reader = iterator(f.observer, f.ref, access)
    expect(await frame(reader)).toEqual(snapshot(f.cursor(0), 's0'))
    await returned(reader)
  })
})

describe('identity, qualification and publication checks', () => {
  it('O05 refuses malformed syntax before target lookup', async () => {
    const f = setup()
    // @ts-expect-error Simulates invalid serialized text at the typed caller boundary.
    const reader = iterator(f.observer, 'not a reference', access)
    expect(await frame(reader)).toEqual(ended('stale-stream'))
    expect(f.events()).toEqual([])
  })

  it.each(['foreign', 'unminted'] as const)(
    'O05 denies %s tenant without a target read',
    async kind => {
      const f = setup()
      const auth = { principal, tenant: kind === 'foreign' ? foreignTenant : { ...tenant } }
      expect(await frame(iterator(f.observer, f.ref, auth))).toEqual(ended('denied'))
      expect(f.events()).toEqual([])
    },
  )

  it('O05 denies a reference whose original call belongs to another tenant', async () => {
    const f = setup()
    const foreign = identity('model', foreignTenant)
    expect(await frame(iterator(f.observer, foreign.ref, access))).toEqual(ended('denied'))
    expect(f.resources()).toEqual(emptyResources)
  })

  it.each(['wrong-producer', 'unknown', 'retired'] as const)(
    'O05 exposes %s only after allow',
    async kind => {
      const f = setup()
      if (kind === 'retired') f.retire()
      const ref =
        kind === 'wrong-producer'
          ? identity('tool').ref
          : kind === 'unknown'
            ? identity('model', tenant, 'str_unknown').ref
            : f.ref
      expect(await frame(iterator(f.observer, ref, access))).toEqual(ended('stale-stream'))
      expect(f.events().some(event => event.action === 'target-read')).toBe(true)
      expect(f.resources()).toEqual(emptyResources)
    },
  )

  it.each(['deny', 'unavailable'] as const)(
    'O06 checks %s before stale target disclosure',
    async decision => {
      const f = setup()
      f.retire()
      f.setAccess(access, decision)
      expect(await frame(iterator(f.observer, f.ref, access))).toEqual(
        ended(decision === 'deny' ? 'denied' : 'unavailable'),
      )
      expect(f.events()).toEqual([])
    },
  )

  it('denies an equal-looking but different principal and defaults to deny', async () => {
    const f = setup()
    expect(
      await frame(iterator(f.observer, f.ref, { tenant, principal: { ...principal } })),
    ).toEqual(ended('denied'))
    expect(f.events()).toEqual([])
  })

  it('reports unavailable target source after qualification', async () => {
    const f = setup()
    f.setSource('unavailable')
    expect(await frame(iterator(f.observer, f.ref, access))).toEqual(ended('unavailable'))
    expect(f.events().some(event => event.action === 'target-read')).toBe(true)
  })

  it.each(['deny', 'unavailable'] as const)(
    'O07 rechecks %s after snapshot preparation waits',
    async decision => {
      const f = setup()
      f.pauseBeforeSnapshot()
      const reader = iterator(f.observer, f.ref, access)
      const first = reader.next()
      await f.reachedSnapshot()
      f.setAccess(access, decision)
      f.resumeSnapshot()
      expect(await first).toEqual({
        done: false,
        value: ended(decision === 'deny' ? 'denied' : 'unavailable'),
      })
      expect(await reader.next()).toEqual({ done: true, value: undefined })
      expect(f.resources()).toEqual(emptyResources)
    },
  )

  it('O07 discards queued content on revocation and cannot revive after regrant', async () => {
    const f = setup()
    const reader = iterator(f.observer, f.ref, access)
    await frame(reader)
    f.commit({ snapshot: 's1', delta: 'secret', cursor: f.cursor(1) })
    f.setAccess(access, 'deny')
    expect(f.resources()).toEqual(emptyResources)
    f.setAccess(access, 'allow')
    expect(await frame(reader)).toEqual(ended('denied'))
    expect(await reader.next()).toEqual({ done: true, value: undefined })
    const next = iterator(f.observer, f.ref, access)
    expect(await frame(next)).toEqual(snapshot(f.cursor(1), 's1'))
    await returned(next)
  })

  it('O17 retires the original ref without redirecting to a ready successor', async () => {
    const f = setup()
    const old = iterator(f.observer, f.ref, access)
    await frame(old)
    const id = identity('model', tenant, 'str_successor')
    const successor = createStreamFixture<typeof principal, string, string>({
      tenant,
      ...id,
      limits: defaults,
    })
    successor.setAccess(access, 'allow')
    successor.confirm({ snapshot: 'new generation', cursor: id.cursor(0) })
    f.retire()
    expect(await frame(old)).toEqual(ended('stale-stream'))
    expect(await frame(iterator(f.observer, f.ref, access))).toEqual(ended('stale-stream'))
    const fresh = iterator(successor.observer, id.ref, access)
    expect(await frame(fresh)).toEqual(snapshot(id.cursor(0), 'new generation'))
    await returned(fresh)
  })
})

describe('inclusive budgets and manual residence deadlines', () => {
  it.each([1, 2, 3])('O08 bounds queued frames at 2 with %i pending changes', async count => {
    const f = setup({ queueFrames: 2 })
    const reader = iterator(f.observer, f.ref, access)
    await frame(reader)
    for (let i = 1; i <= count; i++)
      f.commit({ snapshot: `s${i}`, delta: `d${i}`, cursor: f.cursor(i) })
    if (count > 2) {
      expect(f.resources()).toEqual(emptyResources)
      expect(await frame(reader)).toEqual({ kind: 'gap', reason: 'buffer', after: f.cursor(0) })
      expect(await reader.next()).toEqual({ done: true, value: undefined })
    } else {
      expect(f.resources().queuedFrames).toBe(count)
      for (let i = 1; i <= count; i++)
        expect(await frame(reader)).toEqual(delta(f.cursor(i - 1), f.cursor(i), `d${i}`))
      await returned(reader)
    }
  })

  it.each([-1, 0, 1])('O08 bounds complete queued bytes with budget offset %i', async offset => {
    const id = identity()
    const size = deltaSize(id.cursor(0), id.cursor(1), '中文😀')
    const f = setup({ queueBytes: size + offset })
    const reader = iterator(f.observer, f.ref, access)
    await frame(reader)
    f.commit({ snapshot: 's1', delta: '中文😀', cursor: f.cursor(1) })
    if (offset < 0) {
      expect(f.resources()).toEqual(emptyResources)
      expect(await frame(reader)).toEqual({ kind: 'gap', reason: 'buffer', after: f.cursor(0) })
    } else {
      expect(f.resources().queuedBytes).toBe(size)
      expect(await frame(reader)).toEqual(delta(f.cursor(0), f.cursor(1), '中文😀'))
      await returned(reader)
    }
  })

  it.each([99, 100, 101])(
    'O08 expires residency at elapsed %i with deadline 100',
    async elapsed => {
      const f = setup({ residenceMs: 100 })
      const reader = iterator(f.observer, f.ref, access)
      await frame(reader)
      f.commit({ snapshot: 's1', delta: 'd1', cursor: f.cursor(1) })
      f.advanceTime(elapsed)
      if (elapsed < 100) {
        expect(f.resources().scheduledDeadlines).toBe(1)
        expect(await frame(reader)).toEqual(delta(f.cursor(0), f.cursor(1), 'd1'))
        await returned(reader)
      } else {
        expect(f.resources()).toEqual(emptyResources)
        expect(await frame(reader)).toEqual({ kind: 'gap', reason: 'buffer', after: f.cursor(0) })
      }
    },
  )

  it('uses the oldest remaining deadline and the last actually delivered cursor', async () => {
    const f = setup({ residenceMs: 100 })
    const reader = iterator(f.observer, f.ref, access)
    await frame(reader)
    f.commit({ snapshot: 's1', delta: 'd1', cursor: f.cursor(1) })
    f.advanceTime(40)
    f.commit({ snapshot: 's2', delta: 'd2', cursor: f.cursor(2) })
    expect(await frame(reader)).toEqual(delta(f.cursor(0), f.cursor(1), 'd1'))
    f.advanceTime(99)
    expect(f.resources().queuedFrames).toBe(1)
    f.advanceTime(1)
    expect(await frame(reader)).toEqual({ kind: 'gap', reason: 'buffer', after: f.cursor(1) })
  })

  it('reports null after when the initial snapshot cannot fit the queue', async () => {
    const f = setup({ queueBytes: 1 })
    const reader = iterator(f.observer, f.ref, access)
    expect(await frame(reader)).toEqual({ kind: 'gap', after: null, reason: 'buffer' })
    expect(f.resources()).toEqual(emptyResources)
    expect(f.events().filter(event => event.action === 'subscribe')).toEqual([])
  })

  it.each([-1, 0, 1])('O09 bounds complete snapshot bytes with budget offset %i', async offset => {
    const id = identity()
    const size = snapshotSize(id.cursor(0), 's0')
    const f = setup({ snapshotBytes: size + offset })
    const reader = iterator(f.observer, f.ref, access)
    expect(await frame(reader)).toEqual(
      offset < 0 ? ended('capacity') : snapshot(f.cursor(0), 's0'),
    )
    if (offset < 0) {
      expect(f.events().filter(event => event.action === 'subscribe')).toEqual([])
      expect(f.resources()).toEqual(emptyResources)
    } else await returned(reader)
  })

  it.each([-1, 0, 1])('O09 bounds complete delta bytes with budget offset %i', async offset => {
    const id = identity()
    const size = deltaSize(id.cursor(0), id.cursor(1), 'd1')
    const f = setup({ deltaBytes: size + offset })
    const reader = iterator(f.observer, f.ref, access)
    await frame(reader)
    f.commit({ snapshot: 's1', delta: 'd1', cursor: f.cursor(1) })
    expect(await frame(reader)).toEqual(
      offset < 0
        ? { kind: 'gap', reason: 'buffer', after: f.cursor(0) }
        : delta(f.cursor(0), f.cursor(1), 'd1'),
    )
    if (offset >= 0) await returned(reader)
    expect(f.resources()).toEqual(emptyResources)
  })

  it.each([-1, 0, 1])(
    'O09 bounds complete producer end bytes with budget offset %i',
    async offset => {
      const size = endSize('结束😀')
      const f = setup({ producerEndBytes: size + offset })
      const reader = iterator(f.observer, f.ref, access)
      await frame(reader)
      const value = { code: '结束😀' }
      f.end({ reason: 'producer-ended', value })
      value.code = ''
      const expected =
        offset < 0
          ? ended('capacity')
          : { kind: 'ended', reason: 'producer-ended', value: { code: '结束😀' } }
      expect(await frame(reader)).toEqual(expected)
      expect(f.resources()).toEqual(emptyResources)
      expect(await reader.next()).toEqual({ done: true, value: undefined })
      // A later observation still sees the original source end, with its own admission check.
      expect(await frame(iterator(f.observer, f.ref, access))).toEqual(expected)
    },
  )

  it.each(['deny', 'unavailable'] as const)(
    'O10 protects an oversized producer end with %s qualification',
    async decision => {
      const f = setup({ producerEndBytes: 1 })
      const reader = iterator(f.observer, f.ref, access)
      await frame(reader)
      f.end({ reason: 'producer-ended', value: { code: 'large' } })
      f.setAccess(access, decision)
      expect(await frame(reader)).toEqual(ended(decision === 'deny' ? 'denied' : 'unavailable'))
      expect(await reader.next()).toEqual({ done: true, value: undefined })
      expect(f.resources()).toEqual(emptyResources)
    },
  )

  it('O10 preserves a queued buffer gap when a later producer end arrives', async () => {
    const f = setup({ queueFrames: 1, producerEndBytes: 1 })
    const reader = iterator(f.observer, f.ref, access)
    await frame(reader)
    f.commit({ snapshot: 's1', delta: 'd1', cursor: f.cursor(1) })
    f.commit({ snapshot: 's2', delta: 'd2', cursor: f.cursor(2) })
    f.end({ reason: 'producer-ended', value: { code: 'large' } })
    expect(await frame(reader)).toEqual({ kind: 'gap', reason: 'buffer', after: f.cursor(0) })
    expect(await reader.next()).toEqual({ done: true, value: undefined })
  })

  it.each(['deny', 'unavailable'] as const)('a queued gap still rechecks %s', async decision => {
    const f = setup({ deltaBytes: 1 })
    const reader = iterator(f.observer, f.ref, access)
    await frame(reader)
    f.commit({ snapshot: 's1', delta: 'd1', cursor: f.cursor(1) })
    f.setAccess(access, decision)
    expect(await frame(reader)).toEqual(ended(decision === 'deny' ? 'denied' : 'unavailable'))
    expect(f.resources()).toEqual(emptyResources)
  })

  it('O11 admits max-1 and max observers, refuses max+1 without evicting earlier readers', async () => {
    const f = setup({ observersPerTenant: 2 })
    const a = iterator(f.observer, f.ref, access)
    const b = iterator(f.observer, f.ref, access)
    expect(await frame(a)).toEqual(snapshot(f.cursor(0), 's0'))
    expect(f.resources().subscriptions).toBe(1)
    expect(await frame(b)).toEqual(snapshot(f.cursor(0), 's0'))
    expect(f.resources().subscriptions).toBe(2)
    expect(await frame(iterator(f.observer, f.ref, access))).toEqual(ended('capacity'))
    expect(f.resources()).toEqual({ ...emptyResources, subscriptions: 2 })
    f.commit({ snapshot: 's1', delta: 'd1', cursor: f.cursor(1) })
    expect(await frame(a)).toEqual(delta(f.cursor(0), f.cursor(1), 'd1'))
    expect(await frame(b)).toEqual(delta(f.cursor(0), f.cursor(1), 'd1'))
    await returned(a)
    await returned(b)
    expect(f.resources()).toEqual(emptyResources)
  })

  it.each([-1, 0, 1])(
    'O11 checks total buffer accounting before snapshot admission, offset %i',
    async offset => {
      const id = identity()
      const queued = deltaSize(id.cursor(0), id.cursor(1), 'd1')
      const nextSnapshot = snapshotSize(id.cursor(1), 's1')
      const f = setup({ totalMemoryBytes: queued + nextSnapshot + offset })
      const a = iterator(f.observer, f.ref, access)
      await frame(a)
      f.commit({ snapshot: 's1', delta: 'd1', cursor: f.cursor(1) })
      const b = iterator(f.observer, f.ref, access)
      expect(await frame(b)).toEqual(offset < 0 ? ended('capacity') : snapshot(f.cursor(1), 's1'))
      expect(f.resources().queuedBytes).toBe(queued)
      expect(f.resources().subscriptions).toBe(offset < 0 ? 1 : 2)
      expect(await frame(a)).toEqual(delta(f.cursor(0), f.cursor(1), 'd1'))
      await returned(a)
      await returned(b)
      expect(f.resources()).toEqual(emptyResources)
    },
  )

  it('terminates a slow observer when its next delta exceeds the global buffer budget', async () => {
    const id = identity()
    const size = deltaSize(id.cursor(0), id.cursor(1), 'd1')
    const f = setup({ totalMemoryBytes: size })
    const reader = iterator(f.observer, f.ref, access)
    await frame(reader)
    f.commit({ snapshot: 's1', delta: 'd1', cursor: f.cursor(1) })
    expect(f.resources().queuedBytes).toBe(size)
    f.commit({ snapshot: 's2', delta: 'd2', cursor: f.cursor(2) })
    expect(await frame(reader)).toEqual({ kind: 'gap', reason: 'buffer', after: f.cursor(0) })
    expect(f.resources()).toEqual(emptyResources)
  })

  it('meters UTF-8 JSON independently of key order while preserving arrays and tagged values', () => {
    const value = {
      z: ['😀', undefined, { lexeme: '1.00', kind: 'number' }],
      a: '中\n"',
      omitted: undefined,
    }
    const expected = '{"a":"中\\n\\\"","z":["😀",null,{"kind":"number","lexeme":"1.00"}]}'
    expect(observationBytes(value)).toBe(Buffer.byteLength(expected, 'utf8'))
    expect(observationBytes({ a: value.a, z: value.z })).toBe(Buffer.byteLength(expected, 'utf8'))
    expect(copyObservationValue(value)).toEqual(value)
  })

  it.each(Object.keys(defaults) as (keyof StreamLimits)[])(
    'rejects nonfinite or nonpositive %s configuration',
    key => {
      for (const value of [
        0,
        -1,
        0.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.MAX_SAFE_INTEGER + 1,
      ])
        expect(() => setup({ [key]: value })).toThrow('positive safe integers')
    },
  )
})

describe('terminal delivery and observation-only cleanup', () => {
  it.each(['source-history', 'source-closed', 'producer-ended'] as const)(
    'O12 emits one %s terminal and then done',
    async reason => {
      const f = setup()
      const reader = iterator(f.observer, f.ref, access)
      await frame(reader)
      f.commit({ snapshot: 's1', delta: 'discarded', cursor: f.cursor(1) })
      if (reason === 'source-history') f.sourceGap()
      else if (reason === 'source-closed') f.end({ reason })
      else f.end({ reason, value: { code: 'closed' } })
      expect(f.resources()).toEqual(emptyResources)
      const expected =
        reason === 'source-history'
          ? { kind: 'gap', after: f.cursor(0), reason }
          : reason === 'source-closed'
            ? ended(reason)
            : { kind: 'ended', reason, value: { code: 'closed' } }
      expect(await frame(reader)).toEqual(expected)
      expect(await reader.next()).toEqual({ done: true, value: undefined })
      f.sourceGap()
      f.retire()
      expect(await reader.next()).toEqual({ done: true, value: undefined })
    },
  )

  it.each(['before-first-next', 'queued-content'] as const)(
    'keeps the original signal after the caller replaces its input signal: %s',
    async timing => {
      const f = setup()
      const original = new AbortController()
      const replacement = new AbortController()
      const request = { ref: f.ref, access, signal: original.signal }
      const reader = f.observer.observe(request)[Symbol.asyncIterator]()
      request.signal = replacement.signal
      if (timing === 'queued-content') {
        replacement.abort()
        expect(await frame(reader)).toEqual({ kind: 'snapshot', cursor: f.cursor(0), value: 's0' })
        f.commit({ snapshot: 's1', delta: 'post-abort content', cursor: f.cursor(1) })
      }
      original.abort()
      expect(await frame(reader)).toEqual(ended('observer-closed'))
      expect(await reader.next()).toEqual({ done: true, value: undefined })
      expect(f.resources()).toEqual(emptyResources)
    },
  )

  it('O13 abort resolves pending next and leaves the producer available', async () => {
    const f = setup()
    const controller = new AbortController()
    const reader = iterator(f.observer, f.ref, access, controller.signal)
    await frame(reader)
    const waiting = reader.next()
    controller.abort()
    controller.abort()
    expect(await waiting).toEqual({ done: false, value: ended('observer-closed') })
    expect(f.resources()).toEqual(emptyResources)
    await returned(reader)
    f.commit({ snapshot: 'still running', delta: 'd1', cursor: f.cursor(1) })
    const fresh = iterator(f.observer, f.ref, access)
    expect(await frame(fresh)).toEqual(snapshot(f.cursor(1), 'still running'))
    await returned(fresh)
    expect(
      f.events().every(event => ['target-read', 'subscribe', 'unsubscribe'].includes(event.action)),
    ).toBe(true)
  })

  it('O13 return completes every pending and future next, even after abort', async () => {
    const f = setup()
    const controller = new AbortController()
    const reader = iterator(f.observer, f.ref, access, controller.signal)
    await frame(reader)
    const waiting = [reader.next(), reader.next()]
    await returned(reader)
    controller.abort()
    await returned(reader)
    expect(await Promise.all(waiting)).toEqual([
      { done: true, value: undefined },
      { done: true, value: undefined },
    ])
    expect(await reader.next()).toEqual({ done: true, value: undefined })
    expect(f.resources()).toEqual(emptyResources)
  })

  it('an abort before first next emits no snapshot; return before next emits nothing', async () => {
    const f = setup()
    const controller = new AbortController()
    controller.abort()
    const aborted = iterator(f.observer, f.ref, access, controller.signal)
    expect(await frame(aborted)).toEqual(ended('observer-closed'))
    const unused = iterator(f.observer, f.ref, access)
    await returned(unused)
    expect(await unused.next()).toEqual({ done: true, value: undefined })
    expect(f.events().filter(event => event.action === 'subscribe')).toEqual([])
    expect(f.resources()).toEqual(emptyResources)
  })

  it('removes a waiting snapshot observation on return and repeated abort', async () => {
    const f = setup()
    const controller = new AbortController()
    f.pauseBeforeSnapshot()
    const reader = iterator(f.observer, f.ref, access, controller.signal)
    const pending = reader.next()
    await f.reachedSnapshot()
    await returned(reader)
    controller.abort()
    f.resumeSnapshot()
    expect(await pending).toEqual({ done: true, value: undefined })
    expect(await reader.next()).toEqual({ done: true, value: undefined })
    expect(f.resources()).toEqual(emptyResources)
  })

  it('return wins over a pending, not yet emitted abort terminal', async () => {
    const f = setup()
    const controller = new AbortController()
    const reader = iterator(f.observer, f.ref, access, controller.signal)
    await frame(reader)
    f.commit({ snapshot: 's1', delta: 'queued', cursor: f.cursor(1) })
    controller.abort()
    expect(f.resources()).toEqual(emptyResources)
    await returned(reader)
    expect(await reader.next()).toEqual({ done: true, value: undefined })
  })

  it.each(['gap', 'end', 'abort'] as const)(
    'O14 settles concurrent next calls in call order on %s',
    async action => {
      const f = setup()
      const controller = new AbortController()
      const reader = iterator(f.observer, f.ref, access, controller.signal)
      await frame(reader)
      const pending = [reader.next(), reader.next(), reader.next()]
      if (action === 'gap') f.sourceGap()
      else if (action === 'end') f.end({ reason: 'source-closed' })
      else controller.abort()
      const expected =
        action === 'gap'
          ? { kind: 'gap', after: f.cursor(0), reason: 'source-history' }
          : ended(action === 'end' ? 'source-closed' : 'observer-closed')
      expect(await Promise.all(pending)).toEqual([
        { done: false, value: expected },
        { done: true, value: undefined },
        { done: true, value: undefined },
      ])
      expect(f.resources()).toEqual(emptyResources)
    },
  )

  it('pending calls receive snapshot and confirmed deltas in order before terminal', async () => {
    const f = setup()
    f.pauseBeforeSnapshot()
    const reader = iterator(f.observer, f.ref, access)
    const pending = [reader.next(), reader.next(), reader.next()]
    await f.reachedSnapshot()
    f.resumeSnapshot()
    f.commit({ snapshot: 's1', delta: 'd1', cursor: f.cursor(1) })
    f.end({ reason: 'source-closed' })
    expect(await Promise.all(pending)).toEqual([
      { done: false, value: snapshot(f.cursor(0), 's0') },
      { done: false, value: delta(f.cursor(0), f.cursor(1), 'd1') },
      { done: false, value: ended('source-closed') },
    ])
    expect(f.resources()).toEqual(emptyResources)
  })

  it.each(['model', 'tool'] as const)(
    'O16 consumes %s codec injection and owned E without domain imports',
    async producer => {
      const f = setup({}, producer)
      const reader = iterator(f.observer, f.ref, access)
      expect(await frame(reader)).toEqual(snapshot(f.cursor(0), 's0'))
      f.end({ reason: 'producer-ended', value: { code: `${producer}-closed` } })
      expect(await frame(reader)).toEqual({
        kind: 'ended',
        reason: 'producer-ended',
        value: { code: `${producer}-closed` },
      })
    },
  )
})

async function observeConnection<S, D, E>(frames: AsyncIterable<StreamFrame<S, D, E>>) {
  try {
    for await (const value of frames) {
      if (value.kind === 'gap' || value.kind === 'ended')
        return { observation: 'ended', businessComplete: false, saved: false, acknowledged: false }
    }
  } catch {
    return {
      observation: 'connection-failed',
      businessComplete: false,
      saved: false,
      acknowledged: false,
    }
  }
  return {
    observation: 'connection-failed',
    businessComplete: false,
    saved: false,
    acknowledged: false,
  }
}

describe('consumer connection-failure oracle', () => {
  it.each(['throw', 'eof'] as const)(
    'O15 rejects a nonconforming %s as normal completion',
    async failure => {
      const f = setup()
      const broken: StreamObserver<typeof principal, string, string> = {
        observe() {
          return {
            async *[Symbol.asyncIterator]() {
              yield { kind: 'snapshot', cursor: f.cursor(0), value: 's0' }
              if (failure === 'throw') throw new Error('Internal dependency failure')
            },
          }
        },
      }
      const result = await observeConnection(
        broken.observe({ ref: f.ref, access, signal: new AbortController().signal }),
      )
      expect(result).toEqual({
        observation: 'connection-failed',
        businessComplete: false,
        saved: false,
        acknowledged: false,
      })
      expect(result.observation).not.toBe('ended')
    },
  )

  it('accepts a standard source end only as an observation end', async () => {
    const f = setup()
    f.end({ reason: 'source-closed' })
    expect(
      await observeConnection(
        f.observer.observe({ ref: f.ref, access, signal: new AbortController().signal }),
      ),
    ).toEqual({ observation: 'ended', businessComplete: false, saved: false, acknowledged: false })
  })
})
