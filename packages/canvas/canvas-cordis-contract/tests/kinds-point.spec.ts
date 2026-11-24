import { Context, type Fiber } from '@deepseek-ai/cordis'
import type { Admission, KindDeclaration, KindName } from '@omne-harness/canvas-contract'
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

  it('is taken off only once the admits in flight have their answers, and takes no new one meanwhile', async () => {
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
    const inFlight = admit(input)
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
    expect(await inFlight).toEqual({ kind: 'admitted' })
    await leaving
    expect(tree.registry().retiring).toEqual([])
    expect(tree.registry().placed.filter(placed => placed.point === CANVAS_KINDS_POINT)).toEqual([])
  })

  it('counts an admit that throws as ended', async () => {
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
