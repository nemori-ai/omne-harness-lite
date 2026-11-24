// @module-tag slow
import { expect, it, vi } from 'vitest'
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
