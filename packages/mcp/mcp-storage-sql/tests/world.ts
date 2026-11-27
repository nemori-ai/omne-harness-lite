import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import type { CatalogStore } from '@omne-harness/mcp-contract/provider'
import {
  createSqlCatalogStore,
  mcpSqlMaterials,
  type TenantBinding,
} from '@omne-harness/mcp-storage-sql'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { config } from './config.ts'

export function tenantOf(last: string): TenantId {
  const organization = organizationCodec.parse(`org_0123456789abcdefghjkmnpqr${last}`)
  const account = accountCodec.parse(`acc_0123456789abcdefghjkmnpqr${last}`)
  if (!organization.ok || !account.ok) throw new TypeError('bad tenant sample')
  return tenant(organization.value, account.value)
}

export function temporaryRoot(): string {
  const parent = fileURLToPath(
    new URL('../../../../tmp/mcp-storage-sql/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  return realpathSync(mkdtempSync(join(parent, 'case-')))
}

export type SqlWorld = Readonly<{
  store: CatalogStore
  /** From now on the tenants are not bound: every read and write meets no storage domain. */
  unbind(): void
  close(): Promise<void>
}>

/** Real SQLite storage in a directory; a tenant's domain opens the first time the tenant is used. */
export async function openSqlWorld(root = temporaryRoot()): Promise<SqlWorld> {
  const own = mcpSqlMaterials()
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
    config: config(root),
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
  const { storage, control } = created
  let bound = true
  const known = new Map<string, TenantBinding>()
  async function bind(tenantText: string): Promise<TenantBinding | null> {
    if (!bound) return null
    const had = known.get(tenantText)
    if (had !== undefined) return had
    const binding = {
      transactionDomain: `tenant/fixture/${tenantText}`,
      combinationVersion: 'fixture-mcp/1',
      manifestDigest: digest,
    }
    const registered = await storage.registerCombination({
      scope: { kind: 'tenant', tenant: tenantText },
      ...binding,
      participants,
    })
    if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
    known.set(tenantText, binding)
    return binding
  }
  return {
    store: createSqlCatalogStore({ storage, bind }),
    unbind() {
      bound = false
    },
    async close() {
      const closed = await control.close({ initiator: 'assembly' })
      if (closed.kind !== 'closed') throw new Error(JSON.stringify(closed))
    },
  }
}
