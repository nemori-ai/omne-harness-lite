// The control face of the in-memory Session double: queryControlOperation, readModelSelection,
// the answer-only control branch and commitEntries. The shared conformance suite covers the
// happy paths; these cases pin the answers it does not (denied, conflict, unavailable).
import { describe, expect, it } from 'vitest'
import type {
  RunId,
  SessionCommand,
  SessionEntriesObservation,
  SessionOperationId,
} from '@omne-harness/session-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import { sessionFixture } from './fixtures/session-conformance.ts'

const kindOf = (value: unknown): string | undefined =>
  (value as { failure?: { kind: string } }).failure?.kind
const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}

async function created() {
  const fixture = sessionFixture()
  const base = { tenant: fixture.access.tenant, session: fixture.access.session }
  const create = {
    kind: 'create',
    input: { ...base, operation: fixture.operation('create'), creation: fixture.creation },
  } as Extract<SessionCommand, { kind: 'create' }>
  ok(
    await fixture.port.commit({
      access: fixture.access,
      command: create,
      guards: (await fixture.initializationGuards?.(create)) ?? [],
    }),
  )
  const commit = (command: SessionCommand) =>
    fixture.port.commit({ access: fixture.access, command: command as never, guards: [] })
  const cancel = (name: string) =>
    commit({
      kind: 'cancelRun',
      input: {
        ...base,
        operation: fixture.operation(name),
        run: 'run_never' as RunId,
        urgency: 'force',
      },
    })
  const select = (name: string, route: string) =>
    commit({
      kind: 'change',
      input: {
        ...base,
        operation: fixture.operation(name),
        declaration: { kind: 'model', name: route, basis: evidence(route) },
      },
    })
  return { fixture, base, commit, cancel, select }
}

describe('queryControlOperation', () => {
  it('is unknown for an identity never seen, and the original answer for an answered control', async () => {
    const { fixture, cancel } = await created()
    expect(
      ok(
        await fixture.port.queryControlOperation({
          ...fixture.access,
          operation: fixture.operation('x'),
        }),
      ),
    ).toEqual({ kind: 'unknown' })
    const first = ok(await cancel('answered'))
    expect(
      ok(
        await fixture.port.queryControlOperation({
          ...fixture.access,
          operation: fixture.operation('answered'),
        }),
      ),
    ).toEqual({ kind: 'committed', receipt: first })
  })

  it('is a conflict on a batch identity', async () => {
    const { fixture } = await created()
    const asked = await fixture.port.queryControlOperation({
      ...fixture.access,
      operation: fixture.operation('create'),
    })
    expect(kindOf(asked)).toBe('conflict')
  })

  it('is denied for the access of another tenant, whatever the identity', async () => {
    const { fixture, cancel } = await created()
    ok(await cancel('answered'))
    const other = fixture.otherAccess
    if (other === undefined) throw new Error('fixture')
    expect(
      kindOf(
        await fixture.port.queryControlOperation({
          ...other,
          operation: fixture.operation('answered'),
        }),
      ),
    ).toBe('denied')
  })
})

describe('the answer-only control branch', () => {
  it('replays the answer, refuses the same identity for another command, and advances no revision', async () => {
    const { fixture, cancel, commit, base } = await created()
    const before = ok<{ revision: string }>(await fixture.port.readWork(fixture.access))
    const first = ok(await cancel('none'))
    expect(ok(await cancel('none'))).toEqual(first)
    const other = await commit({
      kind: 'cancelRun',
      input: {
        ...base,
        operation: fixture.operation('none'),
        run: 'run_other' as RunId,
        urgency: 'force',
      },
    })
    expect(kindOf(other)).toBe('conflict')
    expect(ok<{ revision: string }>(await fixture.port.readWork(fixture.access)).revision).toBe(
      before.revision,
    )
  })
})

describe('readModelSelection', () => {
  it('is not-ready without a selection, then the saved one, then the latest one with its own source', async () => {
    const { fixture, select } = await created()
    expect(kindOf(await fixture.port.readModelSelection(fixture.access))).toBe('not-ready')
    ok(await select('a', 'route-a'))
    const second = ok<{ source: unknown }>(await select('b', 'route-b'))
    const read = ok<{ selection: { name: string }; source: unknown }>(
      await fixture.port.readModelSelection(fixture.access),
    )
    expect(read.selection.name).toBe('route-b')
    expect(read.source).toEqual(second.source)
  })

  it('is denied for the access of another tenant', async () => {
    const { fixture } = await created()
    const other = fixture.otherAccess
    if (other === undefined) throw new Error('fixture')
    expect(kindOf(await fixture.port.readModelSelection(other))).toBe('denied')
  })
})

describe('commitEntries', () => {
  // Replaces the case "answers unavailable: no pure range check" (P3 r2 7.5): the double now runs
  // the shared range check, so the same intent is that a refused range is never success and writes
  // nothing. The shared suite holds the ranges of a recorded execution (CF-05, CF-06).
  const observation = (
    fixture: ReturnType<typeof sessionFixture>,
    operation: SessionOperationId,
  ): SessionEntriesObservation => ({
    tenant: fixture.access.tenant,
    session: fixture.access.session,
    run: 'run_never' as RunId,
    execution: 'execution-never',
    channel: 'tool-received',
    operation,
    after: '0',
    through: '1',
    boundary: {
      execution: 'execution-never',
      channel: 'tool-received',
      revision: '1',
      executionEvidence: evidence('head'),
      count: '1',
    },
    items: [
      {
        ordinal: '1',
        key: 'key-1',
        fact: evidence('entry-1'),
        interpretation: [
          {
            kind: 'execution',
            producer: { kind: 'tool', call: 'call-1' },
            source: evidence('fact'),
          },
        ],
      },
    ],
  })

  it('refuses a range of an execution that Session never recorded, and writes nothing', async () => {
    const { fixture } = await created()
    const before = ok<{ revision: string }>(await fixture.port.readWork(fixture.access)).revision
    const answer = await fixture.port.commitEntries({
      observation: observation(fixture, fixture.operation('entries')),
      start: { kind: 'initial' },
    })
    expect(answer).toMatchObject({ failure: { kind: 'unavailable', owner: 'session-history' } })
    expect(ok<{ revision: string }>(await fixture.port.readWork(fixture.access)).revision).toBe(
      before,
    )
  })

  it('answers conflict for the identity of an answer-only control, before the range check', async () => {
    const { fixture, cancel } = await created()
    ok(await cancel('answered'))
    const operation = fixture.operation('answered')
    expect(
      await fixture.port.commitEntries({
        observation: observation(fixture, operation),
        start: { kind: 'initial' },
      }),
    ).toEqual({ failure: { kind: 'conflict', operation } })
  })
})
