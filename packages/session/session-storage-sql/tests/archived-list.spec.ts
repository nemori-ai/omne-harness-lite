import { describe, expect, it } from 'vitest'
import type {
  IdleObservation,
  SessionCommand,
  SessionDirectory,
} from '@omne-harness/session-contract'
import { adoption, evidence, operationId, sessionId } from '@omne-harness/session-contract/testing'
import { sessionStorageMaterials } from '../src/index.ts'
import migration from '../src/worker/session-archive-migration.ts'
import { app, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'
import { clockOf, T } from './fixtures/clock.ts'
import { FIXTURE_READ_OUTPUT_LIMIT_BYTES } from './fixtures/read-limit.ts'

type Archived = Parameters<SessionDirectory<string>['listArchived']>[0]

const SESSION = sessionId('session-1')
const base = { tenant: TENANT_A, session: SESSION }

const directoryOf = (a: App): SessionDirectory<string> => {
  const directory = a.port.directory
  if (directory === undefined) throw new Error('the port offers no directory')
  return directory
}

const commit = (a: App, command: SessionCommand) =>
  a.port.commit({ access: a.access(TENANT_A), command, guards: [] })

const control = (a: App, kind: 'archive' | 'unarchive', name: string) =>
  commit(a, {
    kind: 'control',
    input: { ...base, operation: operationId(name), intent: { kind } },
  } as SessionCommand)

const archived = (a: App, input: Partial<Archived> = {}) =>
  directoryOf(a).listArchived({
    principal: 'tester',
    tenant: TENANT_A,
    after: null,
    limit: 10,
    from: null,
    to: null,
    by: null,
    titleContains: null,
    ...input,
  })

const sessionsOf = async (a: App, input: Partial<Archived> = {}) => {
  const page = await archived(a, input)
  if (!('ok' in page)) throw new Error(JSON.stringify(page))
  return page.ok.items.map(item => item.session)
}

const listed = async (a: App) => {
  const page = await directoryOf(a).list({
    principal: 'tester',
    tenant: TENANT_A,
    after: null,
    limit: 10,
  })
  if (!('ok' in page)) throw new Error(JSON.stringify(page))
  return page.ok.items.map(item => item.session)
}

// Each row: session, title, when it was archived (null: before the archive table), by whom.
function seed(a: App, rows: readonly (readonly [string, string, string | null, string | null])[]) {
  for (const [session, title, at, by] of rows) {
    a.provider.select(
      'dom_0',
      "INSERT INTO sl_session_list (tenant, session, created_at, last_activity_at, lifecycle, title, version) VALUES (?, ?, NULL, NULL, 'archived', ?, 1)",
      [textOf(TENANT_A), session, title],
    )
    if (at !== null)
      a.provider.select(
        'dom_0',
        'INSERT INTO sl_session_archive (tenant, session, archived_at, archived_by) VALUES (?, ?, ?, ?)',
        [textOf(TENANT_A), session, at, by],
      )
  }
}

// Archives session-1 by the idle rule: a policy, an idle observation, then the due consideration.
async function autoArchive(a: App) {
  const policy = { kind: 'enabled', idleMs: '10' } as const
  expect(
    await commit(a, {
      kind: 'configureAutoArchive',
      input: { ...base, operation: operationId('policy'), policy },
    }),
  ).toHaveProperty('ok')
  const observation: IdleObservation = {
    kind: 'interval',
    started: '0',
    through: { at: '10', protocol: adoption('clock'), source: evidence('clock') },
    elapsedMs: '10',
    coverage: {
      own: evidence('own'),
      relations: evidence('relations'),
      children: [],
      calls: [],
      completeScope: evidence('scope'),
    },
    source: evidence('idle'),
  }
  const before = await a.port.readWork(a.access(TENANT_A))
  if (!('ok' in before)) throw new Error('no work')
  expect(
    await commit(a, {
      kind: 'recordIdle',
      input: {
        ...base,
        operation: operationId('idle'),
        expected: before.ok.revision,
        observation,
      },
    }),
  ).toHaveProperty('ok')
  const idle = await a.port.readWork(a.access(TENANT_A))
  if (!('ok' in idle) || idle.ok.idle === null) throw new Error('no idle')
  expect(
    await commit(a, {
      kind: 'considerAutoArchive',
      input: { ...base, operation: operationId('due'), idleEvidence: idle.ok.idle.commit },
    }),
  ).toHaveProperty('ok')
}

describe('the materials', () => {
  it('register the archive migration after the list, and the archived list handler on it', () => {
    const materials = sessionStorageMaterials({
      readOutputLimitBytes: FIXTURE_READ_OUTPUT_LIMIT_BYTES,
    })
    const found = materials.migrations.find(item => item.id === '010-session-archive')
    expect(found?.requires).toEqual([{ owner: 'session', id: '008-session-list' }])
    const session = materials.participants.find(item => item.participant === 'session')
    expect(session?.ownedTables).toContain('sl_session_archive')
    const read = materials.readHandlers.find(item => item.handler === 'session.list-archived')
    expect(read?.readTables).toEqual(['sl_session_list', 'sl_session_archive'])
    expect(read?.requiresMigrations).toEqual([{ owner: 'session', id: '010-session-archive' }])
  })
})

describe('the migration backfill', () => {
  const drop = (a: App) => {
    const port = {
      execute: (sql: string, params: readonly unknown[]) =>
        a.provider.select('dom_0', sql, params as never),
    }
    port.execute('DROP TABLE sl_session_archive', [])
    return port
  }

  it('finds the commit that archived each session: its time and who asked', async () => {
    const a = await app({ clock: clockOf([T(1), T(2), T(3), T(4), T(5), T(6)]) })
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    expect(await control(a, 'archive', 'archive-1')).toHaveProperty('ok')
    expect(await a.create(TENANT_A, 'session-2')).toHaveProperty('ok')
    const port = drop(a)
    migration.up(port as never)
    expect(migration.verify(port as never)).toEqual({ kind: 'verified' })
    expect(await archived(a)).toMatchObject({
      ok: { items: [{ session: 'session-1', archivedAt: T(2), archivedBy: 'person' }] },
    })
    expect(await listed(a)).toEqual(['session-2'])
  })

  it('an auto-archive is by auto; a commit without a recorded time leaves the time empty', async () => {
    const a = await app({ clock: clockOf([T(1), T(2), T(3), null]) })
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    await autoArchive(a)
    const port = drop(a)
    migration.up(port as never)
    expect(await archived(a)).toMatchObject({
      ok: { items: [{ session: 'session-1', archivedAt: null, archivedBy: 'auto' }] },
    })
  })

  it('a missing table fails the verification', () => {
    const empty = { execute: () => ({ columns: ['name'], rows: [] }) }
    expect(migration.verify(empty as never)).toMatchObject({ kind: 'failed' })
  })
})

describe('who archived and when', () => {
  it('a person archives: the session moves to the archived list with the time of that commit', async () => {
    const a = await app({ clock: clockOf([T(1), T(2), T(3)]) })
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    expect(await control(a, 'archive', 'archive-1')).toHaveProperty('ok')
    expect(await listed(a)).toEqual([])
    expect(await archived(a)).toEqual({
      ok: {
        items: [
          {
            session: 'session-1',
            createdAt: T(1),
            lastActivityAt: T(1),
            lifecycle: 'archived',
            title: null,
            archivedAt: T(2),
            archivedBy: 'person',
          },
        ],
        next: null,
        completeness: 'complete',
      },
    })
  })

  it('unarchiving takes it back to the list, and archiving again takes the new time', async () => {
    const a = await app({ clock: clockOf([T(1), T(2), T(3), T(4)]) })
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    expect(await control(a, 'archive', 'archive-1')).toHaveProperty('ok')
    expect(await control(a, 'unarchive', 'unarchive-1')).toHaveProperty('ok')
    expect(await sessionsOf(a)).toEqual([])
    expect(await listed(a)).toEqual(['session-1'])
    expect(await control(a, 'archive', 'archive-2')).toHaveProperty('ok')
    expect(await archived(a)).toMatchObject({ ok: { items: [{ archivedAt: T(4) }] } })
  })

  it('the idle rule archives: by auto', async () => {
    const a = await app({ clock: clockOf([T(1), T(2), T(3), T(4)]) })
    expect(await a.create(TENANT_A)).toHaveProperty('ok')
    await autoArchive(a)
    expect(await archived(a)).toMatchObject({
      ok: { items: [{ session: 'session-1', archivedAt: T(4), archivedBy: 'auto' }] },
    })
  })
})

describe('the archived list', () => {
  const rows = [
    ['s-1', 'fix the build', T(1), 'person'],
    ['s-2', 'release notes', T(5), 'auto'],
    ['s-3', 'build cache', T(5), 'person'],
    ['s-4', 'old work', null, null],
    ['s-5', 'deploy', T(9), 'auto'],
  ] as const

  it('pages newest first, ties by session; a session archived before the table has no time and comes last', async () => {
    const a = await app()
    seed(a, rows)
    const pages: string[][] = []
    let after: string | null = null
    for (;;) {
      const page = await archived(a, { after, limit: 2 })
      if (!('ok' in page)) throw new Error(JSON.stringify(page))
      pages.push(page.ok.items.map(item => item.session))
      if (page.ok.next === null) break
      after = page.ok.next
    }
    expect(pages).toEqual([['s-5', 's-2'], ['s-3', 's-1'], ['s-4']])
    expect(await archived(a, { limit: 10 })).toMatchObject({
      ok: {
        items: expect.arrayContaining([
          expect.objectContaining({ session: 's-4', archivedAt: null, archivedBy: null }),
        ]),
      },
    })
  })

  it('filters by time from (inclusive) to (exclusive), by who archived, and by a part of the title', async () => {
    const a = await app()
    seed(a, rows)
    expect(await sessionsOf(a, { from: T(5) })).toEqual(['s-5', 's-2', 's-3'])
    expect(await sessionsOf(a, { from: T(1), to: T(5) })).toEqual(['s-1'])
    expect(await sessionsOf(a, { by: 'auto' })).toEqual(['s-5', 's-2'])
    expect(await sessionsOf(a, { by: 'parent' })).toEqual([])
    expect(await sessionsOf(a, { titleContains: 'build' })).toEqual(['s-3', 's-1'])
    expect(await sessionsOf(a, { titleContains: 'build', by: 'person', to: T(5) })).toEqual(['s-1'])
  })

  it('refuses an unknown by, a title part over 200 characters, and a range that is not ordered', async () => {
    const a = await app()
    seed(a, rows)
    expect(await archived(a, { by: 'robot' as never })).toMatchObject({
      failure: { kind: 'invalid', field: 'by' },
    })
    expect(await archived(a, { titleContains: '字'.repeat(201) })).toMatchObject({
      failure: { kind: 'invalid', field: 'titleContains' },
    })
    expect(await sessionsOf(a, { titleContains: '字'.repeat(200) })).toEqual([])
    expect(await sessionsOf(a, { limit: 1000 })).toHaveLength(5)
    expect(await archived(a, { limit: 1001 })).toMatchObject({
      failure: { kind: 'invalid', field: 'limit' },
    })
    expect(await archived(a, { from: T(5), to: T(5) })).toMatchObject({
      failure: { kind: 'invalid', field: 'to' },
    })
  })

  it('a cursor of one list is invalid for the other', async () => {
    const a = await app()
    seed(a, rows)
    a.provider.select(
      'dom_0',
      "INSERT INTO sl_session_list (tenant, session, created_at, last_activity_at, lifecycle, title, version) VALUES (?, 'live-1', NULL, NULL, 'dormant', NULL, 1), (?, 'live-2', NULL, NULL, 'dormant', NULL, 1)",
      [textOf(TENANT_A), textOf(TENANT_A)],
    )
    const first = await archived(a, { limit: 1 })
    if (!('ok' in first) || first.ok.next === null) throw new Error('first page')
    expect(
      await directoryOf(a).list({
        principal: 'tester',
        tenant: TENANT_A,
        after: first.ok.next,
        limit: 1,
      }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'cursor' } })
    const live = await directoryOf(a).list({
      principal: 'tester',
      tenant: TENANT_A,
      after: null,
      limit: 1,
    })
    if (!('ok' in live) || live.ok.next === null) throw new Error('live page')
    expect(await archived(a, { after: live.ok.next })).toMatchObject({
      failure: { kind: 'invalid', field: 'cursor' },
    })
  })

  it('asks the same access as the list, before it looks at the filters, and reads only its tenant', async () => {
    const a = await app()
    seed(a, rows)
    a.denyOperation('directory.list')
    expect(await archived(a, { by: 'robot' as never })).toEqual({
      failure: { kind: 'denied', action: 'directory.list' },
    })
    const b = await app()
    seed(b, rows)
    expect(
      await directoryOf(b).listArchived({
        principal: 'tester',
        tenant: TENANT_B,
        after: null,
        limit: 10,
        from: null,
        to: null,
        by: null,
        titleContains: null,
      }),
    ).toMatchObject({ ok: { items: [] } })
  })
})
