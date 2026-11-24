import { Context, type Fiber } from '@deepseek-ai/cordis'
import type {
  Admission,
  CanvasKinds,
  KindDeclaration,
  KindName,
} from '@omne-harness/canvas-contract'
import {
  CANVAS_KINDS_POINT,
  CanvasService,
  kindsOn,
  putKind,
} from '@omne-harness/canvas-cordis-contract/cordis'
import { CATALOG, list, type Contract } from '@omne-harness/dynamis'
import { DynamisService, dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import { describe, expect, it } from 'vitest'

const unavailable = async () => ({ kind: 'basis-unavailable' }) as const

class Canvas extends CanvasService {
  readonly look = unavailable
  readonly lookAway = unavailable
  readonly kinds = unavailable
  readonly place = unavailable
  readonly arrange = unavailable
  readonly take = unavailable
  readonly pile = unavailable
  readonly scatter = unavailable
  readonly lock = unavailable
}

const kind = (name: string, label = name, admit?: KindDeclaration['admit']): KindDeclaration => ({
  name: name as KindName,
  label,
  summary: `${name} is a thing`,
  reference: `the identity of a ${name}`,
  ...(admit === undefined ? {} : { admit }),
})

async function world() {
  const root = new Context()
  await root.plugin(DynamisService)
  await root.plugin(Canvas)
  const tree = root.get(dynamisKey) as DynamisService
  const putting = (name: string, declaration: KindDeclaration): Fiber =>
    root.plugin({
      name,
      inject: [dynamisKey],
      apply(ctx: Context) {
        putKind(ctx, declaration)
      },
    })
  return { root, tree, kinds: kindsOn(tree), putting }
}

/** The declaration on the registry now, as the canvas reads it for `place`. */
function held(tree: DynamisService, name: string): KindDeclaration | undefined {
  const read = list<KindDeclaration>(tree.registry(), CANVAS_KINDS_POINT, name, [])
  return read.kind === 'read' ? read.items[0]?.entry.item : undefined
}

const input = { tenant: 't', subject: null, ref: 'r', holder: 'h' } as never

/** What place does with a kind: takes it, asks its owner against a time limit, and leaves it at the outcome. */
async function asking(kinds: CanvasKinds, timeoutMs: number): Promise<Admission> {
  const entry = kinds.enter('media.object')
  if (entry.kind !== 'declared') throw new Error(entry.kind)
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<Admission>(resolve => {
    timer = setTimeout(() => resolve({ kind: 'basis-unavailable' }), timeoutMs)
  })
  try {
    return await Promise.race([entry.admit!(input), limit])
  } finally {
    clearTimeout(timer)
    entry.leave()
  }
}

describe('the point canvas.kinds', () => {
  it('is declared by the service of the canvas, on the server, one item per key, the keys public', async () => {
    const { tree } = await world()
    const catalog = list<Contract>(tree.registry(), CATALOG, null, [])
    if (catalog.kind !== 'read') throw new Error('the catalog is not read')
    const point = catalog.items.find(({ entry }) => entry.key === CANVAS_KINDS_POINT)?.entry.item
    expect(point).toMatchObject({
      tree: 'server',
      arity: 'keyed-one',
      resolve: 'conflict',
      binding: 'run',
      keys: 'public',
      version: 1,
      revision: 1,
      item: {
        kind: 'effect',
        fields: { name: 'string', label: 'string', summary: 'string', reference: 'string' },
      },
    })
  })

  it('cannot be read while no service of the canvas declares it', async () => {
    const root = new Context()
    await root.plugin(DynamisService)
    expect(kindsOn(root.get(dynamisKey) as DynamisService).read()).toEqual({ kind: 'unavailable' })
  })

  it('lists a kind for exactly as long as the one who put it is there', async () => {
    const { kinds, putting } = await world()
    expect(kinds.read()).toEqual({ kind: 'read', kinds: [] })
    const app = await putting('canvas-row', kind('canvas.app', '画布小应用'))
    const media = await putting('media-row', kind('media.object'))
    expect(kinds.read()).toEqual({
      kind: 'read',
      kinds: [
        {
          kind: 'declared',
          name: 'canvas.app',
          label: '画布小应用',
          summary: 'canvas.app is a thing',
          reference: 'the identity of a canvas.app',
        },
        expect.objectContaining({ kind: 'declared', name: 'media.object' }),
      ],
    })
    await app.dispose()
    expect(kinds.read()).toMatchObject({ kinds: [{ name: 'media.object' }] })
    await media.dispose()
    expect(kinds.read()).toEqual({ kind: 'read', kinds: [] })
  })

  it('lists a name put twice as a conflict with both who put it, and the other counts once one leaves', async () => {
    const { kinds, putting } = await world()
    const first = await putting('media-row', kind('media.object', 'first'))
    await putting('other-row', kind('media.object', 'second'))
    expect(kinds.read()).toEqual({
      kind: 'read',
      kinds: [{ kind: 'conflict', name: 'media.object', by: ['media-row', 'other-row'] }],
    })
    await first.dispose()
    expect(kinds.read()).toMatchObject({
      kinds: [{ kind: 'declared', name: 'media.object', label: 'second' }],
    })
  })

  it('lists the kinds by name, the declared and the conflicts together, each conflict with who put it in order', async () => {
    const { kinds, putting } = await world()
    await putting('zeta-row', kind('probe.zeta'))
    await putting('z-row', kind('media.object', 'z'))
    await putting('app-row', kind('canvas.app'))
    await putting('a-row', kind('media.object', 'a'))
    await putting('beta-row', kind('probe.beta'))
    const read = kinds.read()
    if (read.kind !== 'read') throw new Error(read.kind)
    expect(read.kinds.map(listing => [listing.kind, listing.name])).toEqual([
      ['declared', 'canvas.app'],
      ['conflict', 'media.object'],
      ['declared', 'probe.beta'],
      ['declared', 'probe.zeta'],
    ])
    expect(read.kinds[1]).toEqual({
      kind: 'conflict',
      name: 'media.object',
      by: ['a-row', 'z-row'],
    })
  })

  it('does not take a name that is not the name of a kind', async () => {
    const { putting, tree } = await world()
    const fiber = putting('bad-row', kind('Media'))
    await fiber.await().catch(() => undefined)
    expect(tree.registry().placed.filter(placed => placed.point === CANVAS_KINDS_POINT)).toEqual([])
  })
})

describe('a declaration with admit', () => {
  it('hands admit through to the owner and its answer back', async () => {
    const { putting, tree } = await world()
    const asked: unknown[] = []
    await putting(
      'media-row',
      kind('media.object', 'media', async given => {
        asked.push(given)
        return { kind: 'admitted' }
      }),
    )
    expect(await held(tree, 'media.object')?.admit?.(input)).toEqual({ kind: 'admitted' })
    expect(asked).toEqual([input])
  })

  it('leaves at once when no admit is in flight', async () => {
    const { putting, tree } = await world()
    const fiber = await putting(
      'media-row',
      kind('media.object', 'media', async () => ({ kind: 'refused' })),
    )
    await held(tree, 'media.object')?.admit?.(input)
    await fiber.dispose()
    expect(tree.registry().retiring).toEqual([])
    expect(tree.registry().placed.filter(placed => placed.point === CANVAS_KINDS_POINT)).toEqual([])
  })

  it('is taken off only once the place asking the owner has its answer, and hands no new admit to the owner meanwhile', async () => {
    const { putting, tree, kinds } = await world()
    let answer: (admission: Admission) => void = () => undefined
    let calls = 0
    const fiber = await putting(
      'media-row',
      kind('media.object', 'media', () => {
        calls += 1
        return new Promise(resolve => void (answer = resolve))
      }),
    )
    const admit = held(tree, 'media.object')!.admit!
    const placing = asking(kinds, 60_000)
    const leaving = fiber.dispose()
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(tree.registry().retiring).toEqual([{ fiber: 'media-row', generation: 1 }])
    expect(
      tree.registry().placed.filter(placed => placed.point === CANVAS_KINDS_POINT),
    ).toHaveLength(1)
    expect(kinds.read()).toEqual({ kind: 'read', kinds: [] })
    expect(await admit(input)).toEqual({ kind: 'basis-unavailable' })
    expect(calls).toBe(1)
    answer({ kind: 'admitted' })
    expect(await placing).toEqual({ kind: 'admitted' })
    await leaving
    expect(tree.registry().retiring).toEqual([])
    expect(tree.registry().placed.filter(placed => placed.point === CANVAS_KINDS_POINT)).toEqual([])
  })

  it('waits for every place asking the owner, not only the first to come back', async () => {
    const { putting, tree, kinds } = await world()
    const answers: ((admission: Admission) => void)[] = []
    const fiber = await putting(
      'media-row',
      kind('media.object', 'media', () => new Promise(resolve => void answers.push(resolve))),
    )
    const first = asking(kinds, 60_000)
    const second = asking(kinds, 60_000)
    let gone = false
    const leaving = fiber.dispose().then(() => void (gone = true))
    answers[0]!({ kind: 'admitted' })
    await first
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(gone).toBe(false)
    expect(tree.registry().retiring).toEqual([{ fiber: 'media-row', generation: 1 }])
    answers[1]!({ kind: 'refused' })
    expect(await second).toEqual({ kind: 'refused' })
    await leaving
    expect(tree.registry().retiring).toEqual([])
  })

  it('is taken off once the place has passed its time limit, though the owner never answers; the late answer changes nothing', async () => {
    const { putting, tree, kinds } = await world()
    let answer: (admission: Admission) => void = () => undefined
    let calls = 0
    const fiber = await putting(
      'media-row',
      kind('media.object', 'media', () => {
        calls += 1
        return new Promise(resolve => void (answer = resolve))
      }),
    )
    const admit = held(tree, 'media.object')!.admit!
    expect(await asking(kinds, 5)).toEqual({ kind: 'basis-unavailable' })
    const leaving = fiber.dispose()
    const ended = await Promise.race([
      Promise.resolve(leaving).then(() => 'drained'),
      new Promise(resolve => setTimeout(() => resolve('still draining'), 1_000)),
    ])
    expect(ended).toBe('drained')
    expect(tree.registry().retiring).toEqual([])
    expect(tree.registry().placed.filter(placed => placed.point === CANVAS_KINDS_POINT)).toEqual([])
    answer({ kind: 'admitted' })
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(await admit(input)).toEqual({ kind: 'basis-unavailable' })
    expect(calls).toBe(1)
    expect(tree.registry().placed.filter(placed => placed.point === CANVAS_KINDS_POINT)).toEqual([])
  })

  it('passes a throw of the owner back and does not hold the batch for it', async () => {
    const { putting, tree } = await world()
    const fiber = await putting(
      'media-row',
      kind('media.object', 'media', () => {
        throw new Error('the owner fell over')
      }),
    )
    await expect(held(tree, 'media.object')!.admit!(input)).rejects.toThrow('fell over')
    await fiber.dispose()
    expect(tree.registry().retiring).toEqual([])
  })
})

describe('a declaration without admit', () => {
  it('goes on the registry without an admit of its own making', async () => {
    const { putting, tree } = await world()
    await putting('app-row', kind('canvas.app'))
    const declaration = held(tree, 'canvas.app')!
    expect(declaration.label).toBe('canvas.app')
    expect('admit' in declaration).toBe(false)
  })
})

describe('a kind as place takes it', () => {
  it('gives the one declaration of a name with its admit, none for a name not declared, both who put one twice', async () => {
    const { kinds, putting } = await world()
    expect(kinds.enter('media.object')).toEqual({ kind: 'undeclared' })
    expect(kinds.enter('Not a name')).toEqual({ kind: 'undeclared' })
    await putting(
      'media-row',
      kind('media.object', 'media', async () => ({ kind: 'admitted' })),
    )
    const entry = kinds.enter('media.object')
    if (entry.kind !== 'declared') throw new Error(entry.kind)
    expect(await entry.admit?.(input)).toEqual({ kind: 'admitted' })
    expect(entry.declared()).toBe(true)
    entry.leave()
    await putting('other-row', kind('media.object', 'other'))
    expect(kinds.enter('media.object')).toEqual({
      kind: 'conflict',
      by: ['media-row', 'other-row'],
    })
    expect(entry.declared()).toBe(false)
  })

  it('cannot be taken while no service of the canvas declares the point', async () => {
    const root = new Context()
    await root.plugin(DynamisService)
    expect(kindsOn(root.get(dynamisKey) as DynamisService).enter('canvas.app')).toEqual({
      kind: 'unavailable',
    })
  })

  it.each([
    ['with admit', async (): Promise<Admission> => ({ kind: 'admitted' })],
    ['without admit', undefined],
  ])(
    'holds the declaration %s from the time it is taken until the place leaves it',
    async (_name, admit) => {
      const { putting, tree, kinds } = await world()
      const fiber = await putting('media-row', kind('media.object', 'media', admit))
      const entry = kinds.enter('media.object')
      if (entry.kind !== 'declared') throw new Error(entry.kind)
      const leaving = fiber.dispose()
      await new Promise(resolve => setTimeout(resolve, 5))
      expect(tree.registry().retiring).toEqual([{ fiber: 'media-row', generation: 1 }])
      expect(entry.declared()).toBe(false)
      expect(kinds.enter('media.object')).toEqual({ kind: 'undeclared' })
      entry.leave()
      entry.leave()
      await leaving
      expect(tree.registry().retiring).toEqual([])
      expect(tree.registry().placed.filter(placed => placed.point === CANVAS_KINDS_POINT)).toEqual(
        [],
      )
    },
  )
})

describe('a kind taken by a place, later', () => {
  it('is no longer declared once the point is gone, and says so rather than failing', async () => {
    const root = new Context()
    await root.plugin(DynamisService)
    const service = root.plugin(Canvas)
    await service
    const tree = root.get(dynamisKey) as DynamisService
    await root.plugin({
      name: 'media-row',
      inject: [dynamisKey],
      apply(ctx: Context) {
        putKind(ctx, kind('media.object'))
      },
    })
    const entry = kindsOn(tree).enter('media.object')
    if (entry.kind !== 'declared') throw new Error(entry.kind)
    await service.dispose()
    expect(kindsOn(tree).read()).toEqual({ kind: 'unavailable' })
    expect(entry.declared()).toBe(false)
    entry.leave()
  })

  it('a place that leaves twice lets go of its own hold only, not that of another place', async () => {
    const { putting, tree, kinds } = await world()
    const fiber = await putting(
      'media-row',
      kind('media.object', 'media', async () => ({ kind: 'admitted' })),
    )
    const first = kinds.enter('media.object')
    const second = kinds.enter('media.object')
    if (first.kind !== 'declared' || second.kind !== 'declared') throw new Error('not taken')
    let gone = false
    const leaving = fiber.dispose().then(() => void (gone = true))
    first.leave()
    first.leave()
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(gone).toBe(false)
    expect(tree.registry().retiring).toEqual([{ fiber: 'media-row', generation: 1 }])
    second.leave()
    await leaving
    expect(tree.registry().retiring).toEqual([])
  })
})
