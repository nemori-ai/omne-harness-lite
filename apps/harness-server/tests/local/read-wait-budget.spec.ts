import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { SqliteStoragePlugin } from '@omne-harness/sqlite-provider/cordis'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import { testingTenant } from '@omne-harness/session-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'
import { storageCatalog } from '../../src/rows/storage/catalog.ts'
import { resolveLocations } from '../../src/local/locations.ts'
import { localOperatorLayer } from '../../src/local/operator-defaults.ts'

const BUSY_MS = 1300
const SLOW = `const wait = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
export default {
  handler: 'slow',
  protocol: '1',
  read(input) {
    wait(input.ms)
    return { kind: 'read', output: { waited: input.ms } }
  },
}
`

function localStorageConfig(base: string) {
  const located = resolveLocations({
    platform: 'linux',
    env: { OMNE_SERVER_HOME: base },
    home: base,
  })
  if (located.kind !== 'located') throw new Error('local read wait locations')
  const distribution = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../config/serve.distribution.json', import.meta.url)),
      'utf8',
    ),
  ) as { rows: { id: string; config?: Record<string, unknown> }[] }
  const layer = localOperatorLayer({
    distribution,
    locations: located.locations,
    platform: 'linux',
    shutdownDeadlineMs: 10_000,
    settings: {
      version: 1,
      port: 8965,
      workspace: base,
      shell: '/bin/bash',
      shellEnvironment: {},
    },
  })
  return layer.ops.find(op => op.id === 'storage')?.config
}

function catalogWithSlowRead(base: string) {
  const file = join(base, 'slow.mjs')
  writeFileSync(file, SLOW, 'utf8')
  const released = storageCatalog()
  return {
    ...released,
    readHandlers: [
      ...released.readHandlers,
      {
        handler: 'slow',
        protocol: '1',
        moduleUrl: pathToFileURL(file).href,
        codeDigest: createHash('sha256').update(SLOW, 'utf8').digest('hex'),
        ordering: 'snapshot' as const,
        readTables: [],
        requiresMigrations: [],
        maxOutputBytes: 4096,
        maxRowsRead: 1,
      },
    ],
  }
}

describe('local SQL read wait budget', () => {
  it('answers a read that waited behind the two readers of its domain for more than a second', async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'local-read-wait-')))
    const validated = await SqliteStoragePlugin.Config['~standard'].validate(
      localStorageConfig(base),
    )
    if ('issues' in validated) throw new Error(JSON.stringify(validated.issues))
    const catalog = catalogWithSlowRead(base)
    const made = await createSqliteStorage({
      config: validated.value,
      materials: catalog,
      closeLeases: { admit: name => ({ name }), release: () => {} },
    })
    if (made.kind !== 'created') throw new Error(`read wait provider: ${made.reason}`)
    try {
      const tenant = tenantCodec.encode(
        testingTenant('org_app1st0rage000000000000000', 'acc_app1st0rage000000000000000'),
      )
      if (!tenant.ok) throw new Error('read wait tenant')
      const domain = {
        scope: { kind: 'tenant' as const, tenant: tenant.value },
        transactionDomain: 'read-wait',
      }
      const participants = ['execution-record']
      const manifest = combinationManifest({ catalog, participants })
      if (manifest.kind !== 'manifest') throw new Error(`read wait manifest: ${manifest.kind}`)
      expect(
        await made.storage.registerCombination({
          ...domain,
          combinationVersion: 'read-wait/1',
          manifestDigest: manifestDigest(manifest.manifest),
          participants,
        }),
      ).toMatchObject({ kind: 'registered' })
      const read = (requestKey: string, ms: number) =>
        made.storage.read({ domain, handler: 'slow', protocol: '1', requestKey, input: { ms } })
      const busy = [read('busy-1', BUSY_MS), read('busy-2', BUSY_MS)]
      await sleep(100)
      const asked = Date.now()
      const waited = await read('waited', 0)
      expect(waited.kind, JSON.stringify(waited)).toBe('read')
      expect(Date.now() - asked).toBeGreaterThan(1000)
      for (const answer of await Promise.all(busy)) expect(answer.kind).toBe('read')
    } finally {
      const closed = await made.control.close({ initiator: 'assembly' })
      made.control.assemblyReportSettled()
      rmSync(base, { recursive: true, force: true })
      expect(closed.kind).toBe('closed')
    }
  })
})
