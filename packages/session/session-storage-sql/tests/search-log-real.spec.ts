// @module-tag slow
import { afterEach, expect, it } from 'vitest'
import type { SessionId, SessionRevision } from '@omne-harness/session-contract'
import { blocksOf } from '@omne-harness/session-search'
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

  const page = await log.entries({
    tenant: TENANT_A,
    session: 'session-1' as SessionId,
    after: '0' as SessionRevision,
    maxBytes: 1_000_000,
  })
  if ('failure' in page) throw new Error(page.failure)
  expect(page.ok.entries.map(item => blocksOf(item.entry, 'any'))).toEqual([
    ['input the first words'],
    ['input the second words'],
  ])
  expect(page.ok).toMatchObject({ through: '3', exhausted: true })

  const [first] = page.ok.entries
  const found = await log.at({
    tenant: TENANT_A,
    points: [{ session: 'session-1' as SessionId, position: first!.entry.id }],
  })
  expect(found).toEqual({ ok: [first] })
  const other = await log.at({
    tenant: TENANT_B,
    points: [{ session: 'session-1' as SessionId, position: first!.entry.id }],
  })
  expect(other).toEqual({ ok: [null] })
}, 60_000)
