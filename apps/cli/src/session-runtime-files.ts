import {
  admissionUseMigrations,
  admissionMigrations,
  sessionStateMigrations,
  operationReceiptMigrations,
  sessionRuntimeMigrations,
} from '@omne-harness-lite/session-runtime-local'
import { sessionLogMigrations } from '@omne-harness-lite/session-log-sql'
import { assemblyManifestMigrations } from '@omne-harness-lite/assembly-manifest-store'
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
import { join } from 'node:path'
import {
  openLeaseClock,
  type LeaseClock,
  type OpenLeaseClockOptions,
} from '@omne-harness-lite/clock-lease'
import { checkTenantBinding } from './state-layout-files.ts'
import { tenantPaths, prepareStateDirectory, type TenantBinding } from './state-layout.ts'

export interface SessionRuntimeFileOptions {
  readonly home: string
  readonly binding: TenantBinding
  readonly clockOptions?: Omit<OpenLeaseClockOptions, 'file' | 'initialize'>
}

/** Keep partial file acquisition with its original owner until actual cleanup succeeds. */
export class SessionRuntimeFiles {
  rootStorage?: SqlStorage
  storage?: SqlStorage
  clock?: LeaseClock
  constructor(readonly files: SessionRuntimeFileOptions) {}
  async openFiles(): Promise<void> {
    const o = this.files,
      paths = tenantPaths(o.home, o.binding)
    await checkTenantBinding(paths.binding, Buffer.from(JSON.stringify(o.binding) + '\n'), 65536)
    await prepareStateDirectory(o.home, paths.data)
    await prepareStateDirectory(o.home, paths.run)
    const rootDirectory = join(o.home, 'data')
    await prepareStateDirectory(o.home, rootDirectory)
    this.rootStorage = await openRuntimeDatabase(
      join(rootDirectory, 'session-admission.sqlite'),
      composeMigrations(admissionMigrations),
    )
    this.storage = await openRuntimeDatabase(paths.runtime, sessionTenantMigrations)
    const clockFile = join(paths.run, 'clock.sqlite')
    const creator = await claimRuntimeFile(clockFile)
    await checkCatalogFiles(clockFile)
    this.clock = await openLeaseClock({
      ...o.clockOptions,
      file: clockFile,
      ...(creator ? { initialize: {} } : {}),
    })
  }
  async closeFiles(): Promise<void> {
    await this.clock?.close()
    await this.storage?.close()
    await this.rootStorage?.close()
  }
}

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
  ...assemblyManifestMigrations,
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
