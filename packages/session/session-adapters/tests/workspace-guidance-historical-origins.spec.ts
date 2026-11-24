// @module-tag slow
import { expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { judgeMessage } from '@omne-harness/message'
import type { ModelViewRow } from '@omne-harness/session-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import { readGuidanceHistory } from '../src/cordis/guidance-history.ts'
import { sqlScene } from './fixtures/sql-scene.ts'

it('qualifies a summary without provenance against a real SQLite session with no directory guidance', async () => {
  const s = await sqlScene('legacy-no-directory-guidance', { storage: 'real' })
  try {
    const value = judgeMessage({
      id: 'msg_abcdefghijklmnopqrstuv',
      role: 'compaction',
      covers: { from: '1', to: '3' },
      retained: [],
      derivation: evidence('old summary'),
      blocks: [
        {
          kind: 'text',
          id: 'summary',
          text: 'public task',
          visibility: { toModel: true, toHuman: true },
        },
      ],
    })
    if (!('ok' in value)) throw new Error('invalid fixture')
    const begin = vi.fn(s.port.history.begin.bind(s.port.history))
    const row = {
      entry: '9' as ModelViewRow['entry'],
      seq: '1',
      bytes: 1,
      prefixDigest: 'legacy',
      message: value.ok,
    }
    const result = await readGuidanceHistory(
      {
        begin,
        next: s.port.history.next.bind(s.port.history),
        readModelView: async () => ({
          ok: { kind: 'page', basis: { epoch: 'legacy', upper: '1' }, rows: [row], next: null },
        }),
      },
      s.access,
      'scope',
    )
    expect(begin).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ ok: { summarizedScopes: [] } })
  } finally {
    await s.close()
  }
})

it('reads pre-015 inline summary epoch rows through real SQL and closes when the original origin is absent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'legacy-summary-sql-'))
  const s = await sqlScene('legacy-summary-epoch', { storage: 'real', storageRoot: root })
  const file = join(root, 'storage', 'domains', `${Buffer.from('dom_0').toString('hex')}.sqlite`)
  const db = new DatabaseSync(file)
  try {
    const columns = db
      .prepare('PRAGMA table_info(sl_model_view)')
      .all()
      .map(row => row['name'])
    expect(columns).toEqual([
      'tenant',
      'session',
      'epoch',
      'seq',
      'entry',
      'bytes',
      'prefix_digest',
      'message',
    ])
    const summary = judgeMessage({
      id: 'msg_abcdefghijklmnopqrstuv',
      role: 'compaction',
      covers: { from: '1', to: '3' },
      retained: [],
      derivation: evidence('legacy SQL summary'),
      blocks: [
        {
          kind: 'text',
          id: 'summary',
          text: 'LEGACY_PUBLIC_TASK',
          visibility: { toModel: true, toHuman: true },
        },
      ],
    })
    if (!('ok' in summary)) throw new Error('invalid legacy summary')
    const tenant = s.tenantText(s.access.tenant)
    const session = s.access.session
    const oldEpoch = 'epoch:999'
    const message = JSON.stringify(summary.ok)
    db.prepare(
      'INSERT INTO sl_model_view (tenant, session, epoch, seq, entry, bytes, prefix_digest, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      tenant,
      session,
      oldEpoch,
      1,
      '999',
      Buffer.byteLength(message),
      'legacy-inline-prefix',
      message,
    )
    db.prepare('UPDATE sl_journal SET epoch = ? WHERE tenant = ? AND session = ?').run(
      oldEpoch,
      tenant,
      session,
    )
    // Migration 015 creates an empty side index; pre-existing epochs have no backfilled rows.
    db.prepare('DELETE FROM sl_model_provenance WHERE tenant = ? AND session = ?').run(
      tenant,
      session,
    )
    const page = await s.port.history.readModelView({
      ...s.access,
      basis: null,
      after: null,
      pageBytes: 1048576,
    })
    expect(page).toMatchObject({
      ok: { kind: 'page', rows: [{ message: { role: 'compaction' } }] },
    })
    if ('failure' in page || page.ok.kind !== 'page') throw new Error('legacy SQL view unavailable')
    expect(page.ok.rows[0]).not.toHaveProperty('provenance')
    expect(page.ok.basis.epoch).toContain(oldEpoch)
    const qualified = await readGuidanceHistory(s.port.history, s.access, 'scope')
    expect(qualified).toMatchObject({ ok: { summarizedScopes: [], summaryBoundaries: ['3'] } })
    db.prepare(
      "DELETE FROM sl_entry WHERE tenant = ? AND session = ? AND kind = 'session.created'",
    ).run(tenant, session)
    const closed = await readGuidanceHistory(s.port.history, s.access, 'scope')
    expect(closed).toMatchObject({
      failure: {
        kind: 'unavailable',
        diagnostic: 'the session origin for the original guidance is unavailable',
      },
    })
  } finally {
    db.close()
    await s.close()
    rmSync(root, { recursive: true, force: true })
  }
})
