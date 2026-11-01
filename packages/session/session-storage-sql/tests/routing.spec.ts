// Read routing (SQL r2 section 17): a session read is one `snapshot` read of the storage and
// never takes the write path; the receipt lookups are the only reads that go through a commit.
import { describe, expect, it } from 'vitest'
import { app, TENANT_A } from './fixtures/app.ts'
import { SESSION_ENTRIES, SYSTEM_ENTRIES } from './fixtures/entries.ts'

const READS = [...SESSION_ENTRIES, ...SYSTEM_ENTRIES].filter(
  entry =>
    !['commit', 'queryOperation', 'queryControlOperation', 'history.next'].includes(entry.name),
)

describe('read routing', () => {
  for (const entry of READS)
    it(`${entry.name}: reaches the storage only by read calls`, async () => {
      const a = await app()
      await a.create(TENANT_A)
      const mark = a.provider.calls.length
      await entry.call(a, TENANT_A, 'session-1')
      const kinds = new Set(a.provider.calls.slice(mark).map(call => call.kind))
      expect([...kinds]).toEqual(['read'])
    })

  for (const name of ['queryOperation', 'queryControlOperation'])
    it(`${name}: looks the original receipt up through the commit path and never through a read handler`, async () => {
      const a = await app()
      await a.create(TENANT_A)
      const entry = SESSION_ENTRIES.find(item => item.name === name)
      const mark = a.provider.calls.length
      await entry?.call(a, TENANT_A, 'session-1')
      const kinds = a.provider.calls.slice(mark).map(call => call.kind)
      expect(kinds[0]).toBe('commit')
      expect(kinds).not.toContain('read')
    })
})
