import { expect, it } from 'vitest'
import { createLocalToolRuntimePlugins } from '../../src/runtime-cordis.ts'
import { createRuntimeSourceAccess } from '../../src/runtime-composition.ts'
import { INVOCATION_SOURCE_DOMAIN_KEY } from '../../src/invocation-source.ts'
import { resolveToolInvocationRef } from '@omne-harness/tool-contract'
import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { succeed } from '@omne-harness/operation-result'
import { accepted, fixture, unbox } from './fixture.ts'

it('C05 requires a declared durable store and refuses foreign tenant reads', async () => {
  const world = await fixture()
  try {
    expect(() =>
      createLocalToolRuntimePlugins({
        ...world.input,
        store: { ...world.store, durability: 'none' },
      }),
    ).toThrow('durable')
    const reference = accepted(await world.api.invoke(world.invocation('isolation')))
    await world.settled(reference)
    expect(await world.api.queries.lookup(world.query(reference, world.tenantB))).toMatchObject({
      failure: { kind: 'denied' },
    })
  } finally {
    await world.close()
  }
})

it('receiver withdrawal preserves delivery, then restoration saves the original result', async () => {
  const world = await fixture()
  try {
    await world.removeReceiver()
    const reference = accepted(await world.api.invoke(world.invocation('receiver')))
    await world.settled(reference)
    expect(world.deliveries).toHaveLength(0)
    expect(unbox(await world.api.queries.lookup(world.query(reference)))).toMatchObject({
      state: { delivery: { kind: 'pending' } },
    })
    await world.restoreReceiver()
    await expect.poll(() => world.deliveries.length).toBe(1)
    expect(world.launches()).toBe(1)
  } finally {
    await world.close()
  }
})

it('missing execution provider leaves preparation pending and never invokes the author', async () => {
  const world = await fixture()
  try {
    await world.environments.dispose()
    const reference = accepted(await world.api.invoke(world.invocation('missing-environment')))
    await expect
      .poll(async () => {
        const read = unbox(await world.api.queries.lookup(world.query(reference)))
        return read.kind === 'found' ? read.state.phase : null
      })
      .toBe('preparing')
    expect(world.launches()).toBe(0)
  } finally {
    await world.close()
  }
})

it('C07 retirement rejects new work while preserving unresolved delivery for reads', async () => {
  const world = await fixture()
  try {
    await world.removeReceiver()
    const reference = accepted(await world.api.invoke(world.invocation('retired')))
    await world.settled(reference)
    await world.plugins.close()
    expect(await world.api.invoke(world.invocation('new'))).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'unavailable' },
    })
    expect(unbox(await world.api.queries.lookup(world.query(reference)))).toMatchObject({
      state: { delivery: { kind: 'pending' } },
    })
    expect(world.plugins.diagnostics().retired).toBe(true)
  } finally {
    await world.close()
  }
})

it('completed and definitely rejected calls release the bounded scheduling capacity', async () => {
  const world = await fixture(undefined, undefined, 1)
  try {
    const denied = world.invocation('bad-grant')
    expect(
      await world.api.invoke({
        ...denied,
        request: { ...denied.request, scope: { ...denied.request.scope, key: 'foreign' } },
      }),
    ).toMatchObject({ kind: 'rejected' })
    expect(world.plugins.diagnostics().executor?.knownCalls).toBe(0)
    const first = accepted(await world.api.invoke(world.invocation('first-slot')))
    await world.settled(first)
    await expect.poll(() => world.plugins.diagnostics().executor?.knownCalls).toBe(0)
    const firstParts = unbox(resolveToolInvocationRef(first, world.tenantA))
    const retained = unbox(
      await world.root.toolCommands.loadRecovery({
        tenant: world.tenantA,
        principal: 'alice',
        call: firstParts.call,
      }),
    )
    expect(retained.tasks).toContainEqual(
      expect.objectContaining({ kind: 'clock', state: 'blocked' }),
    )
    const second = accepted(await world.api.invoke(world.invocation('second-slot')))
    await world.settled(second)
    expect(world.launches()).toBe(2)
  } finally {
    await world.close()
  }
})

it('a new executor reads the original call but never attaches or restarts its old execution', async () => {
  let complete: (value: string) => void = () => {}
  const world = await fixture(
    () =>
      new Promise(resolve => {
        complete = resolve
      }),
  )
  let reopened: Awaited<ReturnType<typeof world.newExecutor>> | null = null
  try {
    const request = world.invocation('old-execution')
    const reference = accepted(await world.api.invoke(request))
    await expect.poll(() => world.launches()).toBe(1)
    await world.plugins.close()
    reopened = await world.newExecutor()
    expect(accepted(await reopened.api.invoke(request))).toBe(reference)
    const next = reopened
    const parts = unbox(resolveToolInvocationRef(reference, world.tenantA))
    await next.schedule({ tenant: world.tenantA, call: parts.call })
    await expect
      .poll(() => next.plugins.diagnostics().executor?.unownedRuns ?? 0)
      .toBeGreaterThan(0)
    expect(world.launches()).toBe(1)
    expect(unbox(await next.api.instances.current(world.streamQuery(reference))).current).toBeNull()
    expect(world.signals.get('{"value":"old-execution"}')?.aborted).toBe(false)
  } finally {
    complete('cleanup')
    await reopened?.close()
    await world.close()
  }
})

