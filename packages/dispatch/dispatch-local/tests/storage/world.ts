import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DispatchStore } from '@omne-harness/dispatch'
import {
  createSqlDispatchStore,
  dispatchSqlMaterials,
  type TenantBinding,
} from '@omne-harness/dispatch-local'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
  type SqlStorage,
} from '@omne-harness/sql-contract'
import { createSqliteStorage } from '@omne-harness/sqlite-provider'
import { config } from './config.ts'

export function temporaryRoot(): string {
  const parent = fileURLToPath(
    new URL('../../../../../tmp/dispatch-local/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  return realpathSync(mkdtempSync(join(parent, 'case-')))
}

export type SqlWorld = Readonly<{
  root: string
  storage: SqlStorage
  store: DispatchStore
  /** Opens a tenant's domain the first time the tenant is used, as an assembly does when a tenant is created. */
  bind(tenant: string): Promise<TenantBinding>
  close(): Promise<void>
}>

/** Real SQLite storage in a directory of its own. */
export async function openSqlWorld(
  options: { root?: string; wrap?: (storage: SqlStorage) => SqlStorage } = {},
): Promise<SqlWorld> {
  const root = options.root ?? temporaryRoot()
  const own = dispatchSqlMaterials()
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
  const { storage: raw, control } = created
  const bound = new Map<string, TenantBinding>()
  const storage = options.wrap?.(raw) ?? raw
  async function bind(tenant: string): Promise<TenantBinding> {
    const known = bound.get(tenant)
    if (known !== undefined) return known
    const binding = {
      transactionDomain: `tenant/fixture/${tenant}`,
      combinationVersion: 'fixture-dispatch/1',
      manifestDigest: digest,
    }
    const scope = { kind: 'tenant', tenant } as const
    const registered = await raw.registerCombination({
      scope,
      ...binding,
      participants,
    })
    if (registered.kind !== 'registered') throw new Error(JSON.stringify(registered))
    bound.set(tenant, binding)
    return binding
  }
  const store = createSqlDispatchStore({ storage, bind })
  return {
    root,
    storage,
    store,
    bind,
    async close() {
      const closed = await control.close({ initiator: 'assembly' })
      if (closed.kind !== 'closed') throw new Error(JSON.stringify(closed))
    },
  }
}
