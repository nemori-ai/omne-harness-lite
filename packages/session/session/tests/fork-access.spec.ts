import { afterEach, describe, expect, it } from 'vitest'
import type { ForkPoint, SessionCreation, SessionFailure } from '@omne-harness/session-contract'
import {
  creation,
  evidence,
  memoryOtherAccess,
  operationId,
  sessionId,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, type Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

function failureOf(answer: unknown): SessionFailure {
  expect(answer, JSON.stringify(answer)).toHaveProperty('failure')
  return (answer as { failure: SessionFailure }).failure
}

/** A source with one row in its view, and the point of that whole view. */
async function sourced(): Promise<Readonly<{ h: Harness; point: ForkPoint }>> {
  const h = await harness({ backend: memoryBackend })
  open.push(h)
  await h.create()
  const reminder = {
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'system_reminder',
    blocks: [
      { kind: 'text', id: 'said', text: 'said', visibility: { toHuman: false, toModel: true } },
    ],
  }
  const coordinator = h.faces('coordinator').work
  const work = succeeded(await coordinator.readWork(h.access()), 'work')
  succeeded(
    await coordinator.commitDerived({
      ...h.access(),
      operation: operationId('remind'),
      expected: work.revision,
      value: { kind: 'context-reminder', message: reminder as never, source: evidence('row') },
    }),
    'remind',
  )
  const reader = h.faces('reader').history
  const page = succeeded(
    await reader.readModelView({ ...h.access(), basis: null, after: null, pageBytes: 100_000 }),
    'view',
  )
  if (page.kind !== 'page') throw new Error('a page of the view is expected')
  const history = succeeded(
    await reader.begin({
      ...h.access(),
      kinds: [],
      from: null,
      direction: 'backward',
      pageBytes: 100_000,
    }),
    'history',
  )
  const last = history.entries[0]
  if (last === undefined) throw new Error('the source has no entry')
  return { h, point: { ...page.basis, position: last.id } }
}

const forked = (point: ForkPoint, source = 'session-1'): SessionCreation =>
  creation({
    relation: { kind: 'child', parent: sessionId(source), basis: evidence('dispatch') },
    attendance: 'unattended',
    fork: { source: sessionId(source), point },
  })

const createChild = (h: Harness, value: SessionCreation, access = h.access('child-1')) =>
  h
    .faces('intake')
    .management.create({ ...access, operation: operationId('create-child'), creation: value })

describe('a session is forked within its tenant, under the access of each session itself (SF-6)', () => {
  it('asks for the create once: the view of the source is not read under the name of the creator', async () => {
    const { h, point } = await sourced()
    const before = h.checks.count()
    succeeded(await createChild(h, forked(point)), 'fork')
    const asked = h.checks.asked().slice(before)
    expect(asked.map(request => request.operation)).toEqual(['create'])
    expect(asked[0]?.target).toMatchObject({ kind: 'session', session: sessionId('child-1') })
    const child = succeeded(
      await h.faces('coordinator').work.readWork(h.access('child-1')),
      'child',
    )
    expect(child.relation).toMatchObject({ kind: 'child', parent: sessionId('session-1') })
  })

  it('reads the prefix under the access of the forked session, not of its source', async () => {
    const { h, point } = await sourced()
    succeeded(await createChild(h, forked(point)), 'fork')
    const reader = h.faces('reader').history
    const view = { ...h.access('child-1'), basis: null, after: null, pageBytes: 100_000 }
    const before = h.checks.count()
    const rows = succeeded(await reader.readModelView(view), 'the view of the forked session')
    expect(rows).toMatchObject({ kind: 'page', rows: [{ message: { role: 'system_reminder' } }] })
    const asked = h.checks.asked().slice(before)
    expect(asked.map(request => request.target)).toEqual([
      { kind: 'session', session: sessionId('child-1') },
    ])
    h.checks.script({ kind: 'denied' })
    expect(failureOf(await reader.readModelView(view)).kind).toBe('denied')
  })

  it('answers a source of another tenant as it answers a source that is not there', async () => {
    const { h, point } = await sourced()
    const absent = failureOf(await createChild(h, forked(point, 'ghost')))
    expect(absent).toEqual({ kind: 'denied', action: 'create' })
    const stranger = memoryOtherAccess('b:stranger', 'child-1')
    expect(failureOf(await createChild(h, forked(point), stranger))).toEqual(absent)
    const reads = h.faces('coordinator').work
    expect(failureOf(await reads.readWork(h.access('child-1'))).kind).toBe('denied')
  })

  it('creates nothing for a creator the access check refuses', async () => {
    const { h, point } = await sourced()
    h.checks.script({ kind: 'denied' })
    expect(failureOf(await createChild(h, forked(point)))).toEqual({
      kind: 'denied',
      action: 'create',
    })
    h.checks.script({ kind: 'unavailable', diagnostic: 'the authority is away' })
    expect(failureOf(await createChild(h, forked(point))).kind).toBe('unavailable')
    const reads = h.faces('coordinator').work
    expect(failureOf(await reads.readWork(h.access('child-1'))).kind).toBe('denied')
    succeeded(await createChild(h, forked(point)), 'decided again')
  })

  it('reads the fork point under the access of the model view', async () => {
    const { h } = await sourced()
    const reader = h.faces('reader').history
    const before = h.checks.count()
    expect(
      succeeded(
        await reader.readForkPoint({ ...h.access(), asking: 'msg_not_written_by_it_000' }),
        'point',
      ),
    ).toEqual({ kind: 'none' })
    expect(
      h.checks
        .asked()
        .slice(before)
        .map(request => request.operation),
    ).toEqual(['history.readModelView'])
    h.checks.script({ kind: 'denied' })
    expect(
      failureOf(await reader.readForkPoint({ ...h.access(), asking: 'msg_not_written_by_it_000' }))
        .kind,
    ).toBe('denied')
  })
})
