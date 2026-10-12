import type { CliCatalog, CatalogPolicy } from './catalog.ts'
import { prepareCliCatalog } from './catalog.ts'
import { checkedCatalogPolicy } from './catalog-values.ts'
import { CliCatalogFailure } from './catalog-types.ts'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'
import { setTimeout as delay } from 'node:timers/promises'
import { checkCatalogFiles, prepareCatalogFiles, type CatalogFiles } from './catalog-files.ts'
import { catalogReady, initializeCatalog } from './catalog-sql.ts'
import { rethrowIo } from './state-layout-files.ts'

export interface OwnedCliCatalog {
  readonly catalog: CliCatalog
  close(): Promise<void>
}
export interface CatalogOpenPolicy {
  readonly initializationTimeoutMs: number
  readonly pollIntervalMs: number
}
export const defaultCatalogOpenPolicy: CatalogOpenPolicy = Object.freeze({
  initializationTimeoutMs: 5000,
  pollIntervalMs: 25,
})
function checkedOpeningPolicy(policy: CatalogOpenPolicy): CatalogOpenPolicy {
  const values = [policy.initializationTimeoutMs, policy.pollIntervalMs]
  if (values.some(value => !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647))
    throw new CliCatalogFailure('invalid-input')
  return { ...policy }
}

function sqliteCode(error: unknown): number | undefined {
  return error instanceof Error && 'errcode' in error && typeof error.errcode === 'number'
    ? error.errcode & 0xff
    : undefined
}
async function waitToOpen(
  file: string,
  deadline: AbortSignal,
  policy: CatalogOpenPolicy,
): Promise<SqlStorage> {
  for (;;) {
    try {
      return await openStorage({ dialect: 'sqlite', file, synchronous: 'full' })
    } catch (error) {
      if (![5, 6].includes(sqliteCode(error) ?? -1) && !(error instanceof StorageUnavailable))
        throw error
      if (deadline.aborted) throw new StorageUnavailable('omne-catalog: opening unavailable')
      await delay(policy.pollIntervalMs)
    }
  }
}
async function waitToInitialize(
  storage: SqlStorage,
  files: CatalogFiles,
  policy: CatalogPolicy,
  opening: CatalogOpenPolicy,
  deadline: AbortSignal,
): Promise<void> {
  if (files.creator) await initializeCatalog(storage)
  for (;;) {
    if (await catalogReady(storage, policy)) return
    if (files.creator || deadline.aborted) throw new CliCatalogFailure('invalid-record')
    await delay(opening.pollIntervalMs)
  }
}
function own(catalog: CliCatalog, storage: SqlStorage, files: CatalogFiles): OwnedCliCatalog {
  let closing: Promise<void> | undefined
  return {
    catalog,
    close: () => {
      if (closing !== undefined) return closing
      // Failed result settlement retains storage and file ownership for a storage-only retry.
      closing = catalog
        .close()
        .then(() => storage.close())
        .then(() => files.close())
      const attempt = closing
      void attempt.catch(() => {
        if (closing === attempt) closing = undefined
      })
      return closing
    },
  }
}
export async function openCliCatalog(
  home: string,
  policy: CatalogPolicy,
  opening: CatalogOpenPolicy = defaultCatalogOpenPolicy,
): Promise<OwnedCliCatalog> {
  const checked = checkedCatalogPolicy(policy)
  const openPolicy = checkedOpeningPolicy(opening)
  let files: CatalogFiles | undefined
  let storage: SqlStorage | undefined
  try {
    files = await prepareCatalogFiles(home)
    const deadline = AbortSignal.timeout(openPolicy.initializationTimeoutMs)
    storage = await waitToOpen(files.file, deadline, openPolicy)
    await waitToInitialize(storage, files, checked, openPolicy, deadline)
    await checkCatalogFiles(files.file)
    await files.sync()
    return own(await prepareCliCatalog(storage, checked, false), storage, files)
  } catch (error) {
    return openingFailed(error, storage, files)
  }
}

async function openingFailed(
  error: unknown,
  storage: SqlStorage | undefined,
  files: CatalogFiles | undefined,
): Promise<never> {
  const failures: unknown[] = []
  try {
    await storage?.close()
  } catch (failure) {
    failures.push(failure)
  }
  try {
    await files?.close()
  } catch (failure) {
    failures.push(failure)
  }
  if (failures.length)
    throw new AggregateError([error, ...failures], 'omne-catalog: opening and cleanup failed')
  if ([11, 26].includes(sqliteCode(error) ?? -1)) throw new CliCatalogFailure('invalid-record')
  rethrowIo(error)
}
