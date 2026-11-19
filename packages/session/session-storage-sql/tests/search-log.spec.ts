import { describe, expect, it } from 'vitest'
import type {
  EntryId,
  HistoryEntry,
  SessionId,
  SessionRevision,
} from '@omne-harness/session-contract'
import { blocksOf, type LoggedEntry } from '@omne-harness/session-search'
import { ordinaryInput } from '@omne-harness/session-contract/testing'
import { writeEntryText } from '../src/entry-codec.ts'
import { createSessionSearchLog } from '../src/search-log.ts'
import { app, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'
import { packedLiteral } from './fixtures/packed.ts'

const DOMAIN = 'dom_0'

function tree(plain: unknown): HistoryEntry['payload'] {
  if (typeof plain === 'string') return { kind: 'string', value: plain }
  if (typeof plain === 'boolean') return { kind: 'boolean', value: plain }
  if (Array.isArray(plain)) return { kind: 'array', items: plain.map(tree) }
  const entries = Object.entries(plain as Record<string, unknown>)
  return { kind: 'object', entries: entries.map(([key, value]) => ({ key, value: tree(value) })) }
}
const SEEDED = 'seeded' as SessionId
const rev = (text: string) => text as SessionRevision

async function started() {
  const a = await app()
  expect(await a.create(TENANT_A)).toHaveProperty('ok')
  expect(await a.accept(TENANT_A, 'session-1', 'one', ordinaryInput('first words'))).toHaveProperty(
    'ok',
  )
  expect(
    await a.accept(TENANT_A, 'session-1', 'two', ordinaryInput('second words')),
  ).toHaveProperty('ok')
  return { a, log: createSessionSearchLog(a.storageOptions) }
}

async function entriesOf(
  log: ReturnType<typeof createSessionSearchLog>,
  session: string,
  after = '0',
  maxBytes = 1_000_000,
) {
  const page = await log.entries({
    tenant: TENANT_A,
    session: session as SessionId,
    after: rev(after),
    maxBytes,
  })
  if ('failure' in page) throw new Error(page.failure)
  return page.ok
}
const textsOf = (entries: readonly LoggedEntry[]): string[] =>
  entries.map(item => blocksOf(item.entry, 'any')[0] ?? JSON.stringify(item.entry.kind))

// Rows written by hand: a session whose commits hold several messages, which no test command makes.
function seed(
  a: App,
  template: HistoryEntry,
  tenant: string,
  session: string,
  rows: readonly (readonly [number, number, string, string])[],
) {
  const tail = Math.max(...rows.map(row => row[1]))
  a.provider.seed(
    DOMAIN,
    'INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, ?, ?, ?)',
    [tenant, session, BigInt(tail), BigInt(tail), 'epoch:0'],
  )
  for (const [position, revision, kind, text] of rows) {
    const entry = {
      ...template,
      id: String(position),
      revision: String(revision),
      kind,
      payload: tree({
        message: {
          id: `msg_${String(position).padStart(22, '0')}`,
          role: kind.replace('message.', ''),
          blocks: [{ kind: 'text', id: 'b0', visibility: { toHuman: true, toModel: true }, text }],
        },
      }),
    } as unknown as HistoryEntry
    a.provider.seed(
      DOMAIN,
      `INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes) VALUES (?, ?, ?, ?, ?, ${packedLiteral(writeEntryText(entry))}, 100)`,
      [tenant, session, BigInt(position), BigInt(revision), kind],
    )
  }
}
const COMMITS = [
  [1, 1, 'session.created', 'not a message'],
  [2, 2, 'message.user', 'two'],
  [3, 2, 'message.assistant', 'three'],
  [4, 3, 'run.started', 'not a message either'],
  [5, 4, 'message.user', 'five'],
  [6, 4, 'message.assistant', 'six'],
  [7, 4, 'message.tool', 'seven'],
  [8, 5, 'message.tool', 'eight'],
] as const

async function seeded() {
  const { a, log } = await started()
  const [template] = (await entriesOf(log, 'session-1')).entries
  seed(a, template!.entry, textOf(TENANT_A), SEEDED, COMMITS)
  a.provider.seed(
    DOMAIN,
    'INSERT INTO sl_commit_time (tenant, session, commit_seq, at) VALUES (?, ?, 2, ?)',
    [textOf(TENANT_A), SEEDED, '2026-01-01T00:00:00.000Z'],
  )
  a.provider.seed(
    DOMAIN,
    'INSERT INTO sl_commit_time (tenant, session, commit_seq, at) VALUES (?, ?, 4, NULL)',
    [textOf(TENANT_A), SEEDED],
  )
  return { a, log, template: template!.entry }
}

describe('the sessions of a tenant, as the history search reads them', () => {
  it('lists every session with the revision its log stands at, and whether it is archived', async () => {
    const { a, log } = await started()
    expect(await a.create(TENANT_A, 'session-2')).toHaveProperty('ok')
    a.provider.seed(
      DOMAIN,
      "INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, 'zz-archived', 7, 7, 'epoch:0')",
      [textOf(TENANT_A)],
    )
    a.provider.seed(
      DOMAIN,
      "INSERT INTO sl_session_list (tenant, session, lifecycle, version) VALUES (?, 'zz-archived', 'archived', 1)",
      [textOf(TENANT_A)],
    )
    const listed = await log.sessions(TENANT_A)
    if ('failure' in listed) throw new Error(listed.failure)
    expect(listed.ok).toEqual([
      { session: 'session-1', tail: '3', archived: false },
      { session: 'session-2', tail: '1', archived: false },
      { session: 'zz-archived', tail: '7', archived: true },
    ])
  })

  it('lists nothing of another tenant, even of rows that lie in the same domain', async () => {
    const { a, log } = await started()
    a.provider.seed(
      DOMAIN,
      "INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, 'ghost', 1, 1, 'epoch:0')",
      [textOf(TENANT_B)],
    )
    const listed = await log.sessions(TENANT_A)
    expect('ok' in listed && listed.ok.map(item => item.session)).toEqual(['session-1'])
  })

  it('answers unavailable for a tenant whose domain cannot be reached, not an empty list', async () => {
    const { a, log } = await started()
    a.directory.entries.length = 0
    expect(await log.sessions(TENANT_A)).toEqual({ failure: 'unavailable' })
  })
})

describe('the commits of a session after a revision', () => {
  it('gives the searchable entries of the commits after a revision, through the tail of the log', async () => {
    const { log } = await started()
    const page = await entriesOf(log, 'session-1')
    expect(page.entries.map(item => item.entry.kind)).toEqual(['message.user', 'message.user'])
    expect(textsOf(page.entries)).toEqual(['input first words', 'input second words'])
    expect(page.entries.map(item => item.entry.revision)).toEqual(['2', '3'])
    expect(page).toMatchObject({ through: '3', exhausted: true })
    expect(await entriesOf(log, 'session-1', '2')).toMatchObject({
      entries: [{ entry: { revision: '3' } }],
      through: '3',
    })
    expect(await entriesOf(log, 'session-1', '3')).toEqual({
      entries: [],
      through: '3',
      exhausted: true,
    })
  })

  it('answers unavailable for a session that has no log', async () => {
    const { log } = await started()
    const answer = await log.entries({
      tenant: TENANT_A,
      session: 'never' as SessionId,
      after: rev('0'),
      maxBytes: 1000,
    })
    expect(answer).toEqual({ failure: 'unavailable' })
  })

  it('reads the time of a commit where one was recorded, and null where none was', async () => {
    const { log } = await seeded()
    const page = await entriesOf(log, SEEDED)
    expect(textsOf(page.entries)).toEqual(['two', 'three', 'five', 'six', 'seven', 'eight'])
    expect(page.entries.map(item => item.at)).toEqual([
      Date.parse('2026-01-01T00:00:00.000Z'),
      Date.parse('2026-01-01T00:00:00.000Z'),
      null,
      null,
      null,
      null,
    ])
    expect(page).toMatchObject({ through: '5', exhausted: true })
  })

  it('cuts a page at a commit: a commit is in a page whole, and the page says how far it reaches', async () => {
    const { log } = await seeded()
    const first = await entriesOf(log, SEEDED, '0', 250)
    expect(textsOf(first.entries)).toEqual(['two', 'three'])
    expect(first).toMatchObject({ through: '3', exhausted: false })
    const second = await entriesOf(log, SEEDED, first.through, 250)
    expect(textsOf(second.entries)).toEqual(['five', 'six', 'seven'])
    expect(second).toMatchObject({ through: '4', exhausted: false })
    const third = await entriesOf(log, SEEDED, second.through, 250)
    expect(textsOf(third.entries)).toEqual(['eight'])
    expect(third).toMatchObject({ through: '5', exhausted: true })
  })

  it('reads every entry once, whatever the page size and wherever it starts', async () => {
    const { log } = await seeded()
    const all = textsOf((await entriesOf(log, SEEDED)).entries)
    for (const maxBytes of [1, 100, 150, 250, 350, 1000]) {
      const seen: string[] = []
      let after = '0'
      for (let pages = 0; pages < 20; pages += 1) {
        const page = await entriesOf(log, SEEDED, after, maxBytes)
        seen.push(...textsOf(page.entries))
        expect(BigInt(page.through)).toBeGreaterThanOrEqual(BigInt(after))
        after = page.through
        if (page.exhausted) break
      }
      expect(seen, `maxBytes ${String(maxBytes)}`).toEqual(all)
      expect(after).toBe('5')
    }
    expect(textsOf((await entriesOf(log, SEEDED, '2')).entries)).toEqual([
      'five',
      'six',
      'seven',
      'eight',
    ])
    expect(textsOf((await entriesOf(log, SEEDED, '3')).entries)).toEqual([
      'five',
      'six',
      'seven',
      'eight',
    ])
    expect(textsOf((await entriesOf(log, SEEDED, '4')).entries)).toEqual(['eight'])
  })

  it('says a commit of more messages than a page reads is unavailable, and does not cut it', async () => {
    const { a, log, template } = await seeded()
    const rows = Array.from(
      { length: 402 },
      (_, at) => [at + 2, 2, 'message.tool', `row ${String(at)}`] as const,
    )
    seed(a, template, textOf(TENANT_A), 'huge', [[1, 1, 'session.created', 'x'], ...rows])
    const answer = await log.entries({
      tenant: TENANT_A,
      session: 'huge' as SessionId,
      after: rev('0'),
      maxBytes: 1_000_000,
    })
    expect(answer).toEqual({ failure: 'unavailable' })
  })
})

describe('single entries by their position', () => {
  it('answers each point in order: the entry, or null for a position that is not there', async () => {
    const { log } = await seeded()
    const points = [
      { session: SEEDED, position: '6' as EntryId },
      { session: SEEDED, position: '99' as EntryId },
      {
        session: 'session-1' as SessionId,
        position: (await entriesOf(log, 'session-1')).entries[0]!.entry.id,
      },
      { session: 'never' as SessionId, position: '1' as EntryId },
      { session: SEEDED, position: '2' as EntryId },
    ]
    const found = await log.at({ tenant: TENANT_A, points })
    if ('failure' in found) throw new Error(found.failure)
    expect(found.ok.map(item => (item === null ? null : textsOf([item])[0]))).toEqual([
      'six',
      null,
      'input first words',
      null,
      'two',
    ])
    expect(found.ok[4]!.at).toBe(Date.parse('2026-01-01T00:00:00.000Z'))
    expect(found.ok[0]!.at).toBeNull()
  })

  it('reads more points than one read takes, and none of another tenant', async () => {
    const { a, log, template } = await seeded()
    seed(a, template, textOf(TENANT_B), 'ghost', [[1, 1, 'message.user', 'of another tenant']])
    const many = Array.from({ length: 300 }, (_, at) => ({
      session: SEEDED,
      position: String((at % 8) + 1) as EntryId,
    }))
    const found = await log.at({
      tenant: TENANT_A,
      points: [...many, { session: 'ghost' as SessionId, position: '1' as EntryId }],
    })
    if ('failure' in found) throw new Error(found.failure)
    expect(found.ok).toHaveLength(301)
    expect(found.ok.at(-1)).toBeNull()
    expect(found.ok[299]!.entry).toMatchObject({ id: '4', kind: 'run.started' })
  })
})
