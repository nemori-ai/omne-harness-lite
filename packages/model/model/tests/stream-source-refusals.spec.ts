import { expect, it } from 'vitest'
import {
  decodeDispatchId,
  encodeModelInvocationRef,
  type CallState,
} from '@omne-harness/model-contract'
import { decodeStreamId, encodeStreamRef, type StreamRef } from '@omne-harness/stream-arrival'
import { createModelObservationSource } from '../src/stream-source.ts'
import type { ModelCommandsAuthority } from '../src/commands/types.ts'
import { callId, identity, op, unbox } from './memory-fixture.ts'
import { streamFixture } from './stream-source.spec.ts'

// Refusals of the confirmation source: facts that contradict their own call, references that
// name no call of the reader, and the publication capacity. Each test fails if the source
// installs or answers what it must refuse.

type Fixture = ReturnType<typeof streamFixture>

/** The fixture state again, differing only in what is known about its first content. */
function withFirstContent(state: CallState, firstContent: 'observed' | 'uncertain'): CallState {
  if (state.phase !== 'running') throw new Error('fixture state')
  return { ...state, firstContent }
}

async function published(f: Fixture) {
  f.host.attach(f.publication)
  f.confirm(f.facts())
  const current = unbox(await f.current()).current
  if (!current) throw new Error('fixture target')
  return current.ref
}

async function firstFrame(
  host: Fixture['host'],
  ref: StreamRef,
  access: Fixture['access'],
): Promise<unknown> {
  const iterator = host.observation
    .observe({ ref, access, signal: new AbortController().signal })
    [Symbol.asyncIterator]()
  const frame = (await iterator.next()).value
  await iterator.return?.()
  return frame
}

/** A second source over the same fixture whose tenant-level observe answer is fixed. */
function sourceWithTenantAnswer(f: Fixture, allow: boolean) {
  const base = f.options.authority
  const authority: ModelCommandsAuthority<Fixture['principal']> = {
    ...base,
    authorize: request =>
      request.resource.kind === 'tenant'
        ? allow
          ? { ok: { owner: 'identity', subject: 'trusted', revision: '1' } }
          : { failure: { kind: 'denied', action: request.action } }
        : base.authorize(request),
  }
  const source = createModelObservationSource({
    authority,
    limits: {
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
    },
    timing: { nowMs: () => 0, waitUntil: () => new Promise(() => {}) },
    refresh: async () => ({ ok: undefined }),
  })
  return { source, host: unbox(source.source.openHost()) }
}

it('throws on facts whose reference names another call or admission and installs nothing', async () => {
  const f = streamFixture()
  const facts = f.facts()
  expect(() => f.confirm({ ...facts, admission: op('other') })).toThrow('observation facts binding')
  expect(() => f.confirm({ ...facts, state: { ...facts.state, call: callId('two') } })).toThrow(
    'observation facts binding',
  )
  expect(await f.current()).toHaveProperty('failure.kind', 'unavailable')
  f.confirm(facts)
  expect(unbox(await f.current()).state.revision).toBe('1')
  f.source.close()
})

it('makes the call unavailable when newer facts arrive under another reference of it', async () => {
  const f = streamFixture()
  f.confirm(f.facts())
  const admission = op('second')
  const reference = unbox(
    encodeModelInvocationRef({ tenant: f.tenant, call: f.admit.call, admission }),
  )
  f.confirm({ ...f.facts('2'), reference, admission })
  expect(await f.current()).toHaveProperty('failure.kind', 'unavailable')
  f.source.close()
})

it.each([
  [
    'an execution of another call',
    (f: Fixture) => ({
      ...f.facts(),
      execution: { ...f.publication.execution, call: callId('two') },
    }),
  ],
  [
    'an execution of another tenant',
    (f: Fixture) => ({
      ...f.facts(),
      execution: { ...f.publication.execution, tenant: identity('6') },
    }),
  ],
  [
    'a retained snapshot of another call',
    (f: Fixture) => {
      const facts = f.facts()
      if (facts.material.kind !== 'retained') throw new Error('fixture material')
      return {
        ...facts,
        material: {
          ...facts.material,
          snapshot: { ...facts.material.snapshot, call: callId('two') },
        },
      }
    },
  ],
  [
    'a retained snapshot of another state',
    (f: Fixture) => {
      const facts = f.facts()
      if (facts.material.kind !== 'retained') throw new Error('fixture material')
      const state = withFirstContent(facts.state, 'uncertain')
      return {
        ...facts,
        material: { ...facts.material, snapshot: { ...facts.material.snapshot, state } },
      }
    },
  ],
])('installs nothing from facts that carry %s', async (_name, contradicting) => {
  const f = streamFixture()
  f.confirm(contradicting(f))
  expect(await f.current()).toHaveProperty('failure.kind', 'unavailable')
  f.confirm(f.facts())
  expect(unbox(await f.current()).state.revision).toBe('1')
  f.source.close()
})

