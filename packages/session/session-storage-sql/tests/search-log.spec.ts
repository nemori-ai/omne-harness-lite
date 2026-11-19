import { describe, expect, it } from 'vitest'
import type { EntryId, SessionId, SessionRevision } from '@omne-harness/session-contract'
import { compileQuery, type Extracted, type JudgeSpec } from '@omne-harness/session-search'
import { testEntry } from '@omne-harness/session-search/testing'
import { ordinaryInput } from '@omne-harness/session-contract/testing'
import { writeEntryText } from '../src/entry-codec.ts'
import { createSessionSearchLog } from '../src/search-log.ts'
import { app, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'
import { packedLiteral } from './fixtures/packed.ts'

const DOMAIN = 'dom_0'

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
  const page = await log.extract({
    tenant: TENANT_A,
    session: session as SessionId,
    after: rev(after),
    maxBytes,
  })
  if ('failure' in page) throw new Error(page.failure)
  return page.ok
}
// The text of the first index row of each entry: what the follower would append of it.
const textsOf = (entries: readonly Extracted[]): string[] =>
  entries.map(item => item.documents[0]?.text ?? '(no text)')

const QUERY_LIMITS = {
  maxGramsPerLiteral: 16,
  maxAlternatives: 32,
  maxLiterals: 8,
  maxLiteralLength: 256,
  maxPatternLength: 512,
  maxProgramSize: 8192,
  maxScopeSessions: 64,
}
function specOf(content: JudgeSpec['content'], kinds: JudgeSpec['kinds'] = []): JudgeSpec {
  const query = { scope: { kind: 'tenant' }, archived: 'all', from: null, to: null } as const
  const compiled = compileQuery({ ...query, kinds, modelReadable: 'any', content }, QUERY_LIMITS)
  if (typeof compiled === 'string') throw new Error(compiled)
  return compiled.spec
}
const WORD = specOf({ kind: 'regex', pattern: '\\w+', caseSensitive: true })

