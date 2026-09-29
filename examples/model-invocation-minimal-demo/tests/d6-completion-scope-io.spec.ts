import { constants, lstatSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { createDemoDiagnosticConfig } from '../src/demo.ts'
import { createDiagnosticJournal, openDiagnosticJournalReader } from '../src/diagnostic-journal.ts'
import { demoRetirement } from './model-request-support.ts'

describe('D6 diagnostic scope and IO disclosure', () => {
  const foreignRoot = '/root'
  const foreignRootMatches = (() => {
    try {
      const stat = lstatSync(foreignRoot)
      return stat.isDirectory() && stat.uid !== process.getuid?.() && (stat.mode & 0o777) === 0o700
    } catch {
      return false
    }
  })()

  it.skipIf(!foreignRootMatches)(
    'rejects a real foreign-UID private directory before reading its contents',
    async () => {
      const tenant = unwrap(parseTenantId({ organization: 'd6-org', account: 'd6-owner' }))
      const base = createDemoDiagnosticConfig(
        resolve('tmp/d6-completion'),
        tenant,
        demoRetirement(),
      )
      let lstatCalls = 0
      let openCalls = 0
      let readdirCalls = 0
      let mkdirCalls = 0
      const observedFs = new Proxy(fs, {
        get(target, key, receiver) {
          if (key === 'lstat')
            return (...args: unknown[]) => {
              lstatCalls++
              return Reflect.apply(target.lstat, target, args)
            }
          if (key === 'open')
            return (...args: unknown[]) => {
              openCalls++
              return Reflect.apply(target.open, target, args)
            }
          if (key === 'readdir')
            return (...args: unknown[]) => {
              readdirCalls++
              return Reflect.apply(target.readdir, target, args)
            }
          if (key === 'mkdir')
            return (...args: unknown[]) => {
              mkdirCalls++
              return Reflect.apply(target.mkdir, target, args)
            }
          return Reflect.get(target, key, receiver)
        },
      })
      await expect(
        openDiagnosticJournalReader({
          ...base.collector,
          rootDir: foreignRoot,
          collectorId: 'd6-foreign-owner-negative',
          scope: { kind: 'local' },
          fs: observedFs,
        }),
      ).rejects.toThrow('diagnostic directory permissions invalid')
      expect(lstatCalls).toBe(1)
      expect(openCalls).toBe(0)
      expect(readdirCalls).toBe(0)
      expect(mkdirCalls).toBe(0)
    },
  )

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
