import { describe, expect, it } from 'vitest'
import type { CanvasOperations } from '@omne-harness/canvas-contract'
import { caller, domain, kind, media, OTHER, personOf, SESSION, TENANT } from './world.ts'

/** A canvas with one item i1 a person put on and locked, and one loose item i2. */
async function withLocked() {
  const d = domain()
  const person = personOf(TENANT)
  await d.canvas.place(person, { canvas: 'main', reference: media('a') })
  await d.canvas.place(person, { canvas: 'main', reference: media('b') })
  await d.canvas.lock(person, { canvas: 'main', items: ['i1'], locked: true })
  return d
}

const throwing = (): CanvasOperations =>
  new Proxy({} as CanvasOperations, {
    get: () => async () => {
      throw new Error('the canvas is down')
    },
  })

describe('what the canvas refuses is a failed result with its reason and what to do', () => {
  it('a locked item: says it is locked and that a person has to unlock it, for arrange, take and pile alike', async () => {
    const d = await withLocked()
    const agent = caller(d.canvas)
    const calls = [
      ['arrange', { items: [{ item: 'i1', at: { x: 400, y: 400 } }] }],
      ['take', { items: ['i1'] }],
      ['pile', { pile: 'p1', items: ['i2', 'i1'] }],
    ] as const
    for (const [command, params] of calls)
      expect(await agent.failure(command, params)).toEqual({
        kind: 'conflict',
        reason:
          'conflict locked item i1: it is locked. A person has to unlock it: ask the user to. Nothing in the batch was done.',
      })
    const look = await agent.ok('look')
    expect(look.value.items.map((item: any) => [item.id, item.locked, item.pile])).toEqual([
      ['i1', true, null],
      ['i2', false, null],
    ])
  })

  it('a refusal to act for the tenant: denied, and not by another route', async () => {
    const d = domain()
    d.authority.answer('denied')
    for (const command of ['look', 'place'] as const)
      expect(
        await caller(d.canvas).failure(
          command,
          command === 'place' ? { reference: media('a') } : {},
        ),
      ).toEqual({
        kind: 'unsupported',
        reason:
          'denied: this call may not act on the canvas of this tenant. Do not try another route; tell the user.',
      })
  })

  it('a basis that cannot be read: basis-unavailable, nothing changed, try again later', async () => {
    const d = domain()
    d.authority.answer('unavailable')
    const failure = await caller(d.canvas).failure('take', { items: ['i1'] })
    expect(failure).toEqual({
      kind: 'unavailable',
      operation: 'Canvas.take',
      reason:
        'basis-unavailable: the canvas cannot answer now; nothing was changed. Try again later.',
    })
  })

  it('a kind declared twice: basis-unavailable that names the two who declared it', async () => {
    const d = domain()
    d.kinds.declare(kind('notes.note'), 'notes-row')
    d.kinds.declare(kind('notes.note'), 'other-notes-row')
    const failure = await caller(d.canvas).failure('place', {
      reference: { kind: 'notes.note', ref: 'n1' },
    })
    expect(failure.reason).toBe(
      'basis-unavailable: the kind notes.note is declared twice, by notes-row and other-notes-row; neither counts until one is withdrawn. Nothing was changed; kinds lists it as a conflict.',
    )
    expect((await caller(d.canvas).ok('kinds')).value.kinds).toContainEqual({
      name: 'notes.note',
      conflict: ['notes-row', 'other-notes-row'],
    })
  })

  it('a commit whose result is not known: unknown, look or send the same again', async () => {
    const d = domain()
    d.store.failCommits('unknown-applied')
    const failure = await caller(d.canvas).failure('place', { reference: media('a') })
    expect(failure).toMatchObject({ kind: 'unknown', operation: 'Canvas.place' })
    expect(failure.reason).toMatch(/^unknown: it is not known whether this took effect\. /)
    d.store.failCommits(null)
    expect((await caller(d.canvas).ok('place', { reference: media('a') })).head).toBe(
      'no-change Canvas place',
    )
  })

  it('a value that does not fit: invalid, where in the params, and what to do', async () => {
    const d = domain()
    expect(
      await caller(d.canvas).failure('place', { reference: media('a'), at: { x: 9999, y: 0 } }),
    ).toEqual({
      kind: 'invalid',
      reason:
        'invalid spot at at: the spot is off the sheet; look gives the width and the height of the sheet',
    })
    expect(await caller(d.canvas).failure('take', { items: ['i1', 'i1'] })).toEqual({
      kind: 'invalid',
      reason:
        'invalid repeated at items.1: an item or a pile is named twice in one batch; name each once',
    })
  })

  it('an item or a pile that is not there: not-found, which one, and look', async () => {
    const d = await withLocked()
    expect(await caller(d.canvas).failure('take', { items: ['i2', 'i9'] })).toEqual({
      kind: 'invalid',
      reason:
        'not-found item i9: there is no such item on this canvas; look lists them. Nothing in the batch was done.',
    })
    expect(
      (await caller(d.canvas).failure('arrange', { piles: [{ pile: 'p9', name: 'x' }] })).reason,
    ).toMatch(/^not-found pile p9: there is no such pile/)
  })

  it('a state that does not allow it: conflict with the reason, the item and what to do', async () => {
    const d = domain()
    const agent = caller(d.canvas)
    await agent.ok('place', { reference: media('a') })
    await agent.ok('take', { items: ['i1'] })
    expect((await agent.failure('lock', { items: ['i1'] })).reason).toBe(
      'conflict taken item i1: it is taken off the canvas; place its reference to put it back. Nothing in the batch was done.',
    )
    expect(
      (await agent.failure('place', { reference: { kind: 'notes.note', ref: 'n1' } })).reason,
    ).toBe(
      'conflict kind-undeclared: this kind is not declared now; kinds lists the kinds there are.',
    )
  })

  it('the executor fails the call with the reason, never a text of success', async () => {
    const d = await withLocked()
    await expect(caller(d.canvas).executed('take', { items: ['i1'] })).rejects.toThrow(
      /^conflict locked item i1: it is locked/,
    )
    await expect(caller(d.canvas).executed('take', { items: ['i2'] })).resolves.toBe(
      'done Canvas take\n{"revision":4}',
    )
  })
})

