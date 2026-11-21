import { describe, expect, it } from 'vitest'
import type { ForkPoint, SessionCreation } from '@omne-harness/session-contract'
import {
  creation,
  evidence,
  memoryOtherAccess,
  refused,
  sessionId,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { scene } from './scene.ts'
import {
  childOf,
  compact,
  createWith,
  entryIds,
  pointOf,
  remind,
  rows,
  talking,
  view,
  type Scene,
} from './fork-scene.ts'

const invalid = (field: string, reason: string) => ({ kind: 'invalid', field, reason })
const DENIED = { kind: 'denied', action: 'create' }

type Cell = Readonly<{
  name: string
  creation: (parent: Scene, point: ForkPoint) => SessionCreation
  failure: unknown
}>

const REFUSED: readonly Cell[] = [
  {
    name: 'a source the tenant has no session of',
    creation: (parent, point) => {
      const ghost = sessionId('ghost')
      const relation = { kind: 'child', parent: ghost, basis: evidence('dispatch') } as const
      return childOf(parent, null, { relation, fork: { source: ghost, point } })
    },
    failure: DENIED,
  },
  {
    name: 'a main session',
    creation: (parent, point) => creation({ fork: { source: parent.base.session, point } }),
    failure: invalid('creation.fork.source', 'not the parent of the session'),
  },
  {
    name: 'a session handed over from the source',
    creation: (parent, point) =>
      creation({
        relation: { kind: 'handoff', origin: parent.base.session, basis: evidence('dispatch') },
        fork: { source: parent.base.session, point },
      }),
    failure: invalid('creation.fork.source', 'not the parent of the session'),
  },
  {
    name: 'an epoch the source never had',
    creation: (parent, point) => childOf(parent, { ...point, epoch: `${point.epoch}x` }),
    failure: invalid('creation.fork.point', 'unknown-epoch'),
  },
  {
    name: 'the epoch of another session',
    creation: (parent, point) => childOf(parent, { ...point, epoch: 'elsewhere/epoch:0' }),
    failure: invalid('creation.fork.point', 'unknown-epoch'),
  },
  {
    name: 'an upper bound past the rows of the epoch',
    creation: (parent, point) => childOf(parent, { ...point, upper: '9' }),
    failure: invalid('creation.fork.point', 'out-of-bounds'),
  },
  {
    name: 'a position past the log of the source',
    creation: (parent, point) =>
      childOf(parent, { ...point, position: String(BigInt(point.position) + 1n) }),
    failure: invalid('creation.fork.point', 'out-of-bounds'),
  },
  {
    name: 'a position below an entry of the prefix',
    creation: (parent, point) => childOf(parent, { ...point, position: '1' }),
    failure: invalid('creation.fork.point', 'out-of-bounds'),
  },
  {
    name: 'a point before a tool message',
    creation: (parent, point) => childOf(parent, { ...point, upper: '2' }),
    failure: invalid('creation.fork.point', 'not-a-boundary'),
  },
  {
    name: 'the whole view while a Run of the source is unfinished',
    creation: (parent, point) => childOf(parent, { ...point, upper: '4' }),
    failure: invalid('creation.fork.point', 'not-a-boundary'),
  },
]

describe('a create with a source answers for every state of the source', () => {
  it.each(REFUSED)('refuses $name and creates nothing', async cell => {
    const parent = await talking()
    const before = entryIds(parent)
    const child = parent.peer('child-1')
    const answer = await createWith(child, cell.creation(parent, await pointOf(parent)))
    expect(refused(answer, cell.name)).toEqual(cell.failure)
    expect('failure' in (await child.port.readWork(child.access))).toBe(true)
    expect(entryIds(parent)).toEqual(before)
  })

  it('answers a source of another tenant as it answers no source at all', async () => {
    const parent = await talking()
    const point = await pointOf(parent)
    const stranger = parent.peer('child-1', memoryOtherAccess('tester', 'child-1'))
    const answer = await createWith(stranger, childOf(parent, point))
    expect(refused(answer, 'another tenant')).toEqual(DENIED)
  })

  it('has no basis while the source cannot be read, and creates nothing', async () => {
    const parent = await talking()
    const point = await pointOf(parent)
    const child = parent.peer('child-1')
    parent.port.controls.forkSourceAvailable(false)
    const answer = refused(await createWith(child, childOf(parent, point)), 'unreadable')
    expect(answer).toMatchObject({ kind: 'unavailable' })
    expect('failure' in (await child.port.readWork(child.access))).toBe(true)
    parent.port.controls.forkSourceAvailable(true)
    succeeded(await createWith(child, childOf(parent, point)), 'readable again')
    expect(await rows(child)).toHaveLength(3)
  })

  it('forks from a source whose Run goes on, and from one that compacted since the point', async () => {
    const parent = await talking()
    const point = await pointOf(parent)
    const prefix = (await rows(parent)).slice(0, 3)
    const origin = entryIds(parent)[0] as string
    succeeded(await compact(parent, 'summary', origin, point.position), 'compact')
    expect((await view(parent)).basis.epoch).not.toBe(point.epoch)
    const child = parent.peer('child-1')
    succeeded(await createWith(child, childOf(parent, point)), 'fork of the epoch it left')
    expect(await rows(child)).toEqual(prefix)
  })

  it('forks the whole view of a source that is idle', async () => {
    const parent = scene()
    await parent.create()
    succeeded(await remind(parent, 'one'), 'remind')
    const whole: ForkPoint = {
      epoch: (await view(parent)).basis.epoch,
      upper: '1',
      position: entryIds(parent).at(-1) as string,
    }
    const child = parent.peer('child-1')
    succeeded(await createWith(child, childOf(parent, whole)), 'fork of an idle source')
    expect(await rows(child)).toEqual(await rows(parent))
  })

  it('recalls the same create, and refuses the same session from another point', async () => {
    const parent = await talking()
    const point = await pointOf(parent)
    const child = parent.peer('child-1')
    const first = succeeded(await createWith(child, childOf(parent, point)), 'fork')
    const again = succeeded(await createWith(child, childOf(parent, point)), 'again')
    expect(again.receipt).toEqual({ ...first.receipt, recovered: true })
    const moved = childOf(parent, { ...point, upper: '1' })
    expect(refused(await createWith(child, moved), 'moved').kind).toBe('conflict')
    expect(await rows(child)).toHaveLength(3)
  })

  it('is refused under an archived parent as any child is', async () => {
    const parent = await talking()
    const point = await pointOf(parent)
    await parent.control('archive')
    const child = parent.peer('child-1')
    expect(refused(await createWith(child, childOf(parent, point)), 'archived')).toEqual({
      kind: 'archived',
    })
  })
})

describe('the state of a forked session is reduced from its own entries only (SF-4)', () => {
  it('holds no Run, input, call or child of its source', async () => {
    const parent = await talking()
    await parent.accept('second')
    const point = await pointOf(parent)
    const forked = parent.peer('child-1')
    succeeded(await createWith(forked, childOf(parent, point)), 'fork')
    const plain = parent.peer('child-2')
    succeeded(await createWith(plain, childOf(parent, null)), 'plain child')
    const [a, b, source] = [await forked.read(), await plain.read(), await parent.read()]
    expect(source.run.kind).toBe('active')
    expect(source.pending.length).toBeGreaterThan(0)
    expect(a.run).toEqual({ kind: 'none' })
    expect(a.pending).toEqual([])
    expect(a.consumptions).toEqual([])
    expect(a.children ?? []).toEqual([])
    const shape = ({ session: _s, revision: _r, ...rest }: typeof a) => Object.keys(rest).sort()
    expect(shape(a)).toEqual(shape(b))
    for (const key of ['run', 'pending', 'consumptions', 'lifecycle', 'attendance'] as const)
      expect(a[key]).toEqual(b[key])
  })
})
