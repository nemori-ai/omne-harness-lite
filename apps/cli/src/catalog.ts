import {
  narrow,
  StorageUnavailable,
  type AtomicStorage,
  type WriteTx,
} from '@omne-harness-lite/storage'
import type { GovernanceUse } from '@omne-harness-lite/governance-client-operations'
import { parseOpaqueIdentifier, isOk } from '@omne-harness-lite/identity-values'
import { checkedTenantBinding, type TenantBinding } from './state-layout-values.ts'
import {
  CliCatalogFailure,
  type CapturedCreation,
  type CatalogPolicy,
  type CatalogSnapshot,
  type CliCatalog,
  type CreationRecord,
  type CreationExecutionOutcome,
} from './catalog-types.ts'
import {
  capturedCreation,
  centerProfile,
  creationIdentity,
  encoded,
  decode,
  checkedCatalogPolicy,
} from './catalog-values.ts'
import { initializeCatalog, readCatalogSnapshot, type CatalogDatabase } from './catalog-sql.ts'
import {
  creationResult,
  settledStatus,
  sameCreation,
  checkCreationResult,
  checkResultStatus,
} from './catalog-results.ts'
import { createTenantOrganization } from './tenant-preparation.ts'
import type { CenterProfile } from './center-preparation.ts'
export * from './catalog-types.ts'

/** Borrowed storage and creator status come from the application's private file owner. */
export async function prepareCliCatalog(
  storage: AtomicStorage,
  policy: CatalogPolicy,
  creator: boolean,
): Promise<CliCatalog> {
  const checked = checkedCatalogPolicy(policy)
  if (creator) await initializeCatalog(storage)
  await storage.read(tx => readCatalogSnapshot(tx, checked))
  return new Catalog(storage, checked)
}

class Catalog implements CliCatalog {
  #closed = false
  #closing: Promise<void> | undefined
  readonly #jobs = new Set<Promise<unknown>>()
  readonly #pendingResults = new Map<
    string,
    { request: CapturedCreation; result: ReturnType<typeof creationResult> }
  >()
  constructor(
    readonly storage: AtomicStorage,
    readonly policy: CatalogPolicy,
  ) {}

