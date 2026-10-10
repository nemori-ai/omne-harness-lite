import {
  admissionUseMigrations,
  sessionStateMigrations,
  operationReceiptMigrations,
  sessionRuntimeMigrations,
} from '@omne-harness-lite/session-runtime-local'
import { sessionLogMigrations } from '@omne-harness-lite/session-log-sql'
import { runtimeContextMigrations } from '@omne-harness-lite/runtime-context-local'
import { evaluationInputMigrations } from '@omne-harness-lite/evaluation-input-store'
import { modelProfileDirectoryMigrations } from '@omne-harness-lite/model-profile-directory-local/migrations'
import { replicaMigrations } from '@omne-harness-lite/credential-custodian-local/migrations'
import {
  originalIssueMigrations,
  modelCallContentMigrations,
} from '@omne-harness-lite/model-request-runtime-local'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { composeMigrations } from '@omne-harness-lite/storage'
import { openStorage, createUpgradeGuard, type SqlStorage } from '@omne-harness-lite/storage-sql'
import { checkPrivateFile, ioCode } from './state-layout-files.ts'
import { checkCatalogFiles } from './catalog-files.ts'

export const sessionTenantMigrations = composeMigrations([
  ...admissionUseMigrations,
  ...sessionStateMigrations,
  ...operationReceiptMigrations,
  ...sessionRuntimeMigrations,
  ...sessionLogMigrations,
  ...runtimeContextMigrations,
  ...evaluationInputMigrations,
  ...originalIssueMigrations,
  ...modelCallContentMigrations('sqlite'),
  ...modelProfileDirectoryMigrations,
  ...replicaMigrations,
])
export async function claimRuntimeFile(file: string): Promise<boolean> {
  try {
    const handle = await open(
      file,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
      0o600,
    )
    try {
      await checkPrivateFile(handle)
      await handle.sync()
    } finally {
      await handle.close()
    }
    return true
  } catch (error) {
    if (ioCode(error) !== 'EEXIST') throw error
    return false
  }
}
export async function openRuntimeDatabase(
  file: string,
  migrations: ReturnType<typeof composeMigrations>,
): Promise<SqlStorage> {
  await claimRuntimeFile(file)
  await checkCatalogFiles(file)
  const guard = createUpgradeGuard()
  const storage = await openStorage({
    dialect: 'sqlite',
    file,
    synchronous: 'full',
    migrations,
    upgrade: { guard, checks: [] },
  })
  try {
    await guard.confirm()
    return storage
  } catch (error) {
    try {
      await storage.close()
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        'runtime migration confirmation and storage close failed',
      )
    }
    throw error
  }
}
