import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { createDemoDiagnosticConfig } from '../src/demo.ts'
import { createDiagnosticJournal } from '../src/diagnostic-journal.ts'
import { demoRetirement } from './model-request-support.ts'

describe('D6 diagnostic scope and IO disclosure', () => {
  it('rejects missing or wrong scope before opening a read handle and hides an actual read fault', async () => {
    const parent = resolve('tmp/d6-completion')
    await fs.mkdir(parent, { recursive: true, mode: 0o700 })
    const directory = await fs.mkdtemp(join(parent, 'scope-io-'))
    const tenant = unwrap(parseTenantId({ organization: 'd6-org', account: 'd6-owner' }))
    const other = unwrap(parseTenantId({ organization: 'd6-org', account: 'd6-other' }))
    const base = createDemoDiagnosticConfig(directory, tenant, demoRetirement())
    const scope = { kind: 'tenant' as const, tenant }
    let readOpens = 0
    let failRead = false
    const journal = await createDiagnosticJournal({
      ...base.collector,
      rootDir: join(directory, 'private'),
      collectorId: 'd6-scope-io',
      scope,
      fs: {
        ...fs,
        open: async (path, flags, mode) => {
          if (flags === (constants.O_RDONLY | constants.O_NOFOLLOW)) {
            readOpens++
            if (failRead) throw new Error(`private-path-and-secret:${String(path)}`)
          }
          return fs.open(path, flags, mode)
        },
      },
    })
    try {
      expect(
        await journal.append({
          format: 'model-diagnostics/1',
          collectorId: 'd6-scope-io',
          sequence: '1',
          scope,
          source: 'assembly',
          stage: 'assembly',
          outcome: 'started',
          facts: { kind: 'diagnostics', reason: 'close_incomplete' },
          observedAt: new Date().toISOString(),
        }),
      ).toBe('written')
      const query = { scope, limit: 1, maxBytes: 1_048_576 }
      const limits = { maxRecords: 1, maxBytes: 1_048_576 }
      const missingScope: unknown = { limit: 1, maxBytes: 1_048_576 }
      expect(await Reflect.apply(journal.query, journal, [missingScope])).toEqual({
        rejected: 'forbidden',
      })
      expect(await Reflect.apply(journal.exportPage, journal, [missingScope, limits])).toEqual({
        rejected: 'forbidden',
      })
      expect(await journal.query({ ...query, scope: { kind: 'tenant', tenant: other } })).toEqual({
        rejected: 'forbidden',
      })
      expect(
        await journal.exportPage({ ...query, scope: { kind: 'tenant', tenant: other } }, limits),
      ).toEqual({ rejected: 'forbidden' })
      expect(readOpens).toBe(0)
      failRead = true
      const read = await journal.query(query)
      const exported = await journal.exportPage(query, limits)
      expect(read).toEqual({ rejected: 'unavailable' })
      expect(exported).toEqual({ rejected: 'unavailable' })
      expect(readOpens).toBe(2)
      for (const publicResult of [read, exported, journal.health()]) {
        const rendered = JSON.stringify(publicResult)
        expect(rendered).not.toContain('private-path-and-secret')
        expect(rendered).not.toContain(directory)
      }
      failRead = false
      expect(await journal.query(query)).toHaveProperty('page.records.0.sequence', '1')
    } finally {
      await journal.close()
    }
  })
})
