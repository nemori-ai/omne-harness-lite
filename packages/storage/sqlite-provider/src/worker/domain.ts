// DO-1 inside the Worker (SPEC 5.3): domain open (path A), domain creation (path B) and the
// registration of a new combination version in an open domain (SPEC 6.1). Nothing becomes visible
// to the control side until the whole transaction has committed.
import { DatabaseSync } from 'node:sqlite'
import {
  combinationManifest,
  manifestDigest,
  type ManifestMigration,
  type MigrationDescriptor,
  type ParticipantDescriptor,
  type SqlMaterialCatalog,
  type StorageScope,
} from '@omne-harness/sql-contract'
import { decodeScope } from '../fields.ts'
import { canonicalJson } from '../json.ts'
import { DataError, describeError, isTransientError } from './errors.ts'
import {
  MigrationFailed,
  markerFault,
  orderMigrations,
  pendingOf,
  preloadMigrations,
  runMigrations,
} from './migrate.ts'
import { MaterialMismatch, ModuleCache } from './modules.ts'
import { applyPragmas, isSupportedSqliteVersion } from './open.ts'
import type { OpenReply, RegisterReply, RegistrationSpec, WorkerEnv } from './protocol.ts'
import { PROVIDER_SCHEMA, findSingletons } from './schema.ts'

export type WorkerState = {
  db: DatabaseSync | null
  readonly modules: ModuleCache
  /**
   * The write generation that this Worker wrote into `_sql_generation` when it opened the domain.
   * Null until then. A group commit checks it after BEGIN IMMEDIATE (SPEC 7.5 step 1).
   */
  writeGeneration: number | null
}

/** The write generation in the file. Read it inside a transaction to get a stable value. */
export function readWriteGeneration(db: DatabaseSync): number {
  const row = db.prepare('select generation from _sql_generation where singleton = 1').get() as
    | { generation: number | bigint }
    | undefined
  if (row === undefined) throw new DataError('write_generation_missing')
  return Number(row.generation)
}

/** A COMMIT that failed: the transaction may or may not be durable. */
class CommitUncertain extends Error {}
/** A fault in the domain that retrying does not repair. */
class DomainFault extends Error {}

export function rollbackQuietly(db: DatabaseSync): void {
  try {
    if (db.isTransaction) db.exec('ROLLBACK')
  } catch {
    // The connection is unusable. The caller reports the outcome it can prove.
  }
}

/** BEGIN IMMEDIATE, body, COMMIT. A body error rolls back. A COMMIT error is uncertain. */
export function transact<T>(db: DatabaseSync, body: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  let result: T
  try {
    result = body()
  } catch (error) {
    rollbackQuietly(db)
    throw error
  }
  try {
    db.exec('COMMIT')
  } catch {
    rollbackQuietly(db)
    throw new CommitUncertain('commit_uncertain')
  }
  return result
}

type Plan = Readonly<{
  participants: readonly ParticipantDescriptor[]
  migrations: readonly MigrationDescriptor[]
}>

/** The union of participants and migrations of several combinations, migrations in order. */
function buildPlan(
  catalog: SqlMaterialCatalog,
  combinations: readonly (readonly string[])[],
): Plan {
  const participants = new Map<string, ParticipantDescriptor>()
  const entries = new Map<string, ManifestMigration>()
  for (const names of combinations) {
    const judged = combinationManifest({ catalog, participants: names })
    if (judged.kind !== 'manifest') throw new MigrationFailed('combination_not_valid')
    for (const name of names) {
      const descriptor = catalog.participants.find(item => item.participant === name)
      if (descriptor !== undefined) participants.set(name, descriptor)
    }
    for (const entry of judged.manifest.migrations)
      entries.set(JSON.stringify([entry.owner, entry.id]), entry)
  }
  return {
    participants: [...participants.values()],
    migrations: orderMigrations([...entries.values()], catalog),
  }
}

