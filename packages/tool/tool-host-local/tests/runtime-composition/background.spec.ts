import { expect, it } from 'vitest'
import { accepted, fixture, unbox } from './fixture.ts'

function longRunning() {
  const completions = new Map<string, (value: string) => void>()
  const author = (value: string) =>
    new Promise<string>(resolve => {
      completions.set(value, resolve)
    })
  return { completions, author }
}

it('moves a running call to the background: the placeholder comes first, the same execution delivers the original result later', async () => {
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
    const reference = accepted(await world.api.invoke(world.invocation('long')))
    await expect.poll(() => world.launches()).toBe(1)
    const moved = await world.api.commands.control({
      ...world.query(reference),
      intent: { kind: 'background', otherwise: 'reject' },
    })
    expect(moved).toMatchObject({ kind: 'committed' })
    await expect.poll(() => world.deliveries.map(item => item.kind)).toEqual(['placeholder'])
    expect(world.deliveries[0]).toMatchObject({
      key: { kind: 'placeholder', producer: 'tool', reference },
      source: { kind: 'control' },
    })
    const running = unbox(await world.api.queries.lookup(world.query(reference)))
    expect(running).toMatchObject({
      kind: 'found',
      state: {
        phase: 'running',
        relation: 'background',
        foreground: { kind: 'background', delivery: { kind: 'released' } },
      },
    })
    expect(world.signals.get('{"value":"long"}')?.aborted).toBe(false)
    completions.get('{"value":"long"}')?.('finished-in-background')
    const state = await world.settledState(reference)
    expect(state).toMatchObject({ relation: 'background', terminal: { kind: 'completed' } })
    await expect
      .poll(() => world.deliveries.map(item => item.kind))
      .toEqual(['placeholder', 'result'])
    expect(world.deliveries[1]).toMatchObject({
      kind: 'result',
      relation: 'original',
      value: { content: [{ text: 'finished-in-background' }] },
    })
    expect(world.launches()).toBe(1)
  } finally {
    for (const complete of completions.values()) complete('cleanup')
    await world.close()
  }
})

it('records a rejected background for a definition that does not permit it, and the call stays in front', async () => {
  const { completions, author } = longRunning()
  const world = await fixture(author)
  try {
    const reference = accepted(await world.api.invoke(world.invocation('front')))
    await expect.poll(() => world.launches()).toBe(1)
    const refused = await world.api.commands.control({
      ...world.query(reference),
      intent: { kind: 'background', otherwise: 'reject' },
    })
    expect(refused).toMatchObject({ kind: 'committed' })
    const found = unbox(await world.api.queries.lookup(world.query(reference)))
    expect(found).toMatchObject({ kind: 'found', state: { relation: 'foreground' } })
    if (found.kind !== 'found') throw new Error('the call is gone')
    expect(found.state.controls.at(-1)?.progress).toMatchObject({
      kind: 'rejected',
      reason: 'background-not-allowed',
    })
    completions.get('{"value":"front"}')?.('done-in-front')
    await world.settled(reference)
    expect(world.deliveries.map(item => item.kind)).toEqual(['result'])
  } finally {
    for (const complete of completions.values()) complete('cleanup')
    await world.close()
  }
})
