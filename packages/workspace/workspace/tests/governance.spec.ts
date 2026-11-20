import { describe, expect, it } from 'vitest'
import { fakeAccess } from '@omne-harness/workspace/testing'
import { named, op, world } from './world.ts'

const ALICE = fakeAccess(1)
const BOB = fakeAccess(2)

describe('registering a directory', () => {
  it('makes a workspace, its owner and its first instance in one commit', async () => {
    const w = world()
    w.things.put('/a', { kinds: ['plain'] })
    const answer = await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })
    expect(answer).toMatchObject({ kind: 'done', changed: true, value: { type: 'plain' } })
    if (answer.kind !== 'done') return
    expect(await w.catalog.list(ALICE)).toEqual({
      kind: 'read',
      value: [{ workspace: answer.value.workspace, type: 'plain', standing: 'owner' }],
    })
    expect(w.authority.asked()[0]).toEqual({ action: 'workspace.register', target: 'node-1' })
  })

  it('asks the most specific type first', async () => {
    const w = world()
    w.things.put('/a', { kinds: ['plain', 'versioned'] })
    w.things.put('/b', { kinds: ['plain'] })
    const a = await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })
    const b = await w.governance.register(ALICE, { operation: op('r2'), address: '/b' })
    expect(a).toMatchObject({ kind: 'done', value: { type: 'versioned' } })
    expect(b).toMatchObject({ kind: 'done', value: { type: 'plain' } })
  })

  it('a type that could not look ends the search: a less specific type does not take it', async () => {
    const w = world()
    w.things.put('/a', { kinds: ['plain', 'versioned'], state: 'unreadable' })
    const answer = await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })
    expect(answer.kind).toBe('unavailable')
    expect(await w.catalog.list(ALICE)).toEqual({ kind: 'read', value: [] })
  })

  it('a named type that does not recognise the address is not performed', async () => {
    const w = world()
    w.things.put('/a', { kinds: ['plain'] })
    const answer = await w.governance.register(ALICE, {
      operation: op('r1'),
      address: '/a',
      type: named('versioned'),
    })
    expect(answer).toEqual({ kind: 'not-performed', reason: 'not-recognised' })
  })

  it('the same operation name with the same input is recalled, not done again', async () => {
    const w = world()
    w.things.put('/a', {})
    const first = await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })
    const again = await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })
    expect(first.kind).toBe('done')
    expect(again).toEqual({ ...first, changed: false })
    expect(
      (await w.catalog.list(ALICE)).kind === 'read' && (await w.catalog.list(ALICE)),
    ).toMatchObject({
      value: [{}],
    })
  })

  it('the same operation name with another input is a conflict', async () => {
    const w = world()
    w.things.put('/a', {})
    w.things.put('/b', {})
    await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })
    expect(await w.governance.register(ALICE, { operation: op('r1'), address: '/b' })).toEqual({
      kind: 'conflict',
    })
    expect(
      await w.governance.register(ALICE, {
        operation: op('r1'),
        address: '/a',
        type: named('plain'),
      }),
    ).toEqual({ kind: 'conflict' })
  })

  it('an operation name belongs to its tenant: another tenant using it is another operation', async () => {
    const w = world()
    w.things.put('/a', {})
    w.things.put('/b', {})
    await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })
    expect(await w.governance.register(BOB, { operation: op('r1'), address: '/b' })).toMatchObject({
      kind: 'done',
      changed: true,
    })
    expect(await w.governance.operation(BOB, op('r1'))).toMatchObject({ kind: 'recorded' })
    expect(await w.governance.operation(BOB, op('r-of-nobody'))).toEqual({ kind: 'not-recorded' })
  })

  it('a lost receipt is unknown; the operation is asked about, not repeated', async () => {
    const w = world()
    w.things.put('/a', {})
    w.store.fail('lost')
    const answer = await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })
    expect(answer).toEqual({ kind: 'unknown', operation: 'r1' })
    w.store.fail('none')
    const recorded = await w.governance.operation(ALICE, op('r1'))
    expect(recorded).toMatchObject({ kind: 'recorded', operation: 'register' })
    const again = await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })
    expect(again).toMatchObject({ kind: 'done', changed: false })
    expect(again.kind === 'done' && recorded.kind === 'recorded' && recorded.value).toMatchObject({
      instance: again.kind === 'done' ? again.value.instance : '',
    })
  })

  it('a commit that rolled back wrote nothing and is unavailable', async () => {
    const w = world()
    w.things.put('/a', {})
    w.store.fail('rolled-back')
    expect((await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })).kind).toBe(
      'unavailable',
    )
    w.store.fail('none')
    expect(await w.governance.operation(ALICE, op('r1'))).toEqual({ kind: 'not-recorded' })
  })

  it('a refusal is not kept: the same name may be used again once the reason is gone', async () => {
    const w = world()
    const refused = await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })
    expect(refused).toEqual({ kind: 'not-performed', reason: 'not-found' })
    w.things.put('/a', {})
    expect((await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })).kind).toBe(
      'done',
    )
  })

  it.each([
    ['not a member', 'not-member', 'allowed', 'not-permitted'],
    ['not admitted', 'member', 'denied', 'not-permitted'],
    ['standing unreadable', 'unavailable', 'allowed', 'unavailable'],
    ['admission unreadable', 'member', 'unavailable', 'unavailable'],
    ['standing source down', 'throw', 'allowed', 'unavailable'],
    ['admission source down', 'member', 'throw', 'unavailable'],
  ] as const)('%s: %s', async (_name, standing, admission, kind) => {
    const w = world()
    w.things.put('/a', {})
    w.authority.standingIs(() => standing)
    w.authority.admits(() => admission)
    const looks = w.things.looks()
    expect((await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })).kind).toBe(
      kind,
    )
    expect((await w.governance.operation(ALICE, op('r1'))).kind).toBe(kind)
    expect(w.things.looks()).toBe(looks)
  })

  it.each([
    ['an empty address', { operation: op('r1'), address: '' }],
    ['an operation name that is not one', { operation: 'two words' as never, address: '/a' }],
    [
      'a type name that is not one',
      { operation: op('r1'), address: '/a', type: 'Not A Type' as never },
    ],
  ])('%s is an invalid request', async (_name, input) => {
    const w = world()
    w.things.put('/a', {})
    expect(await w.governance.register(ALICE, input)).toEqual({
      kind: 'not-performed',
      reason: 'invalid-request',
    })
  })

  it('a tenant that was not parsed is not permitted', async () => {
    const w = world()
    w.things.put('/a', {})
    const forged = { principal: 'p', tenant: { ...ALICE.tenant } }
    expect(await w.governance.register(forged, { operation: op('r1'), address: '/a' })).toEqual({
      kind: 'not-permitted',
    })
    expect(await w.catalog.list(forged)).toEqual({ kind: 'read', value: [] })
  })
})