function readBinding(db: DatabaseSync): { transaction_domain: string; scope: string } | null {
  const table = db.prepare("select name from sqlite_schema where name = '_sql_domain'").get()
  if (table === undefined) return null
  const row = db.prepare('select transaction_domain, scope from _sql_domain').get() as
    | { transaction_domain: string; scope: string }
    | undefined
  return row ?? null
}

function parseScope(text: string): StorageScope | null {
  try {
    return decodeScope(JSON.parse(text))
  } catch {
    return null
  }
}

function insertRegistration(db: DatabaseSync, spec: RegistrationSpec): void {
  db.prepare(
    'insert into _sql_registration(combination_version, manifest_digest, participants) values (?, ?, ?)',
  ).run(spec.combinationVersion, spec.manifestDigest, JSON.stringify([...spec.participants].sort()))
}

type StoredRegistration = Readonly<{ manifest_digest: string; participants: string }>

function storedRegistration(db: DatabaseSync, version: string): StoredRegistration | undefined {
  return db
    .prepare(
      'select manifest_digest, participants from _sql_registration where combination_version = ?',
    )
    .get(version) as StoredRegistration | undefined
}

function sameRegistration(stored: StoredRegistration, spec: RegistrationSpec): boolean {
  return (
    stored.manifest_digest === spec.manifestDigest &&
    stored.participants === JSON.stringify([...spec.participants].sort())
  )
}

/**
 * Path A step 7 input: the declared combination of the bound scope, plus every registered
 * combination whose digest still equals the value that this catalog computes for it.
 */
function targetCombinations(
  db: DatabaseSync,
  catalog: SqlMaterialCatalog,
  scope: StorageScope,
): { combinations: string[][]; declared: RegistrationSpec | null } {
  const combinations: string[][] = []
  const rows = db
    .prepare('select manifest_digest, participants from _sql_registration')
    .all() as StoredRegistration[]
  for (const row of rows) {
    const names = JSON.parse(row.participants) as string[]
    const judged = combinationManifest({ catalog, participants: names })
    if (judged.kind === 'manifest' && manifestDigest(judged.manifest) === row.manifest_digest)
      combinations.push(names)
  }
  const declared = catalog.declaredCombinations[scope.kind === 'system' ? 'system' : 'tenant']
  if (declared === null) return { combinations, declared: null }
  const judged = combinationManifest({ catalog, participants: declared.participants })
  if (judged.kind !== 'manifest') throw new DomainFault('declared_combination_invalid')
  combinations.push([...declared.participants])
  return {
    combinations,
    declared: {
      scope,
      combinationVersion: declared.combinationVersion,
      manifestDigest: manifestDigest(judged.manifest),
      participants: [...declared.participants].sort(),
    },
  }
}

function isStatic(error: unknown): boolean {
  return (
    error instanceof MigrationFailed ||
    error instanceof MaterialMismatch ||
    error instanceof DomainFault ||
    error instanceof DataError
  )
}

function failure(step: string, error: unknown, creating: boolean): OpenReply {
  const diagnostic =
    error instanceof Error && isStatic(error) ? error.message : describeError(step, error)
  if (error instanceof CommitUncertain)
    return creating ? { kind: 'unknown', diagnostic } : { kind: 'transient', diagnostic }
  if (creating) return { kind: 'create_failed', diagnostic }
  if (!isStatic(error) && isTransientError(error)) return { kind: 'transient', diagnostic }
  return { kind: 'quarantined', diagnostic }
}

/** Path B steps 2: provider tables, migrations, binding and registration in one transaction. */
async function createDomain(
  env: WorkerEnv,
  state: WorkerState,
  db: DatabaseSync,
  create: RegistrationSpec,
): Promise<OpenReply> {
  const plan = buildPlan(env.catalog, [create.participants])
  const loaded = await preloadMigrations(state.modules, plan.migrations)
  transact(db, () => {
    db.exec(PROVIDER_SCHEMA)
    db.exec('insert into _sql_generation(singleton, generation) values (1, 1)')
    runMigrations(db, env.catalog, plan.migrations, loaded)
    db.prepare(
      'insert into _sql_domain(singleton, transaction_domain, scope) values (1, ?, ?)',
    ).run(env.domain, canonicalJson(create.scope))
    insertRegistration(db, create)
  })
  state.writeGeneration = 1
  return {
    kind: 'ready',
    scope: create.scope,
    singletons: findSingletons(db, plan.participants),
    created: true,
  }
}

