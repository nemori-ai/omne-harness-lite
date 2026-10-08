import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DiagnosticRecord } from '@omne-harness-lite/model-request-runtime-local'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { createDemoDiagnosticConfig } from '../src/demo.ts'
import { createDiagnosticJournal } from '../src/diagnostic-journal.ts'
import { demoRetirement } from './model-request-support.ts'
import { latch } from './support.ts'

describe('D6 bounded SQL journal read after a real late FileHandle.read', () => {
  it('returns only timeout, holds the shared query/export permit, then releases the real handle', async () => {
    const parent = resolve('tmp/d6-completion')
    await fs.mkdir(parent, { recursive: true, mode: 0o700 })
    const directory = await fs.mkdtemp(join(parent, 'late-read-'))
    const tenant = unwrap(parseTenantId({ organization: 'd6-organization', account: 'd6-account' }))
    const base = createDemoDiagnosticConfig(directory, tenant, demoRetirement())
    const scope = { kind: 'local' as const }
    const entered = latch()
    const release = latch()
    let readCalls = 0
    let hold = true
    const journal = await createDiagnosticJournal({
      ...base.collector,
      rootDir: join(directory, 'local'),
      collectorId: 'd6-late-read',
      scope,
      queryConcurrency: 1,
      queryMaxDurationMs: 10,
      fs: {
        ...fs,
        open: async (path, flags, mode) => {
          const handle = await fs.open(path, flags, mode)
          if (flags !== (constants.O_RDONLY | constants.O_NOFOLLOW)) return handle
          return new Proxy(handle, {
            get(target, key) {
              if (key === 'read')
                return async (...args: unknown[]) => {
                  readCalls++
                  if (hold) {
                    entered.resolve()
                    await release.promise
                  }
                  return Reflect.apply(target.read, target, args)
                }
              const value: unknown = Reflect.get(target, key, target)
              return typeof value === 'function' ? value.bind(target) : value
            },
          })
        },
      },
    })
    const row: DiagnosticRecord = {
      format: 'model-diagnostics/1',
      collectorId: 'd6-late-read',
      sequence: '1',
      scope,
      source: 'assembly',
      stage: 'assembly',
      outcome: 'started',
      facts: { kind: 'diagnostics', reason: 'close_incomplete' },
      observedAt: new Date().toISOString(),
    }
    try {
      expect(await journal.append(row)).toBe('written')
      const query = journal.query({ scope, limit: 1, maxBytes: 65_536 })
      await entered.promise
      expect(await query).toEqual({ rejected: 'timeout' })
      expect(journal.health()).toMatchObject({
        pendingQueries: 1,
        pendingQueryIo: 1,
        openQueryHandles: 1,
        timedOutQueries: 1,
      })
      expect(await journal.query({ scope, limit: 1, maxBytes: 65_536 })).toEqual({
        rejected: 'busy',
      })
      expect(
        await journal.exportPage(
          { scope, limit: 1, maxBytes: 65_536 },
          { maxRecords: 1, maxBytes: 65_536 },
        ),
      ).toEqual({ rejected: 'busy' })
      expect(readCalls).toBe(1)
      hold = false
      release.resolve()
      await expect.poll(() => journal.health().pendingQueries).toBe(0)
      expect(journal.health()).toMatchObject({ pendingQueryIo: 0, openQueryHandles: 0 })
      expect(await journal.query({ scope, limit: 1, maxBytes: 65_536 })).toHaveProperty(
        'page.records.0.sequence',
        '1',
      )
      expect(
        await journal.exportPage(
          { scope, limit: 1, maxBytes: 65_536 },
          { maxRecords: 1, maxBytes: 65_536 },
        ),
      ).toHaveProperty('page.jsonl')
      expect(await journal.close()).toHaveProperty('complete', true)
    } finally {
      hold = false
      release.resolve()
      await journal.close()
    }
  })
})
