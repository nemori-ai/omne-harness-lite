import { describe, expect, it } from 'vitest'
import { createLoader, type Listed, type Outcome } from '@omne-harness/plugin-protocol'

const listed = (version: string, name = 'p'): Listed => ({ name, version, members: [] })

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

type Flight = { listed: Listed; land(outcome: 'installed' | 'failed' | 'held'): Promise<void> }

function world(held?: ReadonlyMap<string, string>) {
  const flights: Flight[] = []
  const removed: string[] = []
  const install = (wanted: Listed): Promise<Outcome> =>
    new Promise(resolve => {
      const tag = `${wanted.name}@${wanted.version}`
      flights.push({
        listed: wanted,
        async land(outcome) {
          if (outcome === 'installed')
            resolve({ kind: 'installed', remove: () => void removed.push(tag) })
          else if (outcome === 'failed') resolve({ kind: 'failed', reason: `${tag} broke` })
          else resolve({ kind: 'held' })
          await tick()
        },
      })
    })
  const loader = createLoader({ install, ...(held !== undefined && { held }) })
  const asked = (): string[] => flights.map(flight => flight.listed.version)
  const state = (name = 'p') => loader.states().get(name) ?? { kind: 'unwanted' }
  return { loader, flights, removed, asked, state }
}

type World = ReturnType<typeof world>

async function loaded(version = 'v1'): Promise<World> {
  const t = world()
  t.loader.converge([listed(version)])
  await t.flights[0]!.land('installed')
  return t
}

async function failed(): Promise<World> {
  const t = world()
  t.loader.converge([listed('v1')])
  await t.flights[0]!.land('failed')
  return t
}

async function heldBack(): Promise<World> {
  const t = world()
  t.loader.converge([listed('v1')])
  await t.flights[0]!.land('held')
  return t
}

function loading(): World {
  const t = world()
  t.loader.converge([listed('v1')])
  return t
}

/** The process came up again: nothing is live, and the loader knows only what the last one kept. */
const restarted = (before: World): World => world(before.loader.held())

describe('a plugin that is not wanted', () => {
  it('is loaded once the list has it', () => {
    const t = world()
    t.loader.converge([listed('v1')])
    expect(t.asked()).toEqual(['v1'])
    expect(t.state()).toEqual({ kind: 'loading', version: 'v1', next: 'keep' })
  })

  it('stays as it is while the list does not have it', () => {
    const t = world()
    t.loader.converge([])
    t.loader.converge([listed('v1', 'other')])
    expect(t.state()).toEqual({ kind: 'unwanted' })
    expect(t.flights.map(flight => flight.listed.name)).toEqual(['other'])
  })

  it('is loaded in whatever version the list has', () => {
    const t = world()
    t.loader.converge([listed('v7')])
    expect(t.asked()).toEqual(['v7'])
  })

  it('stays as it is across a restart', () => {
    const t = restarted(world())
    t.loader.converge([])
    expect(t.asked()).toEqual([])
    expect(t.loader.states().size).toBe(0)
  })
})

describe('a plugin that is being loaded', () => {
  it('is not loaded a second time when the list still has it', async () => {
    const t = loading()
    t.loader.converge([listed('v1')])
    expect(t.asked()).toEqual(['v1'])
    await t.flights[0]!.land('installed')
    expect(t.state()).toEqual({ kind: 'loaded', version: 'v1' })
    expect(t.removed).toEqual([])
  })

  it('is unloaded as soon as it is loaded when the list dropped it meanwhile', async () => {
    const t = loading()
    t.loader.converge([])
    expect(t.state()).toMatchObject({ kind: 'loading', next: 'unload' })
    await t.flights[0]!.land('installed')
    expect(t.removed).toEqual(['p@v1'])
    expect(t.loader.states().size).toBe(0)
  })

  it('is followed by the other version when the list changed it meanwhile, and stays until that one is in', async () => {
    const t = loading()
    t.loader.converge([listed('v2')])
    expect(t.asked()).toEqual(['v1'])
    await t.flights[0]!.land('installed')
    expect(t.asked()).toEqual(['v1', 'v2'])
    expect(t.removed).toEqual([])
    await t.flights[1]!.land('installed')
    expect(t.removed).toEqual(['p@v1'])
    expect(t.state()).toEqual({ kind: 'loaded', version: 'v2' })
  })

  it('is loaded anew after a restart, in the version the list has then', () => {
    const t = restarted(loading())
    t.loader.converge([listed('v2')])
    expect(t.asked()).toEqual(['v2'])
  })

  it('counts as failed, with the reason, when the load breaks; a load that throws breaks', async () => {
    const t = loading()
    await t.flights[0]!.land('failed')
    expect(t.state()).toEqual({ kind: 'failed', version: 'v1', reason: 'p@v1 broke' })
    const atOnce = createLoader({
      install: () => {
        throw new Error('no such point')
      },
    })
    atOnce.converge([listed('v1')])
    await atOnce.idle()
    expect(atOnce.states().get('p')).toMatchObject({ kind: 'failed', reason: 'no such point' })
    const thrown = createLoader({
      install: () => Promise.reject(new Error('could not fetch a.js')),
    })
    thrown.converge([listed('v1')])
    await thrown.idle()
    expect(thrown.states().get('p')).toEqual({
      kind: 'failed',
      version: 'v1',
      reason: 'could not fetch a.js',
    })
  })
})

