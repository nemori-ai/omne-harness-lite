import { createServerSide, type ServerSidePorts } from '@omne-harness/plugin-host-local'
import { fiberOf, type FloorPort, type Outcome, type Wanted } from '@omne-harness/plugin-protocol'
import { describe, expect, it } from 'vitest'

const wanted = (name: string, version = 'v1'): Wanted => ({
  name,
  version,
  members: [],
  needs: [],
  files: [],
})

function world(over: Partial<ServerSidePorts> = {}, risen: Record<string, string[]> = {}) {
  const log: string[] = []
  const floor: FloorPort = {
    rise(tenant) {
      log.push(`rise ${tenant}`)
      return { want: risen[tenant] ?? [], held: tenant in risen }
    },
    want: (tenant, fiber) => void log.push(`want ${tenant} ${fiber}`),
    unwant: (tenant, fiber) => void log.push(`unwant ${tenant} ${fiber}`),
    settle: tenant => void log.push(`settle ${tenant}`),
  }
  const side = createServerSide({
    floor,
    install: async (tenant, { name, version }): Promise<Outcome> => {
      log.push(`install ${tenant} ${name}@${version}`)
      return {
        kind: 'installed',
        remove: () => void log.push(`remove ${tenant} ${name}@${version}`),
      }
    },
    ...over,
  })
  return { side, log }
}

const kinds = (states: ReadonlyMap<string, { kind: string }> | undefined) =>
  states === undefined ? undefined : Object.fromEntries([...states].map(([n, s]) => [n, s.kind]))

describe('what each tenant is to load on the server, brought there one tenant at a time', () => {
  it('tells the floor before each load, and that the tenant settled once every load has an outcome', async () => {
    const { side, log } = world()
    side.converge('alice', [wanted('tidy')])
    await side.idle()
    expect(log).toEqual([
      'rise alice',
      `want alice ${fiberOf('tidy', 'v1')}`,
      'install alice tidy@v1',
      'settle alice',
    ])
    expect(kinds(side.states('alice'))).toEqual({ tidy: 'loaded' })
    expect(side.states('bob')).toBeUndefined()
  })

  it('keeps the tenants apart: what one is to load changes nothing of another', async () => {
    const { side, log } = world()
    side.converge('alice', [wanted('tidy')])
    side.converge('bob', [wanted('tidy', 'v9')])
    await side.idle()
    side.converge('alice', [])
    await side.idle()
    expect(log).toContain('remove alice tidy@v1')
    expect(log).not.toContain('remove bob tidy@v9')
    expect(log).toContain(`unwant alice ${fiberOf('tidy', 'v1')}`)
    expect(kinds(side.states('alice'))).toEqual({})
    expect(kinds(side.states('bob'))).toEqual({ tidy: 'loaded' })
    expect(side.tenants()).toEqual(['alice', 'bob'])
  })

  it('does not load what the floor holds back, in the version it holds; another version is loaded', async () => {
    const { side, log } = world({}, { alice: [fiberOf('tidy', 'v1')] })
    side.converge('alice', [wanted('tidy'), wanted('other')])
    await side.idle()
    expect(kinds(side.states('alice'))).toEqual({ tidy: 'held', other: 'loaded' })
    expect(log).not.toContain('install alice tidy@v1')
    side.converge('alice', [wanted('tidy', 'v2'), wanted('other')])
    await side.idle()
    expect(log).toContain('install alice tidy@v2')
    expect(kinds(side.states('alice'))).toEqual({ tidy: 'loaded', other: 'loaded' })
  })

  it('a load that fails is an outcome: the tenant settles, and the reason is kept', async () => {
    const { side, log } = world({
      install: async () => ({ kind: 'failed', reason: 'member 1 (a b): no' }),
    })
    side.converge('alice', [wanted('tidy')])
    await side.idle()
    expect(side.states('alice')?.get('tidy')).toEqual({
      kind: 'failed',
      version: 'v1',
      reason: 'member 1 (a b): no',
    })
    expect(log.at(-1)).toBe('settle alice')
  })

  it('tells who watches which tenant moved', async () => {
    const { side } = world()
    const moved: string[] = []
    const stop = side.watch(tenant => void moved.push(tenant))
    side.converge('alice', [wanted('tidy')])
    await side.idle()
    stop()
    side.converge('alice', [])
    await side.idle()
    expect(new Set(moved)).toEqual(new Set(['alice']))
    expect(moved.length).toBeGreaterThanOrEqual(2)
  })

  it('stopping takes back everything loaded and tells the floor each tenant settled: an orderly stop is not going down', async () => {
    const { side, log } = world()
    side.converge('alice', [wanted('tidy')])
    side.converge('bob', [wanted('pill')])
    await side.idle()
    log.length = 0
    await side.stop()
    expect(new Set(log)).toEqual(
      new Set(['remove alice tidy@v1', 'remove bob pill@v1', 'settle alice', 'settle bob']),
    )
    side.converge('alice', [wanted('late')])
    await side.idle()
    expect(log).not.toContain('install alice late@v1')
  })
})
