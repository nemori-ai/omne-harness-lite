import { expect, it } from 'vitest'
import type { ToolDelivery } from '@omne-harness/tool-contract'
import { accepted, fixture, unbox } from './fixture.ts'

type World = Awaited<ReturnType<typeof fixture>>
type Limits = Readonly<{ backgroundAfterMs?: number; foregroundMs?: number }>

function longRunning() {
  const completions = new Map<string, (value: string) => void>()
  const author = (value: string) =>
    new Promise<string>(resolve => {
      completions.set(value, resolve)
    })
  return { completions, author }
}

function limited(world: World, value: string, limits: Limits) {
  const base = world.invocation(value)
  return { ...base, request: { ...base.request, limits: { ...base.request.limits, ...limits } } }
}

const kinds = (world: World) => world.deliveries.map(item => item.kind)
const relations = (world: World) =>
  world.deliveries.map(item => (item as Extract<ToolDelivery<never>, { kind: 'result' }>).relation)

async function found(world: World, reference: Parameters<World['query']>[0]) {
  const lookup = unbox(await world.api.queries.lookup(world.query(reference)))
  if (lookup.kind !== 'found') throw new Error(`the call is ${lookup.kind}`)
  return lookup.state
}

it('moves a foreground call to the background by itself once its threshold passes, and its foreground time stops there', async () => {
  const { completions, author } = longRunning()
  const world = await fixture(
    author,
    undefined,
    32,
    false,
    undefined,
    undefined,
    undefined,
    base => base,
    undefined,
    true,
  )
  try {
    const reference = accepted(
      await world.api.invoke(limited(world, 'long', { backgroundAfterMs: 50 })),
    )
    await expect.poll(() => kinds(world), { timeout: 10_000 }).toEqual(['placeholder'])
    expect(world.deliveries[0]).toMatchObject({ source: { kind: 'threshold' } })
    const moved = await found(world, reference)
    expect(moved).toMatchObject({
      phase: 'running',
      relation: 'background',
      controls: [
        {
          intent: { kind: 'background', otherwise: 'reject' },
          progress: { kind: 'relation-changed' },
        },
      ],
    })
    expect(moved.timing.kind).not.toBe('running')
    expect(Number(moved.timing.accumulatedMs)).toBeGreaterThanOrEqual(50)
    await new Promise(resolve => setTimeout(resolve, 150))
    expect((await found(world, reference)).timing).toEqual(moved.timing)
    completions.get('{"value":"long"}')?.('finished-in-background')
    await expect.poll(() => kinds(world), { timeout: 10_000 }).toEqual(['placeholder', 'result'])
    expect(world.launches()).toBe(1)
  } finally {
    for (const complete of completions.values()) complete('cleanup')
    await world.close()
  }
})

it('ends the foreground of a call that cannot move once its foreground limit passes: the threshold is refused, the foreground ends interrupted by the limit and the real end comes late', async () => {
  const { completions, author } = longRunning()
  const world = await fixture(author)
  try {
    const reference = accepted(
      await world.api.invoke(limited(world, 'held', { backgroundAfterMs: 20, foregroundMs: 80 })),
    )
    await expect.poll(() => kinds(world), { timeout: 10_000 }).toContain('result')
    expect(world.deliveries[0]).toMatchObject({
      kind: 'result',
      relation: 'original',
      terminal: { kind: 'interrupted', cause: { kind: 'foreground-limit' } },
    })
    // The stop reaches the execution; this author ignores the signal, so it ends it by hand.
    await expect.poll(() => world.signals.get('{"value":"held"}')?.aborted).toBe(true)
    completions.get('{"value":"held"}')?.('ended-after-limit')
    await expect.poll(() => relations(world), { timeout: 10_000 }).toEqual(['original', 'late'])
    expect(world.deliveries[1]).toMatchObject({
      terminal: { kind: 'interrupted', cause: { kind: 'foreground-limit' } },
      actualTerminal: { kind: 'interrupted' },
    })
    const ended = await found(world, reference)
    const [threshold, limit] = ended.controls
    expect(threshold).toMatchObject({
      intent: { kind: 'background', otherwise: 'reject' },
      progress: { kind: 'rejected', reason: 'background-not-allowed' },
    })
    expect(limit?.intent).toEqual({ kind: 'background', otherwise: 'stop' })
    expect(['accepted', 'stopped']).toContain(limit?.progress.kind)
    expect(world.launches()).toBe(1)
  } finally {
    for (const complete of completions.values()) complete('cleanup')
    await world.close()
  }
})
