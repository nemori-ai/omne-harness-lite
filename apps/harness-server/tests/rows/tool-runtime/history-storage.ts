import assert from 'node:assert/strict'
import { mkdtemp, realpath, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Context } from '@deepseek-ai/cordis'
import { createDisabledTelemetry } from '@omne-harness/telemetry-node'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { tenantCodec } from '@omne-harness/legal-identity'
import { referenceSystemActionAuthorization } from '@omne-harness/authorization'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { storageCatalog } from '../../../src/rows/storage/catalog.ts'
import {
  compositeManifestDigest,
  SESSION_COMPOSITE_PARTICIPANTS,
} from '../../../src/rows/session-storage/composite.ts'
import {
  releaseMaintenanceGrants,
  TOOL_HISTORY_UPGRADER_COMPONENT,
} from '../../../src/rows/authorization/grants.ts'
import { providerConfig } from '../storage/fixtures/tree.ts'
import { toolRowsOperatorConfig } from '../../r9/support.ts'

// These bytes were produced by the actual pre-W3 implementation, not the current writer.
type HistoricalFixture = { tables: Record<string, readonly Record<string, string | number>[]> }
const ordinary: HistoricalFixture = JSON.parse(
  await readFile(
    new URL(
      '../../../../../packages/tool/tool-storage-sql/tests/fixtures/pre-w3-drained-ordinary.json',
      import.meta.url,
    ),
    'utf8',
  ),
)

const offloaded: HistoricalFixture = JSON.parse(
  await readFile(
    new URL(
      '../../../../../packages/tool/tool-storage-sql/tests/fixtures/pre-w3-drained-offloaded.json',
      import.meta.url,
    ),
    'utf8',
  ),
)