it('recovers the original initiator from the complete persisted source instead of the latest caller', async () => {
  const world = await fixture()
  try {
    const first = accepted(await world.api.invoke(world.invocation('original-source')))
    await world.settled(first)
    const second = accepted(await world.api.invoke(world.invocation('later-source', world.tenantB)))
    await world.settled(second, world.tenantB)
    const parts = unbox(resolveToolInvocationRef(first, world.tenantA))
    const resolve = createRuntimeSourceAccess({
      store: world.store,
      sources: world.input.sources,
      access: world.input.access,
      recovery: world.input.subjects,
    })
    expect(unbox(await resolve({ tenant: world.tenantA, call: parts.call })).principal).toBe(
      'alice',
    )
    const wrongResolver = createRuntimeSourceAccess({
      store: world.store,
      sources: world.input.sources,
      access: world.input.access,
      recovery: { ...world.input.subjects, resolveSessionWork: async () => succeed('bob') },
    })
    expect(await wrongResolver({ tenant: world.tenantA, call: parts.call })).toMatchObject({
      failure: { kind: 'denied' },
    })
  } finally {
    await world.close()
  }
})

it('does not claim an old admitted call that never acquired an execution', async () => {
  const world = await fixture()
  let reopened: Awaited<ReturnType<typeof world.newExecutor>> | null = null
  try {
    await world.environments.dispose()
    const request = world.invocation('old-preparation')
    const reference = accepted(await world.api.invoke(request))
    await expect
      .poll(async () => {
        const read = unbox(await world.api.queries.lookup(world.query(reference)))
        return read.kind === 'found' ? read.state.phase : null
      })
      .toBe('preparing')
    await world.plugins.close()
    reopened = await world.newExecutor()
    const next = reopened
    expect(accepted(await next.api.invoke(request))).toBe(reference)
    await expect
      .poll(() => next.plugins.diagnostics().executor?.unownedRuns ?? 0)
      .toBeGreaterThan(0)
    expect(world.launches()).toBe(0)
    expect(unbox(await next.api.queries.lookup(world.query(reference)))).toMatchObject({
      state: { phase: 'preparing' },
    })
  } finally {
    await reopened?.close()
    await world.close()
  }
})

it('does not re-sign a principal when the stored original invocation binding is inconsistent', async () => {
  const world = await fixture()
  try {
    const reference = accepted(await world.api.invoke(world.invocation('corrupt-source')))
    await world.settled(reference)
    const parts = unbox(resolveToolInvocationRef(reference, world.tenantA))
    const domain = {
      kind: 'host' as const,
      tenant: world.tenantA,
      key: INVOCATION_SOURCE_DOMAIN_KEY,
    }
    const read = await world.store.read(domain)
    if (read.kind !== 'complete') throw new Error('Missing source domain')
    const source = read.records.find(row => row.kind === 'host')
    if (
      source?.kind !== 'host' ||
      typeof source.host.value !== 'object' ||
      source.host.value === null
    )
      throw new Error('Missing source binding')
    expect(
      await world.store.commit({
        domain,
        expected: read.revision,
        revision: unbox(decodeToolRevision(String(BigInt(read.revision) + 1n))),
        writes: [
          {
            kind: 'put',
            record: {
              kind: 'host',
              host: { ...source.host, value: { ...source.host.value, fixedDigest: 'corrupted' } },
            },
          },
        ],
      }),
    ).toEqual({ kind: 'committed' })
    let restored = 0
    const resolve = createRuntimeSourceAccess({
      store: world.store,
      sources: world.input.sources,
      access: world.input.access,
      recovery: {
        ...world.input.subjects,
        resolveSessionWork: async input => {
          restored += 1
          return world.input.subjects.resolveSessionWork(input)
        },
      },
    })
    expect(await resolve({ tenant: world.tenantA, call: parts.call })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(restored).toBe(0)
  } finally {
    await world.close()
  }
})

it('retirement cancels a pending identity wait without inventing a stop or deleting the admission', async () => {
  const world = await fixture()
  const blocked = world.holdSubjectRecovery()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const reference = accepted(await world.api.invoke(world.invocation('identity-outage')))
    await blocked.entered
    const closed = await Promise.race([
      world.plugins.close().then(() => 'closed'),
      new Promise<'still-waiting'>(resolve => {
        timer = setTimeout(() => resolve('still-waiting'), 1000)
      }),
    ])
    expect(closed).toBe('closed')
    expect(world.launches()).toBe(0)
    expect(unbox(await world.api.queries.lookup(world.query(reference)))).toMatchObject({
      kind: 'found',
      state: { phase: 'accepted' },
    })
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    blocked.release()
    await world.close()
  }
})
