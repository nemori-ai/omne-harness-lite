import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MediaIndex } from '@omne-harness/media-contract'
import {
  createSqlMediaIndex,
  mediaSqlMaterials,
  type TenantBinding,
} from '@omne-harness/media-storage-sql'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
  type SqlStorage,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { config } from './config.ts'

function temporaryRoot(): string {
  const parent = fileURLToPath(
    new URL('../../../../tmp/media-storage-sql/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  return realpathSync(mkdtempSync(join(parent, 'case-')))
}

export type SqlWorld = Readonly<{
  storage: SqlStorage
  index: MediaIndex
  close(): Promise<void>
}>

/** Real SQLite storage in a directory of its own; a tenant's domain opens the first time the tenant is used. */
export async function openSqlWorld(): Promise<SqlWorld> {
  const own = mediaSqlMaterials()
  const materials: SqlMaterialCatalog = {
    catalogProtocol: 'sql-catalog/1',
    ...own,
    declaredCombinations: { tenant: null, system: null },
  }
  const participants = own.participants.map(entry => entry.participant)
  const manifest = combinationManifest({ catalog: materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const digest = manifestDigest(manifest.manifest)
  const leases = new Set<object>()
  const created = await createSqliteStorage({
    config: config(temporaryRoot()),
    materials,
    closeLeases: {
      admit() {
        const lease = {}
        leases.add(lease)
        return lease
      },
      release(lease) {
        leases.delete(lease)
      },
    },
  })
  if (created.kind !== 'created') throw new Error(JSON.stringify(created))
  const { storage: raw, control } = created
  const bound = new Map<string, TenantBinding>()
  async function bind(tenant: string): Promise<TenantBinding> {
    const known = bound.get(tenant)
    if (known !== undefined) return known
    const binding = {
      transactionDomain: `tenant/fixture/${tenant}`,
      combinationVersion: 'fixture-media/1',
      manifestDigest: digest,
    }
    const registered = await raw.registerCombination({
      scope: { kind: 'tenant', tenant },
      ...binding,
      participants,
    })
    if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
    bound.set(tenant, binding)
    return binding
  }
  const storage = raw
  return {
    storage,
    index: createSqlMediaIndex({ storage, bind }),
    async close() {
      const closed = await control.close({ initiator: 'assembly' })
      if (closed.kind !== 'closed') throw new Error(JSON.stringify(closed))
    },
  }
}