// Rows written by hand: a session whose commits hold several messages, which no test command makes.
function seed(
  a: App,
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
    const message = { kind, blocks: [{ text }] }
    const entry = { ...testEntry(message, String(position), String(revision)), kind }
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
  seed(a, textOf(TENANT_A), SEEDED, COMMITS)
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
  return { a, log }
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

  it('stamps the heads of a tenant: the same while nothing moved, another after a commit, a new session or an archive', async () => {
    const { a, log } = await started()
    const stampOf = async () => {
      const stamp = await log.stamp(TENANT_A)
      if ('failure' in stamp) throw new Error(stamp.failure)
      return stamp.ok
    }
    const first = await stampOf()
    expect(first).toEqual({ sessions: 1, total: '3', archived: 0 })
    expect(await stampOf()).toEqual(first)
    // The stamp is the one the list gives: who holds a list knows whether it still stands.
    const listed = await log.sessions(TENANT_A)
    if ('failure' in listed) throw new Error(listed.failure)
    expect(listed.ok.reduce((sum, item) => sum + Number(item.tail), 0)).toBe(Number(first.total))
    expect(await a.accept(TENANT_A, 'session-1', 'three', ordinaryInput('third'))).toHaveProperty(
      'ok',
    )
    expect(await stampOf()).toEqual({ sessions: 1, total: '4', archived: 0 })
    a.provider.seed(
      DOMAIN,
      "INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, 'zz-archived', 7, 7, 'epoch:0')",
      [textOf(TENANT_A)],
    )
    expect(await stampOf()).toEqual({ sessions: 2, total: '11', archived: 0 })
    a.provider.seed(
      DOMAIN,
      "INSERT INTO sl_session_list (tenant, session, lifecycle, version) VALUES (?, 'zz-archived', 'archived', 1)",
      [textOf(TENANT_A)],
    )
    expect(await stampOf()).toEqual({ sessions: 2, total: '11', archived: 1 })
  })

  it('stamps nothing of another tenant, and answers unavailable when the domain cannot be reached', async () => {
    const { a, log } = await started()
    a.provider.seed(
      DOMAIN,
      "INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, 'ghost', 5, 5, 'epoch:0')",
      [textOf(TENANT_B)],
    )
    expect(await log.stamp(TENANT_A)).toEqual({ ok: { sessions: 1, total: '3', archived: 0 } })
    a.directory.entries.length = 0
    expect(await log.stamp(TENANT_A)).toEqual({ failure: 'unavailable' })
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

describe('the reads of the history search and one tenant domain', () => {
  it('go one at a time, whoever asks: the search and the follower leave the other read thread free', async () => {
    const { a } = await started()
    const { storage } = a.storageOptions
    let inFlight = 0
    let most = 0
    const counted = {
      ...a.storageOptions,
      storage: Object.assign(Object.create(storage) as typeof storage, {
        async read(input: Parameters<typeof storage.read>[0]) {
          inFlight += 1
          most = Math.max(most, inFlight)
          await new Promise(resolve => setTimeout(resolve, 3))
          try {
            return await storage.read(input)
          } finally {
            inFlight -= 1
          }
        },
      }),
    }
    const log = createSessionSearchLog(counted)
    const session = 'session-1' as SessionId
    const point = { session, position: '1' as EntryId }
    const all = await Promise.all([
      log.stamp(TENANT_A),
      log.sessions(TENANT_A),
      log.extract({ tenant: TENANT_A, session, after: rev('0'), maxBytes: 1000 }),
      log.judgeAt({ tenant: TENANT_A, points: [point], spec: WORD }),
      log.stamp(TENANT_A),
      log.judge({ tenant: TENANT_A, session, after: rev('1'), maxBytes: 1000, spec: WORD }),
    ])
    expect(all.every(answer => 'ok' in answer)).toBe(true)
    expect(most).toBe(1)
  })

  it('lets the next read in after one that failed', async () => {
    const { a } = await started()
    const log = createSessionSearchLog(a.storageOptions)
    const saved = [...a.directory.entries]
    a.directory.entries.length = 0
    expect(await log.stamp(TENANT_A)).toEqual({ failure: 'unavailable' })
    a.directory.entries.push(...saved)
    expect(await log.stamp(TENANT_A)).toHaveProperty('ok')
  })
})

describe('the commits of a session after a revision', () => {
  it('gives the searchable entries of the commits after a revision, through the tail of the log', async () => {
    const { log } = await started()
    const page = await entriesOf(log, 'session-1')
    expect(textsOf(page.entries)).toEqual(['input first words', 'input second words'])
    expect(page.entries.map(item => item.revision)).toEqual(['2', '3'])
    expect(page).toMatchObject({ through: '3', exhausted: true })
    expect(await entriesOf(log, 'session-1', '2')).toMatchObject({
      entries: [{ revision: '3' }],
      through: '3',
    })
    expect(await entriesOf(log, 'session-1', '3')).toEqual({
      entries: [],
      through: '3',
      exhausted: true,
      bytes: 0,
    })
  })

  it('answers unavailable for a session that has no log', async () => {
    const { log } = await started()
    const never = {
      tenant: TENANT_A,
      session: 'never' as SessionId,
      after: rev('0'),
      maxBytes: 1000,
    }
    expect(await log.extract(never)).toEqual({ failure: 'unavailable' })
    expect(await log.judge({ ...never, spec: WORD })).toEqual({ failure: 'unavailable' })
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
    // Each page says what it cost to read: the stored size of its entries.
    const whole = await entriesOf(log, SEEDED)
    expect([first, second, third].every(page => page.bytes > 0)).toBe(true)
    expect(first.bytes + second.bytes + third.bytes).toBe(whole.bytes)
    expect(first.bytes).toBeLessThanOrEqual(250)
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

  it('judges each entry of a page where it is read: the match and its text, or null', async () => {
    const { log } = await seeded()
    const range = { tenant: TENANT_A, session: SEEDED, after: rev('0'), maxBytes: 1_000_000 }
    const literal = specOf({ kind: 'literals', all: ['E'], caseSensitive: false })
    const page = await log.judge({ ...range, spec: literal })
    if ('failure' in page) throw new Error(page.failure)
    expect(page.ok.entries.map(item => [item.position, item.match?.snippet ?? null])).toEqual([
      ['2', null],
      ['3', { before: 'thr', match: 'e', after: 'e' }],
      ['5', { before: 'fiv', match: 'e', after: '' }],
      ['6', null],
      ['7', { before: 's', match: 'e', after: 'ven' }],
      ['8', { before: '', match: 'e', after: 'ight' }],
    ])
    expect(page.ok).toMatchObject({ through: '5', exhausted: true })
    expect(page.ok.entries.map(item => item.at)).toEqual(
      (await entriesOf(log, SEEDED)).entries.map(item => item.at),
    )
    // The kinds of the query are the judge's: an entry of another kind matches nothing.
    const tools = await log.judge({ ...range, spec: specOf(literal.content, ['message.tool']) })
    if ('failure' in tools) throw new Error(tools.failure)
    expect(tools.ok.entries.filter(item => item.match !== null).map(item => item.position)).toEqual(
      ['7', '8'],
    )
    expect(tools.ok.entries.find(item => item.position === '7')?.match?.kind).toBe('message.tool')
  })

  it('cuts a judged page as it cuts an extracted one', async () => {
    const { log } = await seeded()
    const range = { tenant: TENANT_A, session: SEEDED, after: rev('0'), maxBytes: 250 }
    const judged = await log.judge({ ...range, spec: WORD })
    const extracted = await log.extract(range)
    if ('failure' in judged || 'failure' in extracted) throw new Error('read')
    const { entries: _judged, ...judgedEnd } = judged.ok
    const { entries: _rows, ...extractedEnd } = extracted.ok
    expect(judgedEnd).toEqual(extractedEnd)
    expect(judged.ok.entries.map(item => item.position)).toEqual(['2', '3'])
  })

  it('answers unavailable for a spec no query compiles to, and judges nothing by it', async () => {
    const { log } = await seeded()
    const range = { tenant: TENANT_A, session: SEEDED, after: rev('0'), maxBytes: 1_000_000 }
    const broken = {
      ...WORD,
      content: { kind: 'regex', pattern: '(', caseSensitive: true },
    } as const
    expect(await log.judge({ ...range, spec: broken })).toEqual({ failure: 'unavailable' })
    const point = { session: SEEDED, position: '2' as EntryId }
    expect(await log.judgeAt({ tenant: TENANT_A, points: [point], spec: broken })).toEqual({
      failure: 'unavailable',
    })
  })

  it('says a commit of more messages than a page reads is unavailable, and does not cut it', async () => {
    const { a, log } = await seeded()
    const rows = Array.from(
      { length: 402 },
      (_, at) => [at + 2, 2, 'message.tool', `row ${String(at)}`] as const,
    )
    seed(a, textOf(TENANT_A), 'huge', [[1, 1, 'session.created', 'x'], ...rows])
    const huge = {
      tenant: TENANT_A,
      session: 'huge' as SessionId,
      after: rev('0'),
      maxBytes: 1_000_000,
    }
    expect(await log.extract(huge)).toEqual({ failure: 'unavailable' })
    expect(await log.judge({ ...huge, spec: WORD })).toEqual({ failure: 'unavailable' })
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
        position: (await entriesOf(log, 'session-1')).entries[0]!.position,
      },
      { session: 'never' as SessionId, position: '1' as EntryId },
      { session: SEEDED, position: '2' as EntryId },
    ]
    const found = await log.judgeAt({ tenant: TENANT_A, points, spec: WORD })
    if ('failure' in found) throw new Error(found.failure)
    expect(found.ok.map(item => (item === null ? null : item.match?.snippet.match))).toEqual([
      'six',
      null,
      'input',
      null,
      'two',
    ])
    expect(found.ok[0]).toMatchObject({ position: '6', revision: '4' })
    expect(found.ok[4]!.at).toBe(Date.parse('2026-01-01T00:00:00.000Z'))
    expect(found.ok[0]!.at).toBeNull()
  })

  it('reads more points than one read takes, and none of another tenant', async () => {
    const { a, log } = await seeded()
    seed(a, textOf(TENANT_B), 'ghost', [[1, 1, 'message.user', 'of another tenant']])
    const many = Array.from({ length: 300 }, (_, at) => ({
      session: SEEDED,
      position: String((at % 8) + 1) as EntryId,
    }))
    const found = await log.judgeAt({
      tenant: TENANT_A,
      points: [...many, { session: 'ghost' as SessionId, position: '1' as EntryId }],
      spec: WORD,
    })
    if ('failure' in found) throw new Error(found.failure)
    expect(found.ok).toHaveLength(301)
    expect(found.ok.at(-1)).toBeNull()
    // An entry that is no message is there, and matches nothing.
    expect(found.ok[299]).toMatchObject({ position: '4', revision: '3', match: null })
  })
})
