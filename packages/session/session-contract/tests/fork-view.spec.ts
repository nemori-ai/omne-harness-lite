import { describe, expect, it } from 'vitest'
import { digestOf } from '../src/operations.ts'
import { succeeded } from '@omne-harness/session-contract/testing'
import { scene } from './scene.ts'
import {
  childOf,
  createWith,
  entryIds,
  pointOf,
  remind,
  rows,
  talking,
  view,
  latestAsking,
} from './fork-scene.ts'

describe('the point a session can be forked at', () => {
  it('is before the latest assistant message, at the tail of the log', async () => {
    const s = await talking()
    const point = await pointOf(s)
    expect(point).toEqual({
      epoch: (await view(s)).basis.epoch,
      upper: '3',
      position: entryIds(s).at(-1),
    })
    expect((await rows(s))[3]?.message.role).toBe('assistant')
  })

  it('is none while the view holds no assistant message', async () => {
    const s = scene()
    await s.create()
    expect(
      succeeded(
        await s.port.history.readForkPoint({ ...s.access, asking: await latestAsking(s) }),
        'point',
      ),
    ).toEqual({
      kind: 'none',
    })
  })
})

describe('a forked session sees the rows of its source up to the point, then its own (SF-5)', () => {
  it('starts from the same rows, and numbers its own entries and rows after them (SF-3)', async () => {
    const parent = await talking()
    const point = await pointOf(parent)
    const prefix = (await rows(parent)).slice(0, 3)
    const child = parent.peer('child-1')
    succeeded(await createWith(child, childOf(parent, point)), 'fork')
    expect(await rows(child)).toEqual(prefix)
    expect(entryIds(child).every(id => BigInt(id) > BigInt(point.position))).toBe(true)
    expect(entryIds(child)[0]).toBe(String(BigInt(point.position) + 1n))
    succeeded(await remind(child, 'hello'), 'remind')
    const own = (await rows(child))[3]
    expect(own).toMatchObject({ seq: '4', entry: entryIds(child).at(-1) })
    expect(own?.prefixDigest).toBe(
      digestOf({ prefix: prefix[2]?.prefixDigest, entry: own?.entry, message: own?.message }),
    )
    const named = (await rows(child)).map(row => row.entry)
    expect(new Set(named).size).toBe(named.length)
    for (const row of await rows(child))
      expect(BigInt(row.entry) <= BigInt(point.position)).toBe(!entryIds(child).includes(row.entry))
  })

  it('keeps the epoch of its own: a reader of the source epoch is told another session', async () => {
    const parent = await talking()
    const point = await pointOf(parent)
    const child = parent.peer('child-1')
    succeeded(await createWith(child, childOf(parent, point)), 'fork')
    expect((await view(child)).basis.epoch).not.toBe(point.epoch)
    expect((await view(child)).basis.upper).toBe('3')
  })
})
