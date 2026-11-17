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

it('withdraws a running foreground call: the foreground gets an interrupted final at once, and the real end comes later as a late version', async () => {
  const { completions, author } = longRunning()
  const world = await fixture(author)
  try {
    const reference = accepted(await world.api.invoke(world.invocation('withdrawn')))
    await expect.poll(() => world.launches()).toBe(1)
    const withdrawn = await world.api.commands.control({
      ...world.query(reference),
      intent: { kind: 'withdraw', reach: 'foreground-and-unadmitted' },
    })
    expect(withdrawn).toMatchObject({ kind: 'committed' })
    await expect.poll(() => world.deliveries.map(item => item.kind)).toEqual(['result'])
    expect(world.deliveries[0]).toMatchObject({
      relation: 'original',
      terminal: { kind: 'interrupted', cause: { kind: 'control', withdrawn: true } },
    })
    await expect.poll(() => world.signals.get('{"value":"withdrawn"}')?.aborted).toBe(true)
    completions.get('{"value":"withdrawn"}')?.('ended-after-withdraw')
    await expect.poll(() => world.deliveries.length).toBe(2)
    // The stop reached the execution first, so its real end is the cancellation the executor reports.
    expect(world.deliveries[1]).toMatchObject({
      kind: 'result',
      relation: 'late',
      terminal: { kind: 'interrupted', cause: { kind: 'control', withdrawn: true } },
      actualTerminal: { kind: 'interrupted' },
      value: { content: [{ text: 'the execution was cancelled' }] },
    })
    const found = unbox(await world.api.queries.lookup(world.query(reference)))
    expect(found).toMatchObject({
      kind: 'found',
      state: { phase: 'settled', execution: { kind: 'ended' }, foreground: { kind: 'final' } },
    })
    if (found.kind !== 'found') throw new Error('the call is gone')
    expect(found.state.supplements).toHaveLength(1)
    expect(world.launches()).toBe(1)
  } finally {
    for (const complete of completions.values()) complete('cleanup')
    await world.close()
  }
})