it.each([
  ['another content cursor', (f: Fixture) => f.facts('1', '1')],
  [
    'another dispatch',
    (f: Fixture) => {
      const facts = f.facts()
      if (facts.material.kind !== 'retained') throw new Error('fixture material')
      return {
        ...facts,
        material: { ...facts.material, dispatch: unbox(decodeDispatchId('mdisp_two')) },
      }
    },
  ],
  [
    'another state',
    (f: Fixture) => {
      const facts = f.facts()
      if (facts.material.kind !== 'retained') throw new Error('fixture material')
      const state = withFirstContent(facts.state, 'observed')
      return {
        ...facts,
        state,
        material: { ...facts.material, snapshot: { ...facts.material.snapshot, state } },
      }
    },
  ],
])('makes the call unavailable when the same revision repeats with %s', async (_name, repeat) => {
  const f = streamFixture()
  f.confirm(f.facts())
  expect(unbox(await f.current()).state.revision).toBe('1')
  f.confirm(repeat(f))
  expect(await f.current()).toHaveProperty('failure.kind', 'unavailable')
  f.source.close()
})

it('answers current with the reference failure of a foreign or malformed reference', async () => {
  const f = streamFixture()
  f.confirm(f.facts())
  const foreign = { tenant: identity('6'), principal: f.principal }
  expect(await f.host.references.current({ access: foreign, reference: f.reference })).toEqual({
    failure: { kind: 'denied', action: 'current' },
  })
  const malformed = await f.host.references.current({
    access: f.access,
    reference: 'not-a-reference' as typeof f.reference,
  })
  expect(malformed).toHaveProperty('failure.kind', 'invalid')
  expect(malformed).toHaveProperty('failure.field', 'reference')
  expect(malformed).toHaveProperty('failure.reason', expect.stringMatching(/^reference-/))
  f.source.close()
})

it('refuses current through a reference of the same call under another admission', async () => {
  const f = streamFixture()
  f.confirm(f.facts())
  const reference = unbox(
    encodeModelInvocationRef({ tenant: f.tenant, call: f.admit.call, admission: op('second') }),
  )
  expect(await f.host.references.current({ access: f.access, reference })).toEqual({
    failure: { kind: 'invalid', field: 'admission', reason: 'not-original' },
  })
  f.source.close()
})

it('denies a stream reference of another tenant even when the reader may observe its own tenant', async () => {
  const f = streamFixture()
  const { source, host } = sourceWithTenantAnswer(f, true)
  host.attach(f.publication)
  source.confirm(f.facts())
  const current = unbox(await host.references.current({ access: f.access, reference: f.reference }))
  if (!current.current) throw new Error('fixture target')
  const foreign = { tenant: identity('6'), principal: f.principal }
  expect(await firstFrame(host, current.current.ref, foreign)).toEqual({
    kind: 'ended',
    reason: 'denied',
  })
  source.source.close()
  f.source.close()
})

it('answers a reference that names no model call by the tenant-level observe answer', async () => {
  const f = streamFixture()
  const tool = unbox(
    encodeStreamRef(
      {
        tenant: f.tenant,
        producer: 'tool',
        call: 'tool-call',
        stream: unbox(decodeStreamId('str_tool')),
      },
      { producer: 'tool', resolve: ({ text }) => ({ ok: String(text) }) },
    ),
  )
  const allowed = sourceWithTenantAnswer(f, true)
  expect(await firstFrame(allowed.host, tool, f.access)).toEqual({
    kind: 'ended',
    reason: 'stale-stream',
  })
  const denied = sourceWithTenantAnswer(f, false)
  expect(await firstFrame(denied.host, tool, f.access)).toEqual({
    kind: 'ended',
    reason: 'denied',
  })
  // A malformed reference is stale before any tenant-level answer is asked.
  expect(await firstFrame(denied.host, 'not-a-ref' as StreamRef, f.access)).toEqual({
    kind: 'ended',
    reason: 'stale-stream',
  })
  allowed.source.source.close()
  denied.source.source.close()
  f.source.close()
})

it('bounds publications by the retained calls and still lets a held call change its publication', async () => {
  const f = streamFixture({ maxRetainedCalls: 1 })
  await published(f)
  const other = { ...f.publication.execution, call: callId('two') }
  expect(() => f.host.attach({ execution: other, registration: 'one' })).toThrow(
    'observation publication capacity',
  )
  expect(() => f.host.attach({ ...f.publication, registration: 'two' })).not.toThrow()
  expect(unbox(await f.current()).current).not.toBeNull()
  f.source.close()
})