describe('the catalog', () => {
  it('lists only the workspaces the caller has a relation with', async () => {
    const w = world()
    w.things.put('/a', {})
    w.things.put('/b', {})
    const a = await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })
    await w.governance.register(BOB, { operation: op('r1'), address: '/b' })
    const list = await w.catalog.list(ALICE)
    expect(list.kind === 'read' && list.value.map(summary => summary.workspace)).toEqual([
      a.kind === 'done' ? a.value.workspace : null,
    ])
  })

  it('a list that cannot be read is unavailable, not empty', async () => {
    const w = world()
    w.store.fail('unreadable')
    expect((await w.catalog.list(ALICE)).kind).toBe('unavailable')
    w.store.fail('none')
    w.authority.standingIs(() => 'unavailable')
    expect((await w.catalog.list(ALICE)).kind).toBe('unavailable')
    w.authority.standingIs(() => 'not-member')
    expect(await w.catalog.list(ALICE)).toEqual({ kind: 'read', value: [] })
  })

  it('describes each instance with a look taken now', async () => {
    const w = world()
    w.things.put('/a', { version: 'v7' })
    const made = await w.governance.register(ALICE, { operation: op('r1'), address: '/a' })
    if (made.kind !== 'done') throw new Error('not registered')
    expect(await w.catalog.describe(ALICE, made.value.workspace)).toEqual({
      kind: 'read',
      value: {
        workspace: made.value.workspace,
        type: 'plain',
        standing: 'owner',
        instances: [
          {
            instance: made.value.instance,
            address: '/a',
            availability: { kind: 'available', directory: '/a', basis: 'v7' },
          },
        ],
      },
    })
    w.things.things.get('/a')!.state = 'unreadable'
    expect(await w.catalog.describe(ALICE, made.value.workspace)).toMatchObject({
      value: { instances: [{ availability: { kind: 'unknown' } }] },
    })
    w.store.fail('unreadable')
    expect((await w.catalog.describe(ALICE, made.value.workspace)).kind).toBe('unavailable')
  })
})
