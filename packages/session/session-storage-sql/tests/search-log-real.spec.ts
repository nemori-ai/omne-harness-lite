// @module-tag slow
import { afterEach, expect, it } from 'vitest'
import type { SessionId, SessionRevision } from '@omne-harness/session-contract'
import { compileQuery } from '@omne-harness/session-search'
import { createSessionSearchLog } from '../src/search-log.ts'
import { openRealApp, TENANT_A, TENANT_B, type RealApp } from './fixtures/real-provider.ts'

const apps: RealApp[] = []
afterEach(async () => {
  for (const app of apps.splice(0)) await app.dispose()
})

it('reads sessions, commits and single entries through the read handlers of the real provider', async () => {
  const app = await openRealApp()
  apps.push(app)
  expect(await app.create(TENANT_A)).toHaveProperty('ok')
  expect(await app.accept(TENANT_A, 'session-1', 'one', 'the first words')).toHaveProperty('ok')
  expect(await app.accept(TENANT_A, 'session-1', 'two', 'the second words')).toHaveProperty('ok')
  const log = createSessionSearchLog({ storage: app.storage, domains: app.domains })

  expect(await log.sessions(TENANT_A)).toEqual({
    ok: [{ session: 'session-1', tail: '3', archived: false }],
  })
  expect(await log.sessions(TENANT_B)).toEqual({ ok: [] })

  const range = {
    tenant: TENANT_A,
    session: 'session-1' as SessionId,
    after: '0' as SessionRevision,
    maxBytes: 1_000_000,
  }
  const page = await log.extract(range)
  if ('failure' in page) throw new Error(page.failure)
  expect(page.ok.entries.map(item => item.documents.map(row => row.text))).toEqual([
    ['input the first words'],
    ['input the second words'],
  ])
  expect(page.ok).toMatchObject({ through: '3', exhausted: true })

  // Judged in the read thread of the real provider: the handler loads the matcher there.
  const compiled = compileQuery(
    {
      scope: { kind: 'tenant' },
      archived: 'all',
      from: null,
      to: null,
      kinds: [],
      modelReadable: 'any',
      content: { kind: 'regex', pattern: 'sec\\w+', caseSensitive: true },
    },
    {
      maxGramsPerLiteral: 16,
      maxAlternatives: 32,
      maxLiterals: 8,
      maxLiteralLength: 256,
      maxPatternLength: 512,
      maxProgramSize: 8192,
      maxScopeSessions: 64,
    },
  )
  if (typeof compiled === 'string') throw new Error(compiled)
  const { spec } = compiled
  const judged = await log.judge({ ...range, spec })
  if ('failure' in judged) throw new Error(judged.failure)
  expect(judged.ok.entries.map(item => item.match?.snippet.match ?? null)).toEqual([null, 'second'])

  const [, second] = judged.ok.entries
  const point = { session: 'session-1' as SessionId, position: second!.position }
  expect(await log.judgeAt({ tenant: TENANT_A, points: [point], spec })).toEqual({ ok: [second] })
  expect(await log.judgeAt({ tenant: TENANT_B, points: [point], spec })).toEqual({ ok: [null] })
}, 60_000)
