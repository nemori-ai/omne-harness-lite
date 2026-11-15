import { expect, it } from 'vitest'
import type { DurableEvidence, ToolInvocationRef } from '@omne-harness/tool-contract'
import { accepted, fixture, unbox } from './fixture.ts'

type World = Awaited<ReturnType<typeof fixture>>
type Executor = Awaited<ReturnType<World['newExecutor']>>

const proof = (instance: string): DurableEvidence => ({
  owner: 'contact-spec',
  record: 'state-lock',
  revision: '1',
  digest: `instance:${instance}`,
})

function held() {
  const release = Promise.withResolvers<string>()
  return {
    author: (value: string) =>
      value.includes('hold') ? release.promise : Promise.resolve(`answer:${value}`),
    release: () => release.resolve('released'),
  }
}

const diagnostics = (executor: Pick<Executor, 'plugins'>) => {
  const read = executor.plugins.diagnostics().executor
  if (read === null) throw new Error('no executor')
  return read
}

const contact = async (
  executor: Pick<Executor, 'api'>,
  world: World,
  reference: ToolInvocationRef,
) => unbox(await executor.api.queries.contact(world.query(reference))).kind

const phase = async (
  executor: Pick<Executor, 'api'>,
  world: World,
  reference: ToolInvocationRef,
) => {
  const found = unbox(await executor.api.queries.lookup(world.query(reference)))
  return found.kind === 'found' ? found.state.phase : found.kind
}

async function unstarted(world: World, value: string) {
  await world.environments.dispose()
  const reference = accepted(await world.api.invoke(world.invocation(value)))
  await expect.poll(() => phase(world, world, reference)).toBe('preparing')
  await world.plugins.close()
  return reference
}

async function unstartedBeside(world: World, value: string) {
  await world.environments.dispose()
  const reference = accepted(await world.api.invoke(world.invocation(value)))
  await expect.poll(() => phase(world, world, reference)).toBe('preparing')
  return reference
}

it('a call the records do not hold is not-accepted', async () => {
  const world = await fixture()
  try {
    const reference = accepted(await world.api.invoke(world.invocation('other-tenant')))
    await world.settled(reference)
    expect(unbox(await world.api.queries.contact(world.query(reference, world.tenantB)))).toEqual({
      kind: 'not-accepted',
    })
  } finally {
    await world.close()
  }
})

it('a principal that may not look the call up is denied before the living half is asked: no holding for a call that is held, and a call that is not held is not taken back', async () => {
  const author = held()
  const world = await fixture(author.author)
  let next: Executor | null = null
  try {
    next = await world.newExecutor({ lostContact: () => null })
    const reference = accepted(await world.api.invoke(world.invocation('hold-denied')))
    await expect.poll(() => world.launches()).toBe(1)
    const stranger = { ...world.query(reference), principal: 'bob' }
    expect(diagnostics(world).knownCalls).toBe(1)
    expect(await world.api.queries.contact(stranger)).toEqual({
      failure: { kind: 'denied', action: 'lookup' },
    })
    expect(await world.api.queries.lookup(stranger)).toEqual({
      failure: { kind: 'denied', action: 'lookup' },
    })
    const unheld = await unstartedBeside(world, 'denied-and-not-held')
    expect(diagnostics(next).knownCalls).toBe(0)
    expect(await next.api.queries.contact({ ...world.query(unheld), principal: 'bob' })).toEqual({
      failure: { kind: 'denied', action: 'lookup' },
    })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(diagnostics(next)).toMatchObject({ knownCalls: 0, unownedRuns: 0 })
    expect(await phase(next, world, unheld)).toBe('preparing')
  } finally {
    author.release()
    await next?.close()
    await world.close()
  }
})

it('a call this executor started and still runs is holding', async () => {
  const author = held()
  const world = await fixture(author.author)
  try {
    const reference = accepted(await world.api.invoke(world.invocation('hold-own')))
    await expect.poll(() => world.launches()).toBe(1)
    expect(await contact(world, world, reference)).toBe('holding')
    expect(diagnostics(world).reentries).toBe(0)
    author.release()
    await world.settled(reference)
    expect(world.launches()).toBe(1)
  } finally {
    author.release()
    await world.close()
  }
})