describe('a plugin that is loaded', () => {
  it('stays as it is while the list has the same version', async () => {
    const t = await loaded()
    t.loader.converge([listed('v1')])
    expect(t.asked()).toEqual(['v1'])
    expect(t.removed).toEqual([])
  })

  it('is unloaded when the list no longer has it', async () => {
    const t = await loaded()
    t.loader.converge([])
    await t.loader.idle()
    expect(t.removed).toEqual(['p@v1'])
    expect(t.loader.states().size).toBe(0)
  })

  it('changes generation when the list has another version: the old one stays until the new one is in', async () => {
    const t = await loaded()
    t.loader.converge([listed('v2')])
    expect(t.state()).toEqual({ kind: 'loading', version: 'v2', next: 'keep', over: 'v1' })
    expect(t.removed).toEqual([])
    await t.flights[1]!.land('installed')
    expect(t.removed).toEqual(['p@v1'])
    expect(t.state()).toEqual({ kind: 'loaded', version: 'v2' })
  })

  it('loses the old generation as well when the new one breaks: the list no longer has the old one', async () => {
    const t = await loaded()
    t.loader.converge([listed('v2')])
    await t.flights[1]!.land('failed')
    expect(t.removed).toEqual(['p@v1'])
    expect(t.state()).toMatchObject({ kind: 'failed', version: 'v2' })
  })

  it('is loaded again after a restart', async () => {
    const t = restarted(await loaded())
    t.loader.converge([listed('v1')])
    expect(t.asked()).toEqual(['v1'])
  })
})

describe('a plugin whose load failed', () => {
  it('is not tried again while the list has the same version', async () => {
    const t = await failed()
    t.loader.converge([listed('v1')])
    expect(t.asked()).toEqual(['v1'])
    expect(t.state()).toMatchObject({ kind: 'failed' })
  })

  it('is forgotten when the list no longer has it', async () => {
    const t = await failed()
    t.loader.converge([])
    expect(t.loader.states().size).toBe(0)
    expect(t.removed).toEqual([])
  })

  it('is tried again in the other version the list has', async () => {
    const t = await failed()
    t.loader.converge([listed('v2')])
    expect(t.asked()).toEqual(['v1', 'v2'])
  })

  it('is tried again after a restart', async () => {
    const t = restarted(await failed())
    t.loader.converge([listed('v1')])
    expect(t.asked()).toEqual(['v1'])
  })
})

describe('a plugin the floor holds back', () => {
  it('stays held while the list has the same version', async () => {
    const t = await heldBack()
    t.loader.converge([listed('v1')])
    expect(t.asked()).toEqual(['v1'])
    expect(t.state()).toEqual({ kind: 'held', version: 'v1' })
    expect(t.loader.held()).toEqual(new Map([['p', 'v1']]))
  })

  it('is forgotten when the list no longer has it', async () => {
    const t = await heldBack()
    t.loader.converge([])
    expect(t.loader.states().size).toBe(0)
    expect(t.loader.held().size).toBe(0)
  })

  it('is let go and loaded when the list has another version', async () => {
    const t = await heldBack()
    t.loader.converge([listed('v2')])
    expect(t.asked()).toEqual(['v1', 'v2'])
    expect(t.loader.held().size).toBe(0)
  })

  it('is still held after a restart, and is not loaded', async () => {
    const t = restarted(await heldBack())
    t.loader.converge([listed('v1')])
    expect(t.asked()).toEqual([])
    expect(t.state()).toEqual({ kind: 'held', version: 'v1' })
  })
})

describe('the loader as a whole', () => {
  it('moves each plugin by itself', async () => {
    const t = world()
    t.loader.converge([listed('v1', 'a'), listed('v1', 'b')])
    await t.flights[0]!.land('installed')
    await t.flights[1]!.land('failed')
    t.loader.converge([listed('v1', 'b')])
    await t.loader.idle()
    expect(t.removed).toEqual(['a@v1'])
    expect(t.state('b')).toMatchObject({ kind: 'failed' })
  })

  it('tells who watches each time a plugin moved', async () => {
    const t = world()
    let told = 0
    const stop = t.loader.watch(() => (told += 1))
    t.loader.converge([listed('v1')])
    await t.flights[0]!.land('installed')
    expect(told).toBe(2)
    t.loader.converge([listed('v1')])
    expect(told).toBe(2)
    stop()
    t.loader.converge([])
    expect(told).toBe(2)
  })

  it('takes everything away when it stops, and what lands afterwards as well', async () => {
    const t = world()
    t.loader.converge([listed('v1', 'a'), listed('v1', 'b')])
    await t.flights[0]!.land('installed')
    const stopping = t.loader.stop()
    await t.flights[1]!.land('installed')
    await stopping
    expect(t.removed.sort()).toEqual(['a@v1', 'b@v1'])
    t.loader.converge([listed('v2', 'a')])
    expect(t.asked()).toEqual(['v1', 'v1'])
  })

  it('takes each generation away once: what was unloaded is not taken away again at the stop', async () => {
    const t = await loaded()
    t.loader.converge([])
    await t.loader.stop()
    expect(t.removed).toEqual(['p@v1'])
  })

  it('stops without waiting for a load that never ends: what is loaded is taken away at once', async () => {
    const t = world()
    t.loader.converge([listed('v1', 'a'), listed('v1', 'hangs')])
    await t.flights[0]!.land('installed')
    await t.loader.stop()
    expect(t.removed).toEqual(['a@v1'])
  })

  it('counts a removal that throws as done', async () => {
    const loader = createLoader({
      install: async () => ({
        kind: 'installed',
        remove: () => Promise.reject(new Error('stuck')),
      }),
    })
    loader.converge([listed('v1')])
    await loader.idle()
    loader.converge([])
    await loader.idle()
    expect(loader.states().size).toBe(0)
  })
})
