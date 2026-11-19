// @module-tag slow
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { EntryId, SessionId, SessionRevision } from '@omne-harness/session-contract'
import { testingTenant } from '@omne-harness/session-contract/testing'
import type { GramPlan, IndexDocument } from '@omne-harness/session-search'
import { createSqliteHistoryIndex, type SqliteHistoryIndex } from '../src/index.ts'
import { createStore } from '../src/store.ts'

const TENANT = testingTenant('org_h1st0ry1ndex00000000000000', 'acc_h1st0ry1ndex00000000000000')
const OTHER = testingTenant('org_h1st0ry1ndex0ther000000000', 'acc_h1st0ry1ndex0ther000000000')
const S1 = 'session-one' as SessionId
const gram = (text: string): GramPlan => ({ kind: 'gram', gram: text })
const document = (text: string): IndexDocument => ({ visibility: 'model', text, markers: [] })
const at = (position: number, text: string) => ({
  position: String(position) as EntryId,
  revision: String(position) as SessionRevision,
  at: 1000 + position,
  document: document(text),
})

const roots: string[] = []
const indexes: SqliteHistoryIndex[] = []
afterEach(async () => {
  for (const index of indexes.splice(0)) await index.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fresh(): Readonly<{ index: SqliteHistoryIndex; root: string }> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'history-index-client-')))
  roots.push(root)
  const index = createSqliteHistoryIndex({ root })
  indexes.push(index)
  return { index, root }
}
const request = (generation: number, plan: GramPlan) => ({
  tenant: TENANT,
  generation,
  plan,
  sessions: null,
  window: { from: null, to: null },
  before: null,
  limit: 10,
})

describe('the history index through its two threads', () => {
  it('builds, adopts, appends and answers candidates with the cover of each session', async () => {
    const { index } = fresh()
    expect(await index.state(TENANT)).toEqual({ kind: 'absent' })
    expect(await index.beginRebuild(TENANT, 2)).toEqual({ ok: { generation: 1 } })
    expect(await index.state(TENANT)).toEqual({
      kind: 'rebuilding',
      generation: null,
      building: 1,
      progress: { indexed: 0, total: 2 },
    })
    const batch = { tenant: TENANT, generation: 1, session: S1, through: '3' as SessionRevision }
    expect(
      await index.append({ ...batch, documents: [at(1, 'needle one'), at(3, 'needle three')] }),
    ).toEqual({ ok: null })
    expect(await index.adopt(TENANT, 1)).toEqual({ ok: null })
    expect(await index.state(TENANT)).toEqual({ kind: 'ready', generation: 1 })
    const found = await index.candidates(request(1, gram('nee')))
    if ('failure' in found) throw new Error(found.failure)
    expect(found.ok.rows.map(row => [row.session, row.position])).toEqual([
      [S1, '3'],
      [S1, '1'],
    ])
    expect([...found.ok.covered]).toEqual([[S1, '3']])
    await index.compact(TENANT, 8)
    expect((await index.candidates(request(1, gram('nee')))) satisfies object).toMatchObject({
      ok: {},
    })
  })

  it('keeps the index of one tenant apart from that of another', async () => {
    const { index } = fresh()
    await index.beginRebuild(TENANT, 0)
    await index.adopt(TENANT, 1)
    await index.append({
      tenant: TENANT,
      generation: 1,
      session: S1,
      through: '1' as SessionRevision,
      documents: [at(1, 'needle')],
    })
    expect(await index.state(OTHER)).toEqual({ kind: 'absent' })
    expect(await index.candidates({ ...request(1, gram('nee')), tenant: OTHER })).toEqual({
      failure: 'generation-gone',
    })
  })

  it('answers the failures of the store as failures, never as an empty result', async () => {
    const { index } = fresh()
    expect(await index.candidates(request(1, gram('nee')))).toEqual({ failure: 'generation-gone' })
    expect(
      await index.append({
        tenant: TENANT,
        generation: 4,
        session: S1,
        through: '1' as SessionRevision,
        documents: [],
      }),
    ).toEqual({ failure: 'generation-gone' })
    expect(await index.adopt(TENANT, 4)).toEqual({ failure: 'generation-gone' })
  })

  it('starts its threads again after it was closed: nothing lives in a thread that the files do not hold', async () => {
    const { index } = fresh()
    await index.beginRebuild(TENANT, 0)
    await index.adopt(TENANT, 1)
    await index.append({
      tenant: TENANT,
      generation: 1,
      session: S1,
      through: '1' as SessionRevision,
      documents: [at(1, 'needle')],
    })
    await index.close()
    expect(await index.state(TENANT)).toEqual({ kind: 'ready', generation: 1 })
    const found = await index.candidates(request(1, gram('nee')))
    expect('ok' in found && found.ok.rows).toHaveLength(1)
  })
})

describe('a process killed between the rows of a batch and its cover (SH-2)', () => {
  it('leaves neither: the index reopens with the cover and the rows it had before', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'history-index-kill-')))
    roots.push(root)
    const store = fileURLToPath(new URL('../src/store.ts', import.meta.url))
    const script = `
      import { createStore } from ${JSON.stringify(store)}
      const store = createStore({ root: ${JSON.stringify(root)}, extraction: 1, readOnly: false, vocabularyLimit: 8 })
      const doc = (position) => ({ position: String(position), revision: String(position), at: 1000 + position, document: { visibility: 'model', text: 'needle', markers: [] } })
      const { generation } = store.beginRebuild('t', 0)
      store.adopt('t', generation)
      store.append({ tenant: 't', generation, session: 's', through: '1', documents: [doc(1)] })
      store.append(
        { tenant: 't', generation, session: 's', through: '3', documents: [doc(2), doc(3)] },
        { afterRows: () => process.kill(process.pid, 'SIGKILL') },
      )
    `
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
    })
    expect(child.signal, child.stderr).toBe('SIGKILL')
    const reopened = createStore({ root, extraction: 1, readOnly: false, vocabularyLimit: 8 })
    try {
      const ask = {
        tenant: 't',
        generation: 1,
        plan: gram('nee'),
        sessions: null,
        window: { from: null, to: null },
        before: null,
        limit: 10,
      }
      expect(reopened.state('t')).toEqual({ kind: 'ready', generation: 1 })
      expect(reopened.candidates(ask)).toMatchObject({
        covered: [{ session: 's', position: '1' }],
        rows: [{ session: 's', position: '1' }],
      })
      const again = {
        tenant: 't',
        generation: 1,
        session: 's',
        through: '3',
        documents: [2, 3].map(position => ({
          position: String(position),
          revision: String(position),
          at: 1000 + position,
          document: document('needle'),
        })),
      }
      expect(reopened.append(again)).toBeNull()
      const after = reopened.candidates(ask)
      expect(typeof after === 'string' ? after : after.rows.map(row => row.position)).toEqual([
        '3',
        '2',
        '1',
      ])
    } finally {
      reopened.close()
    }
  }, 60_000)
})
