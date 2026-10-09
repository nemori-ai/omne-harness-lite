import { join } from 'node:path'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { composeMigrations } from '@omne-harness-lite/storage'
import { openStorage, createUpgradeGuard, type SqlStorage } from '@omne-harness-lite/storage-sql'
import {
  openLeaseClock,
  type LeaseClock,
  type OpenLeaseClockOptions,
} from '@omne-harness-lite/clock-lease'
import {
  admissionMigrations,
  admissionUseMigrations,
  sessionStateMigrations,
  operationReceiptMigrations,
  sessionRuntimeMigrations,
} from '@omne-harness-lite/session-runtime-local'
import { sessionLogMigrations } from '@omne-harness-lite/session-log-sql'
import { runtimeContextMigrations } from '@omne-harness-lite/runtime-context-local'
import { evaluationInputMigrations } from '@omne-harness-lite/evaluation-input-store'
import {
  originalIssueMigrations,
  modelCallContentMigrations,
} from '@omne-harness-lite/model-request-runtime-local'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import type { RuntimeCloseResult } from '@omne-harness-lite/model-request-runtime'
import { checkTenantBinding, checkPrivateFile, ioCode } from './state-layout-files.ts'
import { checkCatalogFiles } from './catalog-files.ts'
import { tenantPaths, prepareStateDirectory, resolveStateHome } from './state-layout.ts'
import { checkedTenantBinding } from './state-layout-values.ts'
import {
  startSessionRuntimeRoot,
  confirmSessionRuntimeLogin,
  SessionRuntimeRootFailure,
} from './session-runtime-root.ts'
import type { SessionRuntimeRoot, SessionRuntimeRootOptions } from './session-runtime-root-types.ts'
import { parseRunLoginBinding } from './session-preparation.ts'
import {
  createNativeSessionModelOwner,
  type SessionNativeModelOptions,
} from './session-native-model.ts'

export interface FileSessionModelOwner {
  readonly ready: Promise<SessionRuntimeRootOptions['model']>
  /** Actual physical pool closure, not a statement inferred from absence of calls. */
  readonly close: () => Promise<RuntimeCloseResult>
}
type FileSessionRuntimeInputs = Omit<
  SessionRuntimeRootOptions,
  'storage' | 'rootStorage' | 'clock' | 'model'
> & {
  readonly clockOptions?: Omit<OpenLeaseClockOptions, 'file' | 'initialize'>
}
export type FileSessionRuntimeOptions = FileSessionRuntimeInputs &
  (
    | { readonly nativeModel: SessionNativeModelOptions; readonly createModel?: never }
    | {
        readonly nativeModel?: never
        /** Return the original close owner before asynchronous acquisition. A thrown constructor retains no resources. */
        readonly createModel: (storage: AtomicStorage, clock: Clock) => FileSessionModelOwner
      }
  )
/** Original resources remain available to the owner when startup cleanup cannot finish. */
export class FileSessionRuntimeFailure extends AggregateError {
  constructor(
    errors: readonly unknown[],
    readonly closeRetained: SessionRuntimeRoot['close'],
  ) {
    super(errors, 'file Session root startup failed; original resources retained')
  }
}
const tenantMigrations = composeMigrations([
  ...admissionUseMigrations,
  ...sessionStateMigrations,
  ...operationReceiptMigrations,
  ...sessionRuntimeMigrations,
  ...sessionLogMigrations,
  ...runtimeContextMigrations,
  ...evaluationInputMigrations,
  ...originalIssueMigrations,
  ...modelCallContentMigrations('sqlite'),
])
/** Production file owner. It does not invent deployment, model selection or execution authority. */
export async function startFileSessionRuntimeRoot(
  requested: FileSessionRuntimeOptions,
): Promise<SessionRuntimeRoot> {
  const home = resolveStateHome({ explicitHome: requested.home, osHome: requested.home })
  const binding = Object.freeze(checkedTenantBinding(requested.binding))
  const source = parseRunLoginBinding(requested.source)
  if (
    !source ||
    source.centerId !== binding.centerId ||
    source.accountId !== binding.tenant.account
  )
    throw new TypeError('actual fixed Session source required')
  const options = Object.freeze({ ...requested, home, binding, source: Object.freeze(source) })
  await confirmSessionRuntimeLogin(options)
  const owner = new FileRootOwner(options)
  try {
    await owner.open()
    const root = await startSessionRuntimeRoot({
      ...options,
      storage: owner.storage!,
      rootStorage: owner.rootStorage!,
      clock: owner.clock!,
      model: owner.modelOptions!,
    })
    owner.root = root
    return Object.freeze({ socketPath: root.socketPath, owners: root.owners, close: owner.close })
  } catch (error) {
    if (error instanceof SessionRuntimeRootFailure) owner.retainedRoot = error.closeRetained
    try {
      const closed = await owner.close()
      if ('pending' in closed) throw new FileSessionRuntimeFailure([error], owner.close)
    } catch (cleanup) {
      if (cleanup instanceof FileSessionRuntimeFailure) throw cleanup
      throw new FileSessionRuntimeFailure([error, cleanup], owner.close)
    }
    throw error
  }
}
class FileRootOwner {
  rootStorage?: SqlStorage
  storage?: SqlStorage
  clock?: LeaseClock
  model?: FileSessionModelOwner
  modelOptions?: SessionRuntimeRootOptions['model']
  root?: SessionRuntimeRoot
  retainedRoot?: SessionRuntimeRoot['close']
  closing?: ReturnType<SessionRuntimeRoot['close']>
  constructor(readonly options: FileSessionRuntimeOptions) {}
  async open() {
    const o = this.options,
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
    this.storage = await openRuntimeDatabase(paths.runtime, tenantMigrations)
    const clockFile = join(paths.run, 'clock.sqlite')
    const creator = await claimRuntimeFile(clockFile)
    await checkCatalogFiles(clockFile)
    this.clock = await openLeaseClock({
      ...o.clockOptions,
      file: clockFile,
      ...(creator ? { initialize: {} } : {}),
    })
    this.model = o.nativeModel
      ? createNativeSessionModelOwner(this.storage, this.clock, o.nativeModel)
      : o.createModel(this.storage, this.clock)
    this.modelOptions = await this.model.ready
  }
  close = (): ReturnType<SessionRuntimeRoot['close']> => {
    if (!this.closing) {
      const attempt = this.finishClose()
      this.closing = attempt
      void attempt.then(
        result => {
          if ('pending' in result && this.closing === attempt) delete this.closing
        },
        () => {
          if (this.closing === attempt) delete this.closing
        },
      )
    }
    return this.closing
  }
  async finishClose(): ReturnType<SessionRuntimeRoot['close']> {
    const endRoot = this.retainedRoot ?? this.root?.close
    if (endRoot && 'pending' in (await endRoot())) return { pending: true }
    if (this.model && 'unavailable' in (await this.model.close())) return { pending: true }
    await this.clock?.close()
    await this.storage?.close()
    await this.rootStorage?.close()
    return { closed: true }
  }
}
async function claimRuntimeFile(file: string): Promise<boolean> {
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
async function openRuntimeDatabase(
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