/** Path A steps 6 and 7. */
async function reopenDomain(
  env: WorkerEnv,
  state: WorkerState,
  db: DatabaseSync,
  scope: StorageScope,
): Promise<OpenReply> {
  state.writeGeneration = transact(db, () => {
    db.exec('update _sql_generation set generation = generation + 1')
    return readWriteGeneration(db)
  })
  const fault = markerFault(db, env.catalog)
  if (fault !== null) return { kind: 'quarantined', diagnostic: fault }
  const { combinations, declared } = targetCombinations(db, env.catalog, scope)
  const plan = buildPlan(env.catalog, combinations)
  const loaded = await preloadMigrations(state.modules, pendingOf(db, plan.migrations))
  transact(db, () => {
    runMigrations(db, env.catalog, pendingOf(db, plan.migrations), loaded)
    if (declared === null) return
    const stored = storedRegistration(db, declared.combinationVersion)
    if (stored === undefined) insertRegistration(db, declared)
    else if (!sameRegistration(stored, declared))
      throw new DomainFault('declared_registration_conflict')
  })
  return { kind: 'ready', scope, singletons: findSingletons(db, plan.participants), created: false }
}

export async function openDomain(
  env: WorkerEnv,
  state: WorkerState,
  create: RegistrationSpec | null,
): Promise<OpenReply> {
  const creating = create !== null
  let db: DatabaseSync
  try {
    db = new DatabaseSync(env.file, { timeout: env.lockWaitMs })
  } catch (error) {
    return failure('open_failed', error, creating)
  }
  state.db = db
  try {
    const version = (db.prepare('select sqlite_version() as v').get() as { v: string }).v
    if (!isSupportedSqliteVersion(version))
      return { kind: 'quarantined', diagnostic: 'sqlite_version_below_floor' }
    const pragmas = applyPragmas(db, env)
    if (pragmas.kind === 'mismatch') return { kind: 'quarantined', diagnostic: pragmas.diagnostic }
    const binding = readBinding(db)
    if (binding === null)
      return create === null ? { kind: 'absent' } : await createDomain(env, state, db, create)
    if (binding.transaction_domain !== env.domain)
      return { kind: 'quarantined', diagnostic: 'binding_domain_mismatch' }
    const scope = parseScope(binding.scope)
    if (scope === null) return { kind: 'quarantined', diagnostic: 'binding_scope_invalid' }
    return await reopenDomain(env, state, db, scope)
  } catch (error) {
    return failure('open_error', error, creating)
  }
}

/** Registers a new combination version in an open domain (SPEC 6.1). */
export async function registerInDomain(
  env: WorkerEnv,
  state: WorkerState,
  spec: RegistrationSpec,
): Promise<RegisterReply> {
  const db = state.db as DatabaseSync
  try {
    const stored = storedRegistration(db, spec.combinationVersion)
    if (stored !== undefined)
      return sameRegistration(stored, spec) ? { kind: 'registered' } : { kind: 'conflict' }
    const plan = buildPlan(env.catalog, [spec.participants])
    const pending = pendingOf(db, plan.migrations)
    const loaded = await preloadMigrations(state.modules, pending)
    transact(db, () => {
      runMigrations(db, env.catalog, pendingOf(db, plan.migrations), loaded)
      insertRegistration(db, spec)
    })
    return { kind: 'registered' }
  } catch (error) {
    if (error instanceof CommitUncertain)
      return { kind: 'unknown', diagnostic: 'registration_commit_uncertain' }
    return {
      kind: 'unavailable',
      diagnostic:
        error instanceof Error && isStatic(error)
          ? error.message
          : describeError('register', error),
    }
  }
}
