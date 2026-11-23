import { mkdtempSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServerSide } from '@omne-harness/plugin-host-local'
import { fiberOf } from '@omne-harness/plugin-protocol'
import { describe, expect, it } from 'vitest'
import { fileFloor, FLOOR_LIMIT } from '../../../src/rows/plugin-server/floor-file.ts'

const TIDY = fiberOf('tidy', 'v1')

/** One run of the server: a floor on the same directory, with settling run when the test says. */
function run(directory: string) {
  const warned: string[] = []
  const pending: (() => void)[] = []
  const floor = fileFloor({
    directory,
    warn: message => void warned.push(message),
    later: settle => (pending.push(settle), () => void pending.splice(pending.indexOf(settle), 1)),
  })
  return { floor, warned, settled: () => pending.splice(0).forEach(each => each()) }
}

/** A run that went down while it loaded what it was to load: nothing settled, nothing closed. */
function downWhileLoading(directory: string, tenant = 'alice', fiber = TIDY) {
  const { floor } = run(directory)
  floor.rise(tenant)
  floor.want(tenant, fiber)
}

const fresh = () => realpathSync(mkdtempSync(join(tmpdir(), 'omne-plugin-floor-')))

describe('the floor of the server, kept in a file for each tenant', () => {
  it('holds nothing back on the first run', () => {
    expect(run(fresh()).floor.rise('alice')).toEqual({ want: [], held: false })
  })

  it(`holds back what was loading when the server went down ${FLOOR_LIMIT} times in a row, and says so`, () => {
    const directory = fresh()
    downWhileLoading(directory)
    const second = run(directory)
    expect(second.floor.rise('alice')).toEqual({ want: [TIDY], held: false })
    second.floor.want('alice', TIDY)
    const third = run(directory)
    expect(third.floor.rise('alice')).toEqual({ want: [TIDY], held: true })
    expect(third.warned).toEqual([
      `tenant alice: the server went down ${FLOOR_LIMIT} times in a row while loading its plugins; it does not load ${TIDY} until there is a new version, or until it is disabled and enabled again`,
    ])
  })

  it('a run that settled clears the count: going down once more after it holds nothing back', () => {
    const directory = fresh()
    downWhileLoading(directory)
    const settles = run(directory)
    settles.floor.rise('alice')
    settles.floor.want('alice', TIDY)
    settles.floor.settle('alice')
    settles.settled()
    downWhileLoading(directory)
    expect(run(directory).floor.rise('alice').held).toBe(false)
  })

  it('a settle counts only once it has waited: going down before that is going down while loading', () => {
    const directory = fresh()
    downWhileLoading(directory)
    const waits = run(directory)
    waits.floor.rise('alice')
    waits.floor.want('alice', TIDY)
    waits.floor.settle('alice')
    expect(run(directory).floor.rise('alice').held).toBe(true)
  })

  it('an orderly stop is not going down: closing twice while loading holds nothing back', () => {
    const directory = fresh()
    for (const _ of [1, 2]) {
      const stops = run(directory)
      stops.floor.rise('alice')
      stops.floor.want('alice', TIDY)
      stops.floor.close()
    }
    expect(run(directory).floor.rise('alice')).toEqual({ want: [TIDY], held: false })
  })

  it('what is no longer wanted is no longer held back', () => {
    const directory = fresh()
    downWhileLoading(directory)
    downWhileLoading(directory)
    const third = run(directory)
    expect(third.floor.rise('alice').held).toBe(true)
    third.floor.unwant('alice', TIDY)
    third.floor.settle('alice')
    third.settled()
    expect(run(directory).floor.rise('alice')).toEqual({ want: [], held: false })
  })

  it('keeps each tenant apart, in a file whose name is not the name of the tenant', () => {
    const directory = fresh()
    downWhileLoading(directory, 'a/../b')
    downWhileLoading(directory, 'a/../b')
    const third = run(directory)
    expect(third.floor.rise('bob')).toEqual({ want: [], held: false })
    expect(third.floor.rise('a/../b').held).toBe(true)
    expect(readdirSync(directory).every(name => /^[0-9a-f]+\.json$/u.test(name))).toBe(true)
  })

  it('reads a file it cannot make sense of as the ground', () => {
    const directory = fresh()
    downWhileLoading(directory)
    for (const name of readdirSync(directory)) writeFileSync(join(directory, name), '{"up":')
    expect(run(directory).floor.rise('alice')).toEqual({ want: [], held: false })
  })
})

describe('the floor under the loading of the server', () => {
  const wanted = (version: string) => ({
    name: 'tidy',
    version,
    members: [],
    needs: [],
    files: [],
  })

  it('a third run does not load what went down twice; a new version, or disabling and enabling, loads again', async () => {
    const directory = fresh()
    downWhileLoading(directory)
    downWhileLoading(directory)
    const third = run(directory)
    const loads: string[] = []
    const side = createServerSide({
      floor: third.floor,
      install: async (_tenant, { version }) => {
        loads.push(version)
        return { kind: 'installed', remove: () => undefined }
      },
    })
    side.converge('alice', [wanted('v1')])
    await side.idle()
    expect(side.states('alice')?.get('tidy')).toEqual({ kind: 'held', version: 'v1' })
    expect(loads).toEqual([])
    expect(third.warned).toHaveLength(1)

    side.converge('alice', [])
    side.converge('alice', [wanted('v1')])
    await side.idle()
    expect(loads).toEqual(['v1'])
    side.converge('alice', [wanted('v2')])
    await side.idle()
    expect(loads).toEqual(['v1', 'v2'])
    expect(side.states('alice')?.get('tidy')?.kind).toBe('loaded')
    third.settled()
    expect(run(directory).floor.rise('alice')).toEqual({
      want: [fiberOf('tidy', 'v2')],
      held: false,
    })
  })

  it('held back in one run, it stays held back in the next while the same version is wanted', async () => {
    const directory = fresh()
    downWhileLoading(directory)
    downWhileLoading(directory)
    for (const _ of [3, 4]) {
      const next = run(directory)
      const side = createServerSide({
        floor: next.floor,
        install: async () => ({ kind: 'installed', remove: () => undefined }),
      })
      side.converge('alice', [wanted('v1')])
      await side.idle()
      next.settled()
      expect(side.states('alice')?.get('tidy')?.kind).toBe('held')
      await side.stop()
      next.floor.close()
    }
  })
})
