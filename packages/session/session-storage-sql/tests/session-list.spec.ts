// The commit times and the session list (SPEC「提交的时刻与会话列表」): which commits move the latest
// activity, the title rule, the order and keyset pages of `directory.list`, a clock that answers
// unavailable, the backfill of the migration, and one transaction with the batch.
import { describe, expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  ClockSample,
  RoutedInput,
  SessionClock,
  SessionCommand,
  SessionDirectory,
} from '@omne-harness/session-contract'
import {
  adoption,
  creation,
  evidence,
  operationId,
  ordinaryInput,
  sessionId,
} from '@omne-harness/session-contract/testing'
import { sessionStorageMaterials } from '../src/index.ts'
import migration from '../src/worker/session-list-migration.ts'
import { app, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'
import { FIXTURE_READ_OUTPUT_LIMIT_BYTES } from './fixtures/read-limit.ts'

describe('the materials', () => {
  it('register the migration after the snapshot chunks, the two tables and the list handler', () => {
    const materials = sessionStorageMaterials({
      readOutputLimitBytes: FIXTURE_READ_OUTPUT_LIMIT_BYTES,
    })
    const found = materials.migrations.find(item => item.id === '008-session-list')
    expect(found?.requires).toEqual([{ owner: 'session', id: '004-state-items' }])
    const session = materials.participants.find(item => item.participant === 'session')
    expect(session?.ownedTables).toEqual(
      expect.arrayContaining(['sl_commit_time', 'sl_session_list']),
    )
    const read = materials.readHandlers.find(item => item.handler === 'session.list')
    expect(read?.readTables).toEqual(['sl_session_list'])
    expect(read?.requiresMigrations).toEqual([{ owner: 'session', id: '008-session-list' }])
    expect(read?.maxRowsRead).toBe(1001)
  })
})

type Clock = Pick<SessionClock, 'sample'>

/** A clock that answers `times` in turn, then fails; `null` in the list is one failed reading. */
function clockOf(times: readonly (string | null)[]): Clock {
  let next = 0
  return {
    sample: () => {
      const at = times[next++] ?? null
      if (at === null)
        return Promise.resolve(
          fail({ kind: 'unavailable', owner: 'clock', diagnostic: 'no reading' }),
        )
      const sample: ClockSample = {
        at,
        protocol: adoption('clock'),
        source: evidence(`clock/${at}`),
      }
      return Promise.resolve(succeed(sample))
    },
  }
}

const T = (second: number) => `2026-11-13T00:00:${String(second).padStart(2, '0')}.000Z`

function rowOf(a: App, session = 'session-1') {
  const rows = a.provider.select(
    'dom_0',
    'SELECT created_at, last_activity_at, lifecycle, title, version FROM sl_session_list WHERE tenant = ? AND session = ? LIMIT 2',
    [textOf(TENANT_A), session],
  )
  expect(rows.rows).toHaveLength(1)
  const [createdAt, lastActivityAt, lifecycle, title, version] = rows.rows[0]!
  return { createdAt, lastActivityAt, lifecycle, title, version }
}

function timesOf(a: App, session = 'session-1') {
  return a.provider
    .select(
      'dom_0',
      'SELECT commit_seq, at FROM sl_commit_time WHERE tenant = ? AND session = ? ORDER BY commit_seq LIMIT 100',
      [textOf(TENANT_A), session],
    )
    .rows.map(([seq, at]) => [Number(seq), at])
}

const directoryOf = (a: App): SessionDirectory<string> => {
  const directory = a.port.directory
  if (directory === undefined) throw new Error('the port offers no directory')
  return directory
}

async function startRun(a: App, name = 'start') {
  return a.port.commit({
    access: a.access(TENANT_A),
    command: {
      kind: 'startRun',
      input: {
        tenant: TENANT_A,
        session: sessionId('session-1'),
        operation: operationId(name),
        entry: 'interactive',
        candidate: creation().definition.candidate,
        instance: { owner: 'agent', id: 'instance-1' },
      },
    },
    guards: [],
  })
}

async function finishRun(a: App, name = 'finish') {
  const work = await a.port.readWork(a.access(TENANT_A))
  if (!('ok' in work) || work.ok.run.kind !== 'active') throw new Error('no active Run')
  const command: SessionCommand = {
    kind: 'finishRun',
    input: {
      tenant: TENANT_A,
      session: sessionId('session-1'),
      operation: operationId(name),
      run: work.ok.run.run,
      expected: work.ok.run.revision,
      bounded: { kind: 'uninterpretable', evidence: evidence('agent/uninterpretable') },
    },
  }
  return a.port.commit({ access: a.access(TENANT_A), command, guards: [] })
}

/** An ordinary input whose message is the given blocks. */
function inputOf(
  name: string,
  blocks: readonly object[],
): Extract<RoutedInput, { kind: 'ordinary' }> {
  const input = ordinaryInput(name)
  return { ...input, message: { ...input.message, blocks } as unknown as typeof input.message }
}
const text = (value: string, id = 'b-text') => ({
  kind: 'text',
  id,
  visibility: { toHuman: true, toModel: true },
  text: value,
})
const image = {
  kind: 'image',
  id: 'b-image',
  visibility: { toHuman: true, toModel: true },
  mediaType: 'image/png',
  inline: 'iVBORw0KGgo=',
}

describe('the time of each commit and the latest activity', () => {
  it('create, accepting an input and the end of a Run move the latest activity; other commits do not', async () => {
    const a = await app({ clock: clockOf([T(1), T(2), T(3), T(4)]) })
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    expect(rowOf(a)).toMatchObject({ createdAt: T(1), lastActivityAt: T(1), lifecycle: 'dormant' })
    expect(await a.accept(TENANT_A, 'session-1', 'input-1')).toHaveProperty('ok')
    expect(rowOf(a)).toMatchObject({ createdAt: T(1), lastActivityAt: T(2) })
    expect(await startRun(a)).toHaveProperty('ok')
    expect(rowOf(a)).toMatchObject({ createdAt: T(1), lastActivityAt: T(2), lifecycle: 'active' })
    expect(await finishRun(a)).toHaveProperty('ok')
    expect(rowOf(a)).toMatchObject({ createdAt: T(1), lastActivityAt: T(4), lifecycle: 'dormant' })
    expect(timesOf(a)).toEqual([
      [1, T(1)],
      [2, T(2)],
      [3, T(3)],
      [4, T(4)],
    ])
  })

  it('a clock that answers unavailable leaves the commit standing and its time empty', async () => {
    const a = await app({ clock: clockOf([null, null]) })
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    expect(await a.accept(TENANT_A, 'session-1', 'input-1')).toHaveProperty('ok')
    expect(timesOf(a)).toEqual([
      [1, null],
      [2, null],
    ])
    expect(rowOf(a)).toMatchObject({ createdAt: null, lastActivityAt: null, lifecycle: 'dormant' })
  })

  it('a clock that throws is a commit without a time, not a failed commit', async () => {
    const a = await app({ clock: { sample: () => Promise.reject(new Error('clock down')) } })
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    expect(timesOf(a)).toEqual([[1, null]])
  })
})

describe('the title', () => {
  it('is the first text of the earliest user message with text, collapsed, written once', async () => {
    const a = await app({ clock: clockOf([T(1), T(2), T(3), T(4)]) })
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    expect(rowOf(a).title).toBeNull()
    expect(
      await a.accept(TENANT_A, 'session-1', 'only-image', inputOf('only-image', [image])),
    ).toHaveProperty('ok')
    expect(rowOf(a).title).toBeNull()
    const first = inputOf('first', [
      image,
      text('  plan\t the\n\n trip  '),
      text('second block', 'b-2'),
    ])
    expect(await a.accept(TENANT_A, 'session-1', 'first', first)).toHaveProperty('ok')
    expect(rowOf(a).title).toBe('plan the trip')
    expect(
      await a.accept(TENANT_A, 'session-1', 'later', inputOf('later', [text('later')])),
    ).toHaveProperty('ok')
    expect(rowOf(a).title).toBe('plan the trip')
  })

  it('keeps at most 80 characters, counted in code points', async () => {
    const a = await app({ clock: clockOf([T(1), T(2)]) })
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    const long = `${'字'.repeat(79)}😀tail`
    expect(
      await a.accept(TENANT_A, 'session-1', 'long', inputOf('long', [text(long)])),
    ).toHaveProperty('ok')
    expect(rowOf(a).title).toBe(`${'字'.repeat(79)}😀`)
  })
})

/** Writes list items straight into the table, for the order and page cases. */
function seed(a: App, rows: readonly (readonly [string, string | null, string])[]) {
  for (const [session, at, lifecycle] of rows)
    a.provider.select(
      'dom_0',
      'INSERT INTO sl_session_list (tenant, session, created_at, last_activity_at, lifecycle, title, version) VALUES (?, ?, ?, ?, ?, NULL, 1)',
      [textOf(TENANT_A), session, at, at, lifecycle],
    )
}

async function listAll(
  a: App,
  limit: number,
  includeArchived = false,
): Promise<readonly string[][]> {
  const pages: string[][] = []
  let after: string | null = null
  for (;;) {
    const page = await directoryOf(a).list({
      principal: 'tester',
      tenant: TENANT_A,
      after,
      limit,
      includeArchived,
    })
    if (!('ok' in page)) throw new Error(JSON.stringify(page))
    pages.push(page.ok.items.map(item => item.session))
    if (page.ok.next === null) return pages
    after = page.ok.next
  }
}

describe('directory.list', () => {
  it('orders by latest activity, then by session, sessions without a time last', async () => {
    const a = await app()
    seed(a, [
      ['s-c', T(5), 'dormant'],
      ['s-a', T(5), 'dormant'],
      ['s-b', T(9), 'active'],
      ['s-z', null, 'dormant'],
      ['s-y', null, 'dormant'],
      ['s-d', T(1), 'dormant'],
    ])
    expect((await listAll(a, 2)).flat()).toEqual(['s-b', 's-a', 's-c', 's-d', 's-y', 's-z'])
    expect(await listAll(a, 2)).toEqual([
      ['s-b', 's-a'],
      ['s-c', 's-d'],
      ['s-y', 's-z'],
    ])
    expect(await listAll(a, 100)).toEqual([['s-b', 's-a', 's-c', 's-d', 's-y', 's-z']])
  })

  it('leaves out archived sessions unless asked, and answers each item whole', async () => {
    const a = await app({ clock: clockOf([T(1), T(2)]) })
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    expect(await a.accept(TENANT_A, 'session-1', 'input-1')).toHaveProperty('ok')
    seed(a, [['s-old', T(0), 'archived']])
    expect((await listAll(a, 10)).flat()).toEqual(['session-1'])
    expect((await listAll(a, 10, true)).flat()).toEqual(['session-1', 's-old'])
    const page = await directoryOf(a).list({
      principal: 'tester',
      tenant: TENANT_A,
      after: null,
      limit: 1,
      includeArchived: false,
    })
    expect(page).toEqual({
      ok: {
        items: [
          {
            session: 'session-1',
            createdAt: T(1),
            lastActivityAt: T(2),
            lifecycle: 'dormant',
            title: 'input input-1',
          },
        ],
        next: null,
        completeness: 'complete',
      },
    })
  })

  it('answers partial when a page scanned its bound of rows without filling', async () => {
    const a = await app()
    seed(
      a,
      Array.from({ length: 1001 }, (_, index) => [
        `s-${String(index).padStart(4, '0')}`,
        T(1),
        'archived',
      ]),
    )
    seed(a, [['s-live', T(0), 'dormant']])
    const first = await directoryOf(a).list({
      principal: 'tester',
      tenant: TENANT_A,
      after: null,
      limit: 10,
      includeArchived: false,
    })
    if (!('ok' in first)) throw new Error('first page')
    expect(first.ok).toMatchObject({ items: [], completeness: 'partial' })
    expect(first.ok.next).not.toBeNull()
    const second = await directoryOf(a).list({
      principal: 'tester',
      tenant: TENANT_A,
      after: first.ok.next,
      limit: 10,
      includeArchived: false,
    })
    expect(second).toMatchObject({
      ok: { items: [{ session: 's-live' }], next: null, completeness: 'complete' },
    })
  })

  it('reads only its own tenant, and asks the access check with the tenant as the target', async () => {
    const a = await app({ clock: clockOf([T(1), T(2)]) })
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    expect(await a.create(TENANT_B, 'session-b')).toHaveProperty('ok')
    expect((await listAll(a, 10)).flat()).toEqual(['session-1'])
    const asked = a.accessCheck.controls
      .asked()
      .filter(request => request.operation === 'directory.list')
    expect(asked.at(-1)?.target).toEqual({ kind: 'tenant', tenant: TENANT_A })
    a.denyOperation('directory.list')
    expect(
      await directoryOf(a).list({
        principal: 'tester',
        tenant: TENANT_A,
        after: null,
        limit: 10,
        includeArchived: false,
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'directory.list' } })
  })

  it('refuses a limit outside 1 to 1000 and a cursor of another tenant', async () => {
    const a = await app()
    seed(a, [
      ['s-a', T(1), 'dormant'],
      ['s-b', T(2), 'dormant'],
    ])
    const ask = (input: Partial<Parameters<SessionDirectory<string>['list']>[0]>) =>
      directoryOf(a).list({
        principal: 'tester',
        tenant: TENANT_A,
        after: null,
        limit: 1,
        includeArchived: false,
        ...input,
      })
    expect(await ask({ limit: 0 })).toMatchObject({ failure: { kind: 'invalid', field: 'limit' } })
    expect(await ask({ limit: 1001 })).toMatchObject({
      failure: { kind: 'invalid', field: 'limit' },
    })
    const first = await ask({})
    if (!('ok' in first) || first.ok.next === null) throw new Error('first page')
    expect(await ask({ tenant: TENANT_B, after: first.ok.next })).toMatchObject({
      failure: { kind: 'invalid', field: 'cursor' },
    })
  })

  it('a delegated view denies the list: it names no session', async () => {
    const a = await app()
    const view = a.pair.delegated.bind({
      request: {
        access: { principal: 'tester', tenant: TENANT_A },
        operation: 'readWork',
        target: { kind: 'session', session: sessionId('session-1') },
      },
      evidence: evidence('bound'),
    })
    expect(
      await view.directory?.list({
        principal: 'tester',
        tenant: TENANT_A,
        after: null,
        limit: 1,
        includeArchived: false,
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'directory.list' } })
  })
})

describe('one transaction with the batch', () => {
  it('a commit that fails after the list item was written leaves the item as it was', async () => {
    const a = await app({ clock: clockOf([T(1), T(2), T(3)]) })
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    const before = rowOf(a)
    a.provider.failWrite(/^INSERT INTO sl_operation /, 1, 19)
    const failed = await a.accept(TENANT_A, 'session-1', 'input-1')
    a.provider.failWrite(null)
    expect(failed).not.toHaveProperty('ok')
    expect(rowOf(a)).toEqual(before)
    expect(timesOf(a)).toEqual([[1, T(1)]])
  })
})

describe('the migration backfill', () => {
  it('lists the sessions committed before it, with empty times, their lifecycle and title', async () => {
    const a = await app({ clock: clockOf([T(1), T(2), T(3)]) })
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    expect(await a.accept(TENANT_A, 'session-1', 'input-1')).toHaveProperty('ok')
    expect(await a.create(TENANT_A, 'session-2')).toHaveProperty('ok')
    const port = {
      execute: (sql: string, params: readonly unknown[]) =>
        a.provider.select('dom_0', sql, params as never),
    }
    port.execute('DROP TABLE sl_session_list', [])
    port.execute('DROP TABLE sl_commit_time', [])
    migration.up(port)
    expect(migration.verify(port)).toEqual({ kind: 'verified' })
    const page = await directoryOf(a).list({
      principal: 'tester',
      tenant: TENANT_A,
      after: null,
      limit: 10,
      includeArchived: false,
    })
    expect(page).toEqual({
      ok: {
        items: [
          {
            session: 'session-1',
            createdAt: null,
            lastActivityAt: null,
            lifecycle: 'dormant',
            title: 'input input-1',
          },
          {
            session: 'session-2',
            createdAt: null,
            lastActivityAt: null,
            lifecycle: 'dormant',
            title: null,
          },
        ],
        next: null,
        completeness: 'complete',
      },
    })
    expect(timesOf(a)).toEqual([])
  })
})