export async function historyStorage(seed: boolean | 'offloaded', loseFirstPlanReply = false) {
  const original = seed === 'offloaded' ? offloaded : ordinary
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tool-startup-history-')))
  const config = toolRowsOperatorConfig({ storageRoot: join(root, 'storage') }).records
  const catalog = storageCatalog()
  const manifest = compositeManifestDigest(catalog)
  assert.equal(manifest.kind, 'manifest')
  if (manifest.kind !== 'manifest') throw new Error('invalid fixture catalog')
  const tenantText = original.tables.tl_domain![0]!.tenant as string
  const tenant = tenantCodec.parse(tenantText)
  assert.ok(tenant.ok)
  const domain = {
    scope: { kind: 'tenant' as const, tenant: tenantText },
    transactionDomain: 'historical-startup',
  }
  const leases = new Set<object>()
  const options = {
    config: providerConfig(config.filesRoot + '/storage'),
    materials: catalog,
    closeLeases: {
      admit() {
        const value = {}
        leases.add(value)
        return value
      },
      release(value: object) {
        assert.ok(leases.delete(value))
      },
    },
  }
  const created = await createSqliteStorage(options)
  assert.equal(created.kind, 'created', JSON.stringify(created))
  if (created.kind !== 'created') throw new Error('storage fixture rejected')
  assert.equal(
    (
      await created.storage.registerCombination({
        ...domain,
        combinationVersion: config.combinationVersion,
        manifestDigest: manifest.digest,
        participants: SESSION_COMPOSITE_PARTICIPANTS,
      })
    ).kind,
    'registered',
  )
  await created.control.close({ initiator: 'assembly' })
  created.control.assemblyReportSettled()
  const files = await readdir(join(options.config.storageRoot, 'domains'))
  const databases = files.filter(name => name.endsWith('.sqlite'))
  assert.equal(databases.length, 1)
  const databaseFile = join(options.config.storageRoot, 'domains', databases[0]!)
  if (seed) {
    const db = new DatabaseSync(databaseFile)
    try {
      for (const table of ['tl_domain', 'tl_record', 'tl_manifest', 'tl_chunk']) {
        for (const row of original.tables[table] ?? []) {
          const columns = Object.keys(row)
          db.prepare(
            `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          ).run(
            ...columns.map(key =>
              table === 'tl_chunk' && key === 'data'
                ? Buffer.from(String(row[key]), 'base64')
                : row[key]!,
            ),
          )
        }
      }
    } finally {
      db.close()
    }
  }
  let reopened = await createSqliteStorage(options)
  if (reopened.kind !== 'created') throw new Error(JSON.stringify(reopened))
  let provider = reopened
  assert.equal(
    (
      await provider.storage.registerCombination({
        ...domain,
        combinationVersion: config.combinationVersion,
        manifestDigest: manifest.digest,
        participants: SESSION_COMPOSITE_PARTICIPANTS,
      })
    ).kind,
    'registered',
  )
  const authority = inProcessPrincipalAuthority()
  const principal = authority.issuer.issueSystem({ component: TOOL_HISTORY_UPGRADER_COMPONENT })
  assert.ok('ok' in principal)
  const authorization = referenceSystemActionAuthorization({
    verifier: authority.verifier,
    grants: releaseMaintenanceGrants(),
    clock: null,
  })
  let context = new Context()
  const logs: string[] = []
  context.logger.exporter({
    levels: { default: 3 },
    export: item => logs.push(JSON.stringify(item)),
  })
  let commits = 0
  let lost = false
  const mount = async () =>
    context.plugin({
      apply(ctx: Context) {
        ctx.provide('storage', {
          ...provider.storage,
          commit: async (...args: Parameters<typeof provider.storage.commit>) => {
            commits++
            const answer = await provider.storage.commit(...args)
            if (
              loseFirstPlanReply &&
              !lost &&
              answer.kind === 'committed' &&
              JSON.stringify(args[0].commands).includes('history-migration:')
            ) {
              lost = true
              return {
                kind: 'unknown',
                identity: args[0].identity,
                diagnostic: 'fixture lost the original plan answer',
              }
            }
            return answer
          },
        })
        ctx.provide('tenantDomainLookup', {
          lookup: async ({ tenant }: { tenant: string }) =>
            tenant === tenantText ? { kind: 'ready', domain } : { kind: 'unregistered' },
        })
        ctx.provide('tenantDomains', {
          enumerate: async () => ({
            kind: 'ready',
            revision: '1',
            entries: [{ tenant: tenantText, domain }],
          }),
        })
        ctx.provide('systemActionAuthorization', authorization)
        ctx.provide('tenantDomainScannerPrincipal', {})
        ctx.provide('toolHistoryUpgraderPrincipal', principal.ok)
        ctx.provide('telemetry', createDisabledTelemetry().port)
      },
    })
  await mount()
  return {
    get context() {
      return context
    },
    config,
    tenantText,
    logs,
    databaseFile,
    commits: () => commits,
    plans(call?: string) {
      const db = new DatabaseSync(databaseFile)
      try {
        const rows =
          call === undefined
            ? db
                .prepare(
                  "SELECT key FROM tl_record WHERE key LIKE 'history-migration:%' ORDER BY key",
                )
                .all()
            : db
                .prepare(
                  "SELECT key FROM tl_record WHERE kind = 'call' AND name = ? AND key LIKE 'history-migration:%' ORDER BY key",
                )
                .all(call)
        return rows.map(row => row.key)
      } finally {
        db.close()
      }
    },
    async restart() {
      await context.fiber.dispose()
      assert.equal((await provider.control.close({ initiator: 'assembly' })).kind, 'closed')
      provider.control.assemblyReportSettled()
      reopened = await createSqliteStorage(options)
      if (reopened.kind !== 'created') throw new Error(JSON.stringify(reopened))
      provider = reopened
      assert.equal(
        (
          await provider.storage.registerCombination({
            ...domain,
            combinationVersion: config.combinationVersion,
            manifestDigest: manifest.digest,
            participants: SESSION_COMPOSITE_PARTICIPANTS,
          })
        ).kind,
        'registered',
      )
      context = new Context()
      context.logger.exporter({
        levels: { default: 3 },
        export: item => logs.push(JSON.stringify(item)),
      })
      await mount()
    },
    async close() {
      await context.fiber.dispose()
      const answer = await provider.control.close({ initiator: 'assembly' })
      provider.control.assemblyReportSettled()
      assert.equal(answer.kind, 'closed')
      assert.equal(leases.size, 0)
      await rm(root, { recursive: true, force: true })
    },
  }
}