describe('a canvas that cannot be reached', () => {
  it('a read that throws has no basis; a write that throws has an unknown result', async () => {
    const agent = caller(throwing())
    expect((await agent.failure('look')).reason).toMatch(/^basis-unavailable: /)
    expect((await agent.failure('kinds')).reason).toMatch(/^basis-unavailable: /)
    for (const [command, params] of [
      ['place', { reference: media('a') }],
      ['scatter', { pile: 'p1' }],
      ['unlock', { items: ['i1'] }],
    ] as const)
      expect(await agent.failure(command, params)).toMatchObject({
        kind: 'unknown',
        operation: `Canvas.${command}`,
      })
  })

  it('no canvas, no context or a context of another tenant: the canvas is not asked', async () => {
    const d = domain()
    const cases = [
      caller(undefined),
      caller(d.canvas, TENANT, { context: async () => undefined }),
      caller(d.canvas, TENANT, {
        context: async () => {
          throw new Error('identity is down')
        },
      }),
      caller(d.canvas, TENANT, { context: async () => personOf(OTHER) }),
    ]
    const reasons = []
    for (const agent of cases) {
      const failure = await agent.failure('place', { reference: media('a') })
      expect(failure).toMatchObject({ kind: 'unavailable', operation: 'Canvas.place' })
      reasons.push(failure.reason)
    }
    expect(reasons.at(-1)).toBe(
      'basis-unavailable: this call does not act for the tenant of the canvas',
    )
    expect(d.authority.asked()).toEqual([])
  })
})

describe('what the agent reads', () => {
  it('look names who moved each item: the person, or the agent of a session', async () => {
    const d = await withLocked()
    await caller(d.canvas).ok('arrange', { items: [{ item: 'i2', at: { x: 800, y: 800 } }] })
    const { head, value } = await caller(d.canvas).ok('look')
    expect(head).toBe('done Canvas look')
    expect(value.items.map((item: any) => [item.id, item.by])).toEqual([
      ['i1', { kind: 'human' }],
      ['i2', { kind: 'agent', session: SESSION }],
    ])
    expect(value.sheet).toEqual({
      width: 4800,
      height: 3200,
      grid: 8,
      size: { min: { width: 120, height: 64 }, max: { width: 900, height: 900 } },
      footprint: { width: 160, height: 80 },
    })
  })

  it('kinds gives each kind with how its ref is written; away pages the taken ones', async () => {
    const d = domain()
    const agent = caller(d.canvas)
    expect((await agent.ok('kinds')).value).toEqual({
      kinds: [
        {
          name: 'media.object',
          label: 'media.object',
          summary: 'media.object is a thing',
          ref: 'the identity of a media.object',
        },
      ],
    })
    for (const ref of ['a', 'b', 'c']) await agent.ok('place', { reference: media(ref) })
    await agent.ok('take', { items: ['i1', 'i2', 'i3'] })
    const first = (await agent.ok('away', { limit: 2 })).value
    expect(first.items.map((item: any) => item.reference.ref)).toEqual(['c', 'b'])
    const rest = (await agent.ok('away', { before: first.next })).value
    expect([rest.items.map((item: any) => item.reference.ref), rest.next]).toEqual([['a'], null])
  })
})