it('an accepted call that never started and that no executor holds is taken back: holding, then started once under its identity and settled', async () => {
  const world = await fixture()
  let next: Executor | null = null
  try {
    next = await world.newExecutor()
    const reference = await unstarted(world, 'never-started')
    expect(diagnostics(next).knownCalls).toBe(0)
    expect(await contact(next, world, reference)).toBe('holding')
    const taken = next
    await expect.poll(() => phase(taken, world, reference), { timeout: 3_000 }).toBe('settled')
    expect(world.launches()).toBe(1)
    expect(await contact(next, world, reference)).toBe('settled')
  } finally {
    await next?.close()
    await world.close()
  }
})

it('a call that the full table cannot take back is unknown', async () => {
  const author = held()
  const world = await fixture(author.author)
  let next: Executor | null = null
  try {
    next = await world.newExecutor({ capacity: 1 })
    const reference = await unstarted(world, 'no-room')
    accepted(await next.api.invoke(world.invocation('hold-the-only-slot')))
    expect(diagnostics(next).knownCalls).toBe(1)
    expect(await contact(next, world, reference)).toBe('unknown')
    expect(await phase(next, world, reference)).toBe('preparing')
  } finally {
    author.release()
    await next?.close()
    await world.close()
  }
})

it.each([
  ['no judgment source', {}],
  ['a judgment source that gives no proof', { lostContact: () => null }],
] as const)(
  'a call another instance started is unknown with %s: it is not taken back, and nothing is written',
  async (_name, judgment) => {
    const author = held()
    const world = await fixture(author.author)
    let next: Executor | null = null
    let commits = 0
    try {
      next = await world.newExecutor({
        ...judgment,
        store: {
          ...world.store,
          commit: write => {
            commits += 1
            return world.store.commit(write)
          },
        },
      })
      const reference = accepted(await world.api.invoke(world.invocation('hold-foreign')))
      await expect.poll(() => world.launches()).toBe(1)
      await expect.poll(() => phase(world, world, reference)).toBe('running')
      expect(await contact(next, world, reference)).toBe('unknown')
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(diagnostics(next)).toMatchObject({
        knownCalls: 0,
        reentries: 0,
        foreignExecutionRuns: 0,
        unownedRuns: 0,
      })
      expect(commits).toBe(0)
      expect(world.launches()).toBe(1)
    } finally {
      author.release()
      await next?.close()
      await world.close()
    }
  },
)

it('a call another instance started is taken back with a proof of the loss of that instance: holding', async () => {
  const author = held()
  const world = await fixture(author.author)
  let next: Executor | null = null
  const judged: string[] = []
  try {
    next = await world.newExecutor({
      lostContact: instance => {
        judged.push(instance)
        return proof(instance)
      },
    })
    const reference = accepted(await world.api.invoke(world.invocation('hold-lost')))
    await expect.poll(() => world.launches()).toBe(1)
    await expect.poll(() => phase(world, world, reference)).toBe('running')
    const state = unbox(await world.api.queries.lookup(world.query(reference)))
    if (state.kind !== 'found' || state.state.phase !== 'running') throw new Error('not running')
    await world.plugins.close()
    expect(await contact(next, world, reference)).toBe('holding')
    expect(judged).toContain(state.state.instance)
    expect(world.launches()).toBe(1)
  } finally {
    author.release()
    await next?.close()
    await world.close()
  }
})

it('a settled call whose result was delivered is settled, and it is not taken back', async () => {
  const world = await fixture()
  let next: Executor | null = null
  try {
    next = await world.newExecutor()
    const reference = accepted(await world.api.invoke(world.invocation('delivered')))
    await world.settled(reference)
    await expect.poll(() => world.deliveries.length).toBe(1)
    await expect.poll(() => diagnostics(world).knownCalls).toBe(0)
    expect(await contact(world, world, reference)).toBe('settled')
    expect(await contact(next, world, reference)).toBe('settled')
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(diagnostics(next)).toMatchObject({ knownCalls: 0, unownedRuns: 0 })
  } finally {
    await next?.close()
    await world.close()
  }
})

it('a settled call whose result is not delivered is settled, and its delivery is taken back', async () => {
  const world = await fixture()
  let next: Executor | null = null
  try {
    next = await world.newExecutor()
    await world.removeReceiver()
    const reference = accepted(await world.api.invoke(world.invocation('undelivered')))
    await world.settled(reference)
    expect(await contact(world, world, reference)).toBe('settled')
    await world.plugins.close()
    expect(diagnostics(next).knownCalls).toBe(0)
    expect(await contact(next, world, reference)).toBe('settled')
    expect(diagnostics(next).knownCalls).toBe(1)
  } finally {
    await next?.close()
    await world.close()
  }
})
