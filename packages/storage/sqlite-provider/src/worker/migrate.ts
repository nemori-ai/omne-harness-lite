// Migrations inside DO-1 (SPEC 5.4). Order, markers, the migration port and the failure rule: an
// `up` that throws or a `verify` that fails rolls back the whole migration transaction.
import type { DatabaseSync } from 'node:sqlite'
import type {
  ManifestMigration,
  MigrationDescriptor,
  MigrationRef,
  SqlMaterialCatalog,
} from '@omne-harness/sql-contract'
import type { MigrationModule, MigrationPort } from '@omne-harness/sql-contract/worker'
import type { ModuleCache } from './modules.ts'
import { SqlGateway, migrationDecision } from './ports.ts'

/** A failure that migrations decide: static, so the domain does not retry it. */
export class MigrationFailed extends Error {}

const refId = (ref: MigrationRef): string => JSON.stringify([ref.owner, ref.id])
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function descriptorOf(catalog: SqlMaterialCatalog, ref: MigrationRef): MigrationDescriptor {
  const found = catalog.migrations.find(item => item.owner === ref.owner && item.id === ref.id)
  if (found === undefined) throw new MigrationFailed('migration_not_in_catalog')
  return found
}

/**
 * Topological order by `requires`. When several migrations are ready, the first by (owner, id)
 * in UTF-16 code units runs first. The manifest of a combination already holds the closure.
 */
export function orderMigrations(
  entries: readonly ManifestMigration[],
  catalog: SqlMaterialCatalog,
): MigrationDescriptor[] {
  const remaining = new Map(entries.map(entry => [refId(entry), entry]))
  const ordered: MigrationDescriptor[] = []
  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter(entry => entry.requires.every(ref => !remaining.has(refId(ref))))
      .sort((a, b) => compare(a.owner, b.owner) || compare(a.id, b.id))
    const next = ready[0]
    if (next === undefined) throw new MigrationFailed('migration_cycle')
    ordered.push(descriptorOf(catalog, next))
    remaining.delete(refId(next))
  }
  return ordered
}

/** A marker whose checksum differs from the catalog, or that the catalog lacks, is a fault. */
export function markerFault(db: DatabaseSync, catalog: SqlMaterialCatalog): string | null {
  const rows = db.prepare('select owner, id, checksum from _sql_migration').all() as {
    owner: string
    id: string
    checksum: string
  }[]
  for (const row of rows) {
    const item = catalog.migrations.find(m => m.owner === row.owner && m.id === row.id)
    if (item === undefined) return 'migration_marker_not_in_catalog'
    if (item.checksum !== row.checksum) return 'migration_marker_checksum_mismatch'
  }
  return null
}

export function pendingOf(
  db: DatabaseSync,
  ordered: readonly MigrationDescriptor[],
): MigrationDescriptor[] {
  const done = new Set(
    (db.prepare('select owner, id from _sql_migration').all() as MigrationRef[]).map(refId),
  )
  return ordered.filter(item => !done.has(refId(item)))
}

export type LoadedMigrations = ReadonlyMap<string, MigrationModule>

/** Loads the modules before the transaction begins, so that no import waits inside it. */
export async function preloadMigrations(
  modules: ModuleCache,
  pending: readonly MigrationDescriptor[],
): Promise<LoadedMigrations> {
  const loaded = new Map<string, MigrationModule>()
  for (const item of pending) {
    const module = await modules.load<MigrationModule>(item.moduleUrl, item.checksum)
    loaded.set(refId(item), module)
  }
  return loaded
}

function tablesOfOwner(catalog: SqlMaterialCatalog, owner: string): readonly string[] {
  return catalog.participants.find(item => item.participant === owner)?.ownedTables ?? []
}

function requiredOwners(catalog: SqlMaterialCatalog, item: MigrationDescriptor): Set<string> {
  const owners = new Set<string>()
  const seen = new Set<string>()
  const stack = [...item.requires]
  for (let ref = stack.pop(); ref !== undefined; ref = stack.pop()) {
    if (seen.has(refId(ref))) continue
    seen.add(refId(ref))
    owners.add(ref.owner)
    stack.push(...descriptorOf(catalog, ref).requires)
  }
  owners.delete(item.owner)
  return owners
}

function narrow(gateway: SqlGateway): MigrationPort {
  return { execute: (sql, params) => gateway.execute(sql, params) }
}

/** Runs pending migrations in the open transaction and writes their markers. */
export function runMigrations(
  db: DatabaseSync,
  catalog: SqlMaterialCatalog,
  pending: readonly MigrationDescriptor[],
  loaded: LoadedMigrations,
): void {
  const insert = 'insert into _sql_migration(owner, id, checksum) values (?, ?, ?)'
  for (const item of pending) {
    const module = loaded.get(refId(item))
    if (module === undefined) throw new MigrationFailed('migration_not_loaded')
    if (module.owner !== item.owner || module.id !== item.id)
      throw new MigrationFailed('migration_module_identity_mismatch')
    const required = [...requiredOwners(catalog, item)].flatMap(owner =>
      tablesOfOwner(catalog, owner),
    )
    const decide = migrationDecision(tablesOfOwner(catalog, item.owner), required)
    const step = <T>(run: (port: MigrationPort) => T, name: string): T => {
      const gateway = new SqlGateway(db, decide)
      try {
        const result = run(narrow(gateway))
        if (gateway.violated) throw new MigrationFailed(`${name}_port_violation`)
        return result
      } catch (error) {
        if (error instanceof MigrationFailed) throw error
        // An environment error keeps its identity so that the caller can judge it as transient.
        if (gateway.environmentFailure !== null) throw gateway.environmentFailure
        throw new MigrationFailed(gateway.violated ? `${name}_port_violation` : `${name}_failed`)
      } finally {
        gateway.close()
      }
    }
    step(port => module.up(port), 'migration_up')
    const verdict = step(port => module.verify(port), 'migration_verify')
    if (verdict.kind !== 'verified') throw new MigrationFailed('migration_verify_failed')
    db.prepare(insert).run(item.owner, item.id, item.checksum)
  }
}