  #track<T>(work: () => Promise<T>): Promise<T> {
    if (this.#closed) return Promise.reject(new CliCatalogFailure('closed'))
    const pending = Promise.withResolvers<T>()
    this.#jobs.add(pending.promise)
    void pending.promise.then(
      () => this.#jobs.delete(pending.promise),
      () => this.#jobs.delete(pending.promise),
    )
    try {
      pending.resolve(work())
    } catch (error) {
      pending.reject(error)
    }
    return pending.promise
  }
  close(): Promise<void> {
    if (this.#closing !== undefined) return this.#closing
    this.#closed = true
    this.#closing = Promise.allSettled([...this.#jobs]).then(async () => {
      for (const pending of this.#pendingResults.values()) {
        const written = await this.#settle(pending.request, pending.result)
        if (written === 'unconfirmed') throw new CliCatalogFailure('pending-result')
      }
    })
    const attempt = this.#closing
    void attempt.catch(() => {
      if (this.#closing === attempt) this.#closing = undefined
    })
    return this.#closing
  }
  async #write<T>(work: (tx: WriteTx) => Promise<T>): Promise<T | 'unconfirmed'> {
    try {
      return await this.storage.atomic(unit => unit.mutate(work))
    } catch (error) {
      if (error instanceof StorageUnavailable) return 'unconfirmed'
      throw error
    }
  }
  readSelection(): Promise<CatalogSnapshot> {
    return this.#track(() => this.storage.read(tx => readCatalogSnapshot(tx, this.policy)))
  }
  selectTenant(
    expected: CatalogSnapshot,
    binding: TenantBinding,
    operationId: string,
  ): Promise<'selected' | 'conflict' | 'unconfirmed'> {
    return this.#track(async () => {
      const checked = checkedTenantBinding(binding)
      const value = encoded(checked, this.policy)
      if (!isOk(parseOpaqueIdentifier(operationId, 'OperationId')))
        throw new CliCatalogFailure('invalid-input')
      return this.#write(async tx => {
        await tx.lockRow('cli_catalog_meta', { singleton: 1 })
        const current = await readCatalogSnapshot(tx, this.policy)
        if (expected.storeId !== current.storeId || expected.revision !== current.revision)
          return 'conflict'
        if (current.revision === Number.MAX_SAFE_INTEGER) throw new CliCatalogFailure('capacity')
        await narrow<CatalogDatabase>(tx)
          .updateTable('cli_catalog_meta')
          .set({ selected_json: value, revision: current.revision + 1, operation_id: operationId })
          .where('singleton', '=', 1)
          .execute()
        return 'selected'
      })
    })
  }
  listCenters(): Promise<readonly CenterProfile[]> {
    return this.#track(() =>
      this.storage.read(async tx => {
        const rows = await narrow<CatalogDatabase>(tx)
          .selectFrom('cli_catalog_centers')
          .selectAll()
          .orderBy('name')
          .limit(this.policy.maxCenters + 1)
          .execute()
        if (rows.length > this.policy.maxCenters) throw new CliCatalogFailure('capacity')
        return rows.map(row => {
          return this.#center(row)
        })
      }),
    )
  }
  registerCenter(
    profile: CenterProfile,
  ): Promise<'saved' | 'already-saved' | 'conflict' | 'unconfirmed'> {
    return this.#track(async () => {
      const captured = centerProfile(profile)
      const value = encoded(captured, this.policy)
      return this.#write(async tx => {
        await tx.lockSentinel('cli-catalog/centers')
        const db = narrow<CatalogDatabase>(tx)
        const hit = await db
          .selectFrom('cli_catalog_centers')
          .selectAll()
          .where(eb =>
            eb.or([eb('center_id', '=', captured.center.centerId), eb('name', '=', captured.name)]),
          )
          .executeTakeFirst()
        if (hit !== undefined) {
          this.#center(hit)
          return hit.profile_json === value ? 'already-saved' : 'conflict'
        }
        const count = await db
          .selectFrom('cli_catalog_centers')
          .select('center_id')
          .limit(this.policy.maxCenters + 1)
          .execute()
        if (count.length >= this.policy.maxCenters) throw new CliCatalogFailure('capacity')
        await db
          .insertInto('cli_catalog_centers')
          .values({ center_id: captured.center.centerId, name: captured.name, profile_json: value })
          .execute()
        return 'saved'
      })
    })
  }
  #center(row: CatalogDatabase['cli_catalog_centers']): CenterProfile {
    const profile = decode(row.profile_json, centerProfile, this.policy)
    if (profile.name !== row.name || profile.center.centerId !== row.center_id)
      throw new CliCatalogFailure('invalid-record')
    return profile
  }
  captureCreation(
    request: CapturedCreation,
  ): Promise<'captured' | 'already-captured' | 'conflict' | 'unconfirmed'> {
    return this.#track(async () => {
      const captured = capturedCreation(request)
      const value = encoded(captured, this.policy)
      const key = creationIdentity(captured)
      return this.#write(async tx => {
        await tx.lockSentinel('cli-catalog/creations')
        const db = narrow<CatalogDatabase>(tx)
        const hit = await db
          .selectFrom('cli_catalog_creations')
          .selectAll()
          .where('request_key', '=', key)
          .executeTakeFirst()
        if (hit !== undefined)
          return sameCreation(captured, this.#record(hit).request) ? 'already-captured' : 'conflict'
        const count = await db
          .selectFrom('cli_catalog_creations')
          .select('request_key')
          .limit(this.policy.maxCreations + 1)
          .execute()
        if (count.length >= this.policy.maxCreations) throw new CliCatalogFailure('capacity')
        await db
          .insertInto('cli_catalog_creations')
          .values({ request_key: key, request_json: value, status: 'prepared', result_json: null })
          .execute()
        return 'captured'
      })
    })
  }
  #record(row: CatalogDatabase['cli_catalog_creations']): CreationRecord {
    const request = decode(row.request_json, capturedCreation, this.policy)
    if (row.request_key !== creationIdentity(request)) throw new CliCatalogFailure('invalid-record')
    const status = row.status
    if (status !== 'prepared' && status !== 'submitted' && status !== 'settled')
      throw new CliCatalogFailure('invalid-record')
    const result =
      row.result_json === null ? null : decode(row.result_json, creationResult, this.policy)
    checkResultStatus(status, result)
    if (result !== null) checkCreationResult(request, result)
    return { request, status, result }
  }
  readCreation(request: CapturedCreation): Promise<CreationRecord | null> {
    return this.#track(() => {
      const captured = capturedCreation(request)
      return this.storage.read(async tx => {
        const row = await narrow<CatalogDatabase>(tx)
          .selectFrom('cli_catalog_creations')
          .selectAll()
          .where('request_key', '=', creationIdentity(captured))
          .executeTakeFirst()
        if (row === undefined) return null
        const record = this.#record(row)
        if (!sameCreation(captured, record.request)) throw new CliCatalogFailure('invalid-input')
        return record
      })
    })
  }
  async #claim(
    request: CapturedCreation,
  ): Promise<{ kind: 'claimed' } | { kind: 'existing'; record: CreationRecord } | 'unconfirmed'> {
    const key = creationIdentity(request)
    return this.#write(async tx => {
      await tx.lockRow('cli_catalog_creations', { request_key: key })
      const db = narrow<CatalogDatabase>(tx)
      const row = await db
        .selectFrom('cli_catalog_creations')
        .selectAll()
        .where('request_key', '=', key)
        .executeTakeFirst()
      if (row === undefined) throw new CliCatalogFailure('invalid-input')
      const record = this.#record(row)
      if (!sameCreation(request, record.request)) throw new CliCatalogFailure('invalid-input')
      if (record.status !== 'prepared') return { kind: 'existing', record }
      await db
        .updateTable('cli_catalog_creations')
        .set({ status: 'submitted' })
        .where('request_key', '=', key)
        .execute()
      return { kind: 'claimed' }
    })
  }
  executeCreation(
    request: CapturedCreation,
    use: GovernanceUse,
  ): Promise<CreationExecutionOutcome> {
    return this.#track(async () => {
      const captured = capturedCreation(request)
      const claimed = await this.#claim(captured)
      if (claimed === 'unconfirmed')
        return { kind: 'unconfirmed', creationKey: captured.creationKey, result: null }
      if (claimed.kind === 'existing') return claimed
      const result = await createTenantOrganization(
        use,
        captured.login,
        captured.name,
        captured.creationKey,
      )
      const status = settledStatus(result)
      this.#pendingResults.set(creationIdentity(captured), { request: captured, result })
      const written = await this.#settle(captured, result)
      if (written === 'unconfirmed')
        return { kind: 'unconfirmed', creationKey: captured.creationKey, result }
      return { kind: 'recorded', record: { request: captured, status, result } }
    })
  }
  async #settle(
    request: CapturedCreation,
    result: ReturnType<typeof creationResult>,
  ): Promise<'recorded' | 'unconfirmed'> {
    const key = creationIdentity(request)
    const status = settledStatus(result)
    const json = encoded(creationResult(result), this.policy)
    const written = await this.#write(async tx => {
      await tx.lockRow('cli_catalog_creations', { request_key: key })
      const db = narrow<CatalogDatabase>(tx)
      const row = await db
        .selectFrom('cli_catalog_creations')
        .selectAll()
        .where('request_key', '=', key)
        .executeTakeFirst()
      if (row === undefined || !sameCreation(request, this.#record(row).request))
        throw new CliCatalogFailure('invalid-record')
      if (row.result_json !== null && row.result_json !== json)
        throw new CliCatalogFailure('invalid-record')
      if (row.result_json === json) return 'recorded' as const
      await db
        .updateTable('cli_catalog_creations')
        .set({ status, result_json: json })
        .where('request_key', '=', key)
        .execute()
      return 'recorded' as const
    })
    if (written === 'recorded') this.#pendingResults.delete(key)
    return written
  }
}
