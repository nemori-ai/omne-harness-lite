import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WorkspaceStore } from '@omne-harness/workspace'
import {
  createDomainBinding,
  createSqlWorkspaceStore,
  workspaceSqlMaterials,
  type WorkspaceBinding,
} from '@omne-harness/workspace-local'
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
    new URL('../../../../../tmp/workspace-local/databases/', import.meta.url),
  )
  mkdirSync(parent, { recursive: true })
  return realpathSync(mkdtempSync(join(parent, 'case-')))
}

export type SqlWorld = Readonly<{
  root: string
  storage: SqlStorage
  store: WorkspaceStore
  bind(): Promise<WorkspaceBinding | null>
  reports: string[]
  close(): Promise<void>
}>

/** Real SQLite storage in a directory of its own. Opening the same root again reads what was committed. */
export async function openSqlWorld(
  options: { root?: string; wrap?: (storage: SqlStorage) => SqlStorage } = {},
): Promise<SqlWorld> {
  const root = options.root ?? temporaryRoot()
  const own = workspaceSqlMaterials()
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
  const storage = options.wrap?.(raw) ?? raw
  const reports: string[] = []
  const bind = createDomainBinding({
    storage: raw,
    combination: async () => ({
      combinationVersion: 'fixture-workspace/1',
      manifestDigest: digest,
    }),
    report: reason => void reports.push(reason),
  })
  return {
    root,
    storage,
    store: createSqlWorkspaceStore({ storage, bind }),
    bind,
    reports,
    async close() {
      const closed = await control.close({ initiator: 'assembly' })
      if (closed.kind !== 'closed') throw new Error(JSON.stringify(closed))
    },
  }
}
