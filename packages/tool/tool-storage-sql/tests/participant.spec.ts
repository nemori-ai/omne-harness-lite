import { describe, expect, it } from 'vitest'
import participant from '../src/worker/participant.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

describe('facts of another protocol', () => {
  it('are unsupported and write nothing', () => {
    const { port, rows } = migratedPort()
    expect(participant.execute({ intent: 'ledger', tenant: 'tenant-a' }, port)).toEqual({
      kind: 'unsupported',
      basis: { reason: 'facts' },
    })
    expect(rows('SELECT COUNT(*) AS n FROM tl_domain')).toEqual([{ n: 0n }])
  })
})
