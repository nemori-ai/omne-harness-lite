import { describe, expect, it } from 'vitest'
import {
  childRecorded,
  judgeStanding,
  standingOf,
  type RelatedSession,
  type Relation,
  type SessionCreation,
  type SessionFailure,
} from '@omne-harness/session-contract'
import {
  creation,
  evidence,
  memoryOtherAccess,
  operationId,
  sessionId,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { scene } from './scene.ts'

const self = sessionId('child-1')
const parentId = sessionId('session-1')
const basis = evidence('dispatch')
const child: Relation = { kind: 'child', parent: parentId, basis }
const handoff: Relation = { kind: 'handoff', origin: parentId, basis }

const related = (
  depth: number,
  lifecycle: RelatedSession['lifecycle'] = 'dormant',
): RelatedSession => ({
  session: parentId,
  lifecycle,
  tree: { root: depth === 0 ? parentId : sessionId('root'), depth },
})

type Standing = Pick<SessionCreation, 'relation' | 'attendance'>
type Cell = Readonly<{
  name: string
  creation: Standing
  related: RelatedSession | null | undefined
  answer: SessionFailure | Readonly<{ tree: unknown }>
}>

const invalid = (field: string, reason: string): SessionFailure => ({
  kind: 'invalid',
  field,
  reason,
})

const CELLS: readonly Cell[] = [
  {
    name: 'a creation that names the main relation reads no other end',
    creation: { relation: { kind: 'main' } },
    related: undefined,
    answer: { tree: null },
  },
  {
    name: 'a read of some other session is not the other end',
    creation: { relation: child, attendance: 'unattended' },
    related: { ...related(0), session: sessionId('elsewhere') },
    answer: {
      kind: 'unavailable',
      owner: '@omne-harness/session-contract',
      diagnostic: 'the other end of the relation was not read',
    },
  },
  {
    name: 'a main session reads no other end',
    creation: {},
    related: undefined,
    answer: { tree: null },
  },
  {
    name: 'an unattended main session is legal',
    creation: { attendance: 'unattended' },
    related: undefined,
    answer: { tree: null },
  },
  {
    name: 'a child of a root stands at depth 1 under that root',
    creation: { relation: child, attendance: 'unattended' },
    related: related(0),
    answer: { tree: { root: parentId, depth: 1 } },
  },
  {
    name: 'a child of a depth 1 session stands at depth 2 under the same root',
    creation: { relation: child, attendance: 'unattended' },
    related: related(1),
    answer: { tree: { root: sessionId('root'), depth: 2 } },
  },
  {
    name: 'a child of a depth 2 session is refused',
    creation: { relation: child, attendance: 'unattended' },
    related: related(2),
    answer: invalid('creation.relation', 'the depth would exceed 2'),
  },
  {
    name: 'a child of a session the tenant does not have is denied',
    creation: { relation: child, attendance: 'unattended' },
    related: null,
    answer: { kind: 'denied', action: 'create' },
  },
  {
    name: 'a child of an archived session is refused as archived',
    creation: { relation: child, attendance: 'unattended' },
    related: related(0, 'archived'),
    answer: { kind: 'archived' },
  },
  {
    name: 'a child of a frozen session is refused as frozen',
    creation: { relation: child, attendance: 'unattended' },
    related: related(0, 'frozen'),
    answer: { kind: 'frozen', verdict: null },
  },
  {
    name: 'an attended child is invalid',
    creation: { relation: child, attendance: 'attended' },
    related: related(0),
    answer: invalid('creation.attendance', 'a child session is unattended'),
  },
  {
    name: 'a child that names no attendance is invalid',
    creation: { relation: child },
    related: related(0),
    answer: invalid('creation.attendance', 'a child session is unattended'),
  },
  {
    name: 'a session cannot be its own parent',
    creation: { relation: { kind: 'child', parent: self, basis }, attendance: 'unattended' },
    related: { ...related(0), session: self },
    answer: invalid('creation.relation.parent', 'self parenting'),
  },
  {
    name: 'a relation without a complete basis is invalid',
    creation: {
      relation: { kind: 'child', parent: parentId, basis: { ...basis, digest: '' } },
      attendance: 'unattended',
    },
    related: related(0),
    answer: invalid('creation.relation.basis', 'incomplete evidence'),
  },
  {
    name: 'a relation whose other end nobody read is unavailable',
    creation: { relation: child, attendance: 'unattended' },
    related: undefined,
    answer: {
      kind: 'unavailable',
      owner: '@omne-harness/session-contract',
      diagnostic: 'the other end of the relation was not read',
    },
  },
  {
    name: 'a handoff from a session the tenant does not have is denied',
    creation: { relation: handoff },
    related: null,
    answer: { kind: 'denied', action: 'create' },
  },
  {
    name: 'a handoff is a root, whatever depth its origin stands at',
    creation: { relation: handoff },
    related: related(2),
    answer: { tree: null },
  },
  {
    name: 'a handoff from an archived origin still stands',
    creation: { relation: handoff },
    related: related(0, 'archived'),
    answer: { tree: null },
  },
]

describe('the standing of a session is judged when it is created (SW-I23)', () => {
  it.each(CELLS)('$name', cell => {
    const judged = judgeStanding(self, cell.creation, cell.related)
    expect('kind' in judged && judged.kind === 'rejected' ? judged.failure : judged).toEqual(
      cell.answer,
    )
  })
})

const childCreation = (parent: string, extra: Partial<SessionCreation> = {}) =>
  creation({
    relation: { kind: 'child', parent: sessionId(parent), basis },
    attendance: 'unattended',
    ...extra,
  })

const childEntries = (s: ReturnType<typeof scene>) =>
  s.port.controls
    .entriesOf(s.access.tenant, s.access.session)
    .filter(entry => entry.kind === 'session.child-recorded')

describe('a child session and the record of it in its parent commit together', () => {
  it('fixes relation, tree and attendance on the child and records the child in the parent', async () => {
    const parent = scene()
    await parent.create()
    const before = await parent.read()
    const kid = parent.peer('child-1')
    const created = await kid.create(childCreation('session-1'))
    expect(created.state.relation).toEqual({ kind: 'child', parent: parentId, basis })
    expect(created.state.tree).toEqual({ root: parentId, depth: 1 })
    expect(created.state.attendance).toBe('unattended')
    const after = await parent.read()
    expect(after.children).toEqual([sessionId('child-1')])
    expect(BigInt(after.revision)).toBe(BigInt(before.revision) + 1n)
    expect(childEntries(parent)).toHaveLength(1)
  })

  it('recalls the same child for the same request and records it once', async () => {
    const parent = scene()
    await parent.create()
    const kid = parent.peer('child-1')
    await kid.create(childCreation('session-1'))
    const again = await kid.create(childCreation('session-1'))
    expect(again.receipt.recovered).toBe(true)
    expect((await parent.read()).children).toEqual([sessionId('child-1')])
    expect(childEntries(parent)).toHaveLength(1)
  })

  it('lets a tree grow two layers below its root and no further', async () => {
    const root = scene()
    await root.create()
    const first = root.peer('child-1')
    await first.create(childCreation('session-1'))
    const second = root.peer('child-2')
    const grandchild = await second.create(childCreation('child-1'))
    expect(grandchild.state.tree).toEqual({ root: parentId, depth: 2 })
    expect((await first.read()).children).toEqual([sessionId('child-2')])
    const third = root.peer('child-3')
    const refused = await third.commit({
      kind: 'create',
      input: {
        ...third.base,
        operation: operationId('create'),
        creation: childCreation('child-2'),
      },
    })
    expect(refused).toEqual({
      failure: invalid('creation.relation', 'the depth would exceed 2'),
    })
    expect((await second.read()).children ?? []).toEqual([])
    expect(childEntries(second)).toHaveLength(0)
  })

  it('refuses a child of an archived parent and leaves no child behind', async () => {
    const parent = scene()
    await parent.create()
    await parent.control('archive')
    const kid = parent.peer('child-1')
    const refused = await kid.commit({
      kind: 'create',
      input: {
        ...kid.base,
        operation: operationId('create'),
        creation: childCreation('session-1'),
      },
    })
    expect(refused).toEqual({ failure: { kind: 'archived' } })
    expect('failure' in (await kid.port.readWork(kid.access))).toBe(true)
  })

  it('answers a parent of another tenant as it answers a parent that does not exist', async () => {
    const parent = scene()
    await parent.create()
    const foreign = parent.peer('child-1', memoryOtherAccess('tester', 'child-1'))
    const create = (s: ReturnType<typeof scene>, of: string) =>
      s.commit({
        kind: 'create',
        input: { ...s.base, operation: operationId('create'), creation: childCreation(of) },
      })
    const denied = { failure: { kind: 'denied', action: 'create' } }
    expect(await create(foreign, 'session-1')).toEqual(denied)
    expect(await create(parent.peer('child-2'), 'nobody')).toEqual(denied)
    expect((await parent.read()).children ?? []).toEqual([])
  })

  it('creates a handoff as an attended root and records nothing in its origin', async () => {
    const origin = scene()
    await origin.create()
    const before = await origin.read()
    const next = origin.peer('handoff-1')
    const created = await next.create(
      creation({ relation: { kind: 'handoff', origin: parentId, basis } }),
    )
    expect(created.state.relation).toEqual({ kind: 'handoff', origin: parentId, basis })
    expect(created.state.tree).toBeUndefined()
    expect(await origin.read()).toEqual(before)
  })
})

describe('the resident mark is kept apart from the relation', () => {
  it('marks a main session resident and refuses the mark on a child', async () => {
    const parent = scene()
    await parent.create()
    succeeded(
      await parent.commit({
        kind: 'setResident',
        input: { ...parent.base, operation: operationId('resident'), resident: true },
      }),
      'resident',
    )
    expect((await parent.read()).resident).toBe(true)
    const kid = parent.peer('child-1')
    await kid.create(childCreation('session-1'))
    expect(
      await kid.commit({
        kind: 'setResident',
        input: { ...kid.base, operation: operationId('resident'), resident: true },
      }),
    ).toEqual({ failure: invalid('resident', 'a child cannot become resident') })
    expect((await kid.read()).relation?.kind).toBe('child')
  })
})

describe('what a snapshot says of its standing, and what the parent log takes', () => {
  it('reads a session that names nothing as an attended main session, its own root', async () => {
    const parent = scene()
    await parent.create()
    expect(standingOf(await parent.read())).toEqual({
      relation: { kind: 'main' },
      attendance: 'attended',
      tree: { root: parentId, depth: 0 },
    })
    const kid = parent.peer('child-1')
    const created = await kid.create(childCreation('session-1'))
    expect(standingOf(created.state)).toEqual({
      relation: { kind: 'child', parent: parentId, basis },
      attendance: 'unattended',
      tree: { root: parentId, depth: 1 },
    })
  })

  it('derives the operation of the parent record from the child and its create alone', () => {
    const of = (session: string, operation: string) =>
      childRecorded({
        session: sessionId(session),
        operation: operationId(operation),
        creation: childCreation('session-1'),
      })
    const record = of('child-1', 'create')
    expect(record?.parent).toBe(parentId)
    expect(record?.operation).toBe(
      'sop_50fcb613e04b490d2ff620af096dda6b75865609552afa7262f910920b7a66e7',
    )
    expect(record?.operation).not.toBe(of('child-2', 'create')?.operation)
    expect(record?.operation).not.toBe(of('child-1', 'again')?.operation)
    expect(record?.entry.origin.source.record).toBe(`${operationId('create')}/child-recorded`)
    expect(
      childRecorded({ session: self, operation: operationId('create'), creation: creation() }),
    ).toBeNull()
  })
})
